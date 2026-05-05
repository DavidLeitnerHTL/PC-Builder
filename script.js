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

    // 3) Add a subtle scroll progress indicator.
    let progressBar = document.querySelector('.scroll-progress');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.className = 'scroll-progress';
        progressBar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(progressBar);
    }

    const updateScrollProgress = () => {
        const doc = document.documentElement;
        const maxScroll = Math.max(1, doc.scrollHeight - doc.clientHeight);
        const progress = Math.min(100, (window.scrollY / maxScroll) * 100);
        progressBar.style.transform = `scaleX(${progress / 100})`;
    };

    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress, { passive: true });
    updateScrollProgress();
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
        cooler: "Peerless Assassin",
        mb: "PRO B650",
        gpu: "RTX 5060",
        ram: "Vengeance",
        ssd: "SN770",
        psu: "Pure Power 12 M 750",
        case: "Arx 700",
        os: "Windows 11 Home",
        casefan: "Pure Wings 2"
    },
    midrange: {
        cpu: "Ryzen 7 9800X3D",
        cooler: "Dark Rock Elite",
        mb: "B850",
        gpu: "RTX 5070",
        ram: "Trident Z5",
        ssd: "990 Pro",
        psu: "VERTEX GX-1000",
        case: "North XL",
        os: "Windows 11 Home",
        casefan: "NF-A12x25"
    },
    highend: {
        cpu: "Ryzen 9 9950X3D",
        cooler: "Liquid Freezer III",
        mb: "X870E",
        gpu: "RTX 5090",
        ram: "Dominator Titanium",
        ssd: "T705",
        psu: "Dark Power Pro 13 1300",
        case: "Y70",
        os: "Windows 11 Pro",
        casefan: "T30"
    }
};

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
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/${category}`);
            if (response.ok) {
                const data = await response.json();

                selectEl.innerHTML = '<option value="">Bitte wählen...</option>';

                data.forEach(product => {
                    const option = document.createElement('option');
                    const price = product.price || 0;

                    // Create a safe, unique ID for the dictionary
                    const uniqueKey = `${category}_${product.name}`;

                    // Store the raw product data safely in memory
                    window.hardwareData[uniqueKey] = {
                        name: product.name,
                        clean_name: product.clean_name,
                        price: price,
                        category: category
                    };

                    // Use clean_name for dropdown display and Tom Select search
                    const displayName = product.clean_name || product.name;

                    // Only put the clean, unique ID in the HTML value attribute
                    option.value = uniqueKey;
                    option.textContent = `${displayName} (${price} €)`;
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
                console.warn(`Could not find preset item for ${id}: ${preset[id]}`);
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
    const formattedPrice = isNaN(rawPrice) ? "0.00" : rawPrice.toFixed(2);

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