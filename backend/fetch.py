import os
import json
import requests
import time
from dotenv import load_dotenv

load_dotenv() 

TMDB_API_KEY = os.environ.get("TMDB_API_KEY")
OMDB_API_KEY = os.environ.get("OMDB_API_KEY")

# Define official MCU titles to filter out animated features and legacy movies
MCU_TITLES = {
    "Iron Man", "The Incredible Hulk", "Iron Man 2", "Thor", "Captain America: The First Avenger", "The Avengers",
    "Iron Man 3", "Thor: The Dark World", "Captain America: The Winter Soldier", "Guardians of the Galaxy", "Avengers: Age of Ultron", "Ant-Man",
    "Captain America: Civil War", "Doctor Strange", "Guardians of the Galaxy Vol. 2", "Spider-Man: Homecoming", "Thor: Ragnarok", "Black Panther", "Avengers: Infinity War", "Ant-Man and the Wasp", "Captain Marvel", "Avengers: Endgame", "Spider-Man: Far From Home",
    "Black Widow", "Shang-Chi and the Legend of the Ten Rings", "Eternals", "Spider-Man: No Way Home", "Doctor Strange in the Multiverse of Madness", "Thor: Love and Thunder", "Black Panther: Wakanda Forever",
    "Ant-Man and the Wasp: Quantumania", "Guardians of the Galaxy Vol. 3", "The Marvels", "Deadpool & Wolverine", "Captain America: Brave New World", "Thunderbolts*"
}

def get_mcu_phase(title, release_date):
    # Check if the movie is an official MCU property
    # We also ensure the release year is 2008 or later to avoid legacy animated movies with the same name (e.g., 2007's Doctor Strange)
    year = int(release_date.split("-")[0]) if release_date else 0
    
    if title not in MCU_TITLES or year < 2008:
        return "Non-MCU"

    if not release_date: 
        return "Upcoming"
    
    if year <= 2012: return "Phase 1"
    elif year <= 2015: return "Phase 2"
    elif year <= 2019: return "Phase 3"
    elif year <= 2022: return "Phase 4"
    elif year <= 2025: return "Phase 5"
    else: return "Phase 6"

def fetch_marvel_data():
    if not TMDB_API_KEY or not OMDB_API_KEY:
        print("Error: API keys are missing. Check your environment variables.")
        return

    print("Fetching titles from TMDb...")
    tmdb_url = f"https://api.themoviedb.org/3/discover/movie?api_key={TMDB_API_KEY}&with_companies=420&sort_by=release_date.asc"
    
    response = requests.get(tmdb_url)
    if response.status_code != 200:
        print("Failed to fetch from TMDb")
        return
        
    results = response.json().get("results", [])
    merged_data = []

    for item in results:
        if not item.get("release_date"):
            continue
            
        details_url = f"https://api.themoviedb.org/3/movie/{item['id']}?api_key={TMDB_API_KEY}"
        details_res = requests.get(details_url).json()
        imdb_id = details_res.get("imdb_id")
        
        movie_node = {
            "title": item.get("title"),
            "releaseDate": item.get("release_date"),
            "phase": get_mcu_phase(item.get("title"), item.get("release_date")),
            "type": "Movie",
            "boxOffice": details_res.get("revenue", 0), 
            "rating": 0
        }

        if imdb_id:
            omdb_url = f"http://www.omdbapi.com/?i={imdb_id}&apikey={OMDB_API_KEY}"
            omdb_res = requests.get(omdb_url).json()
            
            if omdb_res.get("Response") == "True":
                try:
                    movie_node["rating"] = float(omdb_res.get("imdbRating", 0))
                except ValueError:
                    movie_node["rating"] = 0
                    
        merged_data.append(movie_node)
        time.sleep(0.1)

    output_path = "marvel-dashboard/data/marvel_data.json"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(merged_data, f, indent=2)
        
    print(f"Successfully saved {len(merged_data)} titles to {output_path}")

if __name__ == "__main__":
    fetch_marvel_data()