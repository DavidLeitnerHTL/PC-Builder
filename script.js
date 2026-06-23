// ==========================================
// CONFIGURATION & STATE
// ==========================================

// Flag to check if a preset is currently loading (prevents button flickering)
let isPresetLoading = false;

// Global state for the dynamic component browser
let currentCategory = 'GPU';

// Store Tom Select instances
const tomSelectInstances = {};

// NEW: Global, safe data store to prevent Cloudflare/HTML string-parsing errors
window.hardwareData = {};

// ==========================================
// PAGE EXPERIENCE ENHANCEMENTS
// ==========================================

function createPreloader() {
    // Preloader intentionally disabled for instant page switching.
}

function removePreloader() {
    const preloader = document.querySelector('.preloader');
    if (!preloader) return;

    preloader.classList.add('hide');
    setTimeout(() => {
        if (preloader.parentNode) preloader.remove();
    }, 700);
}

function setupSmoothPageTransitions() {
    let isExiting = false;

    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link || isExiting) return;

        const href = link.getAttribute('href');
        if (!href) return;

        const isAnchor = href.startsWith('#');
        const isExternal = link.origin !== window.location.origin;
        const isNewTab = link.target === '_blank';
        const isDownload = link.hasAttribute('download');
        const isModifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

        if (isAnchor || isExternal || isNewTab || isDownload || isModifiedClick) return;

        event.preventDefault();
        isExiting = true;
        document.body.classList.add('page-exit');

        setTimeout(() => {
            window.location.assign(link.href);
        }, 280);
    });
}

function setupParallaxScrolling() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || window.innerWidth <= 768) return;

    const parallaxTargets = [
        { el: document.querySelector('.landing-hero .hero-content'), speed: 0.14 },
        { el: document.querySelector('.landing-hero .hero-scroll-hint'), speed: 0.2 },
        { el: document.querySelector('.page-hero'), speed: 0.1 }
    ].filter(item => item.el);

    if (parallaxTargets.length === 0) return;

    parallaxTargets.forEach(item => item.el.classList.add('parallax-element'));

    let ticking = false;
    const update = () => {
        const scrollY = window.scrollY;
        parallaxTargets.forEach(({ el, speed }) => {
            el.style.transform = `translate3d(0, ${scrollY * speed}px, 0)`;
        });
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(update);
            ticking = true;
        }
    }, { passive: true });

    update();
}

function runThemeTransition(nextTheme, triggerEl) {
    const htmlElement = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
        htmlElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('theme', nextTheme);
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'theme-transition-overlay';
    overlay.style.background = nextTheme === 'dark'
        ? 'radial-gradient(circle at 50% 30%, rgba(28, 28, 28, 0.95) 0%, rgba(10, 10, 10, 0.98) 70%)'
        : 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.98) 0%, rgba(245, 245, 240, 0.96) 70%)';
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('expanding'));

    setTimeout(() => {
        htmlElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('theme', nextTheme);
    }, 140);

    setTimeout(() => {
        overlay.classList.add('fading');
        setTimeout(() => overlay.remove(), 380);
    }, 320);
}

function setupPerformanceAndUxPolish() {
    // 1) Improve image loading behavior globally.
    document.querySelectorAll('img').forEach((img, index) => {
        if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
        if (!img.hasAttribute('fetchpriority')) {
            img.setAttribute('fetchpriority', index === 0 ? 'high' : 'low');
        }
        if (!img.hasAttribute('loading')) {
            img.setAttribute('loading', index > 1 ? 'lazy' : 'eager');
        }
    });

    // 2) Add dynamic active nav state based on current URL.
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.nav-link').forEach((link) => {
        const linkPage = (link.getAttribute('href') || '').toLowerCase();
        if (!linkPage.endsWith('.html')) return;
        link.classList.toggle('active', linkPage === currentPage);
    });

}

function setupSmartHeaderVisibility() {
    const header = document.querySelector('header');
    if (!header) return;

    let lastY = window.scrollY;
    let ticking = false;

    const updateHeader = () => {
        const currentY = window.scrollY;
        const scrollingDown = currentY > lastY;
        const passedThreshold = currentY > 90;

        if (scrollingDown && passedThreshold) {
            document.body.classList.add('header-hidden');
        } else {
            document.body.classList.remove('header-hidden');
        }

        lastY = currentY;
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateHeader);
            ticking = true;
        }
    }, { passive: true });
}

/**
 * PRESETS (Hardware Selection for 2026)
 */
const PRESETS = {
    budget: {
        cpu: "Ryzen 5 9600X",
        cooler: "Shadow Rock Slim 2",
        mb: "B650M HDV",
        gpu: "RTX 5060",
        ram: "Crucial Pro Overclocking Black",
        ssd: "P3 -2280",
        psu: "RM650 Black",
        case: "Light Base 600 DX",
        os: "Windows 11 Pro USB",
        casefan: "Aspect 14 Black"
    },
    midrange: {
        cpu: "Ryzen 7 9800X3D",
        cooler: "Silent Loop 3 CPU",
        mb: "B850",
        gpu: "RTX 5070",
        ram: "Flare X5 Black",
        ssd: "T500 -2280",
        psu: "RM750x",
        case: "North XL",
        os: "Windows 11 Pro USB",
        casefan: "NF-A12x25"
    },
    highend: {
        cpu: "Ryzen 9 9950X3D",
        cooler: "Liquid Freezer II 360 RGB",
        mb: "X870E",
        gpu: "RTX 5090",
        ram: "Dominator Titanium",
        ssd: "T705",
        psu: "Straight Power 12 1500",
        case: "Y70",
        os: "Windows 11 Pro USB",
        casefan: "T30"
    }
};

// ==========================================
// COMPATIBILITY & BOTTLENECK PANEL
// ==========================================

function getProductSpecs(product, category) {
    switch (category) {
        case 'CPU':         return { socket: product.socket, tdp: product.tdp, cores: product.cores, clock_speed: product.clock_speed, passmark_score: product.passmark_score };
        case 'CPUCooler':   return { height: product.height, cooler_type: product.cooler_type };
        case 'Motherboard': return { socket: product.socket, form_factor: product.form_factor, memory_type: product.memory_type };
        case 'GPU':         return { length: product.length, tdp: product.tdp, vram: product.vram, boost_clock: product.boost_clock, passmark_score: product.passmark_score };
        case 'RAM':         return { ram_type: product.ram_type };
        case 'PSU':         return { wattage: product.wattage };
        case 'PCCase':      return { motherboard_support: product.motherboard_support, max_gpu_length: product.max_gpu_length, max_cooler_height: product.max_cooler_height };
        default:            return {};
    }
}

function getSelected(selectId) {
    const ts = tomSelectInstances[selectId];
    if (!ts) return null;
    const val = ts.getValue();
    return val ? (window.hardwareData[val] || null) : null;
}

function compScore(comp, type) {
    if (!comp) return 0;
    if (comp.specs && comp.specs.passmark_score) return comp.specs.passmark_score;
    if (type === 'CPU') {
        const cores = parseInt(comp.specs && comp.specs.cores) || 4;
        const clock = parseFloat(comp.specs && comp.specs.clock_speed) || 3.0;
        return cores * clock * 380;
    }
    const vram  = parseInt(comp.specs && comp.specs.vram)        || 8;
    const boost = parseInt(comp.specs && comp.specs.boost_clock) || 1500;
    return vram * boost * 0.05;
}

function calcPercentile(all, target, type) {
    if (!target || all.length === 0) return 50;
    const score = compScore(target, type);
    const below = all.filter(p => compScore(p, type) <= score).length;
    return Math.round((below / all.length) * 100);
}

function updateCompatibilityPanel() {
    const panel = document.getElementById('compat-panel');
    if (!panel) return;

    const cpu    = getSelected('cpu');
    const mb     = getSelected('mb');
    const ram    = getSelected('ram');
    const psu    = getSelected('psu');
    const gpu    = getSelected('gpu');
    const cas    = getSelected('case');
    const cooler = getSelected('cooler');

    if (!cpu && !mb && !ram && !psu && !gpu && !cas && !cooler) {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = '';

    const checks = [];

    // 1. CPU ↔ MB socket
    if (cpu && mb) {
        const cpuS = (cpu.specs.socket || '').toLowerCase().replace(/\s/g, '');
        const mbS  = (mb.specs.socket  || '').toLowerCase().replace(/\s/g, '');
        const ok   = !!(cpuS && mbS && cpuS === mbS);
        checks.push({ ok, label: `Socket: ${cpu.specs.socket || '?'}`, msg: ok ? '' : `CPU: ${cpu.specs.socket}, MB: ${mb.specs.socket}` });
    }

    // 2. RAM ↔ MB memory type (normalize "DDR5-6000" → "DDR5")
    if (ram && mb) {
        const ramT = (ram.specs.ram_type   || '').replace(/-\d+.*$/, '').toUpperCase();
        const mbT  = (mb.specs.memory_type || '').replace(/-\d+.*$/, '').toUpperCase();
        const ok   = !!(ramT && mbT && (mbT.includes(ramT) || ramT.includes(mbT)));
        checks.push({ ok, label: `RAM: ${ram.specs.ram_type || '?'}`, msg: ok ? '' : `MB: ${mbT}, RAM: ${ramT}` });
    }

    // 3. PSU wattage — realistic estimate with peak/boost headroom
    if (psu && (cpu || gpu)) {
        const watts  = parseInt(psu.specs.wattage) || 0;
        const cpuTdp = parseInt(cpu && cpu.specs.tdp) || 0;
        const gpuTdp = parseInt(gpu && gpu.specs.tdp) || 0;
        const missingTdp = (cpu && !cpuTdp) || (gpu && !gpuTdp);
        if (missingTdp) {
            checks.push({ warn: true, label: `PSU: ${watts}W`, msg: 'TDP-Daten unvollständig – kann nicht geprüft werden' });
        } else {
            // CPU ×1.4 (boost), GPU ×1.6 (power spikes), +100W system
            const needed = Math.ceil((cpuTdp * 1.4 + gpuTdp * 1.6 + 100) / 50) * 50;
            if (watts < needed) {
                checks.push({ ok: false, label: `PSU: ${watts}W`, msg: `Braucht ~${needed}W (CPU ${cpuTdp}W · GPU ${gpuTdp}W · System)` });
            } else if (watts >= needed + 300) {
                checks.push({ tip: true, label: `PSU: ${watts}W`, msg: `Überdimensioniert – ~${needed}W würden reichen` });
            } else {
                checks.push({ ok: true, label: `PSU: ${watts}W` });
            }
        }
    }

    // 4. Case ↔ MB form factor (motherboard_support may be an array)
    if (cas && mb) {
        const norm = s => s.toLowerCase().replace(/[-\s]/g, '');
        const mbFF     = norm(mb.specs.form_factor || '');
        const suppRaw  = Array.isArray(cas.specs.motherboard_support)
            ? cas.specs.motherboard_support.join(' ')
            : (cas.specs.motherboard_support || '');
        const caseSupp = norm(suppRaw);
        const ok       = !!(mbFF && caseSupp && caseSupp.includes(mbFF));
        checks.push({ ok, label: `Form: ${mb.specs.form_factor || '?'}`, msg: ok ? '' : `Gehäuse: ${suppRaw}` });
    }

    // 5. GPU length ≤ case max_gpu_length
    if (gpu && cas) {
        const gpuLen  = parseInt(gpu.specs.length)         || 0;
        const caseMax = parseInt(cas.specs.max_gpu_length) || 0;
        if (gpuLen && caseMax) {
            const ok = gpuLen <= caseMax;
            checks.push({ ok, label: `GPU: ${gpuLen}mm`, msg: ok ? '' : `GPU ${gpuLen}mm > Max ${caseMax}mm` });
        } else {
            checks.push({ warn: true, label: `GPU: ${gpuLen ? gpuLen + 'mm' : '?'}`, msg: 'Längenangaben fehlen – bitte manuell prüfen' });
        }
    }

    // 6. Cooler height ≤ case max_cooler_height
    if (cooler && cas) {
        const coolerH = parseInt(cooler.specs.height)         || 0;
        const caseMax = parseInt(cas.specs.max_cooler_height) || 0;
        if (coolerH && caseMax) {
            const ok = coolerH <= caseMax;
            checks.push({ ok, label: `Kühler: ${coolerH}mm`, msg: ok ? '' : `Kühler ${coolerH}mm > Max ${caseMax}mm` });
        } else {
            checks.push({ warn: true, label: `Kühler: ${coolerH ? coolerH + 'mm' : '?'}`, msg: 'Höhenangaben fehlen – bitte manuell prüfen' });
        }
    }

    // ── Advisory tips ────────────────────────────────────────────────────────
    // RAM capacity
    if (ram) {
        const capMatch = (ram.specs.capacity || ram.specs.modules_config || '').match(/([\d.]+)\s*(gb|tb)/i);
        const capGb = capMatch ? parseFloat(capMatch[1]) * (capMatch[2].toLowerCase() === 'tb' ? 1024 : 1) : 0;
        if (capGb >= 64) {
            checks.push({ tip: true, label: `RAM: ${capGb}GB`, msg: '64GB+ ist für Gaming unnötig – 16–32GB reichen' });
        } else if (capGb && capGb <= 8) {
            checks.push({ tip: true, label: `RAM: ${capGb}GB`, msg: '8GB ist für moderne Spiele knapp – 16GB empfohlen' });
        }
    }

    // Single-channel RAM (only 1 module)
    if (ram) {
        const modMatch = (ram.specs.modules_config || '').match(/\(\s*(\d+)\s*x/i);
        const modCount = modMatch ? parseInt(modMatch[1]) : (parseInt(ram.specs.modules) || 0);
        if (modCount === 1) {
            checks.push({ tip: true, label: 'RAM: Single-Channel', msg: 'Ein Modul = Single-Channel. Zweites Modul für deutlich mehr Bandbreite empfohlen' });
        }
    }

    // No SSD selected
    if (cpu && mb && !getSelected('ssd')) {
        checks.push({ tip: true, label: 'Kein Speicher', msg: 'Kein SSD/HDD ausgewählt – der Build bootet nicht' });
    }

    // No CPU cooler selected (and CPU has no integrated graphics hinting at a boxed cooler)
    if (cpu && !cooler) {
        checks.push({ tip: true, label: 'Kein Kühler', msg: 'Kein CPU-Kühler ausgewählt – prüfen ob Boxed-Kühler beigelegt ist' });
    }

    // High-TDP CPU with air cooler
    if (cpu && cooler) {
        const cpuTdpAdv = parseInt(cpu.specs.tdp) || 0;
        const isWater   = cooler.specs.cooler_type === true || cooler.specs.cooler_type === 'liquid';
        if (cpuTdpAdv >= 150 && !isWater) {
            checks.push({ tip: true, label: `TDP: ${cpuTdpAdv}W`, msg: 'Hohe CPU-TDP – Wasserkühlung empfohlen für stabilen Betrieb' });
        }
    }

    const listEl = document.getElementById('compat-list');
    if (listEl) {
        if (checks.length === 0) {
            listEl.innerHTML = '<span style="color:var(--text-secondary);font-size:.82rem">Mehr Komponenten wählen…</span>';
        } else {
            listEl.innerHTML = checks.map(c => {
                const cls  = c.tip ? 'compat-tip' : c.warn ? 'compat-warn' : (c.ok ? 'compat-ok' : 'compat-error');
                const icon = c.tip ? 'fa-lightbulb' : c.warn ? 'fa-question' : (c.ok ? 'fa-check' : 'fa-xmark');
                const tip  = c.msg ? ` title="${c.msg}"` : '';
                const sub  = (c.tip || c.warn) && c.msg
                    ? `<div style="font-size:.72rem;opacity:.8;padding-left:1.1rem;line-height:1.3;margin-bottom:.15rem">${c.msg}</div>`
                    : '';
                return `<div class="compat-check ${cls}"${tip}><i class="fas ${icon}"></i><span>${c.label}</span></div>${sub}`;
            }).join('');
        }
    }

    // Update Amazon cart link (always runs when panel is visible)
    const cartLink = document.getElementById('btn-amazon-cart');
    if (cartLink) {
        const allIds = ['cpu', 'cooler', 'mb', 'gpu', 'ram', 'ssd', 'psu', 'case', 'os', 'casefan'];
        const asins = allIds.map(id => getSelected(id)).filter(c => c && c.amazon_sku).map(c => c.amazon_sku);
        if (asins.length > 0) {
            const params = asins.map((asin, i) => `ASIN.${i + 1}=${encodeURIComponent(asin)}&Quantity.${i + 1}=1`).join('&');
            cartLink.href = `https://www.amazon.de/gp/aws/cart/add.html?${params}`;
            cartLink.style.display = '';
        } else {
            cartLink.style.display = 'none';
        }
    }

    // Bottleneck bars
    const btEl = document.getElementById('bottleneck-content');
    if (!btEl) return;

    if (!cpu || !gpu) {
        const missing = !cpu ? 'CPU' : 'GPU';
        btEl.innerHTML = `<span style="color:var(--text-secondary);font-size:.82rem">${missing} noch wählen…</span>`;
        return;
    }

    const allCPUs = Object.values(window.hardwareData).filter(p => p.category === 'CPU');
    const allGPUs = Object.values(window.hardwareData).filter(p => p.category === 'GPU');
    const cpuPct  = calcPercentile(allCPUs, cpu, 'CPU');
    const gpuPct  = calcPercentile(allGPUs, gpu, 'GPU');
    const diff    = Math.abs(cpuPct - gpuPct);

    const cpuBottleneck = cpuPct < gpuPct && diff > 15;
    const gpuBottleneck = gpuPct < cpuPct && diff > 15;
    const cpuColor = cpuBottleneck ? '#ef4444' : '#22c55e';
    const gpuColor = gpuBottleneck ? '#ef4444' : '#22c55e';

    const verdictColor = diff <= 15 ? '#22c55e' : '#ef4444';
    const verdictIcon  = diff <= 15 ? 'fa-check' : 'fa-triangle-exclamation';
    const verdictText  = diff <= 15 ? 'Ausgewogen' : (cpuBottleneck ? `CPU-Bottleneck ~${diff}%` : `GPU-Bottleneck ~${diff}%`);

    const gpuSrc = gpu.clean_name || gpu.name;
    const gpuChipMatch = gpuSrc.match(
        /((?:GeForce|Radeon)\s+(?:RTX|GTX|GT|RX|R9|R7)\s+\d+(?:\s+(?:Ti|SUPER|XTX?|GRE|SE|ULTRA|OEM))*)/i
    );
    let gpuBenchName = gpuChipMatch ? gpuChipMatch[1] : gpuSrc;
    if (/^GeForce\s/i.test(gpuBenchName))        gpuBenchName = 'NVIDIA ' + gpuBenchName;
    else if (/^RTX\s|^GTX\s/i.test(gpuBenchName)) gpuBenchName = 'NVIDIA GeForce ' + gpuBenchName;
    else if (/^RX\s|^R9\s/i.test(gpuBenchName))   gpuBenchName = 'Radeon ' + gpuBenchName;

    btEl.innerHTML = `
        <div style="margin-bottom:.35rem">
            <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:.2rem">
                <span>CPU</span><span style="color:${cpuColor};font-weight:600">${cpuPct}. Pzt.</span>
            </div>
            <div style="height:6px;background:var(--border-color);border-radius:3px;overflow:hidden">
                <div style="width:${cpuPct}%;height:100%;background:${cpuColor};border-radius:3px;transition:width .5s ease"></div>
            </div>
        </div>
        <div style="margin-bottom:.35rem">
            <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:.2rem">
                <span>GPU</span><span style="color:${gpuColor};font-weight:600">${gpuPct}. Pzt.</span>
            </div>
            <div style="height:6px;background:var(--border-color);border-radius:3px;overflow:hidden">
                <div style="width:${gpuPct}%;height:100%;background:${gpuColor};border-radius:3px;transition:width .5s ease"></div>
            </div>
        </div>
        <div style="font-size:.72rem;color:${verdictColor};margin-top:.4rem"><i class="fas ${verdictIcon} me-1"></i>${verdictText}</div>
        <div class="benchmark-links">
            <a href="https://www.cpubenchmark.net/cpu.php?cpu=${encodeURIComponent(cpu.name)}" target="_blank" rel="noopener noreferrer" class="benchmark-link">
                <i class="fas fa-chart-bar"></i>CPU Benchmark
            </a>
            <span class="benchmark-sep">·</span>
            <a href="https://www.videocardbenchmark.net/gpu.php?gpu=${encodeURIComponent(gpuBenchName)}" target="_blank" rel="noopener noreferrer" class="benchmark-link">
                <i class="fas fa-chart-bar"></i>GPU Benchmark
            </a>
        </div>`;
}

// ==========================================
// COMPONENT BROWSER LOGIC
// ==========================================

async function fetchCategoryData(category) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/${category}`);
        if (!response.ok) {
            throw new Error(`Failed to load ${category} - Status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching data for ${category}:`, error);
        return [];
    }
}

function renderProducts(products, category) {
    const container = document.getElementById('parts-container');

    if (!container) return;

    container.innerHTML = '';

    products.forEach(part => {
        const partDiv = document.createElement('div');
        partDiv.className = 'part-card';

        // Use clean_name if available, otherwise fallback to original name
        const displayName = part.clean_name || part.name;

        if (part.image) {
            const img = document.createElement('img');
            img.src = part.image;
            img.alt = displayName;
            img.className = 'part-image';
            partDiv.appendChild(img);
        }

        const nameElement = document.createElement('h3');
        nameElement.textContent = displayName;
        nameElement.className = 'part-name';
        partDiv.appendChild(nameElement);

        const priceElement = document.createElement('p');
        priceElement.textContent = part.price ? `${part.price} €` : 'Preis unbekannt';
        priceElement.className = 'part-price';
        partDiv.appendChild(priceElement);

        const infoBtn = document.createElement('a');
        const safeLink = `product.html?category=${encodeURIComponent(category)}&name=${encodeURIComponent(part.name)}`;
        infoBtn.href = safeLink;
        infoBtn.textContent = 'Info';
        infoBtn.className = 'buy-btn';

        // Save to Session Storage as Cloudflare fallback
        infoBtn.onclick = () => {
            sessionStorage.setItem('currentCategory', category);
            sessionStorage.setItem('currentProduct', part.name);
        };

        partDiv.appendChild(infoBtn);
        container.appendChild(partDiv);
    });
}

async function loadCategory(category) {
    currentCategory = category;
    const products = await fetchCategoryData(category);
    renderProducts(products, category);
}

// ==========================================
// UI HELPERS
// ==========================================

function resetPresetButtons() {
    const btnBudget = document.getElementById('preset-budget');
    const btnMid = document.getElementById('preset-midrange');
    const btnHigh = document.getElementById('preset-highend');

    if (btnBudget) {
        btnBudget.classList.remove('btn-success');
        btnBudget.classList.add('btn-outline-success');
    }
    if (btnMid) {
        btnMid.classList.remove('btn-primary');
        btnMid.classList.add('btn-outline-primary');
    }
    if (btnHigh) {
        btnHigh.classList.remove('btn-danger');
        btnHigh.classList.add('btn-outline-danger');
    }
}

function activatePresetButton(type) {
    resetPresetButtons();

    let btn;
    let colorClass;

    if (type === 'budget') {
        btn = document.getElementById('preset-budget');
        colorClass = 'success';
    } else if (type === 'midrange') {
        btn = document.getElementById('preset-midrange');
        colorClass = 'primary';
    } else if (type === 'highend') {
        btn = document.getElementById('preset-highend');
        colorClass = 'danger';
    }

    if (btn) {
        btn.classList.remove(`btn-outline-${colorClass}`);
        btn.classList.add(`btn-${colorClass}`);
    }
}

// ==========================================
// CALCULATION & UPDATES
// ==========================================

function formatDisplayName(product, category) {
    const raw   = product.name        || '';
    const clean = product.clean_name  || raw;

    const BRANDS = [
        'AMD', 'Intel',
        'ASUS', 'MSI', 'Gigabyte', 'Sapphire', 'PowerColor', 'XFX', 'Zotac', 'ZOTAC',
        'Palit', 'EVGA', 'PNY', 'Gainward',
        'G.Skill', 'Corsair', 'Kingston', 'Crucial', 'TeamGroup',
        'Seasonic', 'Silverstone', 'SilverStone', 'Thermaltake', 'Antec',
        'be quiet!', 'Noctua', 'Arctic', 'Deepcool', 'DeepCool', 'Cooler Master', 'Scythe',
        'Fractal Design', 'Lian Li', 'NZXT', 'Phanteks', 'Kolink', 'Jonsbo', 'Sharkoon',
        'Samsung', 'WD', 'Western Digital', 'Seagate', 'Sabrent',
    ];

    let brand = '';
    for (const b of BRANDS) {
        if (raw.toLowerCase().startsWith(b.toLowerCase())) { brand = b; break; }
    }

    let model = clean;
    if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) {
        model = model.substring(brand.length).replace(/^[- ]+/, '');
    }

    let spec = '';
    switch (category) {
        case 'CPU':
            if (product.cores) spec = `${product.cores}C`;
            if (product.tdp)   spec += (spec ? ' · ' : '') + `${product.tdp}W`;
            break;
        case 'GPU': {
            const v = product.vram ? String(product.vram) : '';
            if (v) spec = v.toLowerCase().includes('gb') ? v : `${v}GB`;
            break;
        }
        case 'RAM': {
            const capStr = product.capacity || product.modules_config || '';
            const m = capStr.match(/([\d.]+)\s*(gb|tb)/i);
            if (m) spec = `${m[1]}${m[2].toUpperCase()}`;
            if (product.ram_type) spec += (spec ? ' ' : '') + product.ram_type;
            break;
        }
        case 'PSU': {
            const w = String(product.wattage || '').replace(/\s*W$/i, '').trim();
            if (w) spec = `${w}W`;
            if (product.efficiency) spec += (spec ? ' ' : '') + product.efficiency;
            break;
        }
        case 'Motherboard':
            if (product.socket)      spec = product.socket;
            if (product.form_factor) spec += (spec ? ' · ' : '') + product.form_factor;
            break;
        case 'Storage': {
            const m = raw.match(/([\d.]+)\s*(tb|gb)/i);
            if (m) spec = `${m[1]}${m[2].toUpperCase()}`;
            break;
        }
        case 'CPUCooler':
            if (product.height) spec = `${product.height}mm`;
            break;
        case 'CaseFan': {
            const m = raw.match(/(\d{2,3})\s*mm/i);
            if (m) spec = `${m[1]}mm`;
            break;
        }
        case 'PCCase': {
            const base = brand ? `${brand} ${model}` : model;
            return base.length > 34 ? base.substring(0, 32) + '…' : base;
        }
        case 'OS':
            return model.length > 42 ? model.substring(0, 40) + '…' : model;
    }

    const base = brand ? `${brand} ${model}` : model;
    if (spec) {
        const key = spec.split(/[\s·]/)[0].replace(/\W/g, '').toLowerCase();
        if (!key || !base.toLowerCase().replace(/\W/g, '').includes(key)) {
            return `${base} · ${spec}`;
        }
    }
    return base;
}

async function initializeDropdowns() {
    const selectMap = {
        'cpu': 'CPU',
        'cooler': 'CPUCooler',
        'mb': 'Motherboard',
        'gpu': 'GPU',
        'ram': 'RAM',
        'ssd': 'Storage',
        'psu': 'PSU',
        'case': 'PCCase',
        'os': 'OS',
        'casefan': 'CaseFan'
    };

    const fetchPromises = Object.entries(selectMap).map(async ([selectId, category]) => {
        const selectEl = document.getElementById(selectId);
        if (!selectEl) return;

        try {
            const response = await fetch(`processed_data/${category}.json`);
            if (response.ok) {
                const data = (await response.json()).filter(p => p.available !== false && p.price > 0);

                selectEl.innerHTML = '<option value="">Bitte wählen...</option>';

                data.forEach(product => {
                    const option = document.createElement('option');
                    const price = product.price ?? null;

                    // Create a safe, unique ID for the dictionary
                    const uniqueKey = `${category}_${product.name}`;

                    // Store the raw product data safely in memory
                    window.hardwareData[uniqueKey] = {
                        name: product.name,
                        clean_name: product.clean_name,
                        price: price,
                        category: category,
                        amazon_sku: product.amazon_sku || null,
                        specs: getProductSpecs(product, category)
                    };

                    const displayName = formatDisplayName(product, category);

                    // Only put the clean, unique ID in the HTML value attribute
                    option.value = uniqueKey;
                    option.textContent = displayName;
                    selectEl.appendChild(option);
                });
            }
        } catch (e) {
            console.error(`Error loading ${category}:`, e);
        }

        // Initialize Tom Select Library for searchable dropdowns
        tomSelectInstances[selectId] = new TomSelect(selectEl, {
            create: false,
            sortField: null,
            placeholder: "Hardware suchen...",
            maxOptions: 50,
            dropdownParent: 'body',
            onChange: function (selectedValue) {
                // Pass the safe key directly to our update function
                updateRow(selectId, selectedValue);
            }
        });
    });

    await Promise.all(fetchPromises);
}

function loadPreset(type) {
    const preset = PRESETS[type];
    if (!preset) return;

    isPresetLoading = true;
    activatePresetButton(type);

    const mapping = ['cpu', 'cooler', 'mb', 'gpu', 'ram', 'ssd', 'psu', 'case', 'os', 'casefan'];

    mapping.forEach(id => {
        const select = document.getElementById(id);
        const tsInstance = tomSelectInstances[id];

        if (select && tsInstance) {
            let foundMatch = false;
            for (let key in tsInstance.options) {
                if (tsInstance.options[key].text.includes(preset[id])) {
                    tsInstance.setValue(key);
                    foundMatch = true;
                    break;
                }
            }
            if (!foundMatch) {
                tsInstance.clear();
                updateRow(id, '');
            }
        }
    });

    isPresetLoading = false;
}

// NEW: Robust row update function replacing the old 'update(select)'
function updateRow(selectId, selectedValue) {
    if (!isPresetLoading) {
        resetPresetButtons();
    }

    const selectEl = document.getElementById(selectId);
    if (!selectEl) return;

    const row = selectEl.closest('tr');
    if (!row) return;

    const priceInput = row.querySelector('.price-input');
    const linkButton = row.querySelector('a');

    // Fetch the clean data from memory using the unique key
    const productData = window.hardwareData[selectedValue];

    // If no valid selection or search field cleared
    if (!productData) {
        if (priceInput) priceInput.value = "0.00";
        if (linkButton) {
            linkButton.removeAttribute('href');
            linkButton.onclick = (e) => e.preventDefault();
        }
        calcTotal();
        return;
    }

    // Valid selection found
    const rawPrice = parseFloat(productData.price);
    const formattedPrice = isNaN(rawPrice) ? "" : rawPrice.toFixed(2);

    // Construct the URL safely right when it's needed
    const safeLink = `product.html?category=${encodeURIComponent(productData.category)}&name=${encodeURIComponent(productData.name)}`;

    if (priceInput) priceInput.value = formattedPrice;
    if (linkButton) {
        linkButton.href = safeLink;
        // Save to Session Storage as Cloudflare fallback
        linkButton.onclick = () => {
            sessionStorage.setItem('currentCategory', productData.category);
            sessionStorage.setItem('currentProduct', productData.name);
        };
    }

    calcTotal();
}

function calcTotal() {
    let sum = 0;
    document.querySelectorAll("#hardware-table tbody tr").forEach(row => {
        const priceEl = row.querySelector('.price-input');
        if (priceEl) {
            const price = parseFloat(priceEl.value) || 0;
            sum += price;
        }
    });

    const totalEl = document.getElementById("total");
    if (totalEl) {
        if (totalEl.parentElement) {
            totalEl.parentElement.classList.remove('price-update-anim');
            void totalEl.offsetWidth;
            totalEl.parentElement.classList.add('price-update-anim');
        }
        totalEl.textContent = sum.toFixed(2);
    }

    updateCompatibilityPanel();
}

// ==========================================
// UI EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    setupPerformanceAndUxPolish();
    setupSmartHeaderVisibility();
    setupSmoothPageTransitions();
    setupParallaxScrolling();

    // 1. Hardware Table Initialization
    if (document.getElementById('hardware-table')) {
        await initializeDropdowns();
        loadPreset('midrange');
        calcTotal();
    }

    // 2. Component Browser Initialization 
    if (document.getElementById('parts-container')) {
        loadCategory('GPU');
    }

    // 3. Dark Mode Logic
    const themeToggle = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;

    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        htmlElement.setAttribute('data-theme', 'dark');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = htmlElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            runThemeTransition(newTheme, themeToggle);
        });
    }

    // 6. Scroll-In Animation Observer (fade-in-up elements)
    const fadeElements = document.querySelectorAll('.fade-in-up');
    if (fadeElements.length > 0) {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        };

        const fadeObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    fadeObserver.unobserve(entry.target);
                }
            });
        }, observerOptions);

        fadeElements.forEach(el => fadeObserver.observe(el));
    }

    // 7. Navbar toggler icon fix for dark/light
    const toggler = document.querySelector('.navbar-toggler-icon');
    if (toggler) {
        const updateTogglerColor = () => {
            const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
            toggler.style.backgroundImage = isDark
                ? "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba(255,255,255,0.8)' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e\")"
                : "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba(0,0,0,0.55)' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e\")";
        };
        updateTogglerColor();

        // Update on theme change
        const observer = new MutationObserver(updateTogglerColor);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    // 8. Cursor Glow Spotlight
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && window.innerWidth > 768) {
        const glowEl = document.createElement('div');
        glowEl.className = 'cursor-glow';
        glowEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(glowEl);

        let glowX = 0, glowY = 0, targetX = 0, targetY = 0;
        const lerp = (a, b, t) => a + (b - a) * t;

        document.addEventListener('mousemove', (e) => {
            targetX = e.clientX;
            targetY = e.clientY;
        }, { passive: true });

        function animateGlow() {
            glowX = lerp(glowX, targetX, 0.08);
            glowY = lerp(glowY, targetY, 0.08);
            glowEl.style.left = glowX + 'px';
            glowEl.style.top = glowY + 'px';
            requestAnimationFrame(animateGlow);
        }
        animateGlow();
    }

    // 9. Feature Card Mouse-Tracking Glow
    document.querySelectorAll('.feature-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            card.style.setProperty('--mouse-x', x + '%');
            card.style.setProperty('--mouse-y', y + '%');
        });
    });

    // 10. Animated Stat Numbers (count up on scroll)
    const statNumbers = document.querySelectorAll('.stat-number');
    if (statNumbers.length > 0) {
        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const text = el.textContent.trim();
                    const match = text.match(/^(\d+)/);
                    if (match) {
                        const target = parseInt(match[1]);
                        const suffix = text.replace(match[1], '');
                        let current = 0;
                        const duration = 1500;
                        const start = performance.now();

                        function step(now) {
                            const elapsed = now - start;
                            const progress = Math.min(elapsed / duration, 1);
                            // Ease out cubic
                            const eased = 1 - Math.pow(1 - progress, 3);
                            current = Math.round(eased * target);
                            el.textContent = current + suffix;
                            if (progress < 1) requestAnimationFrame(step);
                        }
                        requestAnimationFrame(step);
                    }
                    statObserver.unobserve(el);
                }
            });
        }, { threshold: 0.3 });

        statNumbers.forEach(el => statObserver.observe(el));
    }

});


// ==========================================
// SAVE/LOAD BUILD FEATURE
// ==========================================

// Component mapping for internal IDs
const COMPONENT_IDS = ['cpu', 'cooler', 'mb', 'gpu', 'ram', 'ssd', 'psu', 'case', 'os', 'casefan'];
const COMPONENT_NAMES = {
    cpu: 'Prozessor',
    cooler: 'Kühler',
    mb: 'Mainboard',
    gpu: 'Grafikkarte',
    ram: 'RAM',
    ssd: 'SSD',
    psu: 'Netzteil',
    case: 'Gehäuse',
    os: 'Betriebssystem',
    casefan: 'Gehäuselüfter'
};

let saveBuildModal = null;
let manageBuildsModal = null;
let buildToast = null;

/**
 * Initialize Save/Load Build feature on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Bootstrap modals
    const saveModalEl = document.getElementById('saveBuildModal');
    const manageModalEl = document.getElementById('manageBuildsModal');
    const toastEl = document.getElementById('build-toast');

    if (saveModalEl) saveBuildModal = new bootstrap.Modal(saveModalEl);
    if (manageModalEl) manageBuildsModal = new bootstrap.Modal(manageModalEl);
    if (toastEl) buildToast = new bootstrap.Toast(toastEl, { delay: 3000 });

    // Setup character counter for build name input
    const nameInput = document.getElementById('build-name-input');
    if (nameInput) {
        nameInput.addEventListener('input', (e) => {
            const countEl = document.getElementById('build-name-count');
            if (countEl) countEl.textContent = e.target.value.length;
        });
    }

    // Update dropdown on page load
    updateSavedBuildsDropdown();
});

/**
 * Open the Save Build modal and populate preview
 */
function openSaveBuildModal() {
    const previewEl = document.getElementById('save-build-preview');
    if (previewEl) {
        const components = getCurrentBuildComponents();
        let html = '<ul class="list-unstyled mb-0">';

        COMPONENT_IDS.forEach(id => {
            const comp = components[id];
            if (comp && comp.name) {
                html += `<li><strong>${COMPONENT_NAMES[id]}:</strong> ${comp.name}</li>`;
            }
        });

        html += '</ul>';
        html += `<div class="mt-2 pt-2 border-top"><strong>Gesamtpreis:</strong> ${document.getElementById('total')?.textContent || '0.00'} €</div>`;
        previewEl.innerHTML = html;
    }

    // Reset input
    const nameInput = document.getElementById('build-name-input');
    if (nameInput) {
        nameInput.value = '';
        const countEl = document.getElementById('build-name-count');
        if (countEl) countEl.textContent = '0';
    }

    if (saveBuildModal) saveBuildModal.show();
}

/**
 * Open the Manage Builds modal and populate list
 */
function openManageBuildsModal() {
    updateManageBuildsList();
    if (manageBuildsModal) manageBuildsModal.show();
}

/**
 * Get current component selections as an object
 * @returns {Object} Components with name and price
 */
function getCurrentBuildComponents() {
    const components = {};

    COMPONENT_IDS.forEach(id => {
        const selectEl = document.getElementById(id);
        const tsInstance = tomSelectInstances[id];

        if (selectEl && tsInstance) {
            const selectedValue = tsInstance.getValue();
            const productData = window.hardwareData[selectedValue];

            if (productData) {
                components[id] = {
                    name: productData.name,
                    price: parseFloat(productData.price) || 0,
                    category: productData.category
                };
            } else {
                components[id] = { name: '', price: 0, category: id.toUpperCase() };
            }
        } else {
            components[id] = { name: '', price: 0, category: id.toUpperCase() };
        }
    });

    return components;
}

/**
 * Save the current build configuration
 */
function saveCurrentBuild() {
    const nameInput = document.getElementById('build-name-input');
    const name = nameInput?.value?.trim();

    if (!name) {
        showToast('Bitte gib einen Namen für deinen Build ein.', 'error');
        return;
    }

    const components = getCurrentBuildComponents();
    const totalPrice = parseFloat(document.getElementById('total')?.textContent || 0);

    const result = BuildStorage.saveBuild(name, components, totalPrice);

    if (result.success) {
        showToast(`Build "${result.build.name}" erfolgreich gespeichert!`, 'success');
        if (saveBuildModal) saveBuildModal.hide();
        updateSavedBuildsDropdown();
    } else {
        showToast(result.error, 'error');
    }
}

/**
 * Load a saved build by ID
 * @param {string} buildId - The build ID to load
 */
function loadSavedBuild(buildId) {
    const result = BuildStorage.loadBuild(buildId);

    if (!result.success) {
        showToast(result.error, 'error');
        return;
    }

    const build = result.build;

    // Set flag to prevent preset button flickering
    isPresetLoading = true;
    resetPresetButtons();

    // Load each component
    COMPONENT_IDS.forEach(id => {
        const savedComponent = build.components[id];
        const tsInstance = tomSelectInstances[id];

        if (tsInstance && savedComponent && savedComponent.name) {
            // Find matching option in the dropdown
            let foundMatch = false;
            for (let key in tsInstance.options) {
                if (tsInstance.options[key].text.includes(savedComponent.name)) {
                    tsInstance.setValue(key);
                    foundMatch = true;
                    break;
                }
            }

            if (!foundMatch) {
                console.warn(`Could not find saved component for ${id}: ${savedComponent.name}`);
                tsInstance.clear();
            }
        } else if (tsInstance) {
            tsInstance.clear();
        }
    });

    isPresetLoading = false;
    calcTotal();

    showToast(`Build "${build.name}" geladen!`, 'success');
}

/**
 * Delete a saved build
 * @param {string} buildId - The build ID to delete
 * @param {Event} event - Click event
 */
function deleteSavedBuild(buildId, event) {
    if (event) event.stopPropagation();

    if (!confirm('Möchtest du diesen Build wirklich löschen?')) {
        return;
    }

    const result = BuildStorage.deleteBuild(buildId);

    if (result.success) {
        showToast('Build erfolgreich gelöscht.', 'success');
        updateSavedBuildsDropdown();
        updateManageBuildsList();
    } else {
        showToast(result.error, 'error');
    }
}

/**
 * Export a build to JSON file
 * @param {string} buildId - The build ID to export
 * @param {Event} event - Click event
 */
function exportBuild(buildId, event) {
    if (event) event.stopPropagation();

    const result = BuildStorage.exportBuild(buildId);

    if (!result.success) {
        showToast(result.error, 'error');
        return;
    }

    // Create and download file
    const blob = new Blob([result.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Build erfolgreich exportiert!', 'success');
}

/**
 * Import a build from JSON file
 */
function importBuildFromFile() {
    const fileInput = document.getElementById('import-build-file');
    const file = fileInput?.files?.[0];

    if (!file) {
        showToast('Bitte wähle eine Datei aus.', 'error');
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        const result = BuildStorage.importBuild(e.target.result);

        if (result.success) {
            showToast(`Build "${result.build.name}" erfolgreich importiert!`, 'success');
            updateSavedBuildsDropdown();
            updateManageBuildsList();
            fileInput.value = ''; // Reset input
        } else {
            showToast(result.error, 'error');
        }
    };

    reader.onerror = () => {
        showToast('Fehler beim Lesen der Datei.', 'error');
    };

    reader.readAsText(file);
}

/**
 * Update the Load Build dropdown with saved builds
 */
function updateSavedBuildsDropdown() {
    const dropdown = document.getElementById('saved-builds-dropdown');
    if (!dropdown) return;

    const builds = BuildStorage.getAllBuilds();

    if (builds.length === 0) {
        dropdown.innerHTML = '<li><span class="dropdown-item-text text-muted">Keine gespeicherten Builds</span></li>';
        return;
    }

    // Sort by creation date (newest first)
    builds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let html = '';
    builds.forEach(build => {
        const date = new Date(build.createdAt).toLocaleDateString('de-DE');
        html += `
            <li>
                <a class="dropdown-item d-flex justify-content-between align-items-center" href="#" onclick="loadSavedBuild('${build.id}'); return false;">
                    <span>
                        <i class="fas fa-desktop me-2 text-accent"></i>${build.name}
                        <small class="text-muted ms-2">${date}</small>
                    </span>
                    <span class="badge bg-primary">${build.totalPrice.toFixed(2)} €</span>
                </a>
            </li>
        `;
    });

    dropdown.innerHTML = html;
}

/**
 * Update the Manage Builds modal list
 */
function updateManageBuildsList() {
    const listEl = document.getElementById('saved-builds-list');
    const badgeEl = document.getElementById('build-count-badge');
    if (!listEl) return;

    const builds = BuildStorage.getAllBuilds();

    // Update badge
    if (badgeEl) badgeEl.textContent = `${builds.length}/10`;

    if (builds.length === 0) {
        listEl.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="fas fa-folder-open fa-2x mb-2"></i>
                <p>Keine gespeicherten Builds vorhanden</p>
            </div>
        `;
        return;
    }

    // Sort by creation date (newest first)
    builds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let html = '';
    builds.forEach(build => {
        const date = new Date(build.createdAt).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Count components
        const componentCount = Object.values(build.components).filter(c => c.name).length;

        html += `
            <div class="list-group-item list-group-item-action">
                <div class="d-flex w-100 justify-content-between align-items-start">
                    <div>
                        <h6 class="mb-1 fw-bold">${build.name}</h6>
                        <p class="mb-1 small text-muted">
                            <i class="fas fa-calendar me-1"></i>${date}
                            <span class="mx-2">•</span>
                            <i class="fas fa-microchip me-1"></i>${componentCount}/10 Komponenten
                        </p>
                    </div>
                    <span class="badge bg-primary fs-6">${build.totalPrice.toFixed(2)} €</span>
                </div>
                <div class="d-flex gap-2 mt-2">
                    <button class="btn btn-sm btn-primary" onclick="loadSavedBuild('${build.id}')">
                        <i class="fas fa-upload me-1"></i>Laden
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="exportBuild('${build.id}', event)">
                        <i class="fas fa-download me-1"></i>Exportieren
                    </button>
                    <button class="btn btn-sm btn-outline-danger ms-auto" onclick="deleteSavedBuild('${build.id}', event)">
                        <i class="fas fa-trash me-1"></i>Löschen
                    </button>
                </div>
            </div>
        `;
    });

    listEl.innerHTML = html;
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 */
function showToast(message, type = 'info') {
    const toastEl = document.getElementById('build-toast');
    const iconEl = document.getElementById('toast-icon');
    const messageEl = document.getElementById('toast-message');

    if (!toastEl || !messageEl) return;

    // Set icon based on type
    if (iconEl) {
        iconEl.className = 'fas me-2';
        switch (type) {
            case 'success':
                iconEl.classList.add('fa-check-circle', 'text-success');
                break;
            case 'error':
                iconEl.classList.add('fa-exclamation-circle', 'text-danger');
                break;
            default:
                iconEl.classList.add('fa-info-circle', 'text-info');
        }
    }

    // Set message
    messageEl.textContent = message;

    // Show toast
    if (buildToast) {
        buildToast.show();
    }
}