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

URL = "https://www.amazon.de/s?k=grafikkarte"
CSV_DATEI = "amazon_gpu_preise.csv"
MAX_GPU_ANZAHL = 50
MAX_NAME_LEN = 60  # maximale Länge des Namens in CSV

# =========================
# FUNKTIONEN
# =========================

def starte_browser():
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=de-DE")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                         "AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/120.0.0.0 Safari/537.36")
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

def lade_seite(driver, url):
    driver.get(url)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "div.s-main-slot"))
    )
    time.sleep(2)
    return driver.page_source

def parse_gpus(html):
    soup = BeautifulSoup(html, "html.parser")
    gpus = []

    items = soup.select("div.s-main-slot > div[data-component-type='s-search-result']")

    for item in items[:MAX_GPU_ANZAHL]:
        try:
            # Name
            name_tag = item.h2
            name = name_tag.text.strip() if name_tag else "Unbekannt"
            if len(name) > MAX_NAME_LEN:
                name = name[:MAX_NAME_LEN] + "..."

            # Preis
            preis_float = None
            preis_text = "Kein Preis"

            preis_container = item.select_one("span.a-price")
            if preis_container:
                offscreen = preis_container.select_one("span.a-offscreen")
                if offscreen:
                    preis_text = offscreen.text.strip()
                    preis_num = re.sub(r"[^\d,]", "", preis_text).replace(",", ".")
                    try:
                        preis_float = float(preis_num)
                    except:
                        preis_float = None

            gpus.append((name, preis_float, preis_text))

        except Exception:
            continue

    return gpus

def schreibe_csv(gpus):
    with open(CSV_DATEI, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Name", "Preis", "Text", "Quelle"])
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
