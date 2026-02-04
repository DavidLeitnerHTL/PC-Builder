/**
 * CONFIGURATION
 */
const apiKey = typeof CONFIG !== 'undefined' ? CONFIG.GEMINI_API_KEY : ""; 

// Flag to check if a preset is currently loading
let isPresetLoading = false;

/**
 * PRESETS (Hardware Selection for 2026)
 */
const PRESETS = {
    budget: {
        cpu: "Ryzen 5 9600X",
        cooler: "Peerless Assassin",
        mb: "MSI B650",
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
        ssd: "Samsung 990 Pro",
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

/**
 * Helper function: Resets all preset buttons to normal state
 */
function resetPresetButtons() {
    const btnBudget = document.getElementById('preset-budget');
    const btnMid = document.getElementById('preset-midrange');
    const btnHigh = document.getElementById('preset-highend');

    // Budget: green
    if (btnBudget) {
        btnBudget.classList.remove('btn-success');
        btnBudget.classList.add('btn-outline-success');
    }
    // Midrange: blue
    if (btnMid) {
        btnMid.classList.remove('btn-primary');
        btnMid.classList.add('btn-outline-primary');
    }
    // Highend: red
    if (btnHigh) {
        btnHigh.classList.remove('btn-danger');
        btnHigh.classList.add('btn-outline-danger');
    }
}

/**
 * Helper function: Sets a specific button to "Active" (filled)
 */
function activatePresetButton(type) {
    resetPresetButtons(); // Reset all first
    
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
        // Remove outline, add full color
        btn.classList.remove(`btn-outline-${colorClass}`);
        btn.classList.add(`btn-${colorClass}`);
    }
}

/**
 * FUNCTION: Load Preset
 */
function loadPreset(type) {
    const preset = PRESETS[type];
    if (!preset) return;

    isPresetLoading = true; // Set flag: Programmatic change

    // Button Highlighting
    activatePresetButton(type);

    // Map HTML IDs to Preset Keys
    const mapping = ['cpu', 'cooler', 'mb', 'gpu', 'ram', 'ssd', 'psu', 'case'];

    mapping.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            // Find option containing the preset text
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].text.includes(preset[id])) {
                    select.selectedIndex = i;
                    update(select); 
                    break;
                }
            }
        }
    });

    isPresetLoading = false; // Done
}

/**
 * FUNCTION: update(select)
 * Calculates price and updates Amazon link
 */
function update(select) {
    // If user clicks (not via preset loading), reset buttons
    if (!isPresetLoading) {
        resetPresetButtons();
    }

  const value = select.value;
  if (!value.includes(',')) return;
  
  const parts = value.split(',');
  const rawPrice = parseFloat(parts[0]);
  const preis = isNaN(rawPrice) ? "0.00" : rawPrice.toFixed(2);
  const link = parts.slice(1).join(','); 

  const row = select.closest('tr');
  const priceInput = row.querySelector('.price-input');
  if (priceInput) priceInput.value = preis;

  const linkButton = row.querySelector('a');
  if (linkButton) linkButton.href = link;

  calcTotal();
}

function calcTotal() {
  let sum = 0;
  document.querySelectorAll("tbody tr").forEach(row => {
    const preisEl = row.querySelector('.price-input');
    if(preisEl) {
        const preis = parseFloat(preisEl.value) || 0;
        sum += preis;
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
// AI LOGIC (WITH AUTO-FALLBACK)
// ==========================================

function getSelectedComponents() {
    let components = [];
    document.querySelectorAll('#hardware-table tbody tr').forEach(row => {
        const category = row.getAttribute('data-category');
        const select = row.querySelector('select');
        if(select && select.selectedIndex > -1) { 
            const selectedText = select.options[select.selectedIndex].text;
            components.push(`- ${category}: ${selectedText}`);
        }
    });
    return components.join('\n');
}

function toggleLoading(show) {
    const loadingEl = document.getElementById('ai-loading');
    const resultWrapper = document.getElementById('ai-result-wrapper');
    
    if(loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
    if(resultWrapper && !show) resultWrapper.style.display = 'flex'; 
    
    if(resultWrapper && show) {
        resultWrapper.style.display = 'none';
    }
}

async function callGemini(prompt) {
    // 1. Check if Key exists
    if (!apiKey || apiKey.trim() === "") {
         return "Fehler: API Key fehlt. Bitte überprüfe die config.js Datei.";
    }
    
    const cleanKey = apiKey.trim();

    // 2. Updated Model List
    const modelsToTry = [
        "gemini-2.5-flash", 
        "gemini-1.5-flash",
        "gemini-2.0-flash-exp"
    ];

    let lastError = "";

    // Try models sequentially
    for (const model of modelsToTry) {
        console.log(`Trying AI Model: ${model}...`);
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                return data.candidates[0].content.parts[0].text;
            } else {
                // Parse error
                let errorDetails = await response.text();
                try {
                    const jsonError = JSON.parse(errorDetails);
                    errorDetails = jsonError.error?.message || JSON.stringify(jsonError);
                } catch(e) {}

                // If 404, try next model
                if (response.status === 404) {
                    console.warn(`Model ${model} not found (404). Trying next...`);
                    lastError = `Modell ${model} nicht verfügbar.`;
                    continue; 
                }

                // If API not enabled
                if (errorDetails.includes("API has not been used") || errorDetails.includes("Enable it")) {
                    throw new Error("Die 'Generative Language API' ist in deinem Google Cloud Projekt noch nicht aktiviert.");
                }

                throw new Error(`API Fehler (${response.status}): ${errorDetails}`);
            }
        } catch (error) {
            console.error(`Error with ${model}:`, error);
            lastError = error.message;
            if (!lastError.includes("404") && !lastError.includes("nicht verfügbar")) {
                return `Es gab ein Problem: ${lastError}`;
            }
        }
    }

    return `Fehler: Kein KI-Modell konnte erreicht werden.`;
}

// UI Event Listener for Expand/Collapse
const btnResize = document.getElementById('btn-resize-ai');
const btnClose = document.getElementById('btn-close-expanded');

function toggleExpandedView() {
    const hwCol = document.getElementById('hardware-column');
    const aiCol = document.getElementById('ai-column');

    if(!hwCol || !aiCol) return;

    // Standard: hw=col-lg-8, ai=col-lg-4
    const isExpanded = aiCol.classList.contains('col-lg-8');

    if (isExpanded) {
        // Back to normal
        hwCol.classList.remove('col-lg-4');
        hwCol.classList.add('col-lg-8');
        
        aiCol.classList.remove('col-lg-8');
        aiCol.classList.add('col-lg-4');

        resetButtons(false);
    } else {
        // Expand
        hwCol.classList.remove('col-lg-8');
        hwCol.classList.add('col-lg-4');
        
        aiCol.classList.remove('col-lg-4');
        aiCol.classList.add('col-lg-8');

        resetButtons(true);
    }
}

function resetButtons(isExpanded) {
    if(isExpanded) {
        if(btnResize) btnResize.style.display = 'none';
        if(btnClose) btnClose.style.display = 'inline-block';
    } else {
        if(btnResize) btnResize.style.display = 'inline-block';
        if(btnClose) btnClose.style.display = 'none';
    }
}

if(btnResize) btnResize.addEventListener('click', toggleExpandedView);
if(btnClose) btnClose.addEventListener('click', toggleExpandedView);


// 1. Button: Check System
const btnCheck = document.getElementById('btn-check-build');
if(btnCheck) {
    btnCheck.addEventListener('click', async () => {
        const components = getSelectedComponents();
        if(!components) {
            alert("Bitte wähle zuerst Hardware aus.");
            return;
        }

        const prompt = `Du bist ein PC-Hardware-Experte (Stand 2026).
        Analysiere folgende Konfiguration:
        ${components}
        
        Prüfe auf:
        1. Kompatibilität (Sockel AM5/LGA1851, DDR5, PCIe 5.0)
        2. Flaschenhälse (Passt CPU zur GPU?)
        3. Netzteil (Genug Watt für RTX 50er Serie?)
        
        Antworte auf Deutsch, kurz und in Markdown.`;

        toggleLoading(true);
        const result = await callGemini(prompt);
        toggleLoading(false);
        
        const outputBox = document.getElementById('ai-output');
        if(typeof marked !== 'undefined') {
            outputBox.innerHTML = marked.parse(result);
        } else {
            outputBox.innerHTML = result;
        }
    });
}


// 2. Button: Ask Question
const btnAsk = document.getElementById('btn-ask-ai');
if(btnAsk) {
    btnAsk.addEventListener('click', async () => {
        const inputField = document.getElementById('ai-question-input');
        const question = inputField ? inputField.value : "";
        
        if(!question) return;

        const components = getSelectedComponents();
        const prompt = `Du bist ein PC-Bau Experte (Stand 2026).
        Konfiguration des Nutzers:
        ${components}
        
        Frage: "${question}"
        
        Antworte kurz auf Deutsch.`;

        toggleLoading(true);
        const result = await callGemini(prompt);
        toggleLoading(false);
        
        const outputBox = document.getElementById('ai-output');
        if(typeof marked !== 'undefined') {
            outputBox.innerHTML = marked.parse(result);
        } else {
            outputBox.innerHTML = result;
        }
    });
}

// ==========================================
// DARK MODE LOGIC
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Dark Mode
    const toggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement; // <html> Tag
    
    // Check local storage or system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        htmlElement.setAttribute('data-theme', 'dark');
    } else {
        htmlElement.setAttribute('data-theme', 'light');
    }

    // Click Handler
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const currentTheme = htmlElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            // Set attribute (controls CSS)
            htmlElement.setAttribute('data-theme', newTheme);
            
            // Save to local storage
            localStorage.setItem('theme', newTheme);
        });
    }

    // 2. Initialize Preset and Total Calculation
    loadPreset('midrange');
    calcTotal();
});