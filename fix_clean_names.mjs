/**
 * fix_clean_names.mjs
 *
 * One-shot cleanup: strips "OEM/Tray" (and variants) from the clean_name
 * field of every product in every processed_data JSON file.
 * Also resets price to null for products whose clean_name had OEM/Tray AND
 * have no amazon_sku, so the scraper re-searches them with the clean query.
 *
 * Run ONCE while the scraper is NOT running:
 *   node fix_clean_names.mjs
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

const DIR = './processed_data';

const STRIP_PATTERN = /\s*\(OEM\/Tray\)|\s*OEM\/Tray|\s*\bOEM\b|\s*\bTray\b/gi;

function stripOemTray(str) {
    return (str || '').replace(STRIP_PATTERN, '').trim();
}

const files = (await readdir(DIR)).filter(f => f.endsWith('.json'));

let totalFixed = 0;

for (const file of files) {
    const filePath = join(DIR, file);
    const products = JSON.parse(await readFile(filePath, 'utf-8'));
    let changed = 0;

    for (const p of products) {
        const original = p.clean_name || '';
        const cleaned = stripOemTray(original);

        if (cleaned !== original) {
            console.log(`[FIX] ${file}: "${original}" → "${cleaned}"`);
            p.clean_name = cleaned;

            // If this product has no SKU and was previously found via a
            // polluted search query, reset its price so it gets re-scraped
            // with the correct name.
            const hasSku = p.amazon_sku && String(p.amazon_sku).trim().length > 0;
            if (!hasSku && p.scraped_title) {
                p.price = null;
                p.scraped_title = undefined;
                p.scraped_url = undefined;
                console.log(`  └─ [RESET] price reset to null (no SKU, re-scrape needed)`);
            }
            changed++;
        }
    }

    if (changed > 0) {
        await writeFile(filePath, JSON.stringify(products, null, 2), 'utf-8');
        console.log(`[SAVED] ${file}: ${changed} product(s) updated.\n`);
        totalFixed += changed;
    }
}

console.log(`\nDone. Total fixed: ${totalFixed} product(s).`);
