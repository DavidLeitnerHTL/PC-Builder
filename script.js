/**
 * PC Builder 2026 - Main Script
 * Handles hardware configuration, price calculation, 
 * dark mode, AI assistant via Cloudflare Worker Proxy,
 * and dynamic component browsing.
 */

// ==========================================
// CONFIGURATION & STATE
// ==========================================
const WORKER_URL = "https://gemini-proxy.builder-htl.workers.dev";

// Flag to check if a preset is currently loading (prevents button flickering)
let isPresetLoading = false;

// Global state for the dynamic component browser
let currentCategory = 'GPU';

// Store Tom Select instances
const tomSelectInstances = {};

// NEW: Global, safe data store to prevent Cloudflare/HTML string-parsing errors
window.hardwareData = {};

/**
 * PRESETS (Hardware Selection for 2026)
 */
const PRESETS = {
    budget: {
        cpu: "Ryzen 5 9600X",
        cooler: "Peerless Assassin",
        mb: "MSI PRO B650",
        gpu: "RTX 5060",  
        ram: "Vengeance",
        ssd: "SN770",
        psu: "Pure Power 12 M",
        case: "Arx 700"
    },
    midrange: {
        cpu: "Ryzen 7 9800X3D",
        cooler: "Dark Rock Elite",
        mb: "B850",
        gpu: "RTX 5070",
        ram: "Trident Z5",
        ssd: "990 Pro",
        psu: "Vertex GX-1000",
        case: "North XL"
    },
    highend: {
        cpu: "Ryzen 9 9950X3D",
        cooler: "Liquid Freezer III",
        mb: "X870E",
        gpu: "RTX 5090", 
        ram: "Dominator Titanium",
        ssd: "T705",
        psu: "Dark Power Pro",
        case: "Hyte Y70"
    }
};

// ==========================================
// COMPONENT BROWSER LOGIC
// ==========================================

async function fetchCategoryData(category) {
    try {
        const response = await fetch(`processed_data/${category}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load ${category}.json - Status: ${response.status}`);
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

        if (part.image) {
            const img = document.createElement('img');
            img.src = part.image;
            img.alt = part.name;
            img.className = 'part-image';
            partDiv.appendChild(img);
        }

        const nameElement = document.createElement('h3');
        nameElement.textContent = part.name;
        nameElement.className = 'part-name';
        partDiv.appendChild(nameElement);

        const priceElement = document.createElement('p');
        priceElement.textContent = part.price ? `${part.price} €` : 'Preis unbekannt';
        priceElement.className = 'part-price';
        partDiv.appendChild(priceElement);

        const infoBtn = document.createElement('a');
        // Dies funktioniert, da es sich um ein direktes DOM-Element und nicht um eine Dropdown-Value handelt
        infoBtn.href = `product.html?category=${encodeURIComponent(category)}&name=${encodeURIComponent(part.name)}`;
        infoBtn.textContent = 'Info';
        infoBtn.className = 'buy-btn'; 
        
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
        'case': 'PCCase'
    };

    const fetchPromises = Object.entries(selectMap).map(async ([selectId, category]) => {
        const selectEl = document.getElementById(selectId);
        if (!selectEl) return;

        try {
            // Fetch all products from JSON files
            const response = await fetch(`processed_data/${category}.json`);
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
                        price: price,
                        category: category
                    };

                    // Only put the clean, unique ID in the HTML value attribute
                    option.value = uniqueKey;
                    option.textContent = `${product.name} (${price} €)`;
                    selectEl.appendChild(option);
                });
            }
        } catch(e) {
            console.error(`Error loading ${category}:`, e);
        }

        // Initialize Tom Select Library for searchable dropdowns
        tomSelectInstances[selectId] = new TomSelect(selectEl, {
            create: false,
            sortField: null, 
            placeholder: "Hardware suchen...",
            maxOptions: 50, 
            onChange: function(selectedValue) {
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

    const mapping = ['cpu', 'cooler', 'mb', 'gpu', 'ram', 'ssd', 'psu', 'case'];

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
            if(!foundMatch) {
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
        linkButton.onclick = null; // Remove the blockage so user can click
    }

    calcTotal();
}

function calcTotal() {
    let sum = 0;
    document.querySelectorAll("#hardware-table tbody tr").forEach(row => {
        const priceEl = row.querySelector('.price-input');
        if(priceEl) {
            const price = parseFloat(priceEl.value) || 0;
            sum += price;
        }
    });
    
    const totalEl = document.getElementById("total");
    if(totalEl) {
        if(totalEl.parentElement) {
            totalEl.parentElement.classList.remove('price-update-anim');
            void totalEl.offsetWidth; 
            totalEl.parentElement.classList.add('price-update-anim');
        }
        totalEl.textContent = sum.toFixed(2);
    }
}

// ==========================================
// AI LOGIC (WORKER PROXY)
// ==========================================

function getSelectedComponents() {
    let components = [];
    document.querySelectorAll('#hardware-table tbody tr').forEach(row => {
        const category = row.getAttribute('data-category');
        const select = row.querySelector('select');
        
        // Ensure TomSelect instance value is read safely
        const tsInstance = tomSelectInstances[select.id];
        if(tsInstance && tsInstance.getValue()) {
            const optionText = tsInstance.options[tsInstance.getValue()].text;
            components.push(`- ${category}: ${optionText}`);
        }
    });
    return components.join('\n');
}

function toggleLoading(show) {
    const loadingEl = document.getElementById('ai-loading');
    const resultWrapper = document.getElementById('ai-result-wrapper');
    
    if(loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
    if(resultWrapper) resultWrapper.style.display = show ? 'none' : 'flex'; 
}

async function callWorkerAI(prompt) {
    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } 
        
        if (data.error) {
            let errorDetails = data.error;
            if (typeof data.error === 'object') {
                errorDetails = data.error.message || JSON.stringify(data.error);
            }
            return `KI Fehler: ${errorDetails}`;
        }
        
        return "Die KI konnte keine Antwort generieren.";
    } catch (error) {
        console.error("Worker Error:", error);
        return `Fehler: Die Verbindung zum KI-Server ist fehlgeschlagen. (${error.message})`;
    }
}

// ==========================================
// UI EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
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

    // 3. AI Assistant Buttons
    const btnCheck = document.getElementById('btn-check-build');
    const btnAsk = document.getElementById('btn-ask-ai');
    const outputBox = document.getElementById('ai-output');
    const inputField = document.getElementById('ai-question-input');

    if(btnCheck) {
        btnCheck.addEventListener('click', async () => {
            const components = getSelectedComponents();
            const prompt = `Analysiere diese PC-Konfiguration (2026):\n${components}\nPrüfe kurz Kompatibilität, Flaschenhälse und ob das Netzteil reicht. Antworte in Markdown.`;

            toggleLoading(true);
            const result = await callWorkerAI(prompt);
            toggleLoading(false);
            
            if(outputBox) {
                outputBox.innerHTML = typeof marked !== 'undefined' ? marked.parse(result) : result;
            }
        });
    }

    if(btnAsk) {
        btnAsk.addEventListener('click', async () => {
            const question = inputField ? inputField.value : "";
            if(!question) return;

            const components = getSelectedComponents();
            const prompt = `Aktuelle PC-Konfig:\n${components}\n\nFrage des Nutzers: ${question}\nAntworte kurz und präzise.`;

            toggleLoading(true);
            const result = await callWorkerAI(prompt);
            toggleLoading(false);
            
            if(outputBox) {
                outputBox.innerHTML = typeof marked !== 'undefined' ? marked.parse(result) : result;
            }
        });
    }

    // 4. UI Resizing/Reset
    const btnResize = document.getElementById('btn-resize-ai');
    const btnClose = document.getElementById('btn-close-expanded');

    const toggleExpandedView = () => {
        const hwCol = document.getElementById('hardware-column');
        const aiCol = document.getElementById('ai-column');
        if(!hwCol || !aiCol) return;

        const isExpanded = aiCol.classList.contains('col-lg-8');

        if (isExpanded) {
            hwCol.classList.replace('col-lg-4', 'col-lg-8');
            aiCol.classList.replace('col-lg-8', 'col-lg-4');
            if(btnResize) btnResize.style.display = 'inline-block';
            if(btnClose) btnClose.style.display = 'none';
        } else {
            hwCol.classList.replace('col-lg-8', 'col-lg-4');
            aiCol.classList.replace('col-lg-4', 'col-lg-8');
            if(btnResize) btnResize.style.display = 'none';
            if(btnClose) btnClose.style.display = 'inline-block';
        }
    };

    if(btnResize) btnResize.addEventListener('click', toggleExpandedView);
    if(btnClose) btnClose.addEventListener('click', toggleExpandedView);

    // 5. Dark Mode Logic
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
            htmlElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
});