/**
 * scraper-core.js
 *
 * Shared scraping utilities used by scraper.js and priceUpdater.js.
 */

import { readFile, writeFile } from "fs/promises";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

// ==========================================
// HELPERS
// ==========================================
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function parsePrice(rawPriceString) {
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
    return Math.round(value * 100) / 100;
}

// ==========================================
// BROWSER SETUP
// ==========================================
export async function launchStealthBrowser() {
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

export async function acceptCookies(page) {
    try {
        const cookieSelectors = [
            "#sp-cc-accept",
            'input[name="accept"]',
            '[data-cel-widget="gdpr-consent-banner"] input[type="submit"]',
        ];
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
// PRICE EXTRACTION
// ==========================================
export async function extractPriceFromPage(page) {
    await page
        .waitForSelector(
            "#corePriceDisplay_desktop_feature_div, " +
            "#corePrice_feature_div, " +
            "#corePriceDisplay_desktop_feature_div .a-price-whole, " +
            "#corePrice_feature_div .a-price-whole, " +
            ".aok-offscreen, #aod-ingress-link, .a-price-whole",
            { timeout: 10000 }
        )
        .catch(() => {});
    await sleep(1500);

    const rawPrice = await page.evaluate(() => {
        function readPriceText(el) {
            if (!el) return null;
            const offscreenEl = el.classList.contains("a-offscreen")
                ? el
                : el.querySelector(".a-offscreen");
            const offscreenText = offscreenEl
                ? offscreenEl.textContent.trim()
                : "";
            if (offscreenText.length > 0 && /[0-9]/.test(offscreenText))
                return offscreenText;

            const whole = el.querySelector(".a-price-whole");
            const fraction = el.querySelector(".a-price-fraction");
            if (whole) {
                const wholeText = whole.textContent.replace(/[^0-9]/g, "");
                const fracText = fraction
                    ? fraction.textContent.replace(/[^0-9]/g, "")
                    : "00";
                if (wholeText) return `${wholeText},${fracText}`;
            }

            const raw = (el.textContent || "").trim();
            return raw.length > 0 && /[0-9]/.test(raw) ? raw : null;
        }

        function isOwnProduct(el, pageAsin) {
            if (!pageAsin) return true;
            let node = el.parentElement;
            while (node && node !== document.body) {
                const asin =
                    node.getAttribute("data-csa-c-asin") ||
                    node.getAttribute("data-asin");
                if (asin && asin !== pageAsin) return false;
                node = node.parentElement;
            }
            return true;
        }

        const canonicalHref =
            (document.querySelector('link[rel="canonical"]') || {}).href ||
            window.location.href;
        const asinMatch = canonicalHref.match(/\/dp\/([A-Z0-9]{10})/);
        const pageAsin = asinMatch ? asinMatch[1] : null;

        const accessibilitySelectors = [
            "#apex-pricetopay-accessibility-label",
            "#corePriceDisplay_desktop_feature_div .aok-offscreen",
            "#corePrice_feature_div .aok-offscreen",
            ".priceToPay .aok-offscreen",
            '[id*="priceToPay"] .aok-offscreen',
            ".apexPriceToPay .aok-offscreen",
        ];
        for (const sel of accessibilitySelectors) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const text = el.textContent.trim();
            if (text && /[0-9]/.test(text)) return text;
        }

        const buyBoxScopes = [
            "#corePriceDisplay_desktop_feature_div",
            "#corePrice_feature_div",
            "#apex_offerDisplay_desktop",
        ];
        const buyBoxSelectors = [
            ".a-price.apexPriceToPay",
            ".a-price.a-text-price",
            ".a-price",
            "#priceblock_dealprice",
            "#priceblock_ourprice",
        ];

        for (const scopeSel of buyBoxScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue;
            for (const priceSel of buyBoxSelectors) {
                const el = scope.querySelector(priceSel);
                if (!el) continue;
                if (
                    el.classList.contains("a-text-strike") ||
                    el.hasAttribute("data-a-strike")
                )
                    continue;
                if (!isOwnProduct(el, pageAsin)) continue;
                const text = readPriceText(el);
                if (text) return text;
            }
        }

        const usedBuyBoxScopes = [
            "#usedBuySection",
            "#buyUsed_feature_div",
            "#buyBoxAccordion",
        ];
        for (const scopeSel of usedBuyBoxScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue;
            const candidates = Array.from(scope.querySelectorAll(".a-price"));
            for (const el of candidates) {
                if (
                    el.closest(
                        "#aod-ingress-link, #olp_feature_div, [id*=\"aodIngress\"]"
                    )
                )
                    continue;
                if (
                    el.classList.contains("a-text-strike") ||
                    el.hasAttribute("data-a-strike")
                )
                    continue;
                if (!isOwnProduct(el, pageAsin)) continue;
                const text = readPriceText(el);
                if (text) return text;
            }
        }

        const rightCol =
            document.querySelector("#rightCol") ||
            document.querySelector("#desktop_buybox") ||
            document.querySelector("#ppd");
        if (rightCol) {
            const allWholes = Array.from(
                rightCol.querySelectorAll(".a-price-whole")
            );
            for (const whole of allWholes) {
                if (
                    whole.closest(
                        "#aod-ingress-link, #olp_feature_div, " +
                        ".a-carousel-container, [data-cel-widget*=\"sims\"], " +
                        '[data-cel-widget*="carousel"], [data-cel-widget*="sp_detail"], ' +
                        '[id*="similarities"], [id*="sponsored"]'
                    )
                )
                    continue;
                const priceEl = whole.closest(".a-price");
                if (
                    priceEl &&
                    (priceEl.classList.contains("a-text-strike") ||
                        priceEl.hasAttribute("data-a-strike"))
                )
                    continue;
                if (!isOwnProduct(whole, pageAsin)) continue;
                const wholeText = whole.textContent.replace(/\D/g, "");
                if (!wholeText) continue;
                const fractionEl = priceEl?.querySelector(".a-price-fraction");
                const fracText = fractionEl
                    ? fractionEl.textContent.replace(/\D/g, "")
                    : "00";
                return `${wholeText},${fracText}`;
            }
        }

        const ariaLabelScopes = [
            "#corePriceDisplay_desktop_feature_div",
            "#corePrice_feature_div",
            "#apex_offerDisplay_desktop",
            "#desktop_buybox",
            "#rightCol",
        ];
        for (const scopeSel of ariaLabelScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue;
            const label = scope.getAttribute("aria-label") || "";
            if (
                label &&
                /[0-9]/.test(label) &&
                /[€$£]|EUR/.test(label)
            )
                return label;
            const candidates = Array.from(
                scope.querySelectorAll("[aria-label]")
            );
            for (const el of candidates) {
                if (
                    el.closest(
                        "#aod-ingress-link, #olp_feature_div, .a-carousel-container"
                    )
                )
                    continue;
                if (el.closest('[id*="similarities"], [id*="sponsored"]'))
                    continue;
                const lbl = el.getAttribute("aria-label") || "";
                if (
                    lbl &&
                    /[0-9]/.test(lbl) &&
                    /[€$£]|EUR/.test(lbl)
                )
                    return lbl;
            }
        }

        const priceRegex = /(\d{1,4}[.,]\d{2})\s*€/;
        for (const scopeSel of buyBoxScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue;
            const text = scope.textContent || "";
            const match = text.match(priceRegex);
            if (match) return match[1];
        }

        return null;
    });

    if (rawPrice) return parsePrice(rawPrice);
    return await clickAodAndExtract(page);
}

async function clickAodAndExtract(page) {
    const clicked = await page.evaluate(() => {
        const selectors = [
            "#aod-ingress-link",
            "#buybox-see-all-buying-choices-announce",
            'a.a-button-text[title="Alle Angebote"]',
            'a[href*="/gp/offer-listing/"]',
            'a[href*="all-offers"]',
            '[data-action="aod-ingress"] a',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                el.click();
                return true;
            }
        }
        return null;
    });

    if (!clicked) return null;
    try {
        await page.waitForSelector(
            "#aod-container, #aod-offer-list, #aod-pinned-offer",
            { timeout: 8000 }
        );
    } catch {
        return null;
    }
    await sleep(1200);

    const rawPrice = await page.evaluate(() => {
        function readPriceText(el) {
            if (!el) return null;
            const offscreenEl = el.classList.contains("a-offscreen")
                ? el
                : el.querySelector(".a-offscreen");
            const offscreenText = offscreenEl
                ? offscreenEl.textContent.trim()
                : "";
            if (offscreenText.length > 0 && /[0-9]/.test(offscreenText))
                return offscreenText;
            const whole = el.querySelector(".a-price-whole");
            const fraction = el.querySelector(".a-price-fraction");
            if (whole) {
                const w = whole.textContent.replace(/[^0-9]/g, "");
                const f = fraction
                    ? fraction.textContent.replace(/[^0-9]/g, "")
                    : "00";
                if (w) return `${w},${f}`;
            }
            const raw = (el.textContent || "").trim();
            return raw.length > 0 && /[0-9]/.test(raw) ? raw : null;
        }

        const pinnedPrice = document.querySelector("#aod-pinned-offer .a-price");
        if (pinnedPrice) {
            const text = readPriceText(pinnedPrice);
            if (text) return text;
        }

        const offerList =
            document.querySelector("#aod-offer-list") ||
            document.querySelector("#aod-container");
        if (!offerList) return null;

        let offers = Array.from(
            offerList.querySelectorAll(
                ":scope > div[id], :scope > div.a-section"
            )
        );
        if (offers.length === 0) {
            offers = Array.from(offerList.querySelectorAll("div"));
        }

        for (const offer of offers) {
            const condText = (offer.textContent || "").toLowerCase();
            if (condText.includes("gebraucht") && !/\bneu\b/.test(condText))
                continue;
            const priceEl = offer.querySelector(".a-price");
            const text = readPriceText(priceEl);
            if (text) return text;
        }

        for (const offer of offers) {
            const priceEl = offer.querySelector(".a-price");
            const text = readPriceText(priceEl);
            if (text) return text;
        }

        const anyOffscreen = offerList.querySelector(".a-price .a-offscreen");
        return anyOffscreen ? anyOffscreen.textContent.trim() : null;
    });

    return rawPrice ? parsePrice(rawPrice) : null;
}

// ==========================================
// SEARCH RESULT EXTRACTION
// ==========================================
export async function extractFirstSearchResult(page, expectedName) {
    try {
        await page
            .waitForSelector('div[data-component-type="s-search-result"]', {
                timeout: 5000,
            })
            .catch(() => {});

        const modelTokens = (expectedName || "")
            .split(/\s+/)
            .filter((t) => /\d/.test(t) && t.length >= 3)
            .map((t) => t.toLowerCase());

        const resultData = await page.evaluate((tokens) => {
            const results = Array.from(
                document.querySelectorAll(
                    'div[data-component-type="s-search-result"]:not(.AdHolder):not(.s-widget)'
                )
            );

            for (const result of results) {
                let titleEl = result.querySelector("h2 a span");
                if (!titleEl)
                    titleEl = result.querySelector(
                        ".a-size-medium.a-color-base.a-text-normal"
                    );
                const title = titleEl ? titleEl.innerText.trim() : "";

                const titleLower = title.toLowerCase();
                const isMatch =
                    tokens.length === 0 ||
                    tokens.every((t) => titleLower.includes(t));
                if (!isMatch) continue;

                const priceEl = result.querySelector(".a-price .a-offscreen");
                const rawPrice = priceEl
                    ? priceEl.textContent.trim()
                    : null;
                if (!rawPrice) continue;

                const linkEl = result.querySelector("h2 a");
                const href = linkEl ? linkEl.getAttribute("href") : null;
                const scraped_url = href
                    ? `https://www.amazon.de${href}`
                    : null;

                return { rawPrice, scraped_title: title, scraped_url };
            }

            return null;
        }, modelTokens);

        if (resultData && resultData.rawPrice) {
            return {
                price: parsePrice(resultData.rawPrice),
                scraped_title: resultData.scraped_title,
                scraped_url: resultData.scraped_url,
            };
        }
    } catch {}

    return { price: null, scraped_title: null, scraped_url: null };
}

// ==========================================
// PRODUCT SCRAPING
// ==========================================
export async function scrapeProduct(page, product) {
    const identifier =
        product.name || product.id || product.clean_name || "unknown";
    const hasSku =
        product.amazon_sku && String(product.amazon_sku).trim().length > 0;

    let targetUrl;
    let isDirectHit = false;

    if (hasSku) {
        targetUrl = `https://www.amazon.de/dp/${String(
            product.amazon_sku
        ).trim()}`;
        isDirectHit = true;
        console.log(`[SCRAPER] Direct hit for "${identifier}" -> ${targetUrl}`);
    } else {
        const rawName = String(
            product.clean_name || product.name || ""
        ).trim();
        const cleanedName = rawName
            .replace(/\s*\(OEM\/Tray\)/gi, "")
            .replace(/\s*OEM\/Tray/gi, "")
            .replace(/\s*\bOEM\b/gi, "")
            .replace(/\s*\bTray\b/gi, "")
            .trim();
        const query = encodeURIComponent(cleanedName);
        targetUrl = `https://www.amazon.de/s?k=${query}`;
        console.log(
            `[SCRAPER] Fallback search for "${identifier}" -> ${targetUrl}`
        );
    }

    try {
        await page.goto(targetUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
        });
    } catch (navErr) {
        console.warn(`[SCRAPER] Navigation timeout/error: ${navErr.message}`);
        return {
            price: null,
            scraped_url: undefined,
            scraped_title: undefined,
        };
    }

    await acceptCookies(page);
    await sleep(getRandomDelay(2000, 4000));

    let price = null;
    let scrapedUrl = undefined;
    let scrapedTitle = undefined;

    if (isDirectHit) {
        price = await extractPriceFromPage(page);
    } else {
        const searchName = product.clean_name || product.name || "";
        const result = await extractFirstSearchResult(page, searchName);
        price = result.price;
        scrapedUrl = result.scraped_url || undefined;
        scrapedTitle = result.scraped_title || undefined;

        if (scrapedTitle) {
            console.log(
                `[SCRAPER]  -> Found matching result title: "${scrapedTitle.substring(
                    0,
                    60
                )}..."`
            );
        }
    }

    if (price !== null) {
        console.log(`[SCRAPER]  -> Extracted price: ${price.toFixed(2)}`);
    } else {
        console.warn(
            `[SCRAPER]  -> Could not extract price for "${identifier}"`
        );
    }

    return { price, scraped_url: scrapedUrl, scraped_title: scrapedTitle };
}

// ==========================================
// SAFE FILE WRITING
// ==========================================
export function createSafeWriter() {
    let writeChain = Promise.resolve();
    return async function safeWrite(filePath, data) {
        writeChain = writeChain
            .then(async () => {
                try {
                    await writeFile(
                        filePath,
                        JSON.stringify(data, null, 2),
                        "utf-8"
                    );
                } catch (err) {
                    console.error(
                        `[WRITE ERROR] Failed to write ${filePath}: ${err.message}`
                    );
                    throw err;
                }
            })
            .catch((err) => {
                // Prevent one failed write from blocking subsequent ones,
                // but log the error.
                console.error(
                    `[WRITE ERROR] Chain broken for ${filePath}: ${err.message}`
                );
            });
        return writeChain;
    };
}
