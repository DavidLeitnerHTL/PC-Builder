from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import csv
import urllib.parse
import time
import sys

# =========================
# KONFIGURATION
# =========================

GPUS = [
    "RTX 4060 Ti",
    "RTX 5070",
    "RTX 5080",
    "RX 7900 GRE"
]

CSV_DATEI = "gpu_preise_idealo.csv"
QUELLE = "idealo.at"
MAX_PREISE = 3
WAIT_TIMEOUT = 10
PAUSE_SEKUNDEN = 5

# =========================
# CHROME OPTIONEN
# =========================

def erstelle_chrome_optionen():
    """Erstellt und gibt Chrome-Optionen zurück."""
    try:
        options = Options()
        options.add_argument("--headless")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--window-size=1920,1080")
        return options
    except Exception as e:
        print("Fehler bei Chrome-Optionen:", e)
        sys.exit(1)

# =========================
# DRIVER STARTEN
# =========================

def starte_driver():
    """Startet den Chrome WebDriver."""
    try:
        options = erstelle_chrome_optionen()
        driver = webdriver.Chrome(options=options)
        return driver
    except Exception as e:
        print("Fehler beim Starten des WebDrivers:", e)
        sys.exit(1)

# =========================
# PREISE HOLEN
# =========================

def hole_preise(gpu_name, driver):
    """
    Holt bis zu MAX_PREISE Preise von Idealo.
    Gibt immer eine Liste mit genau MAX_PREISE Einträgen zurück.
    """
    preise = []

    try:
        query = urllib.parse.quote(gpu_name)
        url = f"https://www.idealo.at/preisvergleich/MainSearchProductCategory.html?q={query}"
        driver.get(url)
    except Exception as e:
        print(f"Fehler beim Laden der Seite für {gpu_name}:", e)
        return ["Kein Preis gefunden"] * MAX_PREISE

    try:
        WebDriverWait(driver, WAIT_TIMEOUT).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "span[data-testid='price']"))
        )
    except Exception:
        print(f"Keine Preise sichtbar für {gpu_name}")
        return ["Kein Preis gefunden"] * MAX_PREISE

    try:
        preis_elemente = driver.find_elements(By.CSS_SELECTOR, "span[data-testid='price']")
        for element in preis_elemente[:MAX_PREISE]:
            preise.append(element.text.strip())
    except Exception as e:
        print(f"Fehler beim Auslesen der Preise für {gpu_name}:", e)

    while len(preise) < MAX_PREISE:
        preise.append("-")

    return preise

# =========================
# CSV DATEI ERSTELLEN
# =========================

def schreibe_csv(driver):
    """Schreibt alle GPU-Preise in eine CSV-Datei."""
    try:
        datei = open(CSV_DATEI, "w", newline="", encoding="utf-8")
    except Exception as e:
        print("Fehler beim Öffnen der CSV-Datei:", e)
        sys.exit(1)

    with datei:
        writer = csv.writer(datei)
        writer.writerow(["Grafikkarte", "Preis 1", "Preis 2", "Preis 3", "Quelle"])

        for gpu in GPUS:
            print("Suche:", gpu)

            preise = hole_preise(gpu, driver)

            try:
                writer.writerow([gpu] + preise + [QUELLE])
                print("Preise:", preise)
            except Exception as e:
                print(f"Fehler beim Schreiben in CSV für {gpu}:", e)

            time.sleep(PAUSE_SEKUNDEN)

# =========================
# HAUPTPROGRAMM
# =========================

def main():
    driver = starte_driver()

    try:
        schreibe_csv(driver)
    except Exception as e:
        print("Unerwarteter Fehler:", e)
    finally:
        try:
            driver.quit()
        except:
            pass

    print("Fertig. CSV wurde erstellt.")

# =========================
# START
# =========================

if __name__ == "__main__":
    main()
