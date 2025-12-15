# **PC-Konfigurator Ultimate AI-Edition**

**Teammitglieder** David Leitner, Maximilian Baumgartner

**Projekt:** Intelligenter PC-Konfigurator mit AI-Beratung und Expertenwissen

## **Ausgangssituation / Problemstellung**

Viele PC-Käufer sind mit der Fülle an Hardware-Optionen überfordert. Sie wissen nicht, ob Teile zusammenpassen, wie viel Leistung sie wirklich brauchen oder ob das Netzteil ausreicht. Statische Konfiguratoren bieten hier oft keine aktive Hilfestellung.

**Lösung:** Eine moderne Web-App, die nicht nur Preise addiert, sondern den Nutzer mittels **Künstlicher Intelligenz (Gemini API)** aktiv berät und auf Fehler hinweist.

## **Projektziele & Features**

**Kernfunktionen:**

* 🛠 **Konfigurator:** Auswahl von CPU, GPU, RAM, SSD, Mainboard, Kühler und Gehäuse.  
* 💶 **Echtzeit-Kalkulation:** Der Gesamtpreis wird sofort aktualisiert (Sticky Footer).  
* 🔗 **Direktlinks:** Zu jedem Produkt gibt es einen Link zum Preisvergleich/Shop.

**Neue "Ultimate" Features:**

* ✨ **AI System-Check:** Ein Klick prüft die Konfiguration auf Flaschenhälse und Kompatibilität.  
* 💬 **AI Hardware-Chat:** Der Nutzer kann spezifische Fragen stellen ("Reicht das für 4K Gaming?") und erhält eine Antwort basierend auf seiner aktuellen Auswahl.  
* 📚 **Experten-Kompendium:** Ein interaktives Akkordeon-Menü mit tiefgehendem Wissen zu DLSS, Raytracing, DDR5-Latenzen und Netzteil-Zertifizierungen.

## **Technische Umsetzung**

**Struktur (Die 3 Säulen):**

1. **HTML5 (index.html):** Semantische Struktur, Bootstrap 5 Grid, Accordion-Elemente.  
2. **CSS3 (style.css):** "Slate Theme" (Modern Dark/Blue Grey), Responsive Design, Animationen (Pulse-Effekt beim Preis), Custom Gradients.  
3. **JavaScript (script.js):**  
   * Logik für Preisberechnung.  
   * Integration der **Google Gemini API** für intelligente Antworten.  
   * Asynchrone Datenverarbeitung (Async/Await) für API-Calls.  
   * Nutzung der marked.js Library zum Rendern von Markdown-Antworten der AI.

## **Kritische Erfolgsfaktoren**

* **API-Stabilität:** Die Gemini-Schnittstelle muss zuverlässig antworten (implementiert mit Error-Handling).  
* **Usability:** Die Trennung von Konfigurator und Theorie muss trotz der Informationsfülle übersichtlich bleiben (gelöst durch Tabs und Akkordeons).  
* **Performance:** Schnelle Ladezeiten trotz externer Libraries (Bootstrap, Marked).

## **Meilensteine (Status: Abgeschlossen)**

* \[x\] HTML-Grundstruktur & Bootstrap Integration  
* \[x\] CSS "Slate" Design & Responsive Layout  
* \[x\] JavaScript Preisberechnung  
* \[x\] **NEU:** Integration der Gemini AI (Systemcheck & Chat)  
* \[x\] **NEU:** Erweiterung der Wissensdatenbank (Experten-Level)  
* \[x\] **NEU:** Code Refactoring (Trennung in HTML/CSS/JS Dateien)

*Erstellt am 28\. Oktober 2025 | Version 2.0 (AI Update)*