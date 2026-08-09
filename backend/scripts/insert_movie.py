import json
import os
import sys
from datetime import datetime

# Path to the mcu.json file
MCU_JSON_PATH = os.path.join(
    os.path.dirname(__file__),
    "../app/seed/data/mcu.json"
)

# The prompts below offer exactly the values the seed schema accepts, taken from
# the enums themselves rather than retyped here. A value the enums reject makes
# mcu.json unloadable, and the catalog is validated on every request -- so a
# typo in this script is a 500 on the deployed site, not a local nuisance.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.core.enums import MediaType, Saga, Tier, Universe  # noqa: E402

SAGAS = [member.value for member in Saga]
UNIVERSES = [member.value for member in Universe]
MEDIA_TYPES = [member.value for member in MediaType]
TIERS = [member.value for member in Tier]

def load_mcu_data():
    """Loads the MCU data from mcu.json."""
    if not os.path.exists(MCU_JSON_PATH):
        print(f"Error: {MCU_JSON_PATH} not found.")
        sys.exit(1)
    with open(MCU_JSON_PATH, encoding='utf-8') as f:
        return json.load(f)

def save_mcu_data(data):
    """Saves the updated MCU data back to mcu.json."""
    with open(MCU_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Successfully updated {MCU_JSON_PATH}")

def get_user_input(prompt, default=None, type_cast=str, validator=None, choices=None):
    """
    Helper function to get user input with optional default, type casting, validation, and choices.
    """
    while True:
        if choices:
            display_choices = ", ".join(choices)
            shown_default = default if default is not None else ''
            input_prompt = f"{prompt} ({display_choices})[{shown_default}]: "
        else:
            input_prompt = f"{prompt}[{default if default is not None else ''}]: "

        user_input = input(input_prompt).strip()

        if not user_input and default is not None:
            user_input = default

        if not user_input and not default and type_cast is not str:
            return None # Allow None for optional non-string fields if no input and no default

        try:
            value = type_cast(user_input)
            if validator:
                validator(value)
            if choices and value not in choices:
                raise ValueError(f"Invalid choice. Must be one of: {display_choices}")
            return value
        except ValueError as e:
            print(f"Invalid input: {e}. Please try again.")
        except Exception as e:
            print(f"An unexpected error occurred: {e}. Please try again.")

def validate_unique_id(new_id, existing_movies):
    """Validator to ensure the ID is unique."""
    if not new_id.islower() or " " in new_id:
        raise ValueError("ID must be in kebab-case (lowercase with hyphens, no spaces).")
    for movie in existing_movies:
        if movie["id"] == new_id:
            raise ValueError(f"ID '{new_id}' already exists. Please choose a unique ID.")

def validate_phase(phase):
    """Validator matching the schema's `ge=1, le=10` bound on phase."""
    if phase is not None and not 1 <= phase <= 10:
        raise ValueError("Phase must be between 1 and 10, or blank for none.")


def validate_date_format(date_str):
    """Validator to ensure date is in YYYY-MM-DD format."""
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Date must be in YYYY-MM-DD format.") from exc

def main():
    mcu_data = load_mcu_data()
    movies = mcu_data["movies"]

    print("--- Enter New Movie/Series Details ---")

    new_movie = {}

    # Get unique ID
    new_movie["id"] = get_user_input(
        "ID (kebab-case, e.g., 'the-marvels')",
        validator=lambda x: validate_unique_id(x, movies)
    )
    new_movie["title"] = get_user_input("Title")
    new_movie["release_date"] = get_user_input(
        "Release Date (YYYY-MM-DD)",
        # validator=validate_date_format
    )
    # Blank means "no agreed phase", which the schema stores as null; 0 is not a
    # legal phase.
    new_movie["phase"] = get_user_input(
        "Phase (1-10, blank for none)",
        type_cast=lambda x: int(x) if x else None,
        validator=validate_phase,
        default=""
    )
    new_movie["saga"] = get_user_input("Saga", default="multiverse", choices=SAGAS)
    new_movie["universe"] = get_user_input("Universe", default="mcu", choices=UNIVERSES)
    new_movie["media_type"] = get_user_input(
        "Media Type",
        default="film",
        choices=MEDIA_TYPES
    )
    new_movie["tier"] = get_user_input(
        "Tier",
        default="core",
        choices=TIERS
    )
    new_movie["runtime_min"] = get_user_input(
        "Runtime in minutes (integer, optional)",
        type_cast=lambda x: int(x) if x else None,
        default=""
    )
    
    # Prerequisities input
    prereq_ids_str = get_user_input(
        "Comma-separated prerequisite IDs (optional, e.g., 'iron-man,thor')",
        default=""
    )
    new_movie["prerequisites"] = []
    if prereq_ids_str:
        for prereq_id in [pid.strip() for pid in prereq_ids_str.split(',') if pid.strip()]:
            # Basic check if prereq_id exists, though not strictly necessary for script function
            if not any(movie['id'] == prereq_id for movie in movies):
                print(f"Warning: Prerequisite ID '{prereq_id}' not found in existing movies.")
            new_movie["prerequisites"].append({
                "id": prereq_id,
                "strength": "essential", # Default for simplicity
                "note": "" # Default for simplicity
            })

    new_movie["tmdb_id"] = get_user_input(
        "TMDb ID (integer, optional)",
        type_cast=lambda x: int(x) if x else None,
        default=""
    )
    new_movie["poster_url"] = get_user_input("Poster URL (optional)", default="")
    new_movie["synopsis"] = get_user_input("Synopsis (optional)", default="")

    print("\n--- New Entry Details ---")
    print(json.dumps(new_movie, indent=2, ensure_ascii=False))

    # Get insertion index
    while True:
        try:
            insert_index_str = get_user_input(
                f"Enter the 0-based index to insert the new entry (0 to {len(movies)})",
                default=str(len(movies)), # Default to end of list
                type_cast=int
            )
            if 0 <= insert_index_str <= len(movies):
                insert_index = insert_index_str
                break
            else:
                print(f"Index out of range. Must be between 0 and {len(movies)}.")
        except ValueError as e:
            print(f"Invalid input: {e}. Please enter an integer.")

    movies.insert(insert_index, new_movie)
    mcu_data["movies"] = movies

    save_mcu_data(mcu_data)
    print("Insertion complete. Please review mcu.json.")

if __name__ == "__main__":
    main()
