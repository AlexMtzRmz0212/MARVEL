import json
import requests
import os
from dotenv import load_dotenv

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
OMDB_API_KEY = os.getenv("OMDB_API_KEY")

# --- DATA PATH CONFIGURATION ---
# Define the path variable here for easy updates
MARVEL_DATA_PATH = "../marvel-dashboard/data/marvel_data.json"

def get_mcu_phase(release_date):
    if not release_date: return "Upcoming"
    year = int(release_date.split("-")[0])
    
    if year <= 2012: return "Phase 1"
    elif year <= 2015: return "Phase 2"
    elif year <= 2019: return "Phase 3"
    elif year <= 2022: return "Phase 4"
    elif year <= 2025: return "Phase 5"
    else: return "Phase 6"

def build_marvel_dataset():
    # 1. Check if the file exists before opening
    if not os.path.exists(MARVEL_DATA_PATH):
        print(f"Error: File not found at {MARVEL_DATA_PATH}")
        return

    # 2. Load the data using the variable
    with open(MARVEL_DATA_PATH, 'r') as file:
        data = json.load(file)

    # 3. Apply the Phase mapping
    for item in data:
        item["phase"] = get_mcu_phase(item.get("releaseDate"))

    # 4. Save back to the path variable
    with open(MARVEL_DATA_PATH, "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"Successfully updated dataset at: {MARVEL_DATA_PATH}")

if __name__ == "__main__":
    build_marvel_dataset()