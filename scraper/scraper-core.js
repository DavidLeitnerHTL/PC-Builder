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
            // Software/OS products (Microsoft Windows etc.) use different containers
            "#buyNewSection .a-price .a-offscreen",
            "#buyNewSection .a-price-whole",
            "#digital-list-price",
            "#instantbuybox .a-price .a-offscreen",
            "#instantbuybox_feature_div .a-price .a-offscreen",
            "#buybox .a-price .a-offscreen",
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
function cleanNameArtifacts(name) {
    if (!name) return "";
    return name
        .replace(/\s+-\d+\s*$/g, "") // trailing " -3", " -2" etc.
        .replace(/\s+\d{4,}\s*$/g, "") // trailing long numbers
        .replace(/\(\s*\)/g, "") // empty parens
        .replace(/\s+/g, " ")
        .trim();
}

function simplifySearchQuery(name) {
    if (!name) return "";

    // Remove manufacturer part numbers with 2+ hyphens
    let cleaned = name.replace(/\b[A-Z0-9]+(?:-[A-Z0-9]+){2,}\b/gi, " ");

    // Normalize
    cleaned = cleaned
        .toLowerCase()
        .replace(/[\/()|,[\]{}:;]/g, " ")
        .replace(/\+/g, " plus ")
        .replace(/\s+/g, " ")
        .trim();

    const stopWords = new Set([
        // Colors
        "black",
        "white",
        "red",
        "blue",
        "silver",
        "gold",
        "grey",
        "gray",
        "green",
        "yellow",
        "orange",
        "pink",
        "purple",
        "brown",
        "beige",
        "cyan",
        "teal",
        "violet",
        "magenta",
        // Memory/storage types
        "gddr5",
        "gddr6",
        "gddr6x",
        "ddr2",
        "ddr3",
        "ddr4",
        "ddr5",
        "nvme",
        "sata",
        "ssd",
        "hdd",
        "m2",
        // Form factors
        "atx",
        "eatx",
        "matx",
        "micro",
        "mini",
        "full",
        "mid",
        "tower",
        "slim",
        "desktop",
        "htpc",
        "server",
        // Case features
        "tempered",
        "glass",
        "acrylic",
        "mesh",
        "metal",
        "aluminum",
        "aluminium",
        "steel",
        "side",
        "panel",
        "front",
        "top",
        "bottom",
        "back",
        "frontpanel",
        "usb",
        "gen",
        "typec",
        "typea",
        "type-c",
        "type-a",
        "rgb",
        "argb",
        "led",
        "fan",
        "fans",
        "cooler",
        "cooling",
        "liquid",
        "aio",
        "air",
        "water",
        "heatsink",
        "heat",
        "sink",
        "included",
        "preinstalled",
        "pre",
        "installed",
        "dimensions",
        "dimension",
        "vertical",
        "chassis",
        "case",
        "computer",
        "pc",
        // PSU
        "watt",
        "watts",
        "fully",
        "semi",
        "non",
        "modular",
        "bronze",
        "silver",
        "platinum",
        "titanium",
        "certified",
        "supply",
        "power",
        "psu",
        // OS / Software
        "bit",
        "dvd",
        "oem",
        "retail",
        "flash",
        "drive",
        "download",
        "system",
        "builder",
        "digital",
        "english",
        "edition",
        "version",
        "home",
        "professional",
        "ultimate",
        "enterprise",
        "standard",
        // Generic descriptors
        "box",
        "bulk",
        "tray",
        "series",
        "model",
        "new",
        "original",
        "compatible",
        "support",
        "supported",
        "for",
        "and",
        "or",
        "the",
        "of",
        "in",
        "up",
        "to",
        "mhz",
        "ghz",
        "cl",
        "rpm",
        "mm",
        "cm",
        "dba",
        "cfm",
        "tdp",
        "pwm",
        // NOTE: "oc", "gaming", "ultra", "super", "plus" are intentionally NOT
        // stop-words here – they can be part of official product model names
        // (e.g. "ROG Gaming", "RTX Super", "Vengeance Pro"). Removing them causes
        // too many false negatives in the scoring step.
        "overclock",
        "overclocked",
        "overclocking",
        "game",
        "performance",
        "premium",
        "advanced",
        "basic",
        "value",
        "select",
        "pack",
        "set",
        "bundle",
        "piece",
        "pieces",
        "internal",
        "external",
        "portable",
        "laptop",
        "notebook",
        "mobile",
        // Units without numbers
        "gb",
        "tb",
        "mb",
        "kb",
        "w",
        // Size descriptors
        "xl",
        "xxl",
        "small",
        "medium",
        "large",
        // Misc
        "with",
        "without",
        "only",
        "each",
        "per",
    ]);

    const tokens = cleaned.split(/\s+/).filter((t) => {
        if (!t) return false;
        if (stopWords.has(t)) return false;
        if (/^[a-z]$/.test(t) && !["x", "s", "i"].includes(t)) return false;
        return true;
    });

    return tokens.join(" ");
}

export async function extractFirstSearchResult(page, expectedName) {
    try {
        await page
            .waitForSelector('div[data-component-type="s-search-result"]', {
                timeout: 5000,
            })
            .catch(() => {});

        const simplifiedName = simplifySearchQuery(expectedName);
        const allTokens = simplifiedName
            .split(/\s+/)
            .filter((t) => t.length > 0);

        // Extract brand (first 1-2 words)
        // brandAliases: maps the first token of our clean_name to what Amazon
        // actually uses in product titles (e.g. clean_name starts with "windows"
        // but Amazon titles say "Microsoft Windows").
        const brandAliases = {
            windows: "microsoft",
            linux: "linux",
        };
        let brand = null;
        if (allTokens.length > 0) {
            const first = allTokens[0];
            const second = allTokens[1] || "";
            const twoWordBrands = [
                "fractal design",
                "be quiet",
                "lian li",
                "cooler master",
                "team group",
                "silicon power",
                "power color",
                "v color",
                "western digital",
            ];
            const combined = `${first} ${second}`.trim();
            if (twoWordBrands.includes(combined)) {
                brand = combined;
            } else {
                // Apply alias if one exists (e.g. "windows" -> "microsoft")
                brand = brandAliases[first] || first;
            }
        }

        // Strong tokens: contain digits OR length >= 4
        const strongTokens = allTokens.filter(
            (t) => /\d/.test(t) || t.length >= 4
        );
        const weakTokens = allTokens.filter(
            (t) => !strongTokens.includes(t)
        );

        const resultData = await page.evaluate(
            (args) => {
                const { allTokens, strongTokens, weakTokens, brand } = args;
                const results = Array.from(
                    document.querySelectorAll(
                        'div[data-component-type="s-search-result"]:not(.AdHolder):not(.s-widget)'
                    )
                );

                function scoreResult(result) {
                    let titleEl = result.querySelector("h2 a span");
                    if (!titleEl)
                        titleEl = result.querySelector(
                            ".a-size-medium.a-color-base.a-text-normal"
                        );
                    const title = titleEl ? titleEl.innerText.trim() : "";
                    if (!title) return null;

                    const titleLower = title.toLowerCase();

                    // Brand must be present in title
                    if (brand && !titleLower.includes(brand)) return null;

                    const matchedStrong = strongTokens.filter((t) =>
                        titleLower.includes(t)
                    );
                    const matchedWeak = weakTokens.filter((t) =>
                        titleLower.includes(t)
                    );
                    const matchedTotal =
                        matchedStrong.length + matchedWeak.length;

                    const totalTokens = allTokens.length;
                    if (totalTokens === 0) {
                        const priceEl = result.querySelector(
                            ".a-price .a-offscreen"
                        );
                        const rawPrice = priceEl
                            ? priceEl.textContent.trim()
                            : null;
                        if (!rawPrice) return null;
                        const linkEl = result.querySelector("h2 a");
                        const href = linkEl
                            ? linkEl.getAttribute("href")
                            : null;
                        const scraped_url = href
                            ? `https://www.amazon.de${href}`
                            : null;
                        return brand
                            ? {
                                  rawPrice,
                                  scraped_title: title,
                                  scraped_url,
                                  score: 1,
                              }
                            : null;
                    }

                    // Rule 1: all strong tokens match AND at least half of weak tokens
                    const allStrongMatch =
                        strongTokens.length === 0 ||
                        matchedStrong.length === strongTokens.length;
                    const halfWeakMatch =
                        weakTokens.length === 0 ||
                        matchedWeak.length >=
                            Math.ceil(weakTokens.length / 2);
                    const rule1 = allStrongMatch && halfWeakMatch;

                    // Rule 2: at least 60% of all tokens match
                    const rule2 = matchedTotal / totalTokens >= 0.6;

                    if (!rule1 && !rule2) return null;

                    const priceEl = result.querySelector(
                        ".a-price .a-offscreen"
                    );
                    const rawPrice = priceEl
                        ? priceEl.textContent.trim()
                        : null;
                    if (!rawPrice) return null;

                    const linkEl = result.querySelector("h2 a");
                    const href = linkEl
                        ? linkEl.getAttribute("href")
                        : null;
                    const scraped_url = href
                        ? `https://www.amazon.de${href}`
                        : null;

                    return {
                        rawPrice,
                        scraped_title: title,
                        scraped_url,
                        score: matchedTotal / totalTokens,
                    };
                }

                // 1st pass: best scoring result
                let best = null;
                for (const result of results) {
                    const data = scoreResult(result);
                    if (data && (!best || data.score > best.score)) {
                        best = data;
                    }
                }
                if (best) return best;

                // 2nd pass: first result with brand match and any price
                for (const result of results) {
                    let titleEl = result.querySelector("h2 a span");
                    if (!titleEl)
                        titleEl = result.querySelector(
                            ".a-size-medium.a-color-base.a-text-normal"
                        );
                    const title = titleEl ? titleEl.innerText.trim() : "";
                    const priceEl = result.querySelector(
                        ".a-price .a-offscreen"
                    );
                    const rawPrice = priceEl
                        ? priceEl.textContent.trim()
                        : null;
                    if (!rawPrice || !title) continue;

                    if (brand && !title.toLowerCase().includes(brand))
                        continue;

                    const linkEl = result.querySelector("h2 a");
                    const href = linkEl
                        ? linkEl.getAttribute("href")
                        : null;
                    const scraped_url = href
                        ? `https://www.amazon.de${href}`
                        : null;

                    return {
                        rawPrice,
                        scraped_title: title,
                        scraped_url,
                        score: 0,
                    };
                }

                return null;
            },
            { allTokens, strongTokens, weakTokens, brand }
        );

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

    let price = null;
    let scrapedUrl = undefined;
    let scrapedTitle = undefined;

    // ---- Phase 1: Direct SKU hit ----
    if (hasSku) {
        const skuUrl = `https://www.amazon.de/dp/${String(
            product.amazon_sku
        ).trim()}`;
        console.log(`[SCRAPER] Direct hit for "${identifier}" -> ${skuUrl}`);

        try {
            await page.goto(skuUrl, {
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

        price = await extractPriceFromPage(page);

        if (price !== null) {
            console.log(`[SCRAPER]  -> Extracted price: ${price.toFixed(2)}`);
            return { price, scraped_url: scrapedUrl, scraped_title: scrapedTitle };
        }

        console.warn(
            `[SCRAPER]  -> Direct hit failed for "${identifier}", falling back to search...`
        );
    }

    // ---- Phase 2: Fallback search (no SKU or direct hit failed) ----
    const rawName = String(
        product.clean_name || product.name || ""
    ).trim();
    const cleanedName = rawName
        .replace(/\s*\(OEM\/Tray\)/gi, "")
        .replace(/\s*OEM\/Tray/gi, "")
        .replace(/\s*\bOEM\b/gi, "")
        .replace(/\s*\bTray\b/gi, "")
        .trim();
    const artifactCleanName = cleanNameArtifacts(cleanedName);
    const simplifiedName = simplifySearchQuery(artifactCleanName);
    const query = encodeURIComponent(simplifiedName || artifactCleanName);
    const searchUrl = `https://www.amazon.de/s?k=${query}`;
    console.log(
        `[SCRAPER] Fallback search for "${identifier}" -> ${searchUrl}`
    );

    try {
        await page.goto(searchUrl, {
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

    const searchName = artifactCleanName;
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
