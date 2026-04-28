/**
 * priceUpdater.js
 *
 * Updates existing prices for products that haven't been refreshed recently.
 * Reuses scraper-core.js for consistent, stealthy Amazon scraping.
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
    launchStealthBrowser,
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
    "CPU", "GPU", "RAM", "Motherboard", "Storage",
    "PSU", "PCCase", "CPUCooler", "CaseFan", "OS",
];

// Only update products whose price is older than this (days).
const MAX_AGE_DAYS = 7;

// Number of products to update per run (to keep execution time reasonable).
const MAX_PRODUCTS_PER_RUN = 100;

// Delays between requests.
const MIN_DELAY_MS = 10000;
const MAX_DELAY_MS = 25000;
const MAX_RETRIES = 3;

// ==========================================
// HELPERS
// ==========================================
function isStale(product) {
    if (!product.price) return false; // Only update products that already have a price.
    if (!product.last_updated) return true;
    const lastUpdate = new Date(product.last_updated);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    return lastUpdate < cutoff;
}

// ==========================================
// MAIN ENTRY POINT
// ==========================================
(async function main() {
    console.log("==========================================");
    console.log("  PC Builder - Price Updater (Stealth)    ");
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

    let browser;
    try {
        browser = await launchStealthBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        const safeWrite = createSafeWriter();
        let totalUpdated = 0;
        let totalFailed = 0;
        let totalSkipped = 0;

        for (const category of categories) {
            const filePath = path.join(PROCESSED_DATA_DIR, `${category}.json`);
            if (!existsSync(filePath)) {
                console.warn(`[SKIP] ${filePath} not found.`);
                continue;
            }

            let products;
            try {
                const raw = await readFile(filePath, "utf-8");
                products = JSON.parse(raw);
            } catch (err) {
                console.warn(`[SKIP] Cannot parse ${filePath}: ${err.message}`);
                continue;
            }

            const staleProducts = products.filter(isStale);
            const toUpdate = staleProducts.slice(0, MAX_PRODUCTS_PER_RUN);

            console.log(`\n[${category}] Total: ${products.length} | Stale: ${staleProducts.length} | Will update: ${toUpdate.length}`);

            if (toUpdate.length === 0) {
                totalSkipped += staleProducts.length === 0 ? products.length : 0;
                continue;
            }

            for (const product of toUpdate) {
                if (totalUpdated >= MAX_PRODUCTS_PER_RUN) {
                    console.log(`[LIMIT] Reached max ${MAX_PRODUCTS_PER_RUN} products for this run.`);
                    break;
                }

                const identifier = product.name || product.clean_name || product.id || "unknown";
                let attempt = 0;
                let result = { price: null };

                while (attempt < MAX_RETRIES) {
                    attempt++;
                    try {
                        result = await scrapeProduct(page, product);
                        break;
                    } catch (err) {
                        console.warn(`[RETRY ${attempt}/${MAX_RETRIES}] ${identifier}: ${err.message}`);
                        if (attempt < MAX_RETRIES) {
                            await sleep(getRandomDelay(5000, 10000));
                        }
                    }
                }

                if (result.price !== null) {
                    product.price = result.price;
                    product.last_updated = new Date().toISOString();
                    if (result.scraped_url) product.scraped_url = result.scraped_url;
                    if (result.scraped_title) product.scraped_title = result.scraped_title;
                    totalUpdated++;
                    console.log(`[OK] ${identifier.substring(0, 55)} -> ${result.price.toFixed(2)}`);
                } else {
                    totalFailed++;
                    console.warn(`[FAIL] ${identifier.substring(0, 55)} -> no price found`);
                }

                await safeWrite(filePath, products);

                const delay = getRandomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
                console.log(`[SLEEP] ${(delay / 1000).toFixed(1)}s before next product...\n`);
                await sleep(delay);
            }

            totalSkipped += products.length - toUpdate.length;
        }

        await browser.close();
        browser = null;

        console.log("\n===========================================");
        console.log("  Price Update Summary");
        console.log("===========================================");
        console.log(`  Updated: ${totalUpdated}`);
        console.log(`  Failed:  ${totalFailed}`);
        console.log(`  Skipped: ${totalSkipped}`);
        console.log("===========================================");
    } catch (error) {
        console.error("[FATAL] An unexpected error occurred:", error);
        if (browser) await browser.close().catch(() => {});
        process.exit(1);
    }
})();
