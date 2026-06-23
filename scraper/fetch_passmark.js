/**
 * fetch_passmark.js — run once to generate passmark_scores.json
 *
 * Uses Puppeteer so AMD CPUs (JS-rendered on cpubenchmark.net) are included.
 * GPU data is fetched via plain HTTP (no JS needed on videocardbenchmark.net).
 *
 * Usage:  node fetch_passmark.js
 * Output: passmark_scores.json  (read by data_processor.py)
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, 'passmark_scores.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const ROW_RE = /">([^<"]{5,80})<\/a><\/td><td>([\d,]+)<\/td><td>\d+<\/td>/gi;

function httpGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': UA } }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject).setTimeout(30000);
    });
}

function parseHtmlScores(html) {
    const scores = {};
    ROW_RE.lastIndex = 0;
    let m;
    while ((m = ROW_RE.exec(html)) !== null) {
        const name = m[1].trim();
        const score = parseInt(m[2].replace(/,/g, ''), 10);
        if (name && score > 0) scores[name] = score;
    }
    return scores;
}

async function fetchCpuScores() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    try {
        const page = await browser.newPage();
        await page.setUserAgent(UA);

        // Intercept DataTables AJAX responses to capture AMD rows
        const ajaxRows = [];
        page.on('response', async response => {
            const ct = response.headers()['content-type'] || '';
            if (!ct.includes('json')) return;
            try {
                const json = await response.json();
                if (Array.isArray(json.data) && json.data.length > 0)
                    ajaxRows.push(...json.data);
            } catch (_) {}
        });

        await page.goto('https://www.cpubenchmark.net/cpu-list/', {
            waitUntil: 'networkidle2',
            timeout: 60000,
        });

        // Extract rows from the rendered DOM (Intel SSR + AMD AJAX)
        const domRows = await page.evaluate(() =>
            [...document.querySelectorAll('table tbody tr')].flatMap(tr => {
                const cells = [...tr.querySelectorAll('td')];
                if (cells.length < 2) return [];
                const a = cells[0].querySelector('a');
                if (!a) return [];
                const name = a.textContent.trim();
                const score = parseInt(cells[1].textContent.replace(/,/g, ''), 10);
                return name && score > 0 ? [[name, score]] : [];
            })
        );

        const scores = {};
        domRows.forEach(([n, s]) => { scores[n] = s; });

        // Merge AJAX rows (DataTables format: [name_html, score, rank, …])
        for (const row of ajaxRows) {
            if (!Array.isArray(row) || row.length < 2) continue;
            const nameMatch = String(row[0]).match(/'>([^<']+)<\/a>/i)
                           || String(row[0]).match(/">([^<"]+)<\/a>/i);
            const name = nameMatch
                ? nameMatch[1].trim()
                : String(row[0]).replace(/<[^>]+>/g, '').trim();
            const score = parseInt(String(row[1]).replace(/,/g, ''), 10);
            if (name && score > 0) scores[name] = score;
        }

        console.log(`CPU: ${Object.keys(scores).length} scores (DOM rows: ${domRows.length}, AJAX rows: ${ajaxRows.length})`);
        return scores;
    } finally {
        await browser.close();
    }
}

async function fetchGpuScores() {
    const html = await httpGet('https://www.videocardbenchmark.net/gpu_list.php');
    const scores = parseHtmlScores(html);
    console.log(`GPU: ${Object.keys(scores).length} scores`);
    return scores;
}

(async () => {
    console.log('Fetching PassMark scores (this takes ~30 s)…\n');
    const [CPU, GPU] = await Promise.all([fetchCpuScores(), fetchGpuScores()]);
    const out = { generated: new Date().toISOString(), CPU, GPU };
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
    console.log(`\nWritten → ${OUTPUT}`);
    console.log(`  CPU: ${Object.keys(CPU).length}  GPU: ${Object.keys(GPU).length}`);
})();
