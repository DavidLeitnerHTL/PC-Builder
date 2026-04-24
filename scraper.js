/**
 * scraper.js
 *
 * ETL workflow (Extract, Transform, Load) for 1000+ hardware components.
 * STRICT scoped DOM scraping to prevent carousel/ad scraping.
 */

import { readFile, writeFile } from "fs/promises";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

// ==========================================
// CONFIGURATION
// ==========================================

// Directory containing one JSON file per component category.
const PROCESSED_DATA_DIR = "./processed_data";

// All known category files (in a sensible scraping order).
const ALL_CATEGORIES = [
    "CPU", "GPU", "RAM", "Motherboard", "Storage",
    "PSU", "PCCase", "CPUCooler", "CaseFan", "OS",
];

// Number of parallel browser pages to run simultaneously.
// 3 is safe on a single IP with randomised delays — gives ~3x throughput.
const CONCURRENCY = 3;

// Random delay between requests per page (ms).
const MIN_DELAY_MS = 10000;
const MAX_DELAY_MS = 25000;

// How many times to retry a single product on unexpected errors.
const MAX_RETRIES = 3;

// ==========================================
// HELPERS
// ==========================================
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parsePrice(rawPriceString) {
    if (!rawPriceString || typeof rawPriceString !== "string") return null;

    const cleaned = rawPriceString.replace(/[^0-9.,\-]/g, "");

    let lastSepIndex = -1;
    for (let i = cleaned.length - 1; i >= 0; i--) {
        if (cleaned[i] === "." || cleaned[i] === ",") {
            lastSepIndex = i;
            break;
        }
    }

    if (lastSepIndex === -1) {
        const value = parseFloat(cleaned);
        return isNaN(value) || value <= 0 ? null : value;
    }

    const integerPart = cleaned.substring(0, lastSepIndex).replace(/[.,]/g, "");
    const fractionalPart = cleaned.substring(lastSepIndex + 1);
    const numericString = `${integerPart}.${fractionalPart}`;

    const value = parseFloat(numericString);
    if (isNaN(value) || value <= 0) return null;
    // Round to 2 decimal places to eliminate floating-point drift
    // (e.g. discount percentages can bleed extra digits into the price string).
    return Math.round(value * 100) / 100;
}


// ==========================================
// BROWSER SETUP
// ==========================================
async function launchStealthBrowser() {
    console.log("[BROWSER] Launching stealth browser...");
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--disable-gpu",
            "--window-size=1920,1080",
            "--lang=de-DE,de",
        ],
    });
    console.log("[BROWSER] Browser launched.\n");
    return browser;
}

async function acceptCookies(page) {
    try {
        const cookieSelectors = ["#sp-cc-accept", 'input[name="accept"]', '[data-cel-widget="gdpr-consent-banner"] input[type="submit"]'];
        for (const selector of cookieSelectors) {
            const element = await page.$(selector);
            if (element) {
                await element.click();
                await sleep(1000);
                return;
            }
        }
    } catch {}
}

// ==========================================
// STRICT PRICE EXTRACTION
// ==========================================

/**
 * Extracts the real product price from an Amazon.de product detail page.
 *
 * Three-phase strategy:
 *   Phase 1 (DOM only, no clicks):
 *     Strategy 1 — Standard New Buy Box:
 *       Scoped strictly to #corePriceDisplay_desktop_feature_div /
 *       #corePrice_feature_div / #apex_offerDisplay_desktop.
 *       Uses ASIN guard to reject injected carousel data.
 *     Strategy 2 — Used Buy Box ("Featured Used Offer"):
 *       Scoped to #desktop_buybox, but excludes the "Andere Verkäufer"
 *       (#olp_feature_div) and the AOD ingress link area to avoid grabbing
 *       the cheaper third-party offer shown below the main price.
 *
 *   Phase 2 (requires a click):
 *     Strategy 3 — Click the AOD ingress link and read #aod-offer-list.
 *       Used for products with no Buy Box at all (e.g. Tray / OEM variants)
 *       where the price is only revealed after clicking "Alle Angebote".
 *
 * NOTE on .a-offscreen:
 *   Amazon's machine-readable price is inside a <span class="a-offscreen">
 *   placed off-screen via CSS.  offsetWidth/offsetHeight are always 0 on
 *   those spans, so we use textContent instead of a visibility check.
 */
async function extractPriceFromPage(page) {
    // Give lazy-loaded price elements time to appear.
    // Amazon often injects the price number via JS after networkidle2 settles,
    // so the .a-price-whole span exists but is momentarily empty.
    await page.waitForSelector(
        '#corePriceDisplay_desktop_feature_div, ' +
        '#corePrice_feature_div, ' +
        '#corePriceDisplay_desktop_feature_div .a-price-whole, ' +
        '#corePrice_feature_div .a-price-whole, ' +
        '.aok-offscreen, #aod-ingress-link, .a-price-whole',
        { timeout: 10000 }
    ).catch(() => {}); // Timeout is fine — fall through to extraction anyway.
    // Extra pause to let async price injection settle.
    await sleep(1500);

    // --- Phase 1: DOM-only strategies (no clicks) ---
    const rawPrice = await page.evaluate(() => {

        // ------------------------------------------------------------------
        // Helpers
        // ------------------------------------------------------------------

        // Read the price text from a .a-price element.
        // Tries in order:
        //   1. .a-offscreen textContent (machine-readable, but sometimes empty)
        //   2. .a-price-whole + .a-price-fraction (visible price parts)
        //   3. raw element textContent as last resort
        function readPriceText(el) {
            if (!el) return null;

            // Try .a-offscreen first — but Amazon often puts only a space there,
            // so we must guard against whitespace-only strings.
            const offscreenEl = el.classList.contains('a-offscreen') ? el : el.querySelector('.a-offscreen');
            const offscreenText = offscreenEl ? offscreenEl.textContent.trim() : '';
            // Must contain at least one digit to be a valid price string.
            if (offscreenText.length > 0 && /[0-9]/.test(offscreenText)) return offscreenText;

            // Fallback: reconstruct from visible a-price-whole + a-price-fraction
            const whole = el.querySelector('.a-price-whole');
            const fraction = el.querySelector('.a-price-fraction');
            if (whole) {
                const wholeText = whole.textContent.replace(/[^0-9]/g, '');
                const fracText = fraction ? fraction.textContent.replace(/[^0-9]/g, '') : '00';
                if (wholeText) return `${wholeText},${fracText}`;
            }

            // Last resort: raw textContent
            const raw = (el.textContent || '').trim();
            return raw.length > 0 && /[0-9]/.test(raw) ? raw : null;
        }

        // Walk up the DOM; reject if an ancestor belongs to a different ASIN.
        function isOwnProduct(el, pageAsin) {
            if (!pageAsin) return true;
            let node = el.parentElement;
            while (node && node !== document.body) {
                const asin = node.getAttribute('data-csa-c-asin') ||
                             node.getAttribute('data-asin');
                if (asin && asin !== pageAsin) return false;
                node = node.parentElement;
            }
            return true;
        }

        // Detect the ASIN of the current page.
        const canonicalHref = (document.querySelector('link[rel="canonical"]') || {}).href || window.location.href;
        const asinMatch = canonicalHref.match(/\/dp\/([A-Z0-9]{10})/);
        const pageAsin = asinMatch ? asinMatch[1] : null;

        // ------------------------------------------------------------------
        // STRATEGY 0 — Amazon accessibility price label (most reliable).
        // Amazon now uses #apex-pricetopay-accessibility-label or .aok-offscreen
        // to hold a machine-readable price string like "49,00 €" that is always
        // populated even when .a-offscreen is empty.
        // ------------------------------------------------------------------
        const accessibilitySelectors = [
            '#apex-pricetopay-accessibility-label',
            '#corePriceDisplay_desktop_feature_div .aok-offscreen',
            '#corePrice_feature_div .aok-offscreen',
            '.priceToPay .aok-offscreen',
            '[id*="priceToPay"] .aok-offscreen',
            '.apexPriceToPay .aok-offscreen',
        ];
        for (const sel of accessibilitySelectors) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const text = el.textContent.trim();
            if (text && /[0-9]/.test(text)) return text;
        }

        // ------------------------------------------------------------------
        // STRATEGY 1 — Standard New Buy Box
        // No isRendered() gate — we trust the strict scope.
        // isRendered was blocking valid prices that Amazon lazy-renders:
        // the .a-price element exists but is temporarily display:none while
        // JS populates it, yet textContent is already populated.
        // ------------------------------------------------------------------
        const buyBoxScopes = [
            '#corePriceDisplay_desktop_feature_div',
            '#corePrice_feature_div',
            '#apex_offerDisplay_desktop',
        ];
        const buyBoxSelectors = [
            '.a-price.apexPriceToPay',
            '.a-price.a-text-price',
            '.a-price',
            '#priceblock_dealprice',
            '#priceblock_ourprice',
        ];

        for (const scopeSel of buyBoxScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue;
            for (const priceSel of buyBoxSelectors) {
                const el = scope.querySelector(priceSel);
                if (!el) continue;
                // Skip strike-through (original / compare-at) prices.
                if (el.classList.contains('a-text-strike') || el.hasAttribute('data-a-strike')) continue;
                if (!isOwnProduct(el, pageAsin)) continue;
                const text = readPriceText(el);
                if (text) return text;
            }
        }

        // ------------------------------------------------------------------
        // STRATEGY 2 — Used Buy Box ("Featured Used Offer")
        // ------------------------------------------------------------------
        const usedBuyBoxScopes = [
            '#usedBuySection',
            '#buyUsed_feature_div',
            '#buyBoxAccordion',
        ];
        for (const scopeSel of usedBuyBoxScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue; // No isRendered — same reasoning as S1.
            const candidates = Array.from(scope.querySelectorAll('.a-price'));
            for (const el of candidates) {
                if (el.closest('#aod-ingress-link, #olp_feature_div, [id*="aodIngress"]')) continue;
                if (el.classList.contains('a-text-strike') || el.hasAttribute('data-a-strike')) continue;
                if (!isOwnProduct(el, pageAsin)) continue;
                const text = readPriceText(el);
                if (text) return text;
            }
        }

        // ------------------------------------------------------------------
        // STRATEGY 3 — Broad .a-price-whole scan in the right column.
        // Last DOM-only resort: reads the first numeric .a-price-whole that is
        // NOT inside a carousel, sponsored ad, or "other sellers" block,
        // and is NOT a strike-through price.
        // ------------------------------------------------------------------
        const rightCol = document.querySelector('#rightCol') ||
                         document.querySelector('#desktop_buybox') ||
                         document.querySelector('#ppd');
        if (rightCol) {
            const allWholes = Array.from(rightCol.querySelectorAll('.a-price-whole'));
            for (const whole of allWholes) {
                if (whole.closest(
                    '#aod-ingress-link, #olp_feature_div, ' +
                    '.a-carousel-container, [data-cel-widget*="sims"], ' +
                    '[data-cel-widget*="carousel"], [data-cel-widget*="sp_detail"], ' +
                    '[id*="similarities"], [id*="sponsored"]'
                )) continue;
                const priceEl = whole.closest('.a-price');
                if (priceEl && (
                    priceEl.classList.contains('a-text-strike') ||
                    priceEl.hasAttribute('data-a-strike')
                )) continue;
                if (!isOwnProduct(whole, pageAsin)) continue;
                const wholeText = whole.textContent.replace(/\D/g, '');
                if (!wholeText) continue;
                const fractionEl = priceEl?.querySelector('.a-price-fraction');
                const fracText = fractionEl ? fractionEl.textContent.replace(/\D/g, '') : '00';
                return `${wholeText},${fracText}`;
            }
        }

        // ------------------------------------------------------------------
        // STRATEGY 4 — aria-label fallback on price wrapper elements.
        // Amazon stores the full price string in aria-label on some pages,
        // e.g. <span aria-label="49,00 €" class="a-price apexPriceToPay">.
        // ------------------------------------------------------------------
        const ariaLabelScopes = [
            '#corePriceDisplay_desktop_feature_div',
            '#corePrice_feature_div',
            '#apex_offerDisplay_desktop',
            '#desktop_buybox',
            '#rightCol',
        ];
        for (const scopeSel of ariaLabelScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue;
            // Check the scope itself.
            const label = scope.getAttribute('aria-label') || '';
            if (label && /[0-9]/.test(label) && /[€$£]|EUR/.test(label)) return label;
            // Check children with aria-label.
            const candidates = Array.from(scope.querySelectorAll('[aria-label]'));
            for (const el of candidates) {
                if (el.closest('#aod-ingress-link, #olp_feature_div, .a-carousel-container')) continue;
                if (el.closest('[id*="similarities"], [id*="sponsored"]')) continue;
                const lbl = el.getAttribute('aria-label') || '';
                if (lbl && /[0-9]/.test(lbl) && /[€$£]|EUR/.test(lbl)) return lbl;
            }
        }

        // ------------------------------------------------------------------
        // STRATEGY 5 — Regex scan of the price container's text content.
        // Absolute last DOM resort: parse the raw text of the buy box scope
        // looking for a German-formatted price like "149,99 €".
        // ------------------------------------------------------------------
        const priceRegex = /(\d{1,4}[.,]\d{2})\s*€/;
        for (const scopeSel of buyBoxScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue;
            const text = scope.textContent || '';
            const match = text.match(priceRegex);
            if (match) return match[1];
        }

        return null; // Signal Phase 2 (AOD click).
    });

    if (rawPrice) return parsePrice(rawPrice);

    // --- Phase 2: Click the AOD panel open and read it ---
    return await clickAodAndExtract(page);
}

/**
 * Clicks the "Alle Angebote" (All Offers) ingress link to open the AOD
 * side-panel, waits for #aod-offer-list to render, then returns the price
 * of the best available offer (preferring New condition over Used).
 *
 * Used for products like the Ryzen 8500G Tray that have no Buy Box at all.
 */
async function clickAodAndExtract(page) {
    // Click the AOD ingress link — Amazon uses several different selectors:
    // - Standard DP: #aod-ingress-link (e.g. Ryzen 2600X)
    // - No-BB pages: a[href*="/gp/offer-listing/"] (e.g. Ryzen 8500G)
    //   which renders as <a class="a-button-text" title="Alle Angebote">
    const clicked = await page.evaluate(() => {
        const selectors = [
            '#aod-ingress-link',
            '#buybox-see-all-buying-choices-announce',
            'a.a-button-text[title="Alle Angebote"]',   // 8500G style: no ID, title attr
            'a[href*="/gp/offer-listing/"]',             // offer-listing href fallback
            'a[href*="all-offers"]',
            '[data-action="aod-ingress"] a',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) { el.click(); return true; }
        }
        return null;
    });

    if (!clicked) return null;
    // Wait for the AOD panel to appear — Amazon uses several possible root IDs.
    try {
        await page.waitForSelector('#aod-container, #aod-offer-list, #aod-pinned-offer', { timeout: 8000 });
    } catch {
        return null;
    }
    await sleep(1200); // Allow all offer cards to finish rendering.

    const rawPrice = await page.evaluate(() => {
        // Read price — three-tier fallback (same as Phase 1).
        function readPriceText(el) {
            if (!el) return null;
            const offscreenEl = el.classList.contains('a-offscreen') ? el : el.querySelector('.a-offscreen');
            const offscreenText = offscreenEl ? offscreenEl.textContent.trim() : '';
            // Guard against whitespace-only .a-offscreen spans.
            if (offscreenText.length > 0 && /[0-9]/.test(offscreenText)) return offscreenText;
            const whole = el.querySelector('.a-price-whole');
            const fraction = el.querySelector('.a-price-fraction');
            if (whole) {
                const w = whole.textContent.replace(/[^0-9]/g, '');
                const f = fraction ? fraction.textContent.replace(/[^0-9]/g, '') : '00';
                if (w) return `${w},${f}`;
            }
            const raw = (el.textContent || '').trim();
            return raw.length > 0 && /[0-9]/.test(raw) ? raw : null;
        }

        // Check the pinned offer first (Amazon features cheapest new offer here).
        const pinnedPrice = document.querySelector('#aod-pinned-offer .a-price');
        if (pinnedPrice) {
            const text = readPriceText(pinnedPrice);
            if (text) return text;
        }

        // Work with #aod-offer-list if present, otherwise fall back to the whole panel.
        const offerList = document.querySelector('#aod-offer-list') ||
                          document.querySelector('#aod-container');
        if (!offerList) return null;

        // Collect individual offer cards (top-level children with an id or section class).
        let offers = Array.from(offerList.querySelectorAll(':scope > div[id], :scope > div.a-section'));
        if (offers.length === 0) {
            // Broader fallback: any div that contains a .a-price directly
            offers = Array.from(offerList.querySelectorAll('div'));
        }

        // First pass: prefer "Neu" (New) condition offers.
        for (const offer of offers) {
            const condText = (offer.textContent || '').toLowerCase();
            // Only skip if clearly labeled "Gebraucht" AND not labeled "Neu".
            if (condText.includes('gebraucht') && !/\bneu\b/.test(condText)) continue;
            const priceEl = offer.querySelector('.a-price');
            const text = readPriceText(priceEl);
            if (text) return text;
        }

        // Second pass: any offer regardless of condition (used-only products).
        for (const offer of offers) {
            const priceEl = offer.querySelector('.a-price');
            const text = readPriceText(priceEl);
            if (text) return text;
        }

        // Final fallback: any .a-offscreen price anywhere in the AOD panel.
        const anyOffscreen = offerList.querySelector('.a-price .a-offscreen');
        return anyOffscreen ? anyOffscreen.textContent.trim() : null;
    });

    return rawPrice ? parsePrice(rawPrice) : null;
}

/**
 * Extracts the price from the first organic search result that actually
 * matches the expected product.
 *
 * Amazon often ranks a cheaper/more popular variant (e.g. Ryzen 5500) above
 * the searched product (e.g. Ryzen 3500).  We validate each result's title
 * against the model-number tokens extracted from expectedName and skip any
 * that don't match.
 *
 * @param {object} page           - Puppeteer page
 * @param {string} expectedName   - The clean product name (e.g. "AMD Ryzen 5 3500")
 */
async function extractFirstSearchResult(page, expectedName) {
    try {
        await page.waitForSelector('div[data-component-type="s-search-result"]', { timeout: 5000 }).catch(() => {});

        // Extract model-number tokens from the expected name.
        // A token qualifies if it contains at least one digit and is ≥ 3 chars.
        // Example: "AMD Ryzen 5 3500" → ["3500"]
        // Example: "AMD Ryzen 5 8500G" → ["8500G"]
        const modelTokens = (expectedName || '')
            .split(/\s+/)
            .filter(t => /\d/.test(t) && t.length >= 3)
            .map(t => t.toLowerCase());

        const resultData = await page.evaluate((tokens) => {
            // Collect all non-ad organic results.
            const results = Array.from(
                document.querySelectorAll('div[data-component-type="s-search-result"]:not(.AdHolder):not(.s-widget)')
            );

            for (const result of results) {
                // Extract title.
                let titleEl = result.querySelector('h2 a span');
                if (!titleEl) titleEl = result.querySelector('.a-size-medium.a-color-base.a-text-normal');
                const title = titleEl ? titleEl.innerText.trim() : '';

                // Validate: all model tokens must appear in the title.
                const titleLower = title.toLowerCase();
                const isMatch = tokens.length === 0 || tokens.every(t => titleLower.includes(t));
                if (!isMatch) continue; // Skip — wrong product

                // Extract price.
                const priceEl = result.querySelector('.a-price .a-offscreen');
                const rawPrice = priceEl ? priceEl.textContent.trim() : null;
                if (!rawPrice) continue; // Skip — no price on this result

                // Extract link.
                const linkEl = result.querySelector('h2 a');
                const href = linkEl ? linkEl.getAttribute('href') : null;
                const scraped_url = href ? `https://www.amazon.de${href}` : null;

                return { rawPrice, scraped_title: title, scraped_url };
            }

            return null; // No matching result with a price found.
        }, modelTokens);

        if (resultData && resultData.rawPrice) {
            return {
                price: parsePrice(resultData.rawPrice),
                scraped_title: resultData.scraped_title,
                scraped_url: resultData.scraped_url
            };
        }
    } catch {}

    return { price: null, scraped_title: null, scraped_url: null };
}

// ==========================================
// SCRAPING LOGIC
// ==========================================

async function scrapeProduct(page, product) {
    const identifier = product.name || product.id || product.clean_name || "unknown";
    const hasSku = product.amazon_sku && String(product.amazon_sku).trim().length > 0;

    let targetUrl;
    let isDirectHit = false;

    if (hasSku) {
        targetUrl = `https://www.amazon.de/dp/${String(product.amazon_sku).trim()}`;
        isDirectHit = true;
        console.log(`[SCRAPER] Direct hit for "${identifier}" -> ${targetUrl}`);
    } else {
        // Strip OEM/Tray labels — Amazon listings rarely include them and
        // they actively hurt search relevance.
        const rawName = String(product.clean_name || product.name || "").trim();
        const cleanedName = rawName
            .replace(/\s*\(OEM\/Tray\)/gi, '')
            .replace(/\s*OEM\/Tray/gi, '')
            .replace(/\s*\bOEM\b/gi, '')
            .replace(/\s*\bTray\b/gi, '')
            .trim();
        const query = encodeURIComponent(cleanedName);
        targetUrl = `https://www.amazon.de/s?k=${query}`;
        console.log(`[SCRAPER] Fallback search for "${identifier}" -> ${targetUrl}`);
    }

    try {
        await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });
    } catch (navErr) {
        console.warn(`[SCRAPER] Navigation timeout/error: ${navErr.message}`);
        return { price: null, scraped_url: undefined, scraped_title: undefined };
    }

    await acceptCookies(page);
    await sleep(getRandomDelay(2000, 4000)); 

    let price = null;
    let scrapedUrl = undefined;
    let scrapedTitle = undefined;

    if (isDirectHit) {
        price = await extractPriceFromPage(page);
    } else {
        // Pass the expected product name so mismatched results (e.g. 5500 for a 3500 query) are skipped.
        const searchName = product.clean_name || product.name || '';
        const result = await extractFirstSearchResult(page, searchName);
        price = result.price;
        scrapedUrl = result.scraped_url || undefined;
        scrapedTitle = result.scraped_title || undefined;

        if (scrapedTitle) {
            console.log(`[SCRAPER]  -> Found matching result title: "${scrapedTitle.substring(0, 60)}..."`);
        }
    }

    if (price !== null) {
        console.log(`[SCRAPER]  -> Extracted price: ${price.toFixed(2)}`);
    } else {
        console.warn(`[SCRAPER]  -> Could not extract price for "${identifier}"`);
    }

    return { price, scraped_url: scrapedUrl, scraped_title: scrapedTitle };
}

// ==========================================
// MAIN ENTRY POINT
// ==========================================

(async function main() {
    console.log("==========================================");
    console.log("  PC Builder - ETL Scraper (Stealth)      ");
    console.log("==========================================\n");

    // Optional CLI argument: node scraper.js CPU  → only process the CPU category.
    const targetCategory = process.argv[2] || null;
    const categories = targetCategory
        ? ALL_CATEGORIES.filter(c => c.toLowerCase() === targetCategory.toLowerCase())
        : ALL_CATEGORIES;

    if (targetCategory && categories.length === 0) {
        console.error(`[FATAL] Unknown category "${targetCategory}". Valid options: ${ALL_CATEGORIES.join(', ')}`);
        process.exit(1);
    }

    const summaryRows = [];
    let browser;

    try {
        browser = await launchStealthBrowser();

        // ── Spin up CONCURRENCY pages ─────────────────────────────────────
        const pages = await Promise.all(
            Array.from({ length: CONCURRENCY }, async (_, i) => {
                const p = await browser.newPage();
                const w = 1280 + Math.floor(Math.random() * 200);
                const h = 800  + Math.floor(Math.random() * 200);
                await p.setViewport({ width: w, height: h });
                console.log(`[BROWSER] Page ${i + 1}/${CONCURRENCY} ready.`);
                return p;
            })
        );
        console.log();

        // ── Serialised write mutex (Promise chain) ────────────────────────
        // Prevents two concurrent pages from writing the same file at once.
        let writeChain = Promise.resolve();
        const safeWrite = (filePath, data) => {
            writeChain = writeChain.then(() =>
                writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
            );
            return writeChain;
        };

        // ── Process each category ─────────────────────────────────────────
        for (const category of categories) {
            const filePath = `${PROCESSED_DATA_DIR}/${category}.json`;

            let products;
            try {
                const raw = await readFile(filePath, "utf-8");
                products = JSON.parse(raw);
            } catch (err) {
                console.warn(`[SKIP] Cannot read ${filePath}: ${err.message}`);
                continue;
            }

            const alreadyDone = products.filter(p => p.price != null).length;
            const todo = products.filter(p => p.price == null);

            console.log(`\n==========================================`);
            console.log(`  Category: ${category}`);
            console.log(`  Total: ${products.length} | Priced: ${alreadyDone} | Remaining: ${todo.length} | Workers: ${CONCURRENCY}`);
            console.log(`==========================================\n`);

            if (todo.length === 0) {
                console.log(`[SKIP] All products in ${category} already have prices.\n`);
                summaryRows.push({ category, total: products.length, ok: alreadyDone, failed: 0, skipped: 0 });
                continue;
            }

            // Shared mutable counters (safe — updated only inside await boundaries).
            let okCount = 0;
            let failCount = 0;

            // The shared queue: each worker pops from the front.
            // Array.shift() is atomic in JS's single-threaded event loop.
            const queue = [...todo];

            // ── Page worker ──────────────────────────────────────────────
            const pageWorker = async (page, pageId) => {
                while (true) {
                    const product = queue.shift();
                    if (!product) break; // Queue exhausted

                    let attempt = 0;
                    let scrapeResult = { price: null, scraped_url: undefined, scraped_title: undefined };

                    while (attempt < MAX_RETRIES) {
                        attempt++;
                        try {
                            scrapeResult = await scrapeProduct(page, product);
                            break;
                        } catch (err) {
                            console.warn(`[P${pageId}] Attempt ${attempt} failed: ${err.message}`);
                            if (attempt < MAX_RETRIES) {
                                const backoff = getRandomDelay(5000, 10000);
                                console.log(`[P${pageId}] Retrying after ${(backoff / 1000).toFixed(1)}s...`);
                                await sleep(backoff);
                            }
                        }
                    }

                    // Merge results into the product in-place.
                    product.price        = scrapeResult.price;
                    product.last_updated = new Date().toISOString();
                    const hasSku = product.amazon_sku && String(product.amazon_sku).trim().length > 0;
                    if (!hasSku && scrapeResult.scraped_url)   product.scraped_url   = scrapeResult.scraped_url;
                    if (!hasSku && scrapeResult.scraped_title) product.scraped_title = scrapeResult.scraped_title;

                    const status = product.price !== null ? "OK" : "FAILED";
                    status === "OK" ? okCount++ : failCount++;
                    const remaining = queue.length;
                    console.log(
                        `[P${pageId}] [${status}] "${(product.name || "unknown").substring(0, 55)}" ` +
                        `| price: ${product.price ?? "null"} | queue: ${remaining}\n`
                    );

                    // Write after every product (resume-safe). Serialised via mutex.
                    await safeWrite(filePath, products);

                    // Polite delay before the next request on this page.
                    if (queue.length > 0) {
                        const delay = getRandomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
                        console.log(`[P${pageId}] Sleeping ${(delay / 1000).toFixed(1)}s...\n`);
                        await sleep(delay);
                    }
                }
            };

            // Run all page workers concurrently and wait for all to finish.
            await Promise.all(pages.map((p, i) => pageWorker(p, i + 1)));

            summaryRows.push({
                category,
                total:   products.length,
                ok:      alreadyDone + okCount,
                failed:  failCount,
                skipped: alreadyDone,
            });
        }

        await browser.close();
        browser = null;

        // Print summary table.
        console.log("\n===========================================");
        console.log("  ETL Summary");
        console.log("===========================================");
        console.log(`  ${'Category'.padEnd(14)} ${'Total'.padStart(6)} ${'OK'.padStart(6)} ${'Failed'.padStart(7)} ${'Skipped'.padStart(8)}`);
        console.log(`  ${'-'.repeat(46)}`);
        for (const row of summaryRows) {
            console.log(
                `  ${row.category.padEnd(14)} ` +
                `${String(row.total).padStart(6)} ` +
                `${String(row.ok).padStart(6)} ` +
                `${String(row.failed).padStart(7)} ` +
                `${String(row.skipped).padStart(8)}`
            );
        }
        console.log("===========================================");

    } catch (error) {
        console.error("[FATAL] An unexpected error occurred:", error);
        if (browser) await browser.close().catch(() => {});
        process.exit(1);
    }
})();