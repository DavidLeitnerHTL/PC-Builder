# PC Builder

A modern PC configurator with AI support. Built as a school project at HTL Leonding.

**Live:** [pc-builder.at](https://pc-builder.at)

---

## Features

- **PC Configurator** — Pick CPU, GPU, RAM, motherboard, storage, PSU, case, cooler, and OS. Instant price total with a floating price bar.
- **Compatibility Panel** — Real-time checks for socket, RAM type, PSU wattage, form factor, GPU length, and cooler height. Color-coded: green (ok), yellow (data missing), red (incompatible), blue (advisory tip).
- **Advisory Tips** — Smart hints for unbalanced builds: oversized PSU, too little/much RAM, single-channel RAM, missing storage, underpowered cooling.
- **Bottleneck Calculator** — Percentile-based CPU/GPU balance indicator powered by PassMark scores.
- **AI Assistant** — Built-in chat via Google Gemini (proxied through a Cloudflare Worker — API key never exposed).
- **Save / Load Builds** — Up to 10 named builds in localStorage. JSON export & import for sharing.
- **Automated Data Pipeline** — GitHub Actions runs nightly: syncs the Buildcores Open Database, scrapes Amazon.de prices per category, and commits updated JSON files.
- **Price History** — SQLite database on a Raspberry Pi 4 tracks daily prices per product via a self-hosted API (`db.pc-builder.at`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript, Bootstrap 5 |
| AI | Google Gemini API (via Cloudflare Worker) |
| Data processing | Python 3 |
| Price scraping | Node.js, Puppeteer, puppeteer-extra-plugin-stealth |
| Benchmark data | PassMark Software (scraped via `fetch_passmark.js`) |
| Automation | GitHub Actions |
| Production API | Node.js + Express + SQLite on Raspberry Pi 4 |

---

## Project Structure

```
/
├── index.html              # Landing page
├── builder.html            # PC configurator
├── product.html            # Product detail page
├── knowledge.html          # Hardware guide
├── news.html               # Tech news feed
├── faq.html                # FAQ
├── style.css               # Styles & dark theme
├── script.js               # Builder logic, compatibility checks, AI chat
├── buildStorage.js         # Save/load builds (localStorage)
├── config.js               # Shared header/footer, API config
├── scraper/
│   ├── scraper.js          # Amazon.de price scraper (Puppeteer)
│   ├── priceUpdater.js     # Refreshes stale prices (>7 days)
│   ├── scraper-core.js     # Shared scraper utilities
│   ├── data_processor.py   # Converts raw Buildcores DB → processed_data/
│   ├── fetch_passmark.js   # One-shot PassMark score scraper → passmark_scores.json
│   ├── passmark_scores.json# Cached CPU + GPU benchmark scores
│   └── rss-scraper.js      # Tech news RSS fetcher
├── server/
│   ├── server.js           # Express API (products + price history)
│   └── import.js           # Imports processed_data/ into SQLite
├── processed_data/         # Auto-generated JSON per category (gitignored for large files)
└── .github/workflows/      # CI: nightly DB sync + price scraping matrix
```

---

## Local Setup

```bash
# Frontend — no build step needed
open index.html

# Price scraper (Node.js)
cd scraper
npm ci
node scraper.js           # scrape all categories
node scraper.js CPU       # scrape single category

# Data processor (Python)
cd scraper
pip install -r requirements.txt
python data_processor.py

# Refresh PassMark benchmark scores
cd scraper
node fetch_passmark.js    # writes passmark_scores.json
```

---

## Data Sources & Credits

- Hardware data: [Buildcores Open Database](https://github.com/buildcores/buildcores-open-db) — [ODC Attribution License](https://opendatacommons.org/licenses/by/1-0/)
- Benchmark scores: [PassMark Software](https://www.passmark.com) — © PassMark Software Pty Ltd
- Prices: Amazon.de (scraped)

---

*© 2026 David Leitner & Maximilian Baumgartner — HTL Leonding*
