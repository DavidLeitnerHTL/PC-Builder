import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'products.db'));
const app = express();

app.use(cors());

const getByCategory = db.prepare('SELECT data FROM products WHERE category = ?');
const getHistory = db.prepare('SELECT date, price FROM price_history WHERE product_id = ? ORDER BY date ASC');

app.get('/api/history/:product_id', (req, res) => {
    const rows = getHistory.all(req.params.product_id);
    res.json(rows);
});

app.get('/api/:category', (req, res) => {
    const rows = getByCategory.all(req.params.category);
    if (rows.length === 0) return res.status(404).json({ error: 'Category not found' });
    res.json(rows.map(r => JSON.parse(r.data)).filter(p => p.available !== false));
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PC Builder API on port ${PORT}`));
