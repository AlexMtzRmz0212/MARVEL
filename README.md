# MARVEL

## Done so far:

### Frontend
- created the first timeline dashboard

### Backend
- phases classification script


## OMDb
```
https://www.omdbapi.com/?i=tt3896198&apikey=apikey
{
    "Title": "Guardians of the Galaxy Vol. 2",
    "Year": "2017",
    "Rated": "PG-13",
    "Released": "05 May 2017",
    "Runtime": "136 min",
    "Genre": "Action, Adventure, Comedy",
    "Director": "James Gunn",
    "Writer": "James Gunn, Dan Abnett, Andy Lanning",
    "Actors": "Chris Pratt, Zoe Saldaña, Dave Bautista",
    "Plot": "The Guardians struggle to keep together as a team while dealing with their personal family issues, notably Star-Lord's encounter with his father, the ambitious celestial being Ego.",
    "Language": "English",
    "Country": "United States",
    "Awards": "Nominated for 1 Oscar. 15 wins & 60 nominations total",
    "Poster": "https://m.media-amazon.com/images/M/MV5BNWE5MGI3MDctMmU5Ni00YzI2LWEzMTQtZGIyZDA5MzQzNDBhXkEyXkFqcGc@._V1_SX300.jpg",
    "Ratings": [
        {
            "Source": "Internet Movie Database",
            "Value": "7.6/10"
        },
        {
            "Source": "Rotten Tomatoes",
            "Value": "85%"
        },
        {
            "Source": "Metacritic",
            "Value": "67/100"
        }
    ],
    "Metascore": "67",
    "imdbRating": "7.6",
    "imdbVotes": "823,054",
    "imdbID": "tt3896198",
    "Type": "movie",
    "DVD": "N/A",
    "BoxOffice": "$389,813,101",
    "Production": "N/A",
    "Website": "N/A",
    "Response": "True"
}
```



## TMDb
https://api.themoviedb.org/3/discover/movie?api_key=api_key&with_companies=420&sort_by=release_date.asc
```
{
    "page": 1,
    "results": [
        {
            "adult": false,
            "backdrop_path": "/hoJpIYgFPc75NhaSWPNUeMFPMy1.jpg",
            "genre_ids": [
                12,
                16,
                28,
                878
            ],
            "id": 14611,
            "original_language": "en",
            "original_title": "Ultimate Avengers 2",
            "overview": "Mysterious Wakanda lies in the darkest heart of Africa, unknown to most of the world. An isolated land hidden behind closed borders, fiercely protected by its young king: Black Panther. But when brutal alien invaders attack, the threat leaves Black Panther with no option but to go against the sacred decrees of his people and ask for help from outsiders.",
            "popularity": 4.419,
            "poster_path": "/sMFyYZR9krqcQC99G6jnb10Zv4P.jpg",
            "release_date": "2006-08-08",
            "title": "Ultimate Avengers 2",
            "video": false,
            "vote_average": 6.785,
            "vote_count": 318
        },
    ],
    "total_pages": 5,
    "total_results": 96
}
```