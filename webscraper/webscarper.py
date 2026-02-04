from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
import csv
import re
import time

# =========================
# KONFIGURATION
# =========================

URL = "https://www.amazon.de/s?k=grafikkarte"  # Suche nach Grafikkarten
CSV_DATEI = "amazon_gpu_preise.csv"
MAX_GPU_ANZAHL = 20  # Anzahl der GPUs, die gespeichert werden sollen

# =========================
# FUNKTIONEN
# =========================

def starte_browser():
    options = Options()
    options.add_argument("--headless")  # Browser im Hintergrund
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=de-DE")
    # optional: User-Agent setzen, um Blockierung zu vermeiden
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                         "AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/120.0.0.0 Safari/537.36")
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    return driver

def lade_seite(driver, url):
    driver.get(url)
    # Warten, bis die Suchergebnisse geladen sind
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "div.s-main-slot"))
    )
    return driver.page_source

def parse_gpus(html):
    soup = BeautifulSoup(html, "html.parser")
    gpus = []

    items = soup.select("div.s-main-slot > div[data-component-type='s-search-result']")
    for item in items[:MAX_GPU_ANZAHL]:
        try:
            name = item.h2.text.strip()
            preis_whole = item.select_one("span.a-price-whole")
            preis_fraction = item.select_one("span.a-price-fraction")
            if preis_whole and preis_fraction:
                preis_text = f"{preis_whole.text.strip()},{preis_fraction.text.strip()} €"
                preis_float = float(preis_whole.text.replace(".", "") + "." + preis_fraction.text)
            else:
                preis_text = "Kein Preis"
                preis_float = None

            gpus.append((name, preis_float, preis_text))
        except Exception:
            continue
    return gpus

def schreibe_csv(gpus):
    with open(CSV_DATEI, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Grafikkarte", "Preis (float)", "Preis (Text)", "Quelle"])
        for name, preis_float, preis_text in gpus:
            writer.writerow([name, preis_float, preis_text, "amazon.de"])

# =========================
# MAIN
# =========================

def main():
    print("Starte Browser...")
    driver = starte_browser()

    print("Lade Amazon-Seite...")
    html = lade_seite(driver, URL)

    print("Schließe Browser...")
    driver.quit()

    print("Analysiere HTML...")
    gpus = parse_gpus(html)

    if not gpus:
        print("Keine GPU-Daten gefunden.")
        return

    schreibe_csv(gpus)
    print(f"CSV erstellt: {CSV_DATEI}")
    print(f"{len(gpus)} GPUs gespeichert.")

# =========================
# START
# =========================

if __name__ == "__main__":
    main()
