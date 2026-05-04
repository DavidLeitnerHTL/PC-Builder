import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'processed_data');
const db = new Database(join(__dirname, 'products.db'));

db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id       TEXT,
        category TEXT,
        data     TEXT,
        PRIMARY KEY (id, category)
    );
    CREATE INDEX IF NOT EXISTS idx_category ON products(category);
`);

const insert = db.prepare('INSERT OR REPLACE INTO products (id, category, data) VALUES (?, ?, ?)');

const importAll = db.transaction(() => {
    db.prepare('DELETE FROM products').run();
    let total = 0;
    for (const file of readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))) {
        const category = file.replace('.json', '');
        const products = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
        for (const product of products) {
            insert.run(product.id ?? product.name, category, JSON.stringify(product));
            total++;
        }
        console.log(`  ${category}: ${products.length} products`);
    }
    return total;
});

const total = importAll();
console.log(`Done. ${total} products imported.`);
db.close();
