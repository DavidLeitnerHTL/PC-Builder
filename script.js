/**
 * PC Builder 2026 - Main Script
 * Handles hardware configuration, price calculation, 
 * dark mode, and AI assistant via Cloudflare Worker Proxy.
 */

// ==========================================
// CONFIGURATION & STATE
// ==========================================
const WORKER_URL = "https://gemini-proxy.builder-htl.workers.dev";

// Prevents button UI flickering during preset loading
let isPresetLoading = false;

/**
 * SYSTEM PRESETS 
 * Aligned with actual JSON dataset
 */
const SYSTEM_PRESETS = {
    budget: {
        cpu: "Intel Core i7 6700K",
        cooler: "Noctua NH-U12S",
        mb: "Asus B365 PRIME",
        gpu: "RTX 4060",  
        ram: "TEAMGROUP T-Force",
        ssd: "Patriot Ignite",
        psu: "Enermax Revolution",
        case: "Deepcool Tesseract"
    },
    midrange: {
        cpu: "Intel Core i9 9900KF",
        cooler: "Fractal Design Celsius",
        mb: "Gigabyte B860",
        gpu: "RX 6750 XT",
        ram: "G.Skill Trident",
        ssd: "Corsair MP600",
        psu: "be quiet! Dark Power",
        case: "Zalman Z3"
    },
    highend: {
        cpu: "Intel Core i9 12900",
        cooler: "MSI MEG",
        mb: "ASRock A620",
        gpu: "RTX 4080", 
        ram: "Corsair Dominator",
        ssd: "Seagate Game 1TB",
        psu: "Silverstone HELA",
        case: "Thermaltake CTE"
    }
};

// ==========================================
// UI HELPERS
// ==========================================

function resetPresetButtons() {
    const buttonBudget = document.getElementById('preset-budget');
    const buttonMid = document.getElementById('preset-midrange');
    const buttonHigh = document.getElementById('preset-highend');

    if (buttonBudget) {
        buttonBudget.classList.remove('btn-success');
        buttonBudget.classList.add('btn-outline-success');
    }
    if (buttonMid) {
        buttonMid.classList.remove('btn-primary');
        buttonMid.classList.add('btn-outline-primary');
    }
    if (buttonHigh) {
        buttonHigh.classList.remove('btn-danger');
        buttonHigh.classList.add('btn-outline-danger');
    }
}

function activatePresetButton(presetType) {
    resetPresetButtons(); 
    
    let targetButtonElement;
    let buttonColorClass;
    
    if (presetType === 'budget') {
        targetButtonElement = document.getElementById('preset-budget');
        buttonColorClass = 'success';
    } else if (presetType === 'midrange') {
        targetButtonElement = document.getElementById('preset-midrange');
        buttonColorClass = 'primary';
    } else if (presetType === 'highend') {
        targetButtonElement = document.getElementById('preset-highend');
        buttonColorClass = 'danger';
    }

    if (targetButtonElement) {
        targetButtonElement.classList.remove(`btn-outline-${buttonColorClass}`);
        targetButtonElement.classList.add(`btn-${buttonColorClass}`);
    }
}

// ==========================================
// CALCULATION & DROPDOWN UPDATES
// ==========================================

function loadPreset(presetType) {
    const requestedPreset = SYSTEM_PRESETS[presetType];
    if (!requestedPreset) return;

    isPresetLoading = true; 
    activatePresetButton(presetType);

    const componentMappingKeys = ['cpu', 'cooler', 'mb', 'gpu', 'ram', 'ssd', 'psu', 'case'];

    componentMappingKeys.forEach(domId => {
        const selectElementNode = document.getElementById(domId);
        if (selectElementNode) {
            for (let i = 0; i < selectElementNode.options.length; i++) {
                if (selectElementNode.options[i].text.includes(requestedPreset[domId])) {
                    selectElementNode.selectedIndex = i;
                    updateRow(selectElementNode); 
                    break;
                }
            }
        }
    });

    isPresetLoading = false; 
}

function updateRow(selectElementNode) {
    if (!isPresetLoading) {
        resetPresetButtons();
    }

    const selectedOptionNode = selectElementNode.options[selectElementNode.selectedIndex];
    if (!selectedOptionNode || selectedOptionNode.disabled) return;

    const rawPriceNumber = parseFloat(selectedOptionNode.value);
    const formattedPriceString = isNaN(rawPriceNumber) ? "0.00" : rawPriceNumber.toFixed(2);

    const productGuid = selectedOptionNode.getAttribute('data-id');
    
    const parentTableRow = selectElementNode.closest('tr');
    const tableCategoryName = parentTableRow.getAttribute('data-category');

    const generatedProductLink = productGuid ? `product.html?category=${encodeURIComponent(tableCategoryName)}&id=${encodeURIComponent(productGuid)}` : '#';

    const priceInputElement = parentTableRow.querySelector('.price-input');
    if (priceInputElement) priceInputElement.value = formattedPriceString;

    const detailsButtonElement = parentTableRow.querySelector('a');
    if (detailsButtonElement) detailsButtonElement.href = generatedProductLink;

    calculateTotalPrice();
}

function calculateTotalPrice() {
    let priceSumTotal = 0;
    document.querySelectorAll("#hardware-table tbody tr").forEach(tableRow => {
        const priceField = tableRow.querySelector('.price-input');
        if(priceField) {
            const rowPriceAmount = parseFloat(priceField.value) || 0;
            priceSumTotal += rowPriceAmount;
        }
    });
    
    const totalPriceDisplay = document.getElementById("total");
    if(totalPriceDisplay) {
        if(totalPriceDisplay.parentElement) {
            totalPriceDisplay.parentElement.classList.remove('price-update-anim');
            // Trigger reflow to restart CSS animation
            void totalPriceDisplay.offsetWidth; 
            totalPriceDisplay.parentElement.classList.add('price-update-anim');
        }
        totalPriceDisplay.textContent = priceSumTotal.toFixed(2);
    }
}

// ==========================================
// AI LOGIC (WORKER PROXY)
// ==========================================

function getSelectedComponentsList() {
    let hardwareComponentsList = [];
    document.querySelectorAll('#hardware-table tbody tr').forEach(tableRow => {
        const itemCategoryName = tableRow.getAttribute('data-category');
        const dropdownElement = tableRow.querySelector('select');
        if(dropdownElement && dropdownElement.selectedIndex > -1) { 
            const selectedItemText = dropdownElement.options[dropdownElement.selectedIndex].text;
            hardwareComponentsList.push(`- ${itemCategoryName}: ${selectedItemText}`);
        }
    });
    return hardwareComponentsList.join('\n');
}

function toggleAiLoadingState(isVisible) {
    const loaderElement = document.getElementById('ai-loading');
    const resultWrapperElement = document.getElementById('ai-result-wrapper');
    
    if(loaderElement) loaderElement.style.display = isVisible ? 'flex' : 'none';
    if(resultWrapperElement) resultWrapperElement.style.display = isVisible ? 'none' : 'flex'; 
}

async function callWorkerAIApi(promptString) {
    try {
        const workerNetworkResponse = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptString })
        });

        const parsedJsonResponse = await workerNetworkResponse.json();

        if (parsedJsonResponse.candidates && parsedJsonResponse.candidates[0].content) {
            return parsedJsonResponse.candidates[0].content.parts[0].text;
        } 
        
        if (parsedJsonResponse.error) {
            let errorDetailsString = parsedJsonResponse.error;
            if (typeof parsedJsonResponse.error === 'object') {
                errorDetailsString = parsedJsonResponse.error.message || JSON.stringify(parsedJsonResponse.error);
            }
            return `KI Fehler: ${errorDetailsString}`;
        }
        
        return "Die KI konnte keine Antwort generieren.";
    } catch (networkError) {
        console.error("Worker Execution Error:", networkError);
        return `Fehler: Die Verbindung zum KI-Server ist fehlgeschlagen. (${networkError.message})`;
    }
}

// ==========================================
// UI EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Hardware Table Setup
    if (document.getElementById('hardware-table')) {
        loadPreset('midrange');
        calculateTotalPrice();
    }

    // 2. AI Assistant Triggers
    const triggerBuildCheck = document.getElementById('btn-check-build');
    const triggerAskAi = document.getElementById('btn-ask-ai');
    const aiOutputContainer = document.getElementById('ai-output');
    const aiQuestionInput = document.getElementById('ai-question-input');

    if(triggerBuildCheck) {
        triggerBuildCheck.addEventListener('click', async () => {
            const systemComponents = getSelectedComponentsList();
            const aiPromptText = `Analysiere diese PC-Konfiguration (2026):\n${systemComponents}\nPrüfe kurz Kompatibilität, Flaschenhälse und ob das Netzteil reicht. Antworte in Markdown.`;

            toggleAiLoadingState(true);
            const generatedResult = await callWorkerAIApi(aiPromptText);
            toggleAiLoadingState(false);
            
            if(aiOutputContainer) {
                aiOutputContainer.innerHTML = typeof marked !== 'undefined' ? marked.parse(generatedResult) : generatedResult;
            }
        });
    }

    if(triggerAskAi) {
        triggerAskAi.addEventListener('click', async () => {
            const userCustomQuestion = aiQuestionInput ? aiQuestionInput.value : "";
            if(!userCustomQuestion) return;

            const systemComponents = getSelectedComponentsList();
            const aiPromptText = `Aktuelle PC-Konfig:\n${systemComponents}\n\nFrage des Nutzers: ${userCustomQuestion}\nAntworte kurz und präzise.`;

            toggleAiLoadingState(true);
            const generatedResult = await callWorkerAIApi(aiPromptText);
            toggleAiLoadingState(false);
            
            if(aiOutputContainer) {
                aiOutputContainer.innerHTML = typeof marked !== 'undefined' ? marked.parse(generatedResult) : generatedResult;
            }
        });
    }

    // 3. Handle Column Resizing
    const buttonExpandView = document.getElementById('btn-resize-ai');
    const buttonCollapseView = document.getElementById('btn-close-expanded');

    const toggleColumnLayout = () => {
        const hardwareSection = document.getElementById('hardware-column');
        const aiSection = document.getElementById('ai-column');
        if(!hardwareSection || !aiSection) return;

        const isViewExpanded = aiSection.classList.contains('col-lg-8');

        if (isViewExpanded) {
            hardwareSection.classList.replace('col-lg-4', 'col-lg-8');
            aiSection.classList.replace('col-lg-8', 'col-lg-4');
            if(buttonExpandView) buttonExpandView.style.display = 'inline-block';
            if(buttonCollapseView) buttonCollapseView.style.display = 'none';
        } else {
            hardwareSection.classList.replace('col-lg-8', 'col-lg-4');
            aiSection.classList.replace('col-lg-4', 'col-lg-8');
            if(buttonExpandView) buttonExpandView.style.display = 'none';
            if(buttonCollapseView) buttonCollapseView.style.display = 'inline-block';
        }
    };

    if(buttonExpandView) buttonExpandView.addEventListener('click', toggleColumnLayout);
    if(buttonCollapseView) buttonCollapseView.addEventListener('click', toggleColumnLayout);

    // 4. Dark Theme Toggle Management
    const themeToggleButton = document.getElementById('theme-toggle');
    const rootDocumentElement = document.documentElement;
    
    const previouslyStoredTheme = localStorage.getItem('theme');
    const systemPrefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (previouslyStoredTheme === 'dark' || (!previouslyStoredTheme && systemPrefersDarkScheme)) {
        rootDocumentElement.setAttribute('data-theme', 'dark');
    }

    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => {
            const currentActiveTheme = rootDocumentElement.getAttribute('data-theme');
            const targetTheme = currentActiveTheme === 'dark' ? 'light' : 'dark';
            rootDocumentElement.setAttribute('data-theme', targetTheme);
            localStorage.setItem('theme', targetTheme);
        });
    }
});