import json
import os

# Configuration
INPUT_FOLDER = "raw_hardware_data"

def process_hardware_data():
    if not os.path.exists(INPUT_FOLDER):
        print(f"Error: Folder '{INPUT_FOLDER}' not found.")
        return

    print(f"Scanning categories in {INPUT_FOLDER}...")

    # Iterate through subdirectories (each subdirectory represents a category like 'cpus', 'gpus')
    for category in os.listdir(INPUT_FOLDER):
        category_path = os.path.join(INPUT_FOLDER, category)
        
        # Skip if it is not a directory
        if not os.path.isdir(category_path):
            continue
        
        processed_items = []
        print(f"Processing category: {category}...")

        for filename in os.listdir(category_path):
            if filename.endswith(".json"):
                file_path = os.path.join(category_path, filename)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as file:
                        raw_data = json.load(file)
                    
                    # Basic data extraction for all components
                    filtered_item = {
                        "id": raw_data.get("opendb_id"),
                        "name": raw_data.get("metadata", {}).get("name"),
                        "variant": raw_data.get("metadata", {}).get("variant"),
                        "amazon_sku": raw_data.get("general_product_information", {}).get("amazon_sku")
                    }

                    # Specific data extraction based on category
                    if category == "cpus":
                        filtered_item["socket"] = raw_data.get("socket")
                        filtered_item["cores"] = raw_data.get("cores", {}).get("total")
                        filtered_item["threads"] = raw_data.get("cores", {}).get("threads")
                        filtered_item["tdp"] = raw_data.get("specifications", {}).get("tdp")
                        memory_specs = raw_data.get("specifications", {}).get("memory", {})
                        if "types" in memory_specs and memory_specs["types"]:
                            filtered_item["ram_type"] = memory_specs["types"][0]
                            
                    elif category == "gpus":
                        filtered_item["chipset"] = raw_data.get("chipset")
                        
                    elif category == "motherboards":
                        filtered_item["socket"] = raw_data.get("socket")
                        filtered_item["form_factor"] = raw_data.get("form_factor")

                    if filtered_item["name"]:
                        processed_items.append(filtered_item)

                except Exception as error:
                    print(f"Failed to process {filename}: {error}")

        # Save the processed items into a specific JSON file for this category
        if processed_items:
            output_file = f"{category}.json"
            with open(output_file, 'w', encoding='utf-8') as output:
                json.dump(processed_items, output, indent=4, ensure_ascii=False)
            print(f"Created {output_file} with {len(processed_items)} items.")

if __name__ == "__main__":
    process_hardware_data()