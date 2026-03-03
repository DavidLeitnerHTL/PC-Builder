PC Builder Web App
======================

A modern and simple web app that helps you build your own PC and calculate the price. Included: a smart AI assistant and an automated hardware database.

Features
----------

*   **Interactive PC Building**: Choose your PC parts (CPU, graphics card, RAM, etc.) and instantly see the total price.
    
*   **Sleek Design**: Features a Dark Mode, a floating price bar, and modern buttons.
    
*   **AI Assistant**: A built-in chat using Google Gemini AI helps with questions about your PC (securely connected via a Cloudflare Worker).
    
*   **Automated Data**: A background program (GitHub Actions) fetches the latest hardware data every night, sorts it, and saves it as handy JSON files.
    

Planned Feature: Hardware Info Button
----------------------------------------

We are currently working on connecting our website directly to the new data (processed\_data/).In the next update, there will be an **Info Button** next to every PC part. When you click it, the app will search our database and instantly show you all important technical details (like socket, power consumption, or core count) right on the website!

Technologies Used
---------------------

*   **Frontend (Website)**: HTML5, CSS3, JavaScript, Bootstrap 5
    
*   **Backend (Server)**: Cloudflare Workers
    
*   **AI Model**: Google Gemini API
    
*   **Data Processing**: Python 3, GitHub Actions
    

Project Structure
-----------------

```text
/
├── index.html            # Main page of the web app
├── style.css             # Design, colors, and animations
├── script.js             # Site logic and AI connection
├── config.js             # Settings
├── data_processor.py     # Python script that sorts the data
├── /processed_data/      # Automatically created JSON data (CPUs, graphics cards...)
└── /.github/workflows/   # Background programs (e.g., for daily updates)
```

Installation & Setup
-----------------------

1.  Download the project: git clone https://github.com/DavidLeitnerHTL/PC-Builder.git
    
2.  Open the index.html file in your web browser.
    
3.  To test the data processing locally: Run python data\_processor.py.