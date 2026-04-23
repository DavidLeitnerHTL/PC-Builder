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
import os
import urllib.parse

# =========================
# KONFIGURATION
# =========================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DATEI = os.path.join(BASE_DIR, "gpu_preise.csv")

# 👉 NUR DIESE GPUS WERDEN GESUCHT
ZIEL_GPUS = [
    "PowerColor Hellhound Radeon RX 6600 8GB GDDR6 Black / White",
    "MSI GeForce GTX 1630 AERO ITX 4G OC GeForce GTX 1630 4 GB",
    "Gigabyte GV-R79XTX-24GC-B Radeon RX 7900 XTX 24GB GDDR6 Black",
    "EVGA GeForce GTX 1660 XC Ultra Gaming 6GB",
    "Asus Phoenix OC GeForce GTX 1660 Ti 6GB"
]

# =========================
# BROWSER
# =========================

def starte_browser():
    options = Options()
    # options.add_argument("--headless")  # optional

    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-blink-features=AutomationControlled")

    return webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=options
    )

# =========================
# SEARCH
# =========================

def suche_gpu(driver, query):
    search_url = "https://www.amazon.de/s?k=" + urllib.parse.quote(query)
    driver.get(search_url)

    WebDriverWait(driver, 15).until(
        EC.presence_of_all_elements_located(
            (By.CSS_SELECTOR, "div.s-main-slot div[data-component-type='s-search-result']")
        )
    )

    time.sleep(2)

    html = driver.page_source
    soup = BeautifulSoup(html, "html.parser")

    item = soup.select_one("div.s-main-slot div[data-component-type='s-search-result']")

    if not item:
        return (query, None, "Nicht gefunden")

    # Name
    name_tag = item.h2
    name = name_tag.text.strip() if name_tag else query
    name = " ".join(name.split())

    # Preis
    preis_text = "Kein Preis"
    preis_float = None

    preis_tag = item.select_one("span.a-price > span.a-offscreen")

    if preis_tag:
        preis_text = preis_tag.text.strip()
        preis_num = re.sub(r"[^\d,]", "", preis_text).replace(",", ".")

        try:
            preis_float = float(preis_num)
        except:
            pass

    return (name, preis_float, preis_text)

# =========================
# CSV
# =========================

def schreibe_csv(data):
    with open(CSV_DATEI, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Gesuchte GPU", "Gefundener Name", "Preis", "Text", "Quelle"])

        for gesucht, name, preis, text in data:
            writer.writerow([gesucht, name, preis, text, "amazon.de"])

    print("📂 Gespeichert:", CSV_DATEI)

# =========================
# MAIN
# =========================

def main():
    driver = starte_browser()

    results = []

    for gpu in ZIEL_GPUS:
        print("🔎 Suche:", gpu)
        name, preis, text = suche_gpu(driver, gpu)
        results.append((gpu, name, preis, text))

        time.sleep(2)

    driver.quit()

    schreibe_csv(results)

    print(f"✅ {len(results)} GPUs gespeichert!")

# =========================
# START
# =========================

if __name__ == "__main__":
    main()
