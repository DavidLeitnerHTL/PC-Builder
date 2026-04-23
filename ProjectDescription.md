PC Builder Web App
==================

Summary
-------

The PC Builder is a modern **Web App** that helps users put together their own computers. It is easy to use and offers great features like an AI assistant and automated hardware data. This way, you always have up-to-date prices and all important technical info at a glance.

Project Structure
-----------------

The project consists of three main parts:

1.  **Frontend (The Website Itself)**
    
    *   Built with HTML5, CSS3 (including light and dark themes), and JavaScript.
        
    *   Uses Bootstrap so the site looks great on both phones and computers.
        
    *   Automatically calculates prices and links as soon as you select a part.
        
2.  **AI Integration**
    
    *   Uses the Google Gemini AI as a smart assistant for your PC build.
        
    *   Protects the passwords (API keys) using a **Cloudflare Worker**. This is a mini-server acting as a secure middleman between the website and Google.
        
3.  **Automated Data Processing**
    
    *   A background program (GitHub Actions) fetches new hardware data from the internet every day.
        
    *   A Python script (data\_processor.py) takes over 40,000 messy files, sorts them into categories (like CPUs or graphics cards), and saves them as small, fast JSON files in the processed\_data/ folder.
        

New Feature: Save/Load Builds
-----------------------------

**Status:** ✅ Implemented

Users can now save their PC configurations and load them later:

*   **Save Builds**: Give your configuration a name and save it locally in the browser.
    
*   **Load Builds**: Quickly restore any previously saved build from the dropdown menu.
    
*   **Manage Builds**: View all saved builds, export them as JSON files, or import builds shared by others.
    
*   **Maximum 10 Builds**: To keep storage manageable, up to 10 builds can be saved per user.

Next Big Goal: Hardware Info Button
-----------------------------------

Next, we want to use our newly, automatically generated data on the website.

**The New Feature:** We are adding an **"Info" button** next to every PC part.

*   When you select a part (e.g., a Ryzen CPU) and click the Info button, the website fetches the data from our JSON files.
    
*   It will then immediately show you all precise technical data (like the socket, the number of cores, or the power consumption).
    
*   This turns our app from a simple price calculator into a truly smart hardware encyclopedia.