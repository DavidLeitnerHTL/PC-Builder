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
    "CPUCooler": "CPUCooler",
    "OS": "OS",
    "CaseFan": "CaseFan"
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

def extract_specs_and_clean_name(name, category):
    """
    Extracts technical specifications directly from the product name to create dictionary entries,
    and returns a cleaned-up version of the name.
    """
    if not name:
        return "", {}

    clean_name = name
    extracted_specs = {}

    def extract(pattern, spec_key=None):
        nonlocal clean_name, extracted_specs
        # Find all matching patterns (case-insensitive)
        matches = re.findall(pattern, clean_name, flags=re.IGNORECASE)
        if matches:
            clean_matches = []
            for match in matches:
                clean_match = match.strip()
                if clean_match not in clean_matches:
                    clean_matches.append(clean_match)
                # Remove the extracted part from the clean_name
                clean_name = re.sub(re.escape(match), '', clean_name, flags=re.IGNORECASE)
            
            # If a spec_key is provided, store it (otherwise we just delete the text)
            if spec_key:
                if spec_key in extracted_specs:
                    extracted_specs[spec_key] += ", " + ", ".join(clean_matches)
                else:
                    extracted_specs[spec_key] = ", ".join(clean_matches)

    # Apply extraction rules based on category
    if category == "CPU":
        extract(r'\d+(?:\.\d+)?\s*GHz', 'clock_speed')
        extract(r'\d+-Core', 'cores')
        extract(r'LGA\s*\d+|AM[45]', 'socket')
        extract(r'Desktop Processor|Processor', None) # Just remove
        
    elif category == "CPUCooler":
        extract(r'\d{2,3}\s*mm', 'radiator_size')
        extract(r'Liquid CPU Cooler|CPU Cooler|Air Cooler', None) # Just remove
        
    elif category == "Motherboard":
        extract(r'DDR[45]', 'memory_type')
        extract(r'EATX|Micro[\s-]*ATX|Mini[\s-]*ITX|ATX', 'form_factor')
        extract(r'LGA\s*\d+|AM[45]', 'socket')
        extract(r'Motherboard|Mainboard', None) # Just remove
        
    elif category == "GPU":
        extract(r'\d+\s*GB', 'vram')
        extract(r'Video Card|Graphics Card', None) # Just remove
        
    elif category == "RAM":
        extract(r'DDR[45](?:-\d+)?', 'ram_type')
        extract(r'\(\s*\d+\s*x\s*\d+\s*GB\s*\)', 'modules_config')
        extract(r'\d+\s*GB', 'capacity')
        extract(r'CL\s*\d+', 'cas_latency')
        extract(r'Desktop Memory|Memory', None) # Just remove
        
    elif category == "Storage":
        extract(r'SSD|HDD|NVMe|M\.2', 'storage_type')
        extract(r'\d+(?:\.\d+)?\s*(?:TB|GB)', 'capacity')
        extract(r'PCIe\s*\d(?:\.\d)?\s*(?:X\d)?|Gen\s*\d', 'interface')
        extract(r'Internal Solid State Drive|Solid State Drive', None) # Just remove
        
    elif category == "PSU":
        extract(r'\d+\s*W', 'wattage')
        extract(r'80\s*(?:\+|-|Plus)?\s*(?:Titanium|Platinum|Gold|Silver|Bronze|White)?', 'efficiency')
        extract(r'(?:Fully|Semi|Non)?[\s-]*Modular', 'modularity')
        extract(r'ATX|SFX-L|SFX', 'form_factor')
        extract(r'Power Supply|Certified', None) # Just remove
        
    elif category == "PCCase":
        extract(r'EATX|Micro[\s-]*ATX|Mini[\s-]*ITX|ATX', 'motherboard_support')
        extract(r'Mid[\s-]*Tower|Full[\s-]*Tower', 'case_type')
        extract(r'Case|Chassis', None) # Just remove

    elif category == "OS":
        # Extract specs but keep them in the name for display (OS names are short)
        os_match = re.search(r'(Windows\s*\d+|Windows\s*\w+|Linux|macOS|Ubuntu|Debian|Fedora)', clean_name, re.IGNORECASE)
        if os_match:
            extracted_specs['os_type'] = os_match.group(1).strip()
        
        mode_match = re.search(r'(\d+-bit)', clean_name, re.IGNORECASE)
        if mode_match:
            extracted_specs['mode'] = mode_match.group(1).strip()
        
        edition_match = re.search(r'(Home|Pro|Enterprise|Education|Ultimate|Family)', clean_name, re.IGNORECASE)
        if edition_match:
            extracted_specs['edition'] = edition_match.group(1).strip()
        
        license_match = re.search(r'(OEM|Retail|Download|DVD|USB)', clean_name, re.IGNORECASE)
        if license_match:
            extracted_specs['license_type'] = license_match.group(1).strip()
        
        # Only remove generic words and stray pipes from the clean name
        clean_name = re.sub(r'Microsoft|Operating System|\|', '', clean_name, flags=re.IGNORECASE)

    elif category == "CaseFan":
        extract(r'\d{2,3}\s*mm', 'fan_size')
        extract(r'\d+\.?\d*\s*CFM', 'airflow')
        extract(r'\d+\s*RPM', 'fan_rpm')
        extract(r'\d+\.?\d*\s*dB', 'noise_level')
        extract(r'PWM|LED|RGB|ARGB', 'features')
        extract(r'Case Fan|Fan|Lüfter', None) # Just remove

    # Aggressive Cleanup: remove empty brackets, multiple spaces, and trailing hyphens/commas
    clean_name = re.sub(r'\(\s*\)', '', clean_name)
    clean_name = re.sub(r'\[\s*\]', '', clean_name)
    clean_name = re.sub(r'\s{2,}', ' ', clean_name)
    clean_name = re.sub(r'[-\s,]+$', '', clean_name)
    # Strip OEM/Tray labels — Amazon searches work better without them.
    clean_name = re.sub(r'\s*\(OEM/Tray\)', '', clean_name, flags=re.IGNORECASE)
    clean_name = re.sub(r'\s*OEM/Tray', '', clean_name, flags=re.IGNORECASE)
    clean_name = re.sub(r'\s*\bOEM\b', '', clean_name, flags=re.IGNORECASE)
    clean_name = re.sub(r'\s*\bTray\b', '', clean_name, flags=re.IGNORECASE)
    clean_name = clean_name.strip()

    return clean_name, extracted_specs

def add_category_specific_specs(raw_category, raw_data, item_data):
    """
    Extracts deep, technical specifications based on the hardware type from the JSON metadata.
    """
    specs = raw_data.get("specifications", {})
    
    # --- CPU SPECIFICATIONS ---
    if raw_category == "CPU":
        socket = raw_data.get("socket") or specs.get("socket")
        
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

    # --- OS SPECIFICATIONS ---
    elif raw_category == "OS":
        item_data["manufacturer"] = raw_data.get("metadata", {}).get("manufacturer", "")
        # Mode/edition are extracted from the name by regex above

    # --- CASE FAN SPECIFICATIONS ---
    elif raw_category == "CaseFan":
        item_data["size"] = raw_data.get("size")
        item_data["quantity"] = raw_data.get("quantity")
        item_data["pwm"] = raw_data.get("pwm")
        item_data["led"] = raw_data.get("led")
        item_data["connector"] = raw_data.get("connector")
        item_data["controller"] = raw_data.get("controller")
        item_data["flow_direction"] = raw_data.get("flow_direction")
        item_data["is_oem"] = raw_data.get("isOEM")
        item_data["min_airflow"] = raw_data.get("min_airflow")
        item_data["max_airflow"] = raw_data.get("max_airflow")
        item_data["min_noise_level"] = raw_data.get("min_noise_level")
        item_data["max_noise_level"] = raw_data.get("max_noise_level")
        item_data["static_pressure"] = raw_data.get("static_pressure")
        item_data["color"] = raw_data.get("color")

    return True

# ==========================================
# MAIN PROCESSING LOOP
# ==========================================

def process_hardware_data():
    if not os.path.exists(INPUT_FOLDER):
        print(f"Error: Folder '{INPUT_FOLDER}' not found.")
        return
        
    if os.path.exists(OUTPUT_FOLDER):
        shutil.rmtree(OUTPUT_FOLDER)
        
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    print(f"Scanning categories in '{INPUT_FOLDER}'...")
    
    for raw_category in os.listdir(INPUT_FOLDER):
        category_path = os.path.join(INPUT_FOLDER, raw_category)
        
        if not os.path.isdir(category_path) or raw_category not in CATEGORY_MAPPING:
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
                        
                    item_data = extract_basic_info(raw_data)
                    
                    original_name = item_data.get("name", "")
                    clean_name, extracted_specs = extract_specs_and_clean_name(original_name, raw_category)
                    item_data["clean_name"] = clean_name
                        
                    should_keep_item = add_category_specific_specs(raw_category, raw_data, item_data)
                    
                    for key, val in extracted_specs.items():
                        if not item_data.get(key):
                            item_data[key] = val
                    
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