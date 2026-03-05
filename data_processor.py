import json
import os

# ==========================================
# GLOBAL CONFIGURATION
# ==========================================

# Define the source directory containing the raw JSON files 
# and the target directory where our clean files will be saved.
INPUT_FOLDER = "raw_hardware_data"
OUTPUT_FOLDER = "processed_data"

# This dictionary maps the original folder names from the raw data 
# to the exact, clean JSON filenames our website's frontend expects.
# Example: Data found in "cpus" will be saved as "CPU.json".
CATEGORY_MAPPING = {
    "cpus": "CPU",
    "gpus": "GPU",
    "motherboards": "Motherboard",
    "memory": "RAM",
    "storage": "Storage",
    "power_supplies": "PSU",
    "cases": "PCCase",
    "cpu_coolers": "CPUCooler"
}

# ==========================================
# HELPER FUNCTIONS
# ==========================================

def is_modern_desktop_cpu(name, socket):
    """
    Checks if a given CPU is relevant for modern PC building.
    It filters out server processors (like Xeon or EPYC) and very old 
    architectures (like Core 2 Duo or Pentium) to keep the database clean.
    
    Returns: 
        True if the CPU is a modern desktop processor, False otherwise.
    """
    # If the CPU has no name, we cannot process it safely.
    if not name:
        return False
        
    name_lower = name.lower()
    
    # 1. Exclude known server and obsolete model lines
    excluded_terms = [
        "xeon", "epyc", "threadripper", "pentium", "celeron", 
        "athlon", "fx-", "core 2", "opteron"
    ]
    
    for term in excluded_terms:
        if term in name_lower:
            return False
            
    # 2. Check if the socket is a modern, mainstream desktop socket
    if socket:
        socket_lower = socket.lower()
        modern_sockets = ["am4", "am5", "lga1700", "lga1851", "lga1200", "lga1151"]
        
        for modern_socket in modern_sockets:
            if modern_socket in socket_lower:
                return True
                
    # 3. Fallback check: If the socket is missing but the name contains 
    # modern branding (Ryzen, Core i, Core Ultra), we keep it.
    if "ryzen" in name_lower or "core i" in name_lower or "core ultra" in name_lower:
        return True
        
    return False

def extract_basic_info(raw_data):
    """
    Extracts the general information that every hardware component shares,
    regardless of whether it's a CPU, GPU, or RAM.
    """
    return {
        "id": raw_data.get("opendb_id", ""),
        "name": raw_data.get("metadata", {}).get("name", ""),
        "variant": raw_data.get("metadata", {}).get("variant", ""),
        "amazon_sku": raw_data.get("general_product_information", {}).get("amazon_sku", "")
    }

def add_category_specific_specs(raw_category, raw_data, item_data):
    """
    Extracts deep, technical specifications based on what kind of hardware it is.
    It updates the 'item_data' dictionary with these specific details.
    
    Returns:
        True if the item should be kept, False if it should be skipped 
        (e.g., if it's an old CPU that didn't pass our filter).
    """
    # Technical specs are sometimes nested inside a "specifications" key.
    # We provide an empty dictionary {} as a fallback to prevent errors.
    specs = raw_data.get("specifications", {})
    
    # --- CPU SPECIFICATIONS ---
    if raw_category == "cpus":
        # Socket information can be in the main body or inside specifications
        socket = raw_data.get("socket") or specs.get("socket")
        
        # Apply our custom filter. If it's not a modern desktop CPU, skip it entirely.
        if not is_modern_desktop_cpu(item_data["name"], socket):
            return False 
            
        item_data["socket"] = socket
        item_data["cores"] = raw_data.get("cores", {}).get("total") or specs.get("core_count")
        item_data["threads"] = raw_data.get("cores", {}).get("threads") or specs.get("thread_count")
        item_data["tdp"] = specs.get("tdp")
        item_data["base_clock"] = specs.get("core_clock")
        item_data["boost_clock"] = specs.get("boost_clock")
        item_data["integrated_graphics"] = specs.get("integrated_graphics")
        
        # Extract RAM support (e.g., DDR4 or DDR5)
        memory_specs = specs.get("memory", {})
        if "types" in memory_specs and memory_specs["types"]:
            item_data["ram_type"] = memory_specs["types"][0]
            
    # --- GPU SPECIFICATIONS ---
    elif raw_category == "gpus":
        item_data["chipset"] = raw_data.get("chipset") or specs.get("chipset")
        item_data["vram"] = specs.get("memory")
        item_data["core_clock"] = specs.get("core_clock")
        item_data["boost_clock"] = specs.get("boost_clock")
        item_data["length"] = specs.get("length")
        item_data["tdp"] = specs.get("tdp")
        
    # --- MOTHERBOARD SPECIFICATIONS ---
    elif raw_category == "motherboards":
        item_data["socket"] = raw_data.get("socket") or specs.get("socket")
        item_data["form_factor"] = raw_data.get("form_factor") or specs.get("form_factor")
        item_data["memory_slots"] = specs.get("memory_slots")
        item_data["max_memory"] = specs.get("max_memory")
        item_data["pcie_slots"] = specs.get("pcie_slots")
        item_data["chipset"] = specs.get("chipset")
        
    # --- RAM (MEMORY) SPECIFICATIONS ---
    elif raw_category == "memory":
        item_data["speed"] = specs.get("speed")
        item_data["modules"] = specs.get("modules")
        item_data["cas_latency"] = specs.get("cas_latency")
        item_data["color"] = specs.get("color")
        
    # --- STORAGE (SSD/HDD) SPECIFICATIONS ---
    elif raw_category == "storage":
        item_data["capacity"] = specs.get("capacity")
        item_data["type"] = specs.get("type")
        item_data["form_factor"] = specs.get("form_factor")
        item_data["interface"] = specs.get("interface")
        item_data["nvme"] = specs.get("nvme")
        
    # --- POWER SUPPLY (PSU) SPECIFICATIONS ---
    elif raw_category == "power_supplies":
        item_data["wattage"] = specs.get("wattage")
        item_data["efficiency"] = specs.get("efficiency_rating")
        item_data["modular"] = specs.get("modular")
        item_data["form_factor"] = specs.get("type")
        
    # --- PC CASE SPECIFICATIONS ---
    elif raw_category == "cases":
        item_data["type"] = specs.get("type")
        item_data["color"] = specs.get("color")
        item_data["motherboard_support"] = specs.get("motherboard_form_factor")
        item_data["max_gpu_length"] = specs.get("maximum_video_card_length")
        
    # --- CPU COOLER SPECIFICATIONS ---
    elif raw_category == "cpu_coolers":
        # 'water_cooled' usually holds radiator size (e.g., "360mm"). If missing, it's an air cooler.
        item_data["cooler_type"] = specs.get("water_cooled") 
        item_data["fan_rpm"] = specs.get("fan_rpm")
        item_data["noise_level"] = specs.get("noise_level")
        item_data["color"] = specs.get("color")

    # If the item passed all filters, return True so it gets added to the final list
    return True

# ==========================================
# MAIN PROCESSING LOOP
# ==========================================

def process_hardware_data():
    """
    The main function that orchestrates the data processing.
    It reads the raw files, cleans the data using the helper functions, 
    and writes the results into neatly formatted JSON files.
    """
    # 1. Check if the raw data folder exists before trying to read from it
    if not os.path.exists(INPUT_FOLDER):
        print(f"Error: Folder '{INPUT_FOLDER}' not found.")
        return
        
    # 2. Create the output folder if it doesn't already exist
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
        
    print(f"Scanning categories in '{INPUT_FOLDER}'...")
    
    # 3. Loop through every subfolder inside the raw data directory
    for raw_category in os.listdir(INPUT_FOLDER):
        category_path = os.path.join(INPUT_FOLDER, raw_category)
        
        # Skip files (we only want directories) and skip categories we don't need (like webcams)
        if not os.path.isdir(category_path) or raw_category not in CATEGORY_MAPPING:
            if os.path.isdir(category_path):
                print(f"Skipping irrelevant category folder: {raw_category}")
            continue
            
        processed_items = []
        target_filename = CATEGORY_MAPPING[raw_category]
        print(f"Processing category: {raw_category} -> Building {target_filename}.json ...")
        
        # 4. Loop through every JSON file within the valid category folder
        for filename in os.listdir(category_path):
            if filename.endswith(".json"):
                file_path = os.path.join(category_path, filename)
                
                try:
                    # Open and load the raw JSON file
                    with open(file_path, 'r', encoding='utf-8') as file:
                        raw_data = json.load(file)
                        
                    # Extract basic information (id, name, etc.)
                    item_data = extract_basic_info(raw_data)
                    
                    # Extract detailed specs. 
                    # If this returns False, it means the item was filtered out (e.g., old CPU).
                    should_keep_item = add_category_specific_specs(raw_category, raw_data, item_data)
                    
                    # 5. Clean up the data and save it
                    if should_keep_item and item_data.get("name"):
                        # Remove any keys where the value is None to save file size and keep it clean
                        clean_item = {key: value for key, value in item_data.items() if value is not None}
                        processed_items.append(clean_item)

                except Exception as error:
                    # If a single file fails, print an error but continue with the next file
                    print(f"Failed to process {filename}: {error}")

        # 6. Once all files in the folder are processed, write the final JSON list to the disk
        if processed_items:
            output_file = os.path.join(OUTPUT_FOLDER, f"{target_filename}.json")
            
            with open(output_file, 'w', encoding='utf-8') as output:
                # indent=4 makes the JSON easily readable for humans
                json.dump(processed_items, output, indent=4, ensure_ascii=False)
                
            print(f"Success! Created {output_file} with {len(processed_items)} items.\n")

# Start the script if it is run directly
if __name__ == "__main__":
    process_hardware_data()