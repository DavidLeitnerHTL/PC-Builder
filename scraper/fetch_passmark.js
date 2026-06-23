/**
 * fetch_passmark.js — run once to generate passmark_scores.json
 *
 * Scrapes PassMark CPU chart pages (high_end + mid_range) and the GPU list
 * page via plain HTTP — no Puppeteer needed.
 *
 * Usage:  node fetch_passmark.js
 * Output: passmark_scores.json  (read by data_processor.py)
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, 'passmark_scores.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

function httpGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': UA } }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject).setTimeout(30000);
    });
}

// Parses CPU chart pages (high_end_cpus.html, mid_range_cpus.html).
// HTML structure: <span class="prdname">NAME</span> … <span class="count">SCORE</span>
const CPU_CHART_RE = /<span class="prdname">([^<]+)<\/span>[\s\S]{0,300}?<span class="count">([\d,]+)<\/span>/g;

// Parses videocardbenchmark.net/gpu_list.php (uppercase tags, all GPUs).
const GPU_LIST_RE = /">([^<"]{5,80})<\/a><\/td><td>([\d,]+)<\/td><td>\d+<\/td>/gi;

function parseCpuChart(html) {
    const scores = {};
    CPU_CHART_RE.lastIndex = 0;
    let m;
    while ((m = CPU_CHART_RE.exec(html)) !== null) {
        const name = m[1].trim();
        const score = parseInt(m[2].replace(/,/g, ''), 10);
        if (name && score > 0 && !(name in scores)) scores[name] = score;
    }
    return scores;
}

function parseGpuList(html) {
    const scores = {};
    GPU_LIST_RE.lastIndex = 0;
    let m;
    while ((m = GPU_LIST_RE.exec(html)) !== null) {
        const name = m[1].trim();
        const score = parseInt(m[2].replace(/,/g, ''), 10);
        if (name && score > 0) scores[name] = score;
    }
    return scores;
}

(async () => {
    console.log('Fetching PassMark scores…\n');

    const [highEnd, midRange, gpuHtml] = await Promise.all([
        httpGet('https://www.cpubenchmark.net/high_end_cpus.html'),
        httpGet('https://www.cpubenchmark.net/mid_range_cpus.html'),
        httpGet('https://www.videocardbenchmark.net/gpu_list.php'),
    ]);

    const highScores = parseCpuChart(highEnd);
    const midScores  = parseCpuChart(midRange);

    // Merge: high_end takes priority (higher scores listed first on that page)
    const CPU = { ...midScores, ...highScores };
    const GPU = parseGpuList(gpuHtml);

    const amdCount   = Object.keys(CPU).filter(n => n.includes('Ryzen') || n.startsWith('AMD')).length;
    const intelCount = Object.keys(CPU).filter(n => n.includes('Intel') || n.includes('Core i')).length;

    console.log(`CPU: ${Object.keys(CPU).length} total  (AMD≈${amdCount}, Intel≈${intelCount})`);
    console.log(`GPU: ${Object.keys(GPU).length} total`);

    // Spot-check
    const checks = ['AMD Ryzen 7 9800X3D', 'Intel Core i9-14900K', 'GeForce RTX 4090', 'Radeon RX 7900 XTX'];
    checks.forEach(n => console.log(`  ${n}: ${CPU[n] ?? GPU[n] ?? 'not found'}`));

    const out = { generated: new Date().toISOString(), CPU, GPU };
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
    console.log(`\nWritten → ${OUTPUT}`);
})();
