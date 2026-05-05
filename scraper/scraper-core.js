/**
 * scraper-core.js
 *
 * Shared scraping utilities used by scraper.js and priceUpdater.js.
 */

import { readFile, writeFile, rename } from "fs/promises";
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
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-sync",
            "--no-first-run",
            "--window-size=1920,1080",
            "--lang=de-DE,de",
        ],
    });
    console.log("[BROWSER] Browser launched.\n");
    return browser;
}

/**
 * Enable request interception to block heavy resources we don't need
 * (images, stylesheets, fonts, media, tracking).  This dramatically
 * reduces page-load time since we only need the DOM text for prices.
 */
export async function enableResourceBlocking(page) {
    await page.setRequestInterception(true);
    const BLOCKED = new Set(["image", "stylesheet", "font", "media"]);
    page.on("request", (req) => {
        if (BLOCKED.has(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });
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

// Returns "captcha" if Amazon is rate-limiting / showing a bot-check page, null otherwise.
async function detectPageBlock(page) {
    try {
        const url = page.url();
        if (/\/errors\/validateCaptcha|\/captcha\//i.test(url)) {
            return "captcha";
        }
        return await page.evaluate(() => {
            const title = (document.title || "").toLowerCase();
            if (
                title.includes("robot check") ||
                title.includes("captcha") ||
                title.includes("access denied") ||
                title.includes("zugang verweigert") ||
                title.includes("authentifizierung")
            )
                return "captcha";
            if (
                document.querySelector("#captchacharacters") ||
                document.querySelector('form[action*="validateCaptcha"]') ||
                document.querySelector('form[action*="/errors/"]')
            )
                return "captcha";
            const body = (document.body?.innerText || "")
                .substring(0, 1500)
                .toLowerCase();
            if (
                body.includes("geben sie die zeichen") ||
                body.includes("enter the characters") ||
                body.includes("unusual traffic from your computer") ||
                body.includes("wir müssen sicherstellen, dass sie kein robot")
            )
                return "captcha";
            return null;
        });
    } catch {
        return null;
    }
}

// Returns true if the page is a 404 / product-not-found page.
export async function detectPageNotFound(page) {
    try {
        return await page.evaluate(() => {
            const title = (document.title || "").toLowerCase();
            if (title === "page not found" || title.includes("seite nicht gefunden")) return true;
            // Amazon's 404 page has no #ppd or #dp element
            if (!document.querySelector("#ppd") && !document.querySelector("#dp")) {
                // But also no search results (to avoid false-positive on search pages)
                if (!document.querySelector('[data-component-type="s-search-result"]')) {
                    const body = (document.body?.innerText || "").substring(0, 500).toLowerCase();
                    if (body.includes("page not found") || body.includes("seite nicht gefunden")) return true;
                }
            }
            return false;
        });
    } catch {
        return false;
    }
}

// Returns true if the buybox explicitly says the product is unavailable.
export async function detectOutOfStock(page) {
    try {
        return await page.evaluate(() => {
            const oos = document.querySelector("#outOfStock, #availability_feature_div #outOfStock");
            if (oos) return true;
            const avail = document.querySelector("#availability span, #availability");
            if (avail) {
                const t = (avail.textContent || "").toLowerCase();
                if (
                    t.includes("currently unavailable") ||
                    t.includes("derzeit nicht verfügbar") ||
                    t.includes("nicht auf lager") ||
                    t.includes("we don't know when or if")
                ) return true;
            }
            // "No featured offers available" — no active seller on any marketplace
            const ppd = document.querySelector("#ppd, #rightCol");
            if (ppd) {
                const t = (ppd.textContent || "").toLowerCase();
                if (t.includes("no featured offers available") || t.includes("kein featured angebot verfügbar")) return true;
            }
            return false;
        });
    } catch {
        return false;
    }
}

// ==========================================
// PRICE EXTRACTION
// ==========================================

// Extract the lowest new-condition price from an offer-listing page
// (amazon.de/gp/offer-listing/ASIN?condition=new).
export async function extractOfferListingPrice(page) {
    try {
        await page
            .waitForSelector(".olpOffer, .a-price", { timeout: 6000 })
            .catch(() => {});

        const rawPrice = await page.evaluate(() => {
            // New-condition offer rows
            const offers = Array.from(document.querySelectorAll(".olpOffer"));
            for (const offer of offers) {
                const cond = (offer.querySelector(".olpCondition")?.textContent || "").toLowerCase();
                if (cond && !cond.includes("neu") && !cond.includes("new")) continue;
                const priceEl = offer.querySelector(".olpOfferPrice, .a-price .a-offscreen, .a-price-whole");
                const text = priceEl ? priceEl.textContent.trim() : null;
                if (text && /[0-9]/.test(text)) return text;
            }
            // Newer offer-listing layout
            const offscreen = document.querySelector(".a-price:not(.a-text-strike) .a-offscreen");
            if (offscreen) return offscreen.textContent.trim() || null;
            return null;
        });

        if (rawPrice) {
            const parsed = parsePrice(rawPrice);
            if (parsed !== null) {
                console.log(`[PRICE] Offer-listing hit → raw="${rawPrice}" parsed=${parsed.toFixed(2)}`);
                return parsed;
            }
        }
    } catch (e) {
        console.warn(`[PRICE] extractOfferListingPrice error: ${e.message}`);
    }
    return null;
}

export async function extractPriceFromPage(page) {
    await page
        .waitForSelector(
            "#corePriceDisplay_desktop_feature_div, " +
            "#corePrice_feature_div, " +
            "#corePriceDisplay_desktop_feature_div .a-price-whole, " +
            "#corePrice_feature_div .a-price-whole, " +
            ".aok-offscreen, #aod-ingress-link, .a-price-whole",
            { timeout: 8000 }
        )
        .catch(() => {});
    await sleep(800);

    const result = await page.evaluate(() => {
        function ret(price, via) {
            return { rawPrice: price, via };
        }

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
            "#corePriceDisplay_desktop_feature_div .a-offscreen",
            "#corePrice_feature_div .a-offscreen",
            ".priceToPay .a-offscreen",
            '[id*="priceToPay"] .a-offscreen',
            ".apexPriceToPay .a-offscreen",
            "#apex_offerDisplay_desktop .a-price .a-offscreen",
            "#desktop_buybox .a-price .a-offscreen",
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
            if (text && /[0-9]/.test(text)) return ret(text, `accessibility:${sel}`);
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
                if (text) return ret(text, `buyBox:${scopeSel}>${priceSel}`);
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
                if (text) return ret(text, `usedBox:${scopeSel}`);
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
                return ret(`${wholeText},${fracText}`, "rightCol:.a-price-whole");
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
                return ret(label, `aria-label:${scopeSel}[self]`);
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
                    return ret(lbl, `aria-label:${scopeSel}>[aria-label]`);
            }
        }

        const priceRegex = /(\d{1,4}[.,]\d{2})\s*€/;
        const regexScopes = [
            ...buyBoxScopes,
            "#rightCol",
            "#desktop_buybox",
        ];
        for (const scopeSel of regexScopes) {
            const scope = document.querySelector(scopeSel);
            if (!scope) continue;
            const text = scope.textContent || "";
            const match = text.match(priceRegex);
            if (match) return ret(match[1], `regex:${scopeSel}`);
        }

        return null;
    });

    if (result?.rawPrice) {
        const parsed = parsePrice(result.rawPrice);
        if (parsed !== null) {
            console.log(
                `[PRICE] Hit via "${result.via}" → raw="${result.rawPrice}" parsed=${parsed.toFixed(2)}`
            );
            return parsed;
        }
        console.warn(
            `[PRICE] Selector "${result.via}" matched but parsePrice failed on "${result.rawPrice}"`
        );
    } else {
        console.warn("[PRICE] No price selector matched on page. Trying AOD link...");
    }
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

    if (!clicked) {
        console.warn("[PRICE] No AOD ingress link found on page.");
        return null;
    }
    try {
        await page.waitForSelector(
            "#aod-container, #aod-offer-list, #aod-pinned-offer",
            { timeout: 8000 }
        );
    } catch {
        console.warn("[PRICE] AOD container did not appear within timeout.");
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

    if (rawPrice) {
        const parsed = parsePrice(rawPrice);
        if (parsed !== null) {
            console.log(`[PRICE] AOD hit → raw="${rawPrice}" parsed=${parsed.toFixed(2)}`);
        } else {
            console.warn(`[PRICE] AOD: parsePrice failed on "${rawPrice}"`);
        }
        return parsed;
    }
    console.warn("[PRICE] AOD opened but no price element found.");
    return null;
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
        "gddr5x",
        "gddr6",
        "gddr6x",
        "gddr7",
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
        // NOTE: "home", "professional", "enterprise", "ultimate" intentionally
        // NOT stop-words — they distinguish Windows/OS editions (Home vs Pro vs Enterprise).
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
        // Filter version numbers (e.g. "3.2", "2.0") that come from USB specs
        if (/^\d+\.\d+$/.test(t)) return false;
        // Filter standalone short numbers ("1", "2", "16") – not model identifiers
        if (/^\d{1,2}$/.test(t)) return false;
        // Filter multiplier patterns ("2x2", "1x4") from USB/PCIe spec strings
        if (/^\d+x\d+$/.test(t)) return false;
        return true;
    });

    return tokens.join(" ");
}

// ---- Accessory blacklist ----
// Titles containing these phrases are almost certainly accessories (fans,
// cables, brackets, …) rather than the actual component.  Applied to
// fallback-search results only – direct-hit ASINs are trusted.
//
// IMPORTANT: Use COMPOUND phrases, not single words!  Single words like
// "fan" or "cable" appear in legitimate product names (e.g. "RTX 4070 Ti
// Dual Fan", "USB-C Cable Management") and cause false rejections.
const ACCESSORY_BLACKLIST_RE = new RegExp(
    [
        // German accessory product types
        "lüfter",             // fan (as a product, not feature)
        "kühlerlüfter",       // cooler fan
        "grafikkartenlüfter", // GPU fan
        "gpu.lüfter",         // GPU fan
        "ersatzlüfter",       // replacement fan
        "lüfterersatz",       // fan replacement
        "wärmeleitpaste",     // thermal paste
        "thermal.?pad",       // thermal pad
        // English accessory product types (compound phrases only)
        "replacement.?fan",
        "cooler.?fan",
        "cooling.?fan",
        "fan.?replacement",
        "fan.?for",
        "fan.?compatible",
        // English GPU/cooler accessories
        "card.?cooler",
        "gpu.?cooler",
        "graphics.?cooler",
        // Product types that are clearly accessories
        "backplate",
        "aufkleber",           // sticker
        "wärmeleitpad",
    ].join("|"),
    "i"
);

// Categories where the blacklist should NOT be applied because the
// products themselves are fans/coolers.
const BLACKLIST_EXEMPT_CATEGORIES = new Set(["CaseFan", "CPUCooler"]);

export async function extractFirstSearchResult(page, expectedName, category = null) {
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

        // MUST_HAVE: pure model numbers (3+ digit tokens) + known variant qualifiers.
        // Brand is intentionally NOT must-have — Amazon titles vary in how they write brand
        // names (e.g. "WD" vs "Western Digital", Windows listings without "Microsoft").
        // The 70%/allStrongMatch scoring threshold handles brand discrimination instead.
        // The must-have tokens only guard against cross-model false positives
        // (e.g. RTX 5090 searched → RTX 5070 Ti matched at 83% because everything except
        // the model number "5090" matched — model-number must-have hard-rejects this).
        const QUALIFIER_MUST_HAVE = new Set(["ti", "super", "xt", "xtx", "gre", "kf", "ks", "x3d"]);
        const mustHaveTokens = [];
        for (const t of allTokens) {
            if (/^\d{3,}$/.test(t) || QUALIFIER_MUST_HAVE.has(t)) {
                mustHaveTokens.push(t);
            }
        }

        console.log(
            `[SEARCH] Tokens: all=${allTokens.length} strong=${strongTokens.length} weak=${weakTokens.length} ` +
            `brand="${brand}" mustHave=${JSON.stringify(mustHaveTokens)} | query="${simplifiedName}"`
        );

        const evalResult = await page.evaluate(
            (args) => {
                const {
                    allTokens, strongTokens, weakTokens, brand,
                    mustHaveTokens,
                    blacklistPattern, applyBlacklist,
                } = args;
                const blacklistRe = applyBlacklist
                    ? new RegExp(blacklistPattern, "i")
                    : null;

                const results = Array.from(
                    document.querySelectorAll(
                        'div[data-component-type="s-search-result"]:not(.AdHolder):not(.s-widget)'
                    )
                );

                // Helper: extract price from a search-result card
                function extractResultPrice(result) {
                    let rawPrice = null;
                    const offscreen = result.querySelector(
                        ".a-price:not(.a-text-strike) .a-offscreen"
                    );
                    if (offscreen) rawPrice = offscreen.textContent.trim() || null;
                    if (!rawPrice) {
                        const box = result.querySelector(
                            ".a-price:not(.a-text-strike)"
                        );
                        if (box) {
                            const w = box.querySelector(".a-price-whole");
                            const f = box.querySelector(".a-price-fraction");
                            if (w) {
                                const wt = w.textContent.replace(/[^0-9]/g, "");
                                const ft = f ? f.textContent.replace(/[^0-9]/g, "") : "00";
                                if (wt) rawPrice = `${wt},${ft}`;
                            }
                        }
                    }
                    return rawPrice;
                }

                function scoreResult(result) {
                    let titleEl = result.querySelector("h2 a span");
                    if (!titleEl)
                        titleEl = result.querySelector(
                            ".a-size-medium.a-color-base.a-text-normal, .a-size-base-plus.a-color-base.a-text-normal"
                        );
                    const title = titleEl ? titleEl.innerText.trim() : "";
                    if (!title) return null;

                    const titleLower = title.toLowerCase();

                    // Blacklist: reject accessory results (unless exempt)
                    if (blacklistRe && blacklistRe.test(titleLower)) return null;

                    // Hard reject if any must-have token (brand, model number, qualifier) is absent.
                    // Word-boundary regex prevents "xt" from matching inside "xtx", "5070" inside "50701", etc.
                    for (const mh of mustHaveTokens) {
                        const re = new RegExp(
                            "\\b" + mh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b"
                        );
                        if (!re.test(titleLower)) return null;
                    }

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
                        const rawPrice = extractResultPrice(result);
                        if (!rawPrice) return null;
                        const linkEl = result.querySelector("h2 a") || result.querySelector("a[href*='/dp/']");
                        const href = linkEl ? linkEl.getAttribute("href") : null;
                        const asin = result.getAttribute("data-asin");
                        const scraped_url = href
                            ? (href.startsWith("http") ? href : `https://www.amazon.de${href}`)
                            : (asin ? `https://www.amazon.de/dp/${asin}` : null);
                        return brand
                            ? { rawPrice, scraped_title: title, scraped_url, score: 1 }
                            : null;
                    }

                    // Rule 1: all strong tokens match AND at least half of weak
                    const allStrongMatch =
                        strongTokens.length === 0 ||
                        matchedStrong.length === strongTokens.length;
                    const halfWeakMatch =
                        weakTokens.length === 0 ||
                        matchedWeak.length >= Math.ceil(weakTokens.length / 2);
                    const rule1 = allStrongMatch && halfWeakMatch;

                    // Rule 2: at least 70% of all tokens match (raised from 60%)
                    const rule2 = matchedTotal / totalTokens >= 0.7;

                    if (!rule1 && !rule2) return null;

                    const rawPrice = extractResultPrice(result);

                    const linkEl = result.querySelector("h2 a") || result.querySelector("a[href*='/dp/']");
                    const href = linkEl ? linkEl.getAttribute("href") : null;
                    const asin = result.getAttribute("data-asin");
                    const scraped_url = href
                        ? (href.startsWith("http") ? href : `https://www.amazon.de${href}`)
                        : (asin ? `https://www.amazon.de/dp/${asin}` : null);

                    return {
                        rawPrice,
                        scraped_title: title,
                        scraped_url,
                        score: matchedTotal / totalTokens,
                    };
                }

                // Single pass: best scoring result
                let best = null;
                const allScored = [];
                for (const result of results) {
                    const data = scoreResult(result);
                    if (data) {
                        allScored.push({
                            score: data.score,
                            title: (data.scraped_title || "").substring(0, 70),
                        });
                        if (!best || data.score > best.score) best = data;
                    }
                }

                return {
                    best: best || null,
                    debugCount: results.length,
                    allScored: allScored.slice(0, 5),
                };
            },
            {
                allTokens, strongTokens, weakTokens, brand,
                mustHaveTokens,
                blacklistPattern: ACCESSORY_BLACKLIST_RE.source,
                applyBlacklist: !BLACKLIST_EXEMPT_CATEGORIES.has(category),
            }
        );

        if (evalResult) {
            const { best, debugCount, allScored } = evalResult;
            console.log(
                `[SEARCH] ${debugCount} result cards found. ${allScored.length} passed scoring.`
            );
            for (const s of allScored) {
                console.log(`[SEARCH]   score=${s.score.toFixed(2)} | "${s.title}"`);
            }
            if (best) {
                return {
                    price: best.rawPrice ? parsePrice(best.rawPrice) : null,
                    scraped_title: best.scraped_title,
                    scraped_url: best.scraped_url,
                };
            }
            console.warn(
                "[SEARCH] No result passed scoring threshold (need allStrong+halfWeak OR ≥70%)."
            );
        } else {
            console.warn(
                "[SEARCH] evaluate returned null — zero results or page not loaded."
            );
        }
    } catch (e) {
        console.warn(`[SEARCH] Error during extraction: ${e.message}`);
    }

    return { price: null, scraped_title: null, scraped_url: null };
}

// ==========================================
// PRODUCT SCRAPING
// ==========================================

// Minimum plausible prices per category (EUR).  Anything below this is
// almost certainly an accessory / wrong product.
const CATEGORY_MIN_PRICE = {
    GPU: 25,
    RAM: 8,
    Motherboard: 30,
    CPU: 20,
    Storage: 8,
    PSU: 15,
    PCCase: 15,
    CPUCooler: 5,
    CaseFan: 3,
    OS: 15,
};

export async function scrapeProduct(page, product, category = null) {
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
        console.log(`[SCRAPER] Phase 1 (SKU) for "${identifier}" → ${skuUrl}`);

        try {
            await page.goto(skuUrl, {
                waitUntil: "domcontentloaded",
                timeout: 25000,
            });
        } catch (navErr) {
            if (!/timeout/i.test(navErr.message)) {
                console.warn(`[SCRAPER] Phase 1 nav error: ${navErr.message}`);
                await page.goto("about:blank").catch(() => {});
                throw new Error(`Phase-1 navigation failed: ${navErr.message}`);
            }
            console.warn(`[SCRAPER] Phase 1 nav timeout — proceeding with loaded content`);
        }

        const block = await detectPageBlock(page);
        if (block) {
            console.warn(
                `[SCRAPER] Bot detection (${block}) on phase-1 URL. Sleeping 30-50s...`
            );
            await sleep(getRandomDelay(30000, 50000));
            await page.goto("about:blank").catch(() => {});
            throw new Error(`Bot detection (${block}) during phase-1 lookup`);
        }

        if (await detectPageNotFound(page)) {
            console.warn(`[SCRAPER]  → Phase 1: ASIN not found on amazon.de, skipping to search`);
            // Don't fall to Phase 2 search — the ASIN is invalid, searching by name is the best we can do
        } else if (await detectOutOfStock(page)) {
            console.warn(`[SCRAPER]  → Phase 1: product currently unavailable on amazon.de`);
            // Fall through to Phase 2 — a marketplace seller might still list it
        } else {
            await acceptCookies(page);
            await sleep(getRandomDelay(800, 1500));
            price = await extractPriceFromPage(page);
        }

        // ---- Phase 1.5: Offer-listing fallback ----
        // Some products have prices loaded via AJAX on the product page (lazy buybox).
        // The offer-listing page always renders prices statically — try it as a last resort.
        if (price === null) {
            const offerUrl = `https://www.amazon.de/gp/offer-listing/${String(product.amazon_sku).trim()}?condition=new`;
            console.log(`[SCRAPER] Phase 1.5 (offer-listing) for "${identifier}" → ${offerUrl}`);
            try {
                await page.goto(offerUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
            } catch (navErr) {
                if (!/timeout/i.test(navErr.message)) {
                    console.warn(`[SCRAPER] Phase 1.5 nav error: ${navErr.message}`);
                }
            }
            const block15 = await detectPageBlock(page);
            if (!block15 && !(await detectPageNotFound(page))) {
                await sleep(getRandomDelay(600, 1200));
                price = await extractOfferListingPrice(page);
            }
        }

        if (price !== null) {
            // Plausibility check (direct hits are more trusted – use half the min)
            const minPrice = (CATEGORY_MIN_PRICE[category] || 0) / 2;
            if (price < minPrice) {
                console.warn(
                    `[SCRAPER]  → Price ${price.toFixed(2)}€ below minimum ${minPrice}€ for ${category}, rejecting`
                );
                price = null;
            } else {
                return { price, scraped_url: scrapedUrl, scraped_title: scrapedTitle };
            }
        }

        console.warn(
            `[SCRAPER]  → Phase 1 failed for "${identifier}", falling back to search...`
        );
    }

    // ---- Phase 2: Fallback search (no SKU or direct hit failed) ----
    // Use full name — clean_name strips specs (DDR4-3200, 2TB, 850W, Home edition)
    // that are critical for uniquely identifying the product on Amazon.
    const rawName = String(
        product.name || product.clean_name || ""
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

    console.log(`[SCRAPER] Phase 2 (search) for "${identifier}"`);
    console.log(`[SCRAPER]   raw="${rawName}" → simplified="${simplifiedName}"`);
    console.log(`[SCRAPER]   URL: ${searchUrl}`);

    try {
        await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: 25000,
        });
    } catch (navErr) {
        if (!/timeout/i.test(navErr.message)) {
            console.warn(`[SCRAPER] Phase 2 nav error: ${navErr.message}`);
            await page.goto("about:blank").catch(() => {});
            throw new Error(`Phase-2 navigation failed: ${navErr.message}`);
        }
        console.warn(`[SCRAPER] Phase 2 nav timeout — proceeding with loaded content`);
    }

    const block2 = await detectPageBlock(page);
    if (block2) {
        console.warn(
            `[SCRAPER] Bot detection (${block2}) on search page. Sleeping 30-50s...`
        );
        await sleep(getRandomDelay(30000, 50000));
        await page.goto("about:blank").catch(() => {});
        throw new Error(`Bot detection (${block2}) during phase-2 search`);
    }

    await acceptCookies(page);
    await sleep(getRandomDelay(800, 1500));

    const searchName = artifactCleanName;
    const result = await extractFirstSearchResult(page, searchName, category);
    price = result.price;
    scrapedUrl = result.scraped_url || undefined;
    scrapedTitle = result.scraped_title || undefined;

    if (scrapedTitle) {
        console.log(
            `[SCRAPER]  → Matched: "${scrapedTitle.substring(0, 60)}"`
        );
    }

    // ---- Phase 3: Deep-link extraction (if search card hid the price) ----
    if (price === null && scrapedTitle && !scrapedUrl) {
        console.warn(`[SCRAPER]  → Match found but scraped_url is null — Phase 3 skipped`);
    }
    if (price === null && scrapedUrl) {
        console.log(`[SCRAPER] Phase 3 (deep-link): ${scrapedUrl}`);
        try {
            await page.goto(scrapedUrl, {
                waitUntil: "domcontentloaded",
                timeout: 25000,
            });

            const block3 = await detectPageBlock(page);
            if (block3) {
                console.warn(`[SCRAPER] Bot detection (${block3}) on phase-3 deep-link.`);
            } else {
                await acceptCookies(page);
                await sleep(getRandomDelay(800, 1500));
                price = await extractPriceFromPage(page);
            }
        } catch (navErr) {
            console.warn(`[SCRAPER] Phase 3 nav error: ${navErr.message}`);
        }
    }

    // Plausibility check for fallback-search results (full minimum)
    if (price !== null) {
        const minPrice = CATEGORY_MIN_PRICE[category] || 0;
        if (price < minPrice) {
            console.warn(
                `[SCRAPER]  → Price ${price.toFixed(2)}€ below minimum ${minPrice}€ for ${category}, rejecting`
            );
            price = null;
        } else {
            console.log(`[SCRAPER]  → Final price: ${price.toFixed(2)}€`);
        }
    } else {
        console.warn(
            `[SCRAPER]  → All phases failed for "${identifier}"`
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
                    const tmpPath = filePath + ".tmp";
                    await writeFile(
                        tmpPath,
                        JSON.stringify(data, null, 2),
                        "utf-8"
                    );
                    await rename(tmpPath, filePath);
                } catch (err) {
                    console.error(
                        `[WRITE ERROR] Failed to write ${filePath}: ${err.message}`
                    );
                    throw err;
                }
            })
            .catch((err) => {
                console.error(
                    `[WRITE ERROR] Chain broken for ${filePath}: ${err.message}`
                );
            });
        return writeChain;
    };
}
