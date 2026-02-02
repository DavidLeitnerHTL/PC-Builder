Professional Hardware Systems - PC Konfigurator 2026
====================================================

Ein moderner, webbasierter PC-Konfigurator, der Nutzern hilft, kompatible Computer-Systeme zusammenzustellen. Das Projekt bietet kuratierte Hardware-Vorauswahlen (Presets), Echtzeit-Preisberechnung und einen integrierten KI-Assistenten zur Beratung.

Features
--------

### 1\. Interaktiver Konfigurator

*   **Aktuelle Hardware (Stand 2026):** Unterstützung für NVIDIA RTX 50-Serie (Blackwell), AMD Ryzen 9000 & Intel Core Ultra.
    
*   **Smarte Presets:** Ein-Klick-Lösungen für _Budget_, _Mid-Range_ und _High-End_ Setups.
    
*   **Echtzeit-Kalkulation:** Der Gesamtpreis aktualisiert sich sofort bei jeder Änderung.
    
*   **Direktlinks:** Integrierte Bezugsquellen für alle Komponenten.
    

### 2\. AI Assistant (Gemini Powered)

*   Ein integrierter Chatbot, basierend auf Googles Gemini.
    
*   Beantwortet spezifische Hardware-Fragen.
    
*   Prüft die gewählte Konfiguration auf Kompatibilität und Bottlenecks.
    

### 3\. Expertenwissen & News

*   **Wissensdatenbank:** Detaillierte Erklärungen zu aktuellen Technologien (DDR5, PCIe 5.0, OLED, ATX 3.1).
    
*   **News Feed:** Aktuelle Schlagzeilen aus der Hardware-Industrie.
    
*   **Troubleshooting:** Hilfestellungen bei gängigen PC-Bau-Problemen.
    

Technologien
------------

*   **Frontend:** HTML5, CSS3 (Custom Properties & Animations), JavaScript (ES6+)
    
*   **Framework:** Bootstrap 5.3 (Responsive Design)
    
*   **KI-Integration:** Google Gemini API
    
*   **Icons:** FontAwesome 6
    
*   **Hosting:** Cloudflare Pages
    

Installation & Deployment
-------------------------

Das Projekt ist für das Hosting auf **Cloudflare Pages** optimiert, um GitHub-API-Key-Scans zu vermeiden und unbegrenzte Bandbreite zu nutzen.

### Lokale Entwicklung

1.  Repository klonen oder herunterladen.
    
2.  config.js erstellen (siehe unten).
    
3.  index.html im Browser öffnen.
    

### API Key Konfiguration (config.js)

Um den Google Gemini API Key vor automatischen Scannern (z.B. auf GitHub) zu schützen, wird der Key in der config.js geteilt hinterlegt.

Erstelle eine Datei config.js im Hauptverzeichnis:

<img width="568" height="79" alt="image" src="https://github.com/user-attachments/assets/5b66fc2a-994e-42f7-9c4f-74811629a244" />



### Deployment auf Cloudflare Pages

1.  Cloudflare Dashboard öffnen > **Compute (Workers & Pages)**.
    
2.  Auf **Create Application** > **Pages** > **Upload assets** klicken.
    
3.  Den Projektordner hochladen.
    
4.  **Wichtig:** In der Google Cloud Console die Domain der Cloudflare Page (https://dein-projekt.pages.dev) unter "Website-Einschränkungen" für den API-Key freischalten.
    

Sicherheitshinweis
------------------

Da es sich um eine clientseitige Anwendung handelt, ist der API-Key theoretisch im Browser-Quellcode sichtbar.

*   **Schutzmaßnahme:** Der API-Key ist in der Google Cloud Console strikt auf die Domain der Webseite (Referrer) beschränkt.
    

Autoren
-------

*   David Leitner
    
*   Maximilian Baumgartner
