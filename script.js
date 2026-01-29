/**
 * KONFIGURATION
 */
// API Key wird jetzt aus config.js geladen
const apiKey = typeof CONFIG !== 'undefined' ? CONFIG.GEMINI_API_KEY : ""; 

/**
 * FUNKTION: update(select)
 */
function update(select) {
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
// AI LOGIK
// ==========================================

function getSelectedComponents() {
    let components = [];
    document.querySelectorAll('#hardware-table tbody tr').forEach(row => {
        const category = row.getAttribute('data-category');
        const select = row.querySelector('select');
        if(select && select.options.length > 0) {
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
    
    // Wenn Resultat gezeigt wird, blende Wrapper ein (default hidden)
    if(resultWrapper && !show) {
        resultWrapper.style.display = 'block';
    }
    // Wenn geladen wird, Wrapper ausblenden (damit alte Antworten verschwinden)
    if(resultWrapper && show) {
        resultWrapper.style.display = 'none';
        // Reset expanded state bei neuer Suche
        resultWrapper.classList.remove('expanded');
        resetButtons(false);
    }
}

async function callGemini(prompt) {
    if (!apiKey) {
         return " Konfiguration: API Key fehlt. Stelle sicher, dass config.js geladen wird.";
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    const delays = [1000, 2000, 4000];
    
    for (let i = 0; i <= delays.length; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error(error);
            if (i === delays.length) return "⚠️ Fehler: Die AI konnte nicht antworten. Überprüfe deine Internetverbindung.";
            await new Promise(resolve => setTimeout(resolve, delays[i]));
        }
    }
}

// === Event Listener für UI ===

const btnResize = document.getElementById('btn-resize-ai');
const btnClose = document.getElementById('btn-close-expanded');
const wrapper = document.getElementById('ai-result-wrapper');

function toggleExpandedView() {
    if(!wrapper) return;
    
    wrapper.classList.toggle('expanded');
    const isExpanded = wrapper.classList.contains('expanded');
    resetButtons(isExpanded);
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
        const prompt = `Du bist ein erfahrener PC-Hardware-Experte.
        Analysiere folgende Konfiguration auf:
        1. Kompatibilität (passen Sockel, RAM?)
        2. Flaschenhälse (CPU zu schwach für GPU?)
        3. Netzteil (reicht die Wattzahl?)
        
        Konfiguration:
        ${components}
        
        Antworte auf Deutsch. Fasse dich extrem kurz und prägnant. Nutze Stichpunkte. Antworte in Markdown Formatierung.`;

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
        const prompt = `Du bist ein PC-Bau Experte.
        Der Nutzer hat folgende Konfiguration gewählt:
        ${components}
        
        Frage des Nutzers: "${question}"
        
        Antworte spezifisch basierend auf der Hardware oben. Antworte auf Deutsch. Fasse dich sehr kurz (max 3-4 Sätze).`;

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
  calcTotal();
});