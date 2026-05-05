/**
 * test-scraper.js
 *
 * Usage:
 *   node test-scraper.js            – unit tests only (no browser)
 *   node test-scraper.js --live     – unit + Phase-1 live SKU tests
 *   node test-scraper.js --live B0XXXXXX  – test a specific ASIN
 *
 * Live tests open a real Puppeteer browser against amazon.de.
 * Screenshots land in scraper/test-screenshots/.
 */

import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
    parsePrice,
    launchStealthBrowser,
    enableResourceBlocking,
    acceptCookies,
    extractPriceFromPage,
    extractOfferListingPrice,
    detectPageNotFound,
    detectOutOfStock,
    sleep,
    getRandomDelay,
} from "./scraper-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "test-screenshots");

// ============================================================
// Tiny test runner
// ============================================================
let passed = 0;
let failed = 0;

function assert(description, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        console.log(`  [PASS] ${description}`);
        passed++;
    } else {
        console.error(`  [FAIL] ${description}`);
        console.error(`         expected: ${JSON.stringify(expected)}`);
        console.error(`         actual:   ${JSON.stringify(actual)}`);
        failed++;
    }
}

function assertNotNull(description, actual) {
    if (actual !== null && actual !== undefined) {
        console.log(`  [PASS] ${description} → ${actual}`);
        passed++;
    } else {
        console.error(`  [FAIL] ${description} → got null/undefined`);
        failed++;
    }
}

function assertNull(description, actual) {
    if (actual === null || actual === undefined) {
        console.log(`  [PASS] ${description}`);
        passed++;
    } else {
        console.error(`  [FAIL] ${description} → expected null, got ${actual}`);
        failed++;
    }
}

// ============================================================
// Unit tests – parsePrice
// ============================================================
function runParsePriceTests() {
    console.log("\n=== parsePrice unit tests ===\n");

    // German format
    assert("DE: '1.234,56 €'", parsePrice("1.234,56 €"), 1234.56);
    assert("DE: '234,56€'", parsePrice("234,56€"), 234.56);
    assert("DE: '99,99'", parsePrice("99,99"), 99.99);
    assert("DE: '1.099,00'", parsePrice("1.099,00"), 1099.0);
    assert("DE: '9.999,99 €'", parsePrice("9.999,99 €"), 9999.99);

    // EN format
    assert("EN: '1,234.56'", parsePrice("1,234.56"), 1234.56);
    assert("EN: '234.56'", parsePrice("234.56"), 234.56);
    assert("EN: '99.99'", parsePrice("99.99"), 99.99);

    // Offscreen-style (Amazon a-offscreen often includes currency symbol)
    assert("offscreen: '1.234,56\\u00a0€'", parsePrice("1.234,56 €"), 1234.56);
    assert("offscreen: 'EUR 234,56'", parsePrice("EUR 234,56"), 234.56);

    // Edge cases
    assertNull("null input", parsePrice(null));
    assertNull("empty string", parsePrice(""));
    assertNull("zero", parsePrice("0,00"));
    assertNull("negative", parsePrice("-5,99"));
    assertNull("text only", parsePrice("abc"));

    // Whole number prices (no fraction)
    assert("whole number '200 €'", parsePrice("200 €"), 200);
    assert("whole number '1500'", parsePrice("1500"), 1500);
}

// ============================================================
// Live integration tests – Phase 1 SKU
// ============================================================

// ASINs pulled directly from processed_data (first entries per category).
const DEFAULT_TEST_ASINS = [
    { asin: "B07B428V2L", label: "CPU – Ryzen 5 2600X" },
    { asin: "B09H3NX9HZ", label: "GPU – PowerColor RX 6600" },
    { asin: "B0C3W81SCD", label: "RAM #1" },
    { asin: "B0C3HTWMGR", label: "RAM #2" },
    { asin: "B0C66229S4", label: "Storage #1" },
    { asin: "B07T5QDRFX", label: "Motherboard #1" },
];

async function runLiveTests(customAsin) {
    await mkdir(SCREENSHOT_DIR, { recursive: true });

    const targets = customAsin
        ? [{ asin: customAsin, label: "Custom ASIN" }]
        : DEFAULT_TEST_ASINS;

    console.log("\n=== Live Phase-1 (SKU) tests ===\n");
    console.log("Launching stealth browser...");

    let browser;
    try {
        browser = await launchStealthBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await enableResourceBlocking(page);

        for (const { asin, label } of targets) {
            console.log(`\n--- Testing: ${label} (ASIN: ${asin}) ---`);
            await testSkuPhase(page, asin, label);
            if (targets.length > 1) {
                const delay = getRandomDelay(3000, 6000);
                console.log(`Sleeping ${(delay / 1000).toFixed(1)}s between tests...`);
                await sleep(delay);
            }
        }
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

async function testSkuPhase(page, asin, label) {
    const url = `https://www.amazon.de/dp/${asin}`;
    console.log(`Navigating to: ${url}`);

    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
        if (/timeout/i.test(e.message)) {
            console.warn("Navigation timed out, using partially loaded content...");
        } else {
            console.error(`Navigation error: ${e.message}`);
            failed++;
            return;
        }
    }

    // Screenshot immediately after load
    const ssPath = path.join(SCREENSHOT_DIR, `${asin}-after-load.png`);
    await page.screenshot({ path: ssPath, fullPage: false }).catch(() => {});
    console.log(`Screenshot: ${ssPath}`);

    // Page title (tells us if we hit captcha or real product)
    const title = await page.title().catch(() => "(error)");
    console.log(`Page title: "${title}"`);

    // Bot detection check
    const isBlocked = await detectBlock(page);
    if (isBlocked) {
        console.error(`[BLOCKED] Bot detection triggered! (${isBlocked})`);
        console.error("  → The stealth plugin is insufficient or IP is flagged.");
        failed++;
        return;
    }
    console.log("[OK] No bot detection.");

    // Check for 404 / OOS before spending time on price extraction
    if (await detectPageNotFound(page)) {
        console.warn(`[SKIP] ASIN ${asin} — "Page Not Found" on amazon.de (invalid/delisted ASIN)`);
        passed++; // correct behavior: scraper should fall through to search
        return;
    }

    if (await detectOutOfStock(page)) {
        console.warn(`[SKIP] ASIN ${asin} — product currently unavailable (OOS), no price possible`);
        passed++; // correct behavior: scraper correctly returns null and falls to search
        return;
    }

    await acceptCookies(page);
    await sleep(1000);

    // DOM diagnostic – check which price selectors exist on page
    await dumpSelectorDiagnostic(page, asin);

    // Phase 1: product page
    console.log("\nPhase 1: extracting price from product page...");
    let price = await extractPriceFromPage(page);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${asin}-phase1.png`), fullPage: false }).catch(() => {});

    if (price !== null) {
        console.log(`[PASS] ${label}: Phase 1 price = ${price.toFixed(2)} €`);
        assertNotNull(`Phase-1 price for ${asin}`, price);
        return;
    }

    // Phase 1.5: offer-listing page (lazy buybox products need this)
    console.log("Phase 1.5: trying offer-listing page...");
    const offerUrl = `https://www.amazon.de/gp/offer-listing/${asin}?condition=new`;
    try {
        await page.goto(offerUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    } catch (e) {
        if (!/timeout/i.test(e.message)) {
            console.error(`Phase 1.5 nav error: ${e.message}`);
            failed++;
            return;
        }
    }
    await sleep(800);
    price = await extractOfferListingPrice(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${asin}-phase1.5.png`), fullPage: false }).catch(() => {});

    if (price !== null) {
        console.log(`[PASS] ${label}: Phase 1.5 (offer-listing) price = ${price.toFixed(2)} €`);
        assertNotNull(`Phase-1.5 price for ${asin}`, price);
    } else {
        console.error(`[FAIL] ${label}: both Phase 1 and Phase 1.5 returned null`);
        console.error(`       → Screenshots: ${asin}-phase1.png, ${asin}-phase1.5.png`);
        failed++;
    }
}

async function detectBlock(page) {
    try {
        const url = page.url();
        if (/validateCaptcha|\/captcha\//i.test(url)) return "captcha-url";
        return await page.evaluate(() => {
            const title = (document.title || "").toLowerCase();
            if (title.includes("robot check") || title.includes("captcha")) return "captcha-title";
            if (title.includes("access denied") || title.includes("zugang")) return "access-denied";
            if (document.querySelector("#captchacharacters")) return "captcha-form";
            const body = (document.body?.innerText || "").substring(0, 1000).toLowerCase();
            if (body.includes("geben sie die zeichen") || body.includes("enter the characters")) return "captcha-body";
            if (body.includes("unusual traffic")) return "unusual-traffic";
            return null;
        });
    } catch {
        return null;
    }
}

async function dumpSelectorDiagnostic(page, asin) {
    console.log("\n  --- DOM selector diagnostic ---");

    const selectors = [
        // Core price containers
        "#corePriceDisplay_desktop_feature_div",
        "#corePrice_feature_div",
        "#apex_offerDisplay_desktop",
        "#desktop_buybox",
        "#rightCol",
        "#ppd",
        // Price elements
        ".priceToPay",
        ".apexPriceToPay",
        "#apex-pricetopay-accessibility-label",
        ".a-price-whole",
        ".a-offscreen",
        "#aod-ingress-link",
        // Accessibility labels
        "#corePriceDisplay_desktop_feature_div .a-offscreen",
        "#corePrice_feature_div .a-offscreen",
        // Not-in-stock signals
        "#availability",
        "#outOfStock",
        "#sold-by-amazon-availability",
        // Buybox
        "#buybox",
        "#buyNewSection",
        "#add-to-cart-button",
        "#buy-now-button",
        // Product identity check
        'link[rel="canonical"]',
    ];

    const selectorResults = await page.evaluate((sels) => {
        return sels.map((sel) => {
            const el = document.querySelector(sel);
            if (!el) return { sel, exists: false, text: null };
            const text = (el.textContent || "").trim().substring(0, 80);
            return { sel, exists: true, text };
        });
    }, selectors);

    for (const { sel, exists, text } of selectorResults) {
        if (exists) {
            console.log(`  [FOUND] ${sel}`);
            if (text) console.log(`          → "${text.replace(/\s+/g, " ")}"`);
        } else {
            console.log(`  [MISS]  ${sel}`);
        }
    }

    // Also dump the canonical URL to verify we're on the right product
    const canonicalUrl = await page.evaluate(() => {
        const el = document.querySelector('link[rel="canonical"]');
        return el ? el.href : window.location.href;
    }).catch(() => null);
    console.log(`  Canonical URL: ${canonicalUrl}`);
    console.log("  --- end diagnostic ---\n");
}

// ============================================================
// Entry point
// ============================================================
const args = process.argv.slice(2);
const liveFlagIndex = args.indexOf("--live");
const runLive = liveFlagIndex !== -1;
const customAsin = args.find((a) => a !== "--live") || null;

runParsePriceTests();

if (runLive) {
    runLiveTests(customAsin).then(() => {
        console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
        if (failed > 0) process.exit(1);
    }).catch((err) => {
        console.error("[FATAL]", err);
        process.exit(1);
    });
} else {
    console.log(`\n=== Unit results: ${passed} passed, ${failed} failed ===`);
    console.log("(Run with --live to also test live SKU scraping against amazon.de)\n");
    if (failed > 0) process.exit(1);
}
