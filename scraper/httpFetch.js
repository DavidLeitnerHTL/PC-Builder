/**
 * httpFetch.js
 *
 * Browserless HTTP layer for Amazon.de.
 *
 * Amazon serves the complete, price-bearing product HTML to a plain HTTP
 * client as long as the request carries a believable desktop-Chrome header
 * set.  The search endpoint (/s?k=) additionally requires a same-origin
 * `referer`, otherwise it answers with the interstitial bot challenge.
 *
 * The returned HTML is parsed with linkedom, which gives us a real DOM
 * (querySelector, classList, closest, getAttribute) so the extraction logic
 * in domExtractors.js is identical to what runs inside the browser.
 */

import { parseHTML } from "linkedom";

const AMAZON_ORIGIN = "https://www.amazon.de";

// Realistic desktop Chrome user agents. Rotated per request so a long run
// does not look like one client hammering the site.
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
];

function buildHeaders(userAgent) {
    const isMac = userAgent.includes("Mac OS X");
    const isLinux = userAgent.includes("X11; Linux");
    const platform = isMac ? '"macOS"' : isLinux ? '"Linux"' : '"Windows"';
    const major = (userAgent.match(/Chrome\/(\d+)/) || [, "140"])[1];

    return {
        "user-agent": userAgent,
        accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "sec-ch-ua": `"Chromium";v="${major}", "Not=A?Brand";v="24", "Google Chrome";v="${major}"`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": platform,
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        // Amazon's /s?k= endpoint answers with the interstitial bot challenge
        // when the request arrives without a same-origin referer.
        referer: `${AMAZON_ORIGIN}/`,
    };
}

function pickUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Fetch an Amazon page over plain HTTP.
 *
 * Resolves to { ok, status, finalUrl, html, error }. Never throws — a network
 * failure comes back as { ok: false, error } so the caller can fall back to
 * the browser path.
 */
export async function fetchAmazonPage(url, { timeoutMs = 20000 } = {}) {
    if (typeof fetch !== "function") {
        return { ok: false, status: 0, finalUrl: url, html: "", error: "global fetch unavailable (needs Node 18+)" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            headers: buildHeaders(pickUserAgent()),
            redirect: "follow",
            signal: controller.signal,
        });
        const html = await response.text();
        return {
            ok: true,
            status: response.status,
            finalUrl: response.url || url,
            html,
            error: null,
        };
    } catch (err) {
        const reason = err.name === "AbortError" ? `timeout after ${timeoutMs}ms` : err.message;
        return { ok: false, status: 0, finalUrl: url, html: "", error: reason };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Parse an HTML string into a DOM document usable by domExtractors.js.
 */
export function parseDocument(html) {
    const { document } = parseHTML(html);
    return document;
}

export { AMAZON_ORIGIN };
