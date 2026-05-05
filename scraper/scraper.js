/**
 * scraper.js
 *
 * ETL workflow (Extract, Transform, Load) for hardware components.
 * STRICT scoped DOM scraping to prevent carousel/ad scraping.
 */

import { readFile } from "fs/promises";
import {
    launchStealthBrowser,
    enableResourceBlocking,
    scrapeProduct,
    sleep,
    getRandomDelay,
    createSafeWriter,
} from "./scraper-core.js";

// ==========================================
// CONFIGURATION
// ==========================================
const PROCESSED_DATA_DIR = "../processed_data";

const ALL_CATEGORIES = [
    "CPU",
    "GPU",
    "RAM",
    "Motherboard",
    "Storage",
    "PSU",
    "PCCase",
    "CPUCooler",
    "CaseFan",
    "OS",
];

const CONCURRENCY = 6;
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 6000;
const MAX_RETRIES = 3;

// ==========================================
// MAIN ENTRY POINT
// ==========================================
(async function main() {
    console.log("==========================================");
    console.log("  PC Builder - ETL Scraper (Stealth)      ");
    console.log("==========================================\n");

    const targetCategory = process.argv[2] || null;
    const categories = targetCategory
        ? ALL_CATEGORIES.filter(
              (c) => c.toLowerCase() === targetCategory.toLowerCase()
          )
        : ALL_CATEGORIES;

    if (targetCategory && categories.length === 0) {
        console.error(
            `[FATAL] Unknown category "${targetCategory}". Valid options: ${ALL_CATEGORIES.join(", ")}`
        );
        process.exit(1);
    }

    const summaryRows = [];
    let browser;

    try {
        browser = await launchStealthBrowser();

        const pages = await Promise.all(
            Array.from({ length: CONCURRENCY }, async (_, i) => {
                const p = await browser.newPage();
                const w = 1280 + Math.floor(Math.random() * 200);
                const h = 800 + Math.floor(Math.random() * 200);
                await p.setViewport({ width: w, height: h });
                await enableResourceBlocking(p);
                console.log(
                    `[BROWSER] Page ${i + 1}/${CONCURRENCY} ready.`
                );
                return p;
            })
        );
        console.log();

        const safeWrite = createSafeWriter();

        for (const category of categories) {
            const filePath = `${PROCESSED_DATA_DIR}/${category}.json`;

            let products;
            try {
                const raw = await readFile(filePath, "utf-8");
                products = JSON.parse(raw);
            } catch (err) {
                console.warn(
                    `[SKIP] Cannot read ${filePath}: ${err.message}`
                );
                continue;
            }

            console.log(`\n==========================================`);
            console.log(`  Category: ${category}`);
            console.log(
                `  Total: ${products.length} | Workers: ${CONCURRENCY}`
            );
            console.log(`==========================================\n`);

            const todo = [...products];
            let okCount = 0;
            let failCount = 0;
            const queue = [...todo];

            const pageWorker = async (page, pageId) => {
                while (true) {
                    const product = queue.shift();
                    if (!product) break;

                    let attempt = 0;
                    let scrapeResult = {
                        price: null,
                        scraped_url: undefined,
                        scraped_title: undefined,
                    };

                    while (attempt < MAX_RETRIES) {
                        attempt++;
                        try {
                            scrapeResult = await scrapeProduct(page, product, category);
                            break;
                        } catch (err) {
                            console.warn(
                                `[P${pageId}] Attempt ${attempt} failed: ${err.message}`
                            );
                            if (attempt < MAX_RETRIES) {
                                const backoff = getRandomDelay(5000, 10000);
                                console.log(
                                    `[P${pageId}] Retrying after ${(
                                        backoff / 1000
                                    ).toFixed(1)}s...`
                                );
                                await sleep(backoff);
                            }
                        }
                    }

                    product.price = scrapeResult.price;
                    product.available = scrapeResult.available ?? true;
                    product.last_updated = new Date().toISOString();
                    const hasSku =
                        product.amazon_sku &&
                        String(product.amazon_sku).trim().length > 0;
                    if (!hasSku && scrapeResult.scraped_url)
                        product.scraped_url = scrapeResult.scraped_url;
                    if (!hasSku && scrapeResult.scraped_title)
                        product.scraped_title = scrapeResult.scraped_title;

                    const status = product.price !== null ? "OK" : "FAILED";
                    status === "OK" ? okCount++ : failCount++;
                    const remaining = queue.length;
                    console.log(
                        `[P${pageId}] [${status}] "${(
                            product.name || "unknown"
                        ).substring(0, 55)}" ` +
                            `| price: ${product.price ?? "null"} | queue: ${remaining}\n`
                    );

                    await safeWrite(filePath, products);

                    if (queue.length > 0) {
                        const delay = getRandomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
                        console.log(
                            `[P${pageId}] Sleeping ${(delay / 1000).toFixed(
                                1
                            )}s...\n`
                        );
                        await sleep(delay);
                    }
                }
            };

            await Promise.all(pages.map((p, i) => pageWorker(p, i + 1)));

            summaryRows.push({
                category,
                total: products.length,
                ok: okCount,
                failed: failCount,
                unavailable: products.filter(p => p.available === false).length,
            });
        }

        await browser.close();
        browser = null;

        console.log("\n===========================================");
        console.log("  ETL Summary");
        console.log("===========================================");
        console.log(
            `  ${"Category".padEnd(14)} ${"Total".padStart(6)} ${"OK".padStart(6)} ${"Failed".padStart(7)} ${"N/A".padStart(6)}`
        );
        console.log(`  ${"-".repeat(44)}`);
        for (const row of summaryRows) {
            console.log(
                `  ${row.category.padEnd(14)} ` +
                    `${String(row.total).padStart(6)} ` +
                    `${String(row.ok).padStart(6)} ` +
                    `${String(row.failed).padStart(7)} ` +
                    `${String(row.unavailable).padStart(6)}`
            );
        }
        console.log("===========================================");
    } catch (error) {
        console.error("[FATAL] An unexpected error occurred:", error);
        if (browser) await browser.close().catch(() => {});
        process.exit(1);
    }
})();
