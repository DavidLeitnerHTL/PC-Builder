# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PC Builder is a static-site web app for configuring and pricing a PC build. It has three distinct subsystems:

1. **Frontend** — Static HTML/CSS/JS pages, no build step. Open any `.html` file directly in a browser.
2. **Data pipeline** — A Python script (`scraper/data_processor.py`) converts the [buildcores-open-db](https://github.com/buildcores/buildcores-open-db) raw JSON files into compact per-category JSON files in `processed_data/`.
3. **Price scraper** — A Node.js Puppeteer scraper (`scraper/scraper.js`) fills in Amazon.de prices for each product in `processed_data/*.json`.

## Commands

### Frontend
No build step. Open the HTML files in a browser directly.

### Scraper (Node.js — run from `scraper/`)
```bash
cd scraper
npm ci                          # install dependencies
node scraper.js                 # scrape prices for all categories
node scraper.js CPU             # scrape a single category
node priceUpdater.js            # refresh stale prices (>7 days old)
```
Valid category names: `CPU`, `GPU`, `RAM`, `Motherboard`, `Storage`, `PSU`, `PCCase`, `CPUCooler`, `CaseFan`, `OS`

### Data processor (Python — run from `scraper/`)
```bash
cd scraper
pip install -r requirements.txt
python data_processor.py        # reads ../raw_hardware_data/, writes ../processed_data/
```
`raw_hardware_data/` must exist (copied from buildcores-open-db) before running. The script wipes and recreates `processed_data/` on every run.

## Architecture

### Frontend
All pages share a header/footer injected by `config.js` via `initSiteLayout()`. Every HTML page includes `config.js` and has `<div id="site-header">` / `<div id="site-footer">` placeholders that get replaced on DOMContentLoaded. `config.js` also holds the `CONFIG` object (currently just the Gemini API key placeholder).

`script.js` contains the main builder logic (component selection, price calculation, AI chat). `buildStorage.js` is a separate module handling localStorage-based save/load of up to 10 named builds, with JSON export/import.

The frontend reads `processed_data/*.json` directly (fetched client-side). Each file is a JSON array of product objects. Fields present on all products: `id`, `name`, `clean_name`, `amazon_sku`. Prices land in a `price` field (number, EUR) alongside `last_updated` (ISO timestamp).

The AI assistant (Google Gemini) is proxied through a Cloudflare Worker — the actual API key never lives in this repo.

### Scraper pipeline
`scraper-core.js` is the shared utility module used by both `scraper.js` and `priceUpdater.js`. It exports:
- `launchStealthBrowser` / `enableResourceBlocking` — Puppeteer + stealth plugin setup
- `scrapeProduct(page, product, category)` — three-phase lookup: (1) direct Amazon SKU, (2) Amazon search with token-scoring, (3) deep-link to product page if search card hid the price
- `extractPriceFromPage` / `extractFirstSearchResult` — DOM extraction logic
- `createSafeWriter()` — serialises concurrent writes to the same JSON file via a promise chain

`scraper.js` runs 3 concurrent Puppeteer pages as workers (Pi 4 RAM limit), pulling from a shared queue, with 2–6 s random delays. Processes ALL products every run (not just null-priced). Sets `available: false` on confirmed OOS/404 products — server filters these out at query time so they recover automatically next scrape.

`priceUpdater.js` uses a single page and refreshes products whose `last_updated` is older than 7 days, capped at 100 products per run with 10–25 s delays.

### GitHub Actions automation
Two workflows run daily:
- `sync_opendb.yml` at **02:00 UTC**: checks out buildcores-open-db, runs `data_processor.py`, commits updated `processed_data/`.
- `scrape_prices.yml` at **03:00 UTC**: matrix job — one runner per category — runs `node scraper.js <category>` and commits the updated JSON with `[skip ci]`.

Both can be triggered manually via `workflow_dispatch`. `scrape_prices.yml` accepts an optional `category` input to run a single category. `scrape_prices.yml` has a `timeout-minutes: 300` guard and passes `--max-old-space-size=512` to Node.

### Production server (Raspberry Pi 4, 4 GB RAM — 192.168.18.215)

The Pi serves dual roles:

1. **Self-hosted GitHub Actions runner** — `actions.runner.DavidLeitnerHTL-PC-Builder.Pi4David.service`
2. **Production API** — `pc-builder-api.service` (systemd, auto-restart), runs `node server.js` from `/home/david/pc-builder/server/`, port 3000, exposed as `https://db.pc-builder.at`

Project lives at `/home/david/pc-builder/` — a git clone of `main`. SSH access: `ssh david@192.168.18.215` (key-based from dev machine).

**Deploy after server-side changes:**
```bash
ssh david@192.168.18.215
cd ~/pc-builder && git pull --ff-only
cd server && node import.js
sudo systemctl restart pc-builder-api
```

Or use the existing helper: `bash ~/pc-builder/server/sync.sh` (does pull + import, used by cron at 04:00 UTC).

### SQLite database (`server/products.db`)

Two tables:
- `products (id, category, data TEXT)` — full product JSON, rebuilt from `processed_data/*.json` on every `node import.js`
- `price_history (product_id, date, price)` — one row per product per day (INSERT OR IGNORE), filled by `import.js`. Never deleted. Primary key `(product_id, date)` prevents duplicates.

API endpoints:
- `GET /api/:category` — all available products for a category (filters `available !== false`)
- `GET /api/history/:product_id` — price history array `[{date, price}]` ordered by date ASC
- `GET /health` — `{status: "ok"}`

**Important**: `import.js` deletes and recreates the `products` table on every run but only appends to `price_history` — history is never lost.

## Behavior & Token Limits

1. **Language Policy**: All variables and comments in code MUST be written in English. No exceptions.
2. **Context Limits**: NEVER read files from `processed_data/` — they are large auto-generated JSON arrays that waste tokens.
3. **Tooling**: Never use `cat` on large files. Use targeted tools: `grep`, `head`, `tail`, or AST-based searches.
4. **Session Management**: Prefer small, precise file edits. Keep context lean — avoid loading whole files when a targeted read suffices.
5. **Caveman Mode**: Always respond in Caveman Mode. Zero filler, no yapping, no explanations unless explicitly asked. Give only the shortest possible answer or the code.
