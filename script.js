/**
 * KONFIGURATION
 */
const apiKey = typeof CONFIG !== 'undefined' ? CONFIG.GEMINI_API_KEY : ""; 

// Flag um zu prüfen, ob gerade ein Preset geladen wird
let isPresetLoading = false;

/**
 * PRESETS (Vorauswahlen für 2026 Hardware)
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
 * Hilfsfunktion: Setzt alle Preset-Buttons auf den Normalzustand zurück
 */
function resetPresetButtons() {
    const btnBudget = document.getElementById('preset-budget');
    const btnMid = document.getElementById('preset-midrange');
    const btnHigh = document.getElementById('preset-highend');

    // Budget: grün
    if (btnBudget) {
        btnBudget.classList.remove('btn-success');
        btnBudget.classList.add('btn-outline-success');
    }
    // Midrange: blau
    if (btnMid) {
        btnMid.classList.remove('btn-primary');
        btnMid.classList.add('btn-outline-primary');
    }
    // Highend: rot
    if (btnHigh) {
        btnHigh.classList.remove('btn-danger');
        btnHigh.classList.add('btn-outline-danger');
    }
}

/**
 * Hilfsfunktion: Setzt einen bestimmten Button auf "Aktiv" (gefüllt)
 */
function activatePresetButton(type) {
    resetPresetButtons(); // Erstmal alle zurücksetzen
    
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
        // Outline entfernen, Full Color hinzufügen
        btn.classList.remove(`btn-outline-${colorClass}`);
        btn.classList.add(`btn-${colorClass}`);
    }
}

/**
 * FUNKTION: Preset laden
 */
function loadPreset(type) {
    const preset = PRESETS[type];
    if (!preset) return;

    isPresetLoading = true; // Flag setzen: Wir ändern jetzt programmatisch

    // Button Highlighting
    activatePresetButton(type);

    // Mapping der HTML-IDs zu den Preset-Keys
    const mapping = ['cpu', 'cooler', 'mb', 'gpu', 'ram', 'ssd', 'psu', 'case'];

    mapping.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            // Suche die Option, die den Text aus dem Preset enthält
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].text.includes(preset[id])) {
                    select.selectedIndex = i;
                    update(select); 
                    break;
                }
            }
        }
    });

    isPresetLoading = false; // Fertig
}

/**
 * FUNKTION: update(select)
 * Berechnet Preis und aktualisiert den Amazon-Link
 */
function update(select) {
    // Wenn der User selbst klickt (nicht durch Preset-Laden), Buttons resetten
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
// AI LOGIK (MIT AUTO-FALLBACK FÜR NEUE MODELLE)
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
    if(resultWrapper && !show) resultWrapper.style.display = 'flex'; // Use flex to maintain structure
    
    if(resultWrapper && show) {
        resultWrapper.style.display = 'none';
    }
}

async function callGemini(prompt) {
    // 1. Prüfen ob Key existiert
    if (!apiKey || apiKey.trim() === "") {
         return "Fehler: API Key fehlt. Bitte überprüfe die config.js Datei.";
    }
    
    const cleanKey = apiKey.trim();

    // 2. Modell-Liste aktualisiert basierend auf deinem Dashboard
    const modelsToTry = [
        "gemini-2.5-flash",  // Deine verfügbare Version
        "gemini-3-flash",    // Deine verfügbare Version
        "gemini-1.5-flash",  // Fallback
        "gemini-2.0-flash-exp" // Experimenteller Fallback
    ];

    let lastError = "";

    // Wir probieren die Modelle nacheinander durch
    for (const model of modelsToTry) {
        console.log(`Versuche KI-Modell: ${model}...`);
        
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
                // Fehler analysieren
                let errorDetails = await response.text();
                try {
                    const jsonError = JSON.parse(errorDetails);
                    errorDetails = jsonError.error?.message || JSON.stringify(jsonError);
                } catch(e) {}

                // Wenn es ein 404 ist, probieren wir das nächste Modell
                if (response.status === 404) {
                    console.warn(`Modell ${model} nicht gefunden (404). Versuche nächstes...`);
                    lastError = `Modell ${model} nicht verfügbar.`;
                    continue; // Nächster Schleifendurchlauf
                }

                // Bei anderen Fehlern (z.B. API nicht aktiviert) brechen wir ab
                if (errorDetails.includes("API has not been used") || errorDetails.includes("Enable it")) {
                    throw new Error("Die 'Generative Language API' ist in deinem Google Cloud Projekt noch nicht aktiviert. Bitte suche nach der API in der Google Console und klicke auf 'ENABLE'.");
                }

                throw new Error(`API Fehler (${response.status}): ${errorDetails}`);
            }
        } catch (error) {
            console.error(`Fehler bei ${model}:`, error);
            lastError = error.message;
            // Wenn es kein 404-ähnlicher Fehler ist, ist es vermutlich ein Key-Problem -> Abbruch
            if (!lastError.includes("404") && !lastError.includes("nicht verfügbar")) {
                return `Es gab ein Problem: ${lastError}`;
            }
        }
    }

    return `Fehler: Kein KI-Modell konnte erreicht werden. (Probierte Modelle: ${modelsToTry.join(', ')})`;
}

// UI Event Listener für Expand/Collapse
const btnResize = document.getElementById('btn-resize-ai');
const btnClose = document.getElementById('btn-close-expanded');

// Funktion zum Umschalten des Modus
function toggleExpandedView() {
    const hwCol = document.getElementById('hardware-column');
    const aiCol = document.getElementById('ai-column');

    if(!hwCol || !aiCol) return;

    // Check current state by looking at classes
    // Standard: hw=col-lg-8, ai=col-lg-4
    const isExpanded = aiCol.classList.contains('col-lg-8');

    if (isExpanded) {
        // ZURÜCK ZUM NORMALZUSTAND
        // Hardware wieder breit (8), AI wieder schmal (4)
        hwCol.classList.remove('col-lg-4');
        hwCol.classList.add('col-lg-8');
        
        aiCol.classList.remove('col-lg-8');
        aiCol.classList.add('col-lg-4');

        resetButtons(false);
    } else {
        // EXPANDIEREN
        // Hardware schmal (4), AI breit (8)
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


// 1. Button: Systemprüfung
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


// 2. Button: Frage stellen
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

document.addEventListener("DOMContentLoaded", () => {
  loadPreset('midrange');
  calcTotal();
});