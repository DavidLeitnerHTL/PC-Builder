import json
import os
import re
import shutil

# ==========================================
# GLOBAL CONFIGURATION
# ==========================================

INPUT_FOLDER = "../raw_hardware_data/open-db"
OUTPUT_FOLDER = "../processed_data"

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
# FILTER CONSTANTS
# ==========================================

# Modern consumer GPU detection (RTX 2000+ / RX 5000+ / Intel Arc, ~2019+)
_MODERN_GPU_RE = re.compile(
    r"rtx\s*[2-9]\d{3}"        # RTX 2000-9000 series
    r"|\brx\s*[5-9]\d{3}\b"    # RX 5000-9000 series (RDNA1-4)
    r"|\bvega\s*\d+"            # RX Vega 56 / 64
    r"|\bradeon\s+vii\b"        # Radeon VII (2019)
    r"|\barc\s+[ab]\d+",        # Intel Arc A-series / B-series
    re.IGNORECASE
)

# Professional / server GPU patterns to always exclude
_EXCLUDED_GPU_RE = re.compile(
    r"quadro|tesla|firepro|radeon\s+pro|radeon\s+instinct"
    r"|nvs\s+\d|grid\s+\w|\binstinct\b|\bcompute\b"
    r"|\ba100\b|\bh100\b|\bv100\b|\bp100\b|\bl40\b|\ba10\b",
    re.IGNORECASE
)

# Consumer motherboard sockets (AM4/AM5 + Intel LGA 1700/1851)
_MODERN_MB_SOCKETS = {
    "am4", "am5",
    "lga1700", "lga 1700",
    "lga1851", "lga 1851",
}

# Storage interfaces to exclude (enterprise/server only)
_EXCLUDED_STORAGE_INTERFACES = {"sas", "sas2", "sas3", "u.2"}

# PCCase name patterns that indicate server/rack enclosures
_SERVER_CASE_RE = re.compile(
    r"\brackmount\b|\bserver\s+case\b|\bserver\s+chassis\b"
    r"|\b[124]u\s+\b|\b[124]u-\b|rack\s+enclosure",
    re.IGNORECASE
)

# PCCase: only consumer tower form factors
_CONSUMER_CASE_FF_RE = re.compile(
    r"mid[\s-]*tower|full[\s-]*tower|mini[\s-]*itx[\s-]*tower"
    r"|micro[\s-]*atx[\s-]*(?:mid|mini)[\s-]*tower",
    re.IGNORECASE
)

# CaseFan: only common consumer sizes
_CONSUMER_FAN_SIZES = {120, 140}

# CPUCooler: must support at least one of these modern sockets (if socket data is present)
_MODERN_COOLER_SOCKETS = {"am4", "am5", "lga1700", "lga1851"}

# Storage: only common consumer form factors / types
_EXCLUDED_STORAGE_NAMES_RE = re.compile(
    r"\boptane\b|\bdram\s*cache\b|\bwrite\s*cache\b",
    re.IGNORECASE
)

# PSU: consumer form factors and sane wattage range
_CONSUMER_PSU_TYPES = {"atx", "sfx", "sfxl"}  # normalised (no spaces/hyphens)
_PSU_MIN_W = 450
_PSU_MAX_W = 1600

# PCCase: must support at least one standard consumer MB form factor
_CONSUMER_CASE_MB_FORMS = {
    "atx", "microatx", "matx", "miniitx",
    "eatx", "extendedatx",
}

# ==========================================
# FILTER FUNCTIONS
# ==========================================

def is_modern_desktop_cpu(name, socket):
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
    if not socket:
        return False
    socket_lower = socket.lower()
    for modern_socket in ["am4", "am5", "lga1700", "lga1851"]:
        if modern_socket in socket_lower:
            return True
    return False


def is_modern_gpu(name, chipset=""):
    """Keep only consumer GPUs from ~2016 onwards (GTX 1000+ / RX 400+ / Arc)."""
    text = (name or "") + " " + (chipset or "")
    if _EXCLUDED_GPU_RE.search(text):
        return False
    return bool(_MODERN_GPU_RE.search(text))


def is_modern_motherboard(socket, name=""):
    """Keep only boards with a modern consumer socket."""
    if socket:
        normalized = socket.lower().replace(" ", "").replace("-", "")
        for s in _MODERN_MB_SOCKETS:
            if s.replace(" ", "") == normalized:
                return True
    # Fallback: check name for socket pattern
    text = (name or "").lower()
    return bool(re.search(r"am[45]|lga\s*1[78][05][01]|lga\s*1851", text))


def is_modern_ram(name, speed=""):
    """Keep only DDR4/DDR5 with at least 8 GB capacity."""
    text = (name or "").lower() + " " + str(speed or "").lower()
    if "ddr3" in text or "ddr2" in text or "ddr1" in text:
        return False
    if "ddr4" not in text and "ddr5" not in text:
        return False
    cap = _parse_capacity_gb(name)
    if cap is not None and cap < 8:
        return False
    return True


def _parse_capacity_gb(s):
    if not s:
        return None
    m = re.search(r"([\d.]+)\s*(tb|gb|mb)", str(s).lower())
    if not m:
        return None
    v = float(m.group(1))
    u = m.group(2)
    return v * 1024 if u == "tb" else (v / 1024 if u == "mb" else v)


def is_consumer_storage(interface, capacity_str="", storage_type="", name=""):
    """Exclude SAS, mSATA, Optane, and very small drives."""
    if interface:
        iface = interface.lower().replace(" ", "").replace(".", "")
        for excl in _EXCLUDED_STORAGE_INTERFACES:
            if excl.replace(".", "") in iface:
                return False
        if "msata" in iface:
            return False
    name_lower = (name or "").lower()
    if "tape" in name_lower or "lto" in name_lower:
        return False
    if _EXCLUDED_STORAGE_NAMES_RE.search(name or ""):
        return False
    # Capacity filter: skip tiny old drives
    cap = _parse_capacity_gb(capacity_str)
    if cap is not None:
        stype = (storage_type or "").lower()
        if "hdd" in stype or "hard" in stype:
            if cap < 1000:
                return False
        else:  # SSD / NVMe / unknown
            if cap < 256:
                return False
    return True


def is_consumer_case(name):
    """Exclude server rack enclosures."""
    return not _SERVER_CASE_RE.search(name or "")


def is_consumer_case_mb(mb_form_factor):
    """Keep only cases that support a standard consumer MB form factor.
    If no form factor data exists, keep the case (unknown ≠ incompatible)."""
    if not mb_form_factor:
        return True
    forms = mb_form_factor if isinstance(mb_form_factor, list) else [mb_form_factor]
    for f in forms:
        normalised = str(f).lower().replace(" ", "").replace("-", "").replace("_", "")
        if normalised in _CONSUMER_CASE_MB_FORMS:
            return True
    return False


def is_consumer_psu(psu_type, wattage):
    """Keep only ATX/SFX/SFX-L PSUs in the 350–1600 W range."""
    if psu_type:
        t = str(psu_type).lower().replace(" ", "").replace("-", "")
        # If the type is explicitly non-consumer, reject
        if t and t not in _CONSUMER_PSU_TYPES:
            return False
    if wattage is not None:
        try:
            w = int(wattage)
            if w < _PSU_MIN_W or w > _PSU_MAX_W:
                return False
        except (ValueError, TypeError):
            pass
    return True


def is_consumer_fan_size(size):
    """Only 120 mm and 140 mm fans — the only sizes sold standalone at scale."""
    try:
        return int(size) in _CONSUMER_FAN_SIZES
    except (TypeError, ValueError):
        return False


def is_modern_cooler(sockets):
    """Keep cooler if it supports at least one modern socket.
    If no socket list is provided, keep it (unknown ≠ incompatible)."""
    if not sockets:
        return True
    names = {str(s).lower().replace(" ", "").replace("-", "") for s in sockets}
    return bool(_MODERN_COOLER_SOCKETS & names)


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def extract_basic_info(raw_data):
    return {
        "id": raw_data.get("opendb_id", ""),
        "name": raw_data.get("metadata", {}).get("name", ""),
        "variant": raw_data.get("metadata", {}).get("variant", ""),
        "amazon_sku": raw_data.get("general_product_information", {}).get("amazon_sku", "")
    }

def extract_specs_and_clean_name(name, category):
    if not name:
        return "", {}
    clean_name = name
    extracted_specs = {}

    def extract(pattern, spec_key=None):
        nonlocal clean_name, extracted_specs
        matches = re.findall(pattern, clean_name, flags=re.IGNORECASE)
        if matches:
            clean_matches = []
            for match in matches:
                clean_match = match.strip()
                if clean_match not in clean_matches:
                    clean_matches.append(clean_match)
                clean_name = re.sub(re.escape(match), '', clean_name, flags=re.IGNORECASE)
            if spec_key:
                if spec_key in extracted_specs:
                    extracted_specs[spec_key] += ", " + ", ".join(clean_matches)
                else:
                    extracted_specs[spec_key] = ", ".join(clean_matches)

    if category == "CPU":
        extract(r'\d+(?:\.\d+)?\s*GHz', 'clock_speed')
        extract(r'\d+-Core', 'cores')
        extract(r'LGA\s*\d+|AM[45]', 'socket')
        extract(r'Desktop Processor|Processor', None)
    elif category == "CPUCooler":
        extract(r'\d{2,3}\s*mm', 'radiator_size')
        extract(r'Liquid CPU Cooler|CPU Cooler|Air Cooler', None)
    elif category == "Motherboard":
        extract(r'DDR[45]', 'memory_type')
        extract(r'EATX|Micro[\s-]*ATX|Mini[\s-]*ITX|ATX', 'form_factor')
        extract(r'LGA\s*\d+|AM[45]', 'socket')
        extract(r'Motherboard|Mainboard', None)
    elif category == "GPU":
        extract(r'\d+\s*GB', 'vram')
        extract(r'Video Card|Graphics Card', None)
    elif category == "RAM":
        extract(r'DDR[45](?:-\d+)?', 'ram_type')
        extract(r'\(\s*\d+\s*x\s*\d+\s*GB\s*\)', 'modules_config')
        extract(r'\d+\s*GB', 'capacity')
        extract(r'CL\s*\d+', 'cas_latency')
        extract(r'Desktop Memory|Memory', None)
    elif category == "Storage":
        extract(r'SSD|HDD|NVMe|M\.2', 'storage_type')
        extract(r'\d+(?:\.\d+)?\s*(?:TB|GB)', 'capacity')
        extract(r'PCIe\s*\d(?:\.\d)?\s*(?:X\d)?|Gen\s*\d', 'interface')
        extract(r'Internal Solid State Drive|Solid State Drive', None)
    elif category == "PSU":
        extract(r'\d+\s*W', 'wattage')
        extract(r'80\s*(?:\+|-|Plus)?\s*(?:Titanium|Platinum|Gold|Silver|Bronze|White)?', 'efficiency')
        extract(r'(?:Fully|Semi|Non)?[\s-]*Modular', 'modularity')
        extract(r'ATX|SFX-L|SFX', 'form_factor')
        extract(r'Power Supply|Certified', None)
    elif category == "PCCase":
        extract(r'EATX|Micro[\s-]*ATX|Mini[\s-]*ITX|ATX', 'motherboard_support')
        extract(r'Mid[\s-]*Tower|Full[\s-]*Tower', 'case_type')
        extract(r'Case|Chassis', None)
    elif category == "OS":
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
        clean_name = re.sub(r'Microsoft|Operating System|\|', '', clean_name, flags=re.IGNORECASE)
    elif category == "CaseFan":
        extract(r'\d{2,3}\s*mm', 'fan_size')
        extract(r'\d+\.?\d*\s*CFM', 'airflow')
        extract(r'\d+\s*RPM', 'fan_rpm')
        extract(r'\d+\.?\d*\s*dB', 'noise_level')
        extract(r'PWM|LED|RGB|ARGB', 'features')
        extract(r'Case Fan|Fan|Lüfter', None)

    clean_name = re.sub(r'\(\s*\)', '', clean_name)
    clean_name = re.sub(r'\[\s*\]', '', clean_name)
    clean_name = re.sub(r'\s{2,}', ' ', clean_name)
    clean_name = re.sub(r'[-\s,]+$', '', clean_name)
    clean_name = re.sub(r'\s*\(OEM/Tray\)', '', clean_name, flags=re.IGNORECASE)
    clean_name = re.sub(r'\s*OEM/Tray', '', clean_name, flags=re.IGNORECASE)
    clean_name = re.sub(r'\s*\bOEM\b', '', clean_name, flags=re.IGNORECASE)
    clean_name = re.sub(r'\s*\bTray\b', '', clean_name, flags=re.IGNORECASE)
    clean_name = clean_name.strip()

    return clean_name, extracted_specs

def add_category_specific_specs(raw_category, raw_data, item_data):
    specs = raw_data.get("specifications", {})
    name = item_data.get("name", "")

    if raw_category == "CPU":
        socket = raw_data.get("socket") or specs.get("socket")
        if not is_modern_desktop_cpu(name, socket):
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

    elif raw_category == "GPU":
        chipset = raw_data.get("chipset") or specs.get("chipset") or ""
        if not is_modern_gpu(name, chipset):
            return False
        vram = raw_data.get("memory") or specs.get("memory")
        if vram is not None:
            try:
                if int(vram) < 4:
                    return False
            except (ValueError, TypeError):
                pass
        item_data["chipset"] = chipset or None
        item_data["vram"] = vram
        item_data["core_clock"] = raw_data.get("core_base_clock") or specs.get("core_clock")
        item_data["boost_clock"] = raw_data.get("core_boost_clock") or specs.get("boost_clock")
        item_data["length"] = raw_data.get("length") or specs.get("length")
        item_data["tdp"] = raw_data.get("tdp") or specs.get("tdp")
        item_data["memory_type"] = raw_data.get("memory_type")

    elif raw_category == "Motherboard":
        socket = raw_data.get("socket") or specs.get("socket") or ""
        if not is_modern_motherboard(socket, name):
            return False
        item_data["socket"] = socket or None
        item_data["form_factor"] = raw_data.get("form_factor") or specs.get("form_factor")
        item_data["memory_slots"] = specs.get("memory_slots")
        item_data["max_memory"] = specs.get("max_memory")
        item_data["pcie_slots"] = specs.get("pcie_slots")
        item_data["chipset"] = specs.get("chipset")

    elif raw_category == "RAM":
        speed = specs.get("speed") or ""
        if not is_modern_ram(name, speed):
            return False
        item_data["speed"] = speed or None
        item_data["modules"] = specs.get("modules")
        item_data["cas_latency"] = specs.get("cas_latency")
        item_data["color"] = specs.get("color")

    elif raw_category == "Storage":
        interface = raw_data.get("interface") or specs.get("interface") or ""
        capacity_raw = raw_data.get("capacity")
        capacity_str = f"{capacity_raw} GB" if capacity_raw is not None else (specs.get("capacity") or "")
        storage_type = raw_data.get("type") or raw_data.get("storage_type") or specs.get("type") or ""
        is_hdd = "hdd" in storage_type.lower() or "hard" in storage_type.lower()
        is_nvme = raw_data.get("nvme") is True
        if not is_hdd and not is_nvme:
            return False
        if not is_consumer_storage(interface, capacity_str, storage_type, name):
            return False
        item_data["capacity"] = capacity_str or None
        item_data["type"] = storage_type or None
        item_data["form_factor"] = raw_data.get("form_factor") or specs.get("form_factor")
        item_data["interface"] = interface or None
        item_data["nvme"] = raw_data.get("nvme") or specs.get("nvme")

    elif raw_category == "PSU":
        psu_type = specs.get("type") or ""
        wattage = specs.get("wattage")
        if not is_consumer_psu(psu_type, wattage):
            return False
        item_data["wattage"] = wattage
        item_data["efficiency"] = specs.get("efficiency_rating")
        item_data["modular"] = specs.get("modular")
        item_data["form_factor"] = psu_type or None

    elif raw_category == "PCCase":
        if not is_consumer_case(name):
            return False
        case_ff = raw_data.get("form_factor") or ""
        if not _CONSUMER_CASE_FF_RE.search(case_ff):
            return False
        mb_form = raw_data.get("supported_motherboard_form_factors") or specs.get("motherboard_form_factor")
        if not is_consumer_case_mb(mb_form):
            return False
        max_gpu = raw_data.get("max_video_card_length") or specs.get("maximum_video_card_length")
        if not max_gpu:
            return False
        item_data["type"] = case_ff or specs.get("type")
        item_data["color"] = raw_data.get("color") or specs.get("color")
        item_data["motherboard_support"] = mb_form
        item_data["max_gpu_length"] = max_gpu
        item_data["max_cooler_height"] = raw_data.get("max_cpu_cooler_height")

    elif raw_category == "CPUCooler":
        sockets = raw_data.get("cpu_sockets") or raw_data.get("sockets") or specs.get("sockets") or []
        if not sockets or not is_modern_cooler(sockets):
            return False
        item_data["cooler_type"] = raw_data.get("water_cooled")
        item_data["radiator_size"] = raw_data.get("radiator_size")
        item_data["height"] = raw_data.get("height")
        item_data["min_fan_rpm"] = raw_data.get("min_fan_rpm")
        item_data["max_fan_rpm"] = raw_data.get("max_fan_rpm")
        item_data["min_noise_level"] = raw_data.get("min_noise_level")
        item_data["max_noise_level"] = raw_data.get("max_noise_level")
        item_data["color"] = raw_data.get("color")

    elif raw_category == "OS":
        item_data["manufacturer"] = raw_data.get("metadata", {}).get("manufacturer", "")

    elif raw_category == "CaseFan":
        if raw_data.get("isOEM"):
            return False
        if not raw_data.get("pwm"):
            return False
        if not is_consumer_fan_size(raw_data.get("size")):
            return False
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

def load_existing_prices():
    """Load scraped prices from current processed_data so they survive regeneration."""
    prices = {}
    if not os.path.exists(OUTPUT_FOLDER):
        return prices
    for cat_file in os.listdir(OUTPUT_FOLDER):
        if not cat_file.endswith(".json"):
            continue
        try:
            with open(os.path.join(OUTPUT_FOLDER, cat_file), encoding="utf-8") as f:
                items = json.load(f)
            for item in items:
                item_id = item.get("id")
                if item_id and item.get("price") is not None:
                    prices[item_id] = {
                        "price": item["price"],
                        "last_updated": item.get("last_updated"),
                        "scraped_url": item.get("scraped_url"),
                        "scraped_title": item.get("scraped_title"),
                    }
        except Exception:
            pass
    print(f"Preserved {len(prices)} existing prices across all categories.")
    return prices


def process_hardware_data():
    if not os.path.exists(INPUT_FOLDER):
        print(f"Error: Folder '{INPUT_FOLDER}' not found.")
        return

    # Snapshot existing prices before wiping the folder
    existing_prices = load_existing_prices()

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
                        # Skip products with no Amazon SKU — the scraper cannot price them
                        if not clean_item.get("amazon_sku", "").strip():
                            continue
                        # Restore previously scraped price for this product
                        saved = existing_prices.get(clean_item.get("id"))
                        if saved:
                            clean_item["price"] = saved["price"]
                            if saved.get("last_updated"):
                                clean_item["last_updated"] = saved["last_updated"]
                            if saved.get("scraped_url"):
                                clean_item["scraped_url"] = saved["scraped_url"]
                            if saved.get("scraped_title"):
                                clean_item["scraped_title"] = saved["scraped_title"]
                        processed_items.append(clean_item)
                except Exception as error:
                    print(f"Failed to process {filename}: {error}")

        # ── Deduplication by clean_name ────────────────────────────────────
        # Multiple OEM/retail/colour variants often share the same clean_name.
        # Keep the entry with the most populated spec fields (most keys wins).
        seen_names: dict = {}
        for item in processed_items:
            key = (item.get("clean_name") or item.get("name") or "").strip().lower()
            if not key:
                continue
            existing = seen_names.get(key)
            if existing is None or len(item) > len(existing):
                seen_names[key] = item
        deduplicated = list(seen_names.values())
        removed_dupes = len(processed_items) - len(deduplicated)

        if deduplicated:
            output_file = os.path.join(OUTPUT_FOLDER, f"{target_filename}.json")
            with open(output_file, 'w', encoding='utf-8') as output:
                json.dump(deduplicated, output, indent=4, ensure_ascii=False)
            priced = sum(1 for p in deduplicated if p.get("price") is not None)
            print(f"Success! Created {output_file} with {len(deduplicated)} items "
                  f"({removed_dupes} dupes removed, {priced} already priced).\n")

if __name__ == "__main__":
    process_hardware_data()
