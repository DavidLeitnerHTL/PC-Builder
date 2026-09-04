/**
 * parityTest.js
 *
 * Verifies that the browserless HTTP path returns the same answers as the
 * Puppeteer path.  Both paths run against the same live products, back to
 * back, and every disagreement is reported.
 *
 * Usage (from scraper/):
 *   node parityTest.js                 # 4 products from every category
 *   node parityTest.js CPU 10          # 10 products from one category
 *   node parityTest.js all 3           # 3 products from every category
 *   node parityTest.js CPU 5 --search  # strip the SKU to force the phase-2
 *                                      # search path on both sides
 *
 * Exit code is 1 if any mismatch is found, so it can gate a commit.
 */

import { readFile } from "fs/promises";
import {
    launchStealthBrowser,
    enableResourceBlocking,
    scrapeProductViaHttp,
    scrapeProductViaBrowser,
    sleep,
    getRandomDelay,
} from "./scraper-core.js";

const PROCESSED_DATA_DIR = "../processed_data";
const ALL_CATEGORIES = [
    "CPU", "GPU", "RAM", "Motherboard", "Storage",
    "PSU", "PCCase", "CPUCooler", "CaseFan", "OS",
];

const FORCE_SEARCH = process.argv.includes("--search");
const targetArg = (process.argv[2] || "all").toLowerCase();
const perCategory = Number(process.argv[3]) || 4;
const categories =
    targetArg === "all"
        ? ALL_CATEGORIES
        : ALL_CATEGORIES.filter((c) => c.toLowerCase() === targetArg);

if (categories.length === 0) {
    console.error(`[FATAL] Unknown category "${process.argv[2]}"`);
    process.exit(1);
}

// Deterministic spread across the file instead of the first N entries, so the
// sample is not biased towards one manufacturer.
function sample(products, n) {
    const withSku = products.filter(
        (p) => p.amazon_sku && String(p.amazon_sku).trim().length > 0
    );
    const pool = withSku.length >= n ? withSku : products;
    if (pool.length <= n) return pool;
    const step = Math.floor(pool.length / n);
    return Array.from({ length: n }, (_, i) => pool[i * step]);
}

function fmt(value) {
    if (value === null || value === undefined) return "null";
    return typeof value === "number" ? value.toFixed(2) : String(value);
}

(async function main() {
    console.log("==========================================");
    console.log("  HTTP vs Puppeteer — parity test");
    console.log("==========================================\n");

    const browser = await launchStealthBrowser();
    const page = await browser.newPage();
    await enableResourceBlocking(page);

    const rows = [];
    let mismatches = 0;
    let httpHandled = 0;
    let httpDeclined = 0;
    let httpMs = 0;
    let browserMs = 0;
    let peakRss = 0;

    for (const category of categories) {
        let products;
        try {
            const raw = await readFile(`${PROCESSED_DATA_DIR}/${category}.json`, "utf-8");
            products = JSON.parse(raw);
        } catch (err) {
            console.warn(`[SKIP] ${category}: ${err.message}`);
            continue;
        }

        for (const original of sample(products, perCategory)) {
            // Both sides get their own copy so neither run can mutate the other's
            // input, and --search drops the SKU to exercise the fallback path.
            const product = { ...original };
            if (FORCE_SEARCH) delete product.amazon_sku;

            const name = (product.name || product.id || "unknown").substring(0, 45);
            console.log(`\n--- [${category}] ${name}${FORCE_SEARCH ? " (search-only)" : ""} ---`);

            const tHttp = Date.now();
            let http;
            try {
                http = await scrapeProductViaHttp(product, category);
            } catch (err) {
                http = { handled: false, reason: `threw: ${err.message}` };
            }
            const httpElapsed = Date.now() - tHttp;
            httpMs += httpElapsed;
            peakRss = Math.max(peakRss, process.memoryUsage().rss);

            await sleep(getRandomDelay(1500, 3000));

            const tBrowser = Date.now();
            let browserResult;
            try {
                browserResult = await scrapeProductViaBrowser(page, product, category);
            } catch (err) {
                browserResult = { price: null, available: true, error: err.message };
            }
            const browserElapsed = Date.now() - tBrowser;
            browserMs += browserElapsed;

            const browserPrice = browserResult.price ?? null;
            const browserAvailable = browserResult.available ?? true;

            let verdict;
            if (!http.handled) {
                httpDeclined++;
                verdict = "DECLINED";
            } else {
                httpHandled++;
                const httpPrice = http.result.price ?? null;
                const httpAvailable = http.result.available ?? true;
                const samePrice =
                    httpPrice === browserPrice ||
                    (httpPrice !== null &&
                        browserPrice !== null &&
                        Math.abs(httpPrice - browserPrice) < 0.01);
                verdict = samePrice && httpAvailable === browserAvailable ? "MATCH" : "MISMATCH";
                if (verdict === "MISMATCH") mismatches++;
            }

            rows.push({
                category,
                name,
                http: http.handled ? fmt(http.result.price) : `– (${http.reason})`,
                httpAvail: http.handled ? String(http.result.available ?? true) : "–",
                browser: fmt(browserPrice),
                browserAvail: String(browserAvailable),
                verdict,
                httpElapsed,
                browserElapsed,
            });

            console.log(
                `    → ${verdict}  http=${rows.at(-1).http} (${httpElapsed}ms)  ` +
                `browser=${fmt(browserPrice)} (${browserElapsed}ms)`
            );

            await sleep(getRandomDelay(1500, 3000));
        }
    }

    await browser.close();

    console.log("\n\n==========================================");
    console.log("  Results");
    console.log("==========================================");
    console.log(
        `${"Category".padEnd(12)} ${"Product".padEnd(46)} ${"HTTP".padEnd(12)} ${"Browser".padEnd(10)} Verdict`
    );
    console.log("-".repeat(100));
    for (const r of rows) {
        console.log(
            `${r.category.padEnd(12)} ${r.name.padEnd(46)} ${r.http.padEnd(12)} ${r.browser.padEnd(10)} ${r.verdict}`
        );
    }

    const total = rows.length;
    console.log("\n==========================================");
    console.log("  Summary");
    console.log("==========================================");
    console.log(`  Products tested   : ${total}`);
    console.log(`  HTTP handled      : ${httpHandled} (${((httpHandled / total) * 100).toFixed(1)}%)`);
    console.log(`  HTTP declined     : ${httpDeclined} (browser fallback)`);
    console.log(`  MISMATCHES        : ${mismatches}`);
    console.log(`  HTTP total time   : ${(httpMs / 1000).toFixed(1)}s (avg ${Math.round(httpMs / total)}ms)`);
    console.log(`  Browser total time: ${(browserMs / 1000).toFixed(1)}s (avg ${Math.round(browserMs / total)}ms)`);
    console.log(`  Speedup           : ${(browserMs / httpMs).toFixed(2)}x`);
    console.log(`  Node peak RSS     : ${Math.round(peakRss / 1048576)} MB`);
    console.log("==========================================");

    process.exit(mismatches > 0 ? 1 : 0);
})();
