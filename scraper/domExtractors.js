/**
 * domExtractors.js
 *
 * Pure DOM extraction logic, decoupled from Puppeteer.
 *
 * Every function here takes a `document` and uses nothing but standard DOM
 * APIs, so the same code runs against a linkedom document built from a plain
 * HTTP response.  These are ports of the `page.evaluate` callbacks in
 * scraper-core.js and must stay behaviourally identical to them — the parity
 * test (`node parityTest.js`) asserts exactly that against live pages.
 *
 * Note: linkedom implements `textContent` but not `innerText`, so the ports
 * use `textContent` throughout.
 */

// ==========================================
// PAGE STATE DETECTION
// ==========================================

// Returns "captcha" if Amazon is rate-limiting / showing a bot-check page.
export function detectBlockInDocument(doc, url = "") {
    if (/\/errors\/validateCaptcha|\/captcha\//i.test(url)) return "captcha";

    const title = (doc.title || "").toLowerCase();
    if (
        title.includes("robot check") ||
        title.includes("captcha") ||
        title.includes("access denied") ||
        title.includes("zugang verweigert") ||
        title.includes("authentifizierung")
    )
        return "captcha";

    if (
        doc.querySelector("#captchacharacters") ||
        doc.querySelector('form[action*="validateCaptcha"]') ||
        doc.querySelector('form[action*="/errors/"]')
    )
        return "captcha";

    const body = (doc.body?.textContent || "").substring(0, 1500).toLowerCase();
    if (
        body.includes("geben sie die zeichen") ||
        body.includes("enter the characters") ||
        body.includes("unusual traffic from your computer") ||
        body.includes("wir müssen sicherstellen, dass sie kein robot")
    )
        return "captcha";

    // Interstitial challenge: served instead of the real page when the request
    // looks automated. It is a tiny document with an empty iframe shell.
    if (body.includes("triggerinterstitialchallenge")) return "captcha";

    return null;
}

// Returns true if the page is a 404 / product-not-found page.
export function detectNotFoundInDocument(doc) {
    const title = (doc.title || "").toLowerCase().trim();
    if (title === "page not found" || title.includes("seite nicht gefunden")) return true;

    // Amazon's 404 page has no #ppd or #dp element
    if (!doc.querySelector("#ppd") && !doc.querySelector("#dp")) {
        // But also no search results (to avoid false-positive on search pages)
        if (!doc.querySelector('[data-component-type="s-search-result"]')) {
            const body = (doc.body?.textContent || "").substring(0, 500).toLowerCase();
            if (body.includes("page not found") || body.includes("seite nicht gefunden")) return true;
        }
    }
    return false;
}

// Returns true if the buybox explicitly says the product is unavailable.
export function detectOutOfStockInDocument(doc) {
    const oos = doc.querySelector("#outOfStock, #availability_feature_div #outOfStock");
    if (oos) return true;

    const avail = doc.querySelector("#availability span, #availability");
    if (avail) {
        const t = (avail.textContent || "").toLowerCase();
        if (
            t.includes("currently unavailable") ||
            t.includes("derzeit nicht verfügbar") ||
            t.includes("nicht auf lager") ||
            t.includes("we don't know when or if")
        )
            return true;
    }

    // "No featured offers available" — no active seller on any marketplace
    const ppd = doc.querySelector("#ppd, #rightCol");
    if (ppd) {
        const t = (ppd.textContent || "").toLowerCase();
        if (t.includes("no featured offers available") || t.includes("kein featured angebot verfügbar"))
            return true;
    }
    return false;
}

// ==========================================
// PRICE EXTRACTION
// ==========================================

function readPriceText(el) {
    if (!el) return null;
    const offscreenEl = el.classList?.contains("a-offscreen") ? el : el.querySelector(".a-offscreen");
    const offscreenText = offscreenEl ? offscreenEl.textContent.trim() : "";
    if (offscreenText.length > 0 && /[0-9]/.test(offscreenText)) return offscreenText;

    const whole = el.querySelector(".a-price-whole");
    const fraction = el.querySelector(".a-price-fraction");
    if (whole) {
        const wholeText = whole.textContent.replace(/[^0-9]/g, "");
        const fracText = fraction ? fraction.textContent.replace(/[^0-9]/g, "") : "00";
        if (wholeText) return `${wholeText},${fracText}`;
    }

    const raw = (el.textContent || "").trim();
    return raw.length > 0 && /[0-9]/.test(raw) ? raw : null;
}

function isOwnProduct(doc, el, pageAsin) {
    if (!pageAsin) return true;
    let node = el.parentElement;
    while (node && node !== doc.body) {
        const asin = node.getAttribute("data-csa-c-asin") || node.getAttribute("data-asin");
        if (asin && asin !== pageAsin) return false;
        node = node.parentElement;
    }
    return true;
}

/**
 * Port of the price cascade in extractPriceFromPage().
 * Returns { rawPrice, via } or null.
 *
 * `fallbackUrl` stands in for window.location.href, which does not exist on a
 * document parsed from a raw HTTP response.
 */
export function extractPriceInDocument(doc, fallbackUrl = "") {
    function ret(price, via) {
        return { rawPrice: price, via };
    }

    const canonicalHref = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || fallbackUrl;
    const asinMatch = String(canonicalHref).match(/\/dp\/([A-Z0-9]{10})/);
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
        const el = doc.querySelector(sel);
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
        const scope = doc.querySelector(scopeSel);
        if (!scope) continue;
        for (const priceSel of buyBoxSelectors) {
            const el = scope.querySelector(priceSel);
            if (!el) continue;
            if (el.classList?.contains("a-text-strike") || el.hasAttribute("data-a-strike")) continue;
            if (!isOwnProduct(doc, el, pageAsin)) continue;
            const text = readPriceText(el);
            if (text) return ret(text, `buyBox:${scopeSel}>${priceSel}`);
        }
    }

    const usedBuyBoxScopes = ["#usedBuySection", "#buyUsed_feature_div", "#buyBoxAccordion"];
    for (const scopeSel of usedBuyBoxScopes) {
        const scope = doc.querySelector(scopeSel);
        if (!scope) continue;
        const candidates = Array.from(scope.querySelectorAll(".a-price"));
        for (const el of candidates) {
            if (el.closest('#aod-ingress-link, #olp_feature_div, [id*="aodIngress"]')) continue;
            if (el.classList?.contains("a-text-strike") || el.hasAttribute("data-a-strike")) continue;
            if (!isOwnProduct(doc, el, pageAsin)) continue;
            const text = readPriceText(el);
            if (text) return ret(text, `usedBox:${scopeSel}`);
        }
    }

    const rightCol =
        doc.querySelector("#rightCol") || doc.querySelector("#desktop_buybox") || doc.querySelector("#ppd");
    if (rightCol) {
        const allWholes = Array.from(rightCol.querySelectorAll(".a-price-whole"));
        for (const whole of allWholes) {
            if (
                whole.closest(
                    "#aod-ingress-link, #olp_feature_div, " +
                        '.a-carousel-container, [data-cel-widget*="sims"], ' +
                        '[data-cel-widget*="carousel"], [data-cel-widget*="sp_detail"], ' +
                        '[id*="similarities"], [id*="sponsored"]'
                )
            )
                continue;
            const priceEl = whole.closest(".a-price");
            if (priceEl && (priceEl.classList?.contains("a-text-strike") || priceEl.hasAttribute("data-a-strike")))
                continue;
            if (!isOwnProduct(doc, whole, pageAsin)) continue;
            const wholeText = whole.textContent.replace(/\D/g, "");
            if (!wholeText) continue;
            const fractionEl = priceEl?.querySelector(".a-price-fraction");
            const fracText = fractionEl ? fractionEl.textContent.replace(/\D/g, "") : "00";
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
        const scope = doc.querySelector(scopeSel);
        if (!scope) continue;
        const label = scope.getAttribute("aria-label") || "";
        if (label && /[0-9]/.test(label) && /[€$£]|EUR/.test(label))
            return ret(label, `aria-label:${scopeSel}[self]`);
        const candidates = Array.from(scope.querySelectorAll("[aria-label]"));
        for (const el of candidates) {
            if (el.closest("#aod-ingress-link, #olp_feature_div, .a-carousel-container")) continue;
            if (el.closest('[id*="similarities"], [id*="sponsored"]')) continue;
            const lbl = el.getAttribute("aria-label") || "";
            if (lbl && /[0-9]/.test(lbl) && /[€$£]|EUR/.test(lbl))
                return ret(lbl, `aria-label:${scopeSel}>[aria-label]`);
        }
    }

    const priceRegex = /(\d{1,4}[.,]\d{2})\s*€/;
    const regexScopes = [...buyBoxScopes, "#rightCol", "#desktop_buybox"];
    for (const scopeSel of regexScopes) {
        const scope = doc.querySelector(scopeSel);
        if (!scope) continue;
        const text = scope.textContent || "";
        const match = text.match(priceRegex);
        if (match) return ret(match[1], `regex:${scopeSel}`);
    }

    return null;
}

/**
 * Port of the offer-listing extraction in extractOfferListingPrice().
 * Returns the raw price string or null.
 *
 * `/gp/offer-listing/<ASIN>` no longer serves the old `.olpOffer` layout — it
 * redirects to the product page with `?aod=1`.  The generic ".a-price" fallback
 * therefore lands on a full product page whose first price can belong to an ad
 * carousel for a completely different article (observed: B01019BM7O returning
 * €45,37 from a neighbouring ASIN's widget).  `expectedAsin` gates the fallback
 * with the same ownership rule the buybox cascade uses.
 */
export function extractOfferListingPriceInDocument(doc, expectedAsin = null) {
    const offers = Array.from(doc.querySelectorAll(".olpOffer"));
    for (const offer of offers) {
        const cond = (offer.querySelector(".olpCondition")?.textContent || "").toLowerCase();
        if (cond && !cond.includes("neu") && !cond.includes("new")) continue;
        const priceEl = offer.querySelector(".olpOfferPrice, .a-price .a-offscreen, .a-price-whole");
        const text = priceEl ? priceEl.textContent.trim() : null;
        if (text && /[0-9]/.test(text)) return text;
    }

    const candidates = Array.from(doc.querySelectorAll(".a-price:not(.a-text-strike) .a-offscreen"));
    for (const el of candidates) {
        if (!isOwnProduct(doc, el, expectedAsin)) continue;
        if (
            el.closest(
                '.a-carousel-container, [data-cel-widget*="carousel"], [data-cel-widget*="sims"], ' +
                    '[id*="similarities"], [id*="sponsored"], [class*="multi-brand"]'
            )
        )
            continue;
        const text = el.textContent.trim();
        if (text && /[0-9]/.test(text)) return text;
    }
    return null;
}

// ==========================================
// SEARCH RESULT SELECTION
// ==========================================

/**
 * Port of the scoring pass inside extractFirstSearchResult().
 * `args` carries the pre-computed token sets so the scoring rules stay in one
 * place (scraper-core.js) for both paths.
 */
export function pickSearchResultInDocument(doc, args) {
    const { allTokens, strongTokens, weakTokens, brand, mustHaveTokens, blacklistPattern, applyBlacklist } = args;

    const blacklistRe = applyBlacklist ? new RegExp(blacklistPattern, "i") : null;

    const results = Array.from(
        doc.querySelectorAll('div[data-component-type="s-search-result"]:not(.AdHolder):not(.s-widget)')
    );

    function extractResultPrice(result) {
        let rawPrice = null;
        const offscreen = result.querySelector(".a-price:not(.a-text-strike) .a-offscreen");
        if (offscreen) rawPrice = offscreen.textContent.trim() || null;
        if (!rawPrice) {
            const box = result.querySelector(".a-price:not(.a-text-strike)");
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

    function buildScrapedUrl(result) {
        const linkEl = result.querySelector("h2 a") || result.querySelector("a[href*='/dp/']");
        const href = linkEl ? linkEl.getAttribute("href") : null;
        const asin = result.getAttribute("data-asin");
        if (href) return href.startsWith("http") ? href : `https://www.amazon.de${href}`;
        return asin ? `https://www.amazon.de/dp/${asin}` : null;
    }

    function scoreResult(result) {
        let titleEl = result.querySelector("h2 a span");
        if (!titleEl)
            titleEl = result.querySelector(
                ".a-size-medium.a-color-base.a-text-normal, .a-size-base-plus.a-color-base.a-text-normal"
            );
        const title = titleEl ? titleEl.textContent.trim() : "";
        if (!title) return null;

        const titleLower = title.toLowerCase();

        if (blacklistRe && blacklistRe.test(titleLower)) return null;

        for (const mh of mustHaveTokens) {
            const re = new RegExp("\\b" + mh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
            if (!re.test(titleLower)) return null;
        }

        const matchedStrong = strongTokens.filter((t) => titleLower.includes(t));
        const matchedWeak = weakTokens.filter((t) => titleLower.includes(t));
        const matchedTotal = matchedStrong.length + matchedWeak.length;

        const totalTokens = allTokens.length;
        if (totalTokens === 0) {
            const rawPrice = extractResultPrice(result);
            if (!rawPrice) return null;
            return brand
                ? { rawPrice, scraped_title: title, scraped_url: buildScrapedUrl(result), score: 1 }
                : null;
        }

        const allStrongMatch = strongTokens.length === 0 || matchedStrong.length === strongTokens.length;
        const halfWeakMatch = weakTokens.length === 0 || matchedWeak.length >= Math.ceil(weakTokens.length / 2);
        const rule1 = allStrongMatch && halfWeakMatch;
        const rule2 = matchedTotal / totalTokens >= 0.7;

        if (!rule1 && !rule2) return null;

        return {
            rawPrice: extractResultPrice(result),
            scraped_title: title,
            scraped_url: buildScrapedUrl(result),
            score: matchedTotal / totalTokens,
        };
    }

    let best = null;
    const allScored = [];
    for (const result of results) {
        const data = scoreResult(result);
        if (data) {
            allScored.push({ score: data.score, title: (data.scraped_title || "").substring(0, 70) });
            if (!best || data.score > best.score) best = data;
        }
    }

    return { best: best || null, debugCount: results.length, allScored: allScored.slice(0, 5) };
}
