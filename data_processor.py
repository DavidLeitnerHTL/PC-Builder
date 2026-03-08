import json
import os
import shutil
import re

# ==========================================
# GLOBAL CONFIGURATION
# ==========================================

INPUT_FOLDER = "raw_hardware_data"
OUTPUT_FOLDER = "processed_data"

# Updated Mapping: Matches the exact folder names from your GitHub Actions log
CATEGORY_MAPPING = {
    "CPU": "CPU",
    "GPU": "GPU",
    "Motherboard": "Motherboard",
    "RAM": "RAM",
    "Storage": "Storage",
    "PSU": "PSU",
    "PCCase": "PCCase",
    "CPUCooler": "CPUCooler"
}

# ==========================================
# HELPER FUNCTIONS
# ==========================================

def is_modern_desktop_cpu(name, socket):
    """
    Checks if a given CPU is relevant for modern PC building.
    Filters out server processors (Xeon, EPYC) and very old architectures.
    """
    if not name:
        return False
        
    name_lower = name.lower()
    
    excluded_terms = [
        "xeon", "epyc", "threadripper", "pentium", "celeron", 
        "athlon", "fx-", "core 2", "opteron"
    ]
    
    for term in excluded_terms:
        if term in name_lower:
            return False
            
    if socket:
        socket_lower = socket.lower()
        modern_sockets = ["am4", "am5", "lga1700", "lga1851", "lga1200", "lga1151"]
        for modern_socket in modern_sockets:
            if modern_socket in socket_lower:
                return True
                
    if "ryzen" in name_lower or "core i" in name_lower or "core ultra" in name_lower:
        return True
        
    return False

def extract_basic_info(raw_data):
    """
    Extracts the general information that every hardware component shares.
    """
    return {
        "id": raw_data.get("opendb_id", ""),
        "name": raw_data.get("metadata", {}).get("name", ""),
        "variant": raw_data.get("metadata", {}).get("variant", ""),
        "amazon_sku": raw_data.get("general_product_information", {}).get("amazon_sku", "")
    }

def extract_tags_and_clean_name(name, category):
    """
    Extracts technical specifications directly from the product name to create tags,
    and returns a cleaned-up version of the name.
    """
    if not name:
        return "", []

    clean_name = name
    tags = []

    def extract(pattern):
        nonlocal clean_name, tags
        # Find all matching patterns (case-insensitive)
        matches = re.findall(pattern, clean_name, flags=re.IGNORECASE)
        for match in matches:
            clean_match = match.strip()
            if clean_match not in tags:
                tags.append(clean_match)
            # Remove the extracted part from the clean_name
            clean_name = re.sub(re.escape(match), '', clean_name, flags=re.IGNORECASE)

    # Apply extraction rules based on the category
    if category == "CPU":
        extract(r'\d+(?:\.\d+)?\s*GHz')
        extract(r'\d+-Core')
        extract(r'LGA\s*\d+|AM[45]')
    elif category == "CPUCooler":
        extract(r'\d{2,3}\s*mm')
    elif category == "Motherboard":
        extract(r'DDR[45]')
        extract(r'EATX|Micro[\s-]*ATX|Mini[\s-]*ITX|ATX')
        extract(r'LGA\s*\d+|AM[45]')
    elif category == "GPU":
        extract(r'\d+\s*GB')
    elif category == "RAM":
        extract(r'DDR[45](?:-\d+)?')
    elif category == "Storage":
        extract(r'SSD|HDD|NVMe|M\.2')
    elif category == "PCCase":
        extract(r'EATX|Micro[\s-]*ATX|Mini[\s-]*ITX|ATX|Mid[\s-]*Tower|Full[\s-]*Tower')

    # Cleanup: remove empty brackets, multiple spaces, and trailing hyphens/commas
    clean_name = re.sub(r'\(\s*\)', '', clean_name)
    clean_name = re.sub(r'\s{2,}', ' ', clean_name)
    clean_name = re.sub(r'[-\s,]+$', '', clean_name)
    clean_name = clean_name.strip()

    return clean_name, tags

def add_category_specific_specs(raw_category, raw_data, item_data):
    """
    Extracts deep, technical specifications based on the hardware type.
    """
    specs = raw_data.get("specifications", {})
    
    # --- CPU SPECIFICATIONS ---
    if raw_category == "CPU":
        socket = raw_data.get("socket") or specs.get("socket")
        
        # We need to pass the original full name for the desktop CPU check
        if not is_modern_desktop_cpu(item_data["name"], socket):
            return False 
            
        item_data["socket"] = socket
        item_data["cores"] = raw_data.get("cores", {}).get("total") or specs.get("core_count")
        item_data["threads"] = raw_data.get("cores", {}).get("threads") or specs.get("thread_count")
        item_data["tdp"] = specs.get("tdp")
        item_data["base_clock"] = specs.get("core_clock")
        item_data["boost_clock"] = specs.get("boost_clock")
        item_data["integrated_graphics"] = specs.get("integrated_graphics")
        
        memory_specs = specs.get("memory", {})
        if "types" in memory_specs and memory_specs["types"]:
            item_data["ram_type"] = memory_specs["types"][0]
            
    # --- GPU SPECIFICATIONS ---
    elif raw_category == "GPU":
        item_data["chipset"] = raw_data.get("chipset") or specs.get("chipset")
        item_data["vram"] = specs.get("memory")
        item_data["core_clock"] = specs.get("core_clock")
        item_data["boost_clock"] = specs.get("boost_clock")
        item_data["length"] = specs.get("length")
        item_data["tdp"] = specs.get("tdp")
        
    # --- MOTHERBOARD SPECIFICATIONS ---
    elif raw_category == "Motherboard":
        item_data["socket"] = raw_data.get("socket") or specs.get("socket")
        item_data["form_factor"] = raw_data.get("form_factor") or specs.get("form_factor")
        item_data["memory_slots"] = specs.get("memory_slots")
        item_data["max_memory"] = specs.get("max_memory")
        item_data["pcie_slots"] = specs.get("pcie_slots")
        item_data["chipset"] = specs.get("chipset")
        
    # --- RAM (MEMORY) SPECIFICATIONS ---
    elif raw_category == "RAM":
        item_data["speed"] = specs.get("speed")
        item_data["modules"] = specs.get("modules")
        item_data["cas_latency"] = specs.get("cas_latency")
        item_data["color"] = specs.get("color")
        
    # --- STORAGE (SSD/HDD) SPECIFICATIONS ---
    elif raw_category == "Storage":
        item_data["capacity"] = specs.get("capacity")
        item_data["type"] = specs.get("type")
        item_data["form_factor"] = specs.get("form_factor")
        item_data["interface"] = specs.get("interface")
        item_data["nvme"] = specs.get("nvme")
        
    # --- POWER SUPPLY (PSU) SPECIFICATIONS ---
    elif raw_category == "PSU":
        item_data["wattage"] = specs.get("wattage")
        item_data["efficiency"] = specs.get("efficiency_rating")
        item_data["modular"] = specs.get("modular")
        item_data["form_factor"] = specs.get("type")
        
    # --- PC CASE SPECIFICATIONS ---
    elif raw_category == "PCCase":
        item_data["type"] = specs.get("type")
        item_data["color"] = specs.get("color")
        item_data["motherboard_support"] = specs.get("motherboard_form_factor")
        item_data["max_gpu_length"] = specs.get("maximum_video_card_length")
        
    # --- CPU COOLER SPECIFICATIONS ---
    elif raw_category == "CPUCooler":
        item_data["cooler_type"] = specs.get("water_cooled") 
        item_data["fan_rpm"] = specs.get("fan_rpm")
        item_data["noise_level"] = specs.get("noise_level")
        item_data["color"] = specs.get("color")

    return True

# ==========================================
# MAIN PROCESSING LOOP
# ==========================================

def process_hardware_data():
    if not os.path.exists(INPUT_FOLDER):
        print(f"Error: Folder '{INPUT_FOLDER}' not found.")
        return
        
    # Wipe the old processed_data folder completely if it exists to clean out removed categories
    if os.path.exists(OUTPUT_FOLDER):
        shutil.rmtree(OUTPUT_FOLDER)
        
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    print(f"Scanning categories in '{INPUT_FOLDER}'...")
    
    for raw_category in os.listdir(INPUT_FOLDER):
        category_path = os.path.join(INPUT_FOLDER, raw_category)
        
        # Check if the folder name is exactly in our CATEGORY_MAPPING
        if not os.path.isdir(category_path) or raw_category not in CATEGORY_MAPPING:
            if os.path.isdir(category_path):
                print(f"Skipping irrelevant category folder: {raw_category}")
            continue
            
        processed_items = []
        target_filename = CATEGORY_MAPPING[raw_category]
        print(f"Processing category: {raw_category} -> Building {target_filename}.json ...")
        
        for filename in os.listdir(category_path):
            if filename.endswith(".json"):
                file_path = os.path.join(category_path, filename)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as file:
                        raw_data = json.load(file)
                        
                    # Extract basic information
                    item_data = extract_basic_info(raw_data)
                    
                    # Extract clean name and tags for the UI
                    original_name = item_data.get("name", "")
                    clean_name, tags = extract_tags_and_clean_name(original_name, raw_category)
                    item_data["clean_name"] = clean_name
                    if tags:
                        item_data["tags"] = tags
                        
                    should_keep_item = add_category_specific_specs(raw_category, raw_data, item_data)
                    
                    if should_keep_item and item_data.get("name"):
                        clean_item = {key: value for key, value in item_data.items() if value is not None}
                        processed_items.append(clean_item)

                except Exception as error:
                    print(f"Failed to process {filename}: {error}")

        if processed_items:
            output_file = os.path.join(OUTPUT_FOLDER, f"{target_filename}.json")
            with open(output_file, 'w', encoding='utf-8') as output:
                json.dump(processed_items, output, indent=4, ensure_ascii=False)
            print(f"Success! Created {output_file} with {len(processed_items)} items.\n")

if __name__ == "__main__":
    process_hardware_data()