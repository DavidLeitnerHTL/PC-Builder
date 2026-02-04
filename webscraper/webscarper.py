from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import csv
import urllib.parse
import time

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

# Chrome Optionen für Headless-Browser
chrome_options = Options()
chrome_options.add_argument("--headless")  # Browser unsichtbar
chrome_options.add_argument("--disable-gpu")
chrome_options.add_argument("--no-sandbox")
chrome_options.add_argument("--window-size=1920,1080")

# =========================
# PREISE HOLEN
# =========================
def hole_preise(gpu_name, driver, max_preise=3):
    """
    Liest die ersten max_preise Preise für eine GPU aus Idealo aus.
    """
    query = urllib.parse.quote(gpu_name)
    url = f"https://www.idealo.at/preisvergleich/MainSearchProductCategory.html?q={query}"
    driver.get(url)

    try:
        # Warten bis mindestens ein Preis sichtbar ist (max. 10 Sekunden)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "span[data-testid='price']"))
        )
        # Alle Preise sammeln
        preis_elements = driver.find_elements(By.CSS_SELECTOR, "span[data-testid='price']")
        preise = [el.text.strip() for el in preis_elements[:max_preise]]
        if not preise:
            return ["Kein Preis gefunden"]
        return preise
    except:
        return ["Kein Preis gefunden"]

# =========================
# HAUPTPROGRAMM
# =========================
def main():
    driver = webdriver.Chrome(options=chrome_options)

    with open(CSV_DATEI, "w", newline="", encoding="utf-8") as datei:
        writer = csv.writer(datei)
        writer.writerow(["Grafikkarte", "Preis 1", "Preis 2", "Preis 3", "Quelle"])

        for gpu in GPUS:
            print("Suche:", gpu)
            preise = hole_preise(gpu, driver)
            # Füllen mit "-" falls weniger als 3 Preise gefunden wurden
            while len(preise) < 3:
                preise.append("-")
            writer.writerow([gpu] + preise + ["idealo.at"])
            print("Preise gefunden:", preise)
            time.sleep(5)  # Pause, damit Seite nicht blockiert

    driver.quit()
    print("Fertig. CSV wurde erstellt.")

# =========================
# START
# =========================
if __name__ == "__main__":
    main()
