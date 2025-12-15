/**
 * KONFIGURATION
 * WICHTIG: Wenn du die Seite lokal auf deinem PC nutzt, musst du hier
 * deinen eigenen Google Gemini API Key zwischen die Anführungszeichen setzen.
 * Beispiel: const apiKey = "AIzaSy...";
 */
const apiKey = "AIzaSyDhsBHrpDgfGze7Pw3MYL_QVIRRiNPSJTs"; 

/**
 * FUNKTION: update(select)
 * Wird aufgerufen, sobald der Benutzer im Dropdown etwas ändert.
 */
function update(select) {
  // 1. Wert auslesen: Der Value im HTML ist z.B. "99.00,https://..."
  const value = select.value;
  
  // Sicherheitscheck: Wenn kein Komma da ist, abbrechen
  if (!value.includes(',')) return;
  
  // 2. Zerlegen: Wir trennen den String am Komma
  const parts = value.split(',');
  const preis = parts[0];                // Der Teil vor dem Komma
  const link = parts.slice(1).join(','); // Der Teil nach dem Komma (Link)

  // 3. Zeile finden: Wir suchen das übergeordnete <tr> Element (Tabellenzeile)
  const row = select.closest('tr');

  // 4. Preis-Feld updaten: Wir suchen das Input-Feld in dieser Zeile
  const priceInput = row.querySelector('.price-input');
  if (priceInput) priceInput.value = preis;

  // 5. Link-Button updaten: Wir suchen den <a> Tag
  const linkButton = row.querySelector('a');
  if (linkButton) linkButton.href = link;

  // 6. Gesamtpreis neu berechnen
  calcTotal();
}

/**
 * FUNKTION: calcTotal()
 * Geht durch alle Zeilen, sammelt die Preise ein und zeigt die Summe an.
 */
function calcTotal() {
  let sum = 0;

  // Wir suchen alle Zeilen im Tabellen-Körper (tbody)
  document.querySelectorAll("tbody tr").forEach(row => {
    // In jeder Zeile suchen wir das Preis-Input
    const preisEl = row.querySelector('.price-input');
    
    if(preisEl) {
        // parseFloat macht aus dem Text "99.00" eine echte Zahl 99.00
        const preis = parseFloat(preisEl.value) || 0;
        sum += preis;
    }
  });
  
  // Ergebnis anzeigen
  const totalEl = document.getElementById("total");
  
  if(totalEl) {
      // Animation neu anstoßen
      if(totalEl.parentElement) {
          totalEl.parentElement.classList.remove('price-update-anim');
          void totalEl.offsetWidth; // Trigger Reflow
          totalEl.parentElement.classList.add('price-update-anim');
      }
      // Preis auf 2 Nachkommastellen formatieren
      totalEl.textContent = sum.toFixed(2);
  }
}

// ==========================================
// AI LOGIK (Gemini API Integration)
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
    const outputEl = document.getElementById('ai-output');
    
    if(loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
    if(outputEl) outputEl.style.display = show ? 'none' : 'block';
}

async function callGemini(prompt) {
    // Prüfen ob API Key vorhanden ist (wichtig für lokale Ausführung)
    if (!apiKey || apiKey === "") {
        console.warn("API Key fehlt! Bitte in script.js eintragen.");
        // Wir versuchen es trotzdem, falls er injected wurde, aber geben Warnung aus
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
            if (i === delays.length) return "⚠️ Fehler: Die AI antwortet nicht. Bitte prüfe deinen API-Key in der Datei script.js oder versuche es später erneut.";
            await new Promise(resolve => setTimeout(resolve, delays[i]));
        }
    }
}

// === Event Listener ===

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
        
        Antworte auf Deutsch, kurz, prägnant und hilfreich in Markdown Formatierung.`;

        toggleLoading(true);
        const result = await callGemini(prompt);
        toggleLoading(false);
        
        const outputBox = document.getElementById('ai-output');
        if(typeof marked !== 'undefined') {
            outputBox.innerHTML = marked.parse(result);
        } else {
            outputBox.innerHTML = result; // Fallback falls marked.js fehlt
        }
        outputBox.style.display = 'block';
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
        
        Antworte spezifisch basierend auf der Hardware oben. Antworte auf Deutsch.`;

        toggleLoading(true);
        const result = await callGemini(prompt);
        toggleLoading(false);
        
        const outputBox = document.getElementById('ai-output');
        if(typeof marked !== 'undefined') {
            outputBox.innerHTML = marked.parse(result);
        } else {
            outputBox.innerHTML = result;
        }
        outputBox.style.display = 'block';
    });
}

// Start: Einmal rechnen, wenn die Seite geladen ist
document.addEventListener("DOMContentLoaded", () => {
  calcTotal();
});