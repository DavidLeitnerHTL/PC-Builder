/**
 * priceUpdater.js
 *
 * Asynchronous stealth scraper for 1000+ hardware components.
 * Prevents rate-limits and IP-bans by introducing random delays
 * between each processed product.
 */

// ==========================================
// CONFIGURATION
// ==========================================

const MIN_DELAY_MS = 15000; // 15 seconds
const MAX_DELAY_MS = 40000; // 40 seconds

// ==========================================
// HELPERS
// ==========================================

/**
 * Returns a Promise that resolves after the given amount of milliseconds.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a random integer between min and max (both inclusive).
 * @param {number} min - Minimum value.
 * @param {number} max - Maximum value.
 * @returns {number}
 */
function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ==========================================
// DATABASE STUB
// ==========================================

/**
 * Simulates fetching the 20 oldest products from the database,
 * sorted by last_updated in ascending order.
 * @returns {Promise<Array<{id: number, name: string, price: number, last_updated: Date}>>}
 */
async function fetchOldestProducts() {
    // In a real-world scenario this would query a database:
    // e.g., SELECT * FROM products ORDER BY last_updated ASC LIMIT 20
    const simulatedDbRows = [
        { id: 1,  name: "AMD Ryzen 5 9600X",        price: 279.00, last_updated: new Date("2025-03-01T10:00:00Z") },
        { id: 2,  name: "AMD Ryzen 7 9800X3D",      price: 479.00, last_updated: new Date("2025-03-02T11:30:00Z") },
        { id: 3,  name: "AMD Ryzen 9 9950X3D",      price: 799.00, last_updated: new Date("2025-03-03T09:15:00Z") },
        { id: 4,  name: "Noctua NH-D15",            price: 109.90, last_updated: new Date("2025-03-04T14:00:00Z") },
        { id: 5,  name: "be quiet! Dark Rock Pro 5",price: 89.90,  last_updated: new Date("2025-03-05T08:45:00Z") },
        { id: 6,  name: "ASUS ROG STRIX B650E",     price: 299.00, last_updated: new Date("2025-03-06T16:20:00Z") },
        { id: 7,  name: "MSI MAG X670E TOMAHAWK",  price: 349.00, last_updated: new Date("2025-03-07T12:10:00Z") },
        { id: 8,  name: "NVIDIA RTX 5070",          price: 649.00, last_updated: new Date("2025-03-08T10:05:00Z") },
        { id: 9,  name: "NVIDIA RTX 5080",          price: 999.00, last_updated: new Date("2025-03-09T09:30:00Z") },
        { id: 10, name: "NVIDIA RTX 5090",          price: 1999.00,last_updated: new Date("2025-03-10T11:00:00Z") },
        { id: 11, name: "Corsair Vengeance 32GB",   price: 119.00, last_updated: new Date("2025-03-11T13:45:00Z") },
        { id: 12, name: "G.Skill Trident Z5 32GB",  price: 139.00, last_updated: new Date("2025-03-12T15:00:00Z") },
        { id: 13, name: "Samsung 990 Pro 2TB",      price: 179.00, last_updated: new Date("2025-03-13T08:00:00Z") },
        { id: 14, name: "WD Black SN850X 2TB",      price: 159.00, last_updated: new Date("2025-03-14T10:30:00Z") },
        { id: 15, name: "Corsair RM850x",           price: 149.00, last_updated: new Date("2025-03-15T11:15:00Z") },
        { id: 16, name: "be quiet! Straight Power 12", price: 169.00, last_updated: new Date("2025-03-16T09:45:00Z") },
        { id: 17, name: "Fractal Design North",     price: 139.00, last_updated: new Date("2025-03-17T14:20:00Z") },
        { id: 18, name: "Lian Li O11 Dynamic",      price: 159.00, last_updated: new Date("2025-03-18T16:00:00Z") },
        { id: 19, name: "Windows 11 Pro",           price: 199.00, last_updated: new Date("2025-03-19T10:10:00Z") },
        { id: 20, name: "Noctua NF-A12x25 PWM",     price: 29.90,  last_updated: new Date("2025-03-20T12:00:00Z") }
    ];

    // Ensure ascending sort by last_updated (oldest first)
    simulatedDbRows.sort((a, b) => a.last_updated - b.last_updated);

    return simulatedDbRows;
}

/**
 * Simulates updating a product's price and timestamp in the database.
 * @param {Object} product - The product object to update.
 * @param {number} newPrice - The newly scraped price.
 */
async function updateProductPrice(product, newPrice) {
    // In a real-world scenario this would execute an UPDATE statement:
    // e.g., UPDATE products SET price = ?, last_updated = NOW() WHERE id = ?
    product.price = newPrice;
    product.last_updated = new Date();
}

// ==========================================
// SCRAPING LOGIC
// ==========================================

/**
 * Simulates the stealth scraping process for a single product.
 * @param {Object} product - The product to scrape.
 * @returns {Promise<number>} - The simulated new price.
 */
async function scrapeProduct(product) {
    console.log(`[SCRAPER] Scraping product: "${product.name}" (ID: ${product.id})`);

    // Simulate network / parsing delay
    await sleep(getRandomDelay(800, 2500));

    // Simulate price fluctuation (-5% to +5%)
    const fluctuation = 1 + (Math.random() * 0.10 - 0.05);
    const simulatedNewPrice = parseFloat((product.price * fluctuation).toFixed(2));

    console.log(`[SCRAPER]  -> Old price: ${product.price.toFixed(2)} € | New price: ${simulatedNewPrice.toFixed(2)} €`);

    return simulatedNewPrice;
}

// ==========================================
// MAIN ENTRY POINT
// ==========================================

(async function main() {
    console.log("==========================================");
    console.log("  PC Builder - Price Updater (Stealth)    ");
    console.log("==========================================\n");

    try {
        const products = await fetchOldestProducts();
        console.log(`[INIT] Fetched ${products.length} products (oldest first).\n`);

        for (const product of products) {
            // 1. Scrape the product
            const newPrice = await scrapeProduct(product);

            // 2. Update the database record
            await updateProductPrice(product, newPrice);
            console.log(`[DB] Updated "${product.name}" | last_updated: ${product.last_updated.toISOString()}\n`);

            // 3. Stealth delay before next request (15 - 40 seconds)
            const delay = getRandomDelay(MIN_DELAY_MS, MAX_DELAY_MS);
            console.log(`[SLEEP] Waiting ${(delay / 1000).toFixed(1)} seconds before next request...\n`);
            await sleep(delay);
        }

        console.log("==========================================");
        console.log("  All products processed successfully.    ");
        console.log("==========================================");

    } catch (error) {
        console.error("[FATAL] An unexpected error occurred:", error);
        process.exit(1);
    }
})();
