import { useState, useMemo } from 'react';

const MOCK_DATA = [
  { title: "Iron Man", releaseDate: "2008-05-02", phase: "Phase 1", type: "Movie" },
  { title: "The Incredible Hulk", releaseDate: "2008-06-13", phase: "Phase 1", type: "Movie" },
  { title: "Iron Man 2", releaseDate: "2010-05-07", phase: "Phase 1", type: "Movie" },
  { title: "Thor", releaseDate: "2011-05-06", phase: "Phase 1", type: "Movie" },
  { title: "Captain America: The First Avenger", releaseDate: "2011-07-22", phase: "Phase 1", type: "Movie" },
  { title: "The Avengers", releaseDate: "2012-05-04", phase: "Phase 1", type: "Movie" },
  { title: "Iron Man 3", releaseDate: "2013-05-03", phase: "Phase 2", type: "Movie" },
  { title: "Avengers: Age of Ultron", releaseDate: "2015-05-01", phase: "Phase 2", type: "Movie" },
  { title: "Captain America: Civil War", releaseDate: "2016-05-06", phase: "Phase 3", type: "Movie" },
  { title: "Avengers: Infinity War", releaseDate: "2018-04-27", phase: "Phase 3", type: "Movie" },
  { title: "Avengers: Endgame", releaseDate: "2019-04-26", phase: "Phase 3", type: "Movie" },
  { title: "WandaVision", releaseDate: "2021-01-15", phase: "Phase 4", type: "TV Show" },
  { title: "Loki", releaseDate: "2021-06-09", phase: "Phase 4", type: "TV Show" },
  { title: "Spider-Man: No Way Home", releaseDate: "2021-12-17", phase: "Phase 4", type: "Movie" },
  { title: "Guardians of the Galaxy Vol. 3", releaseDate: "2023-05-05", phase: "Phase 5", type: "Movie" }
];

export default function App() {
  const [filterPhase, setFilterPhase] = useState('All');
  const [filterType, setFilterType] = useState('All');

  const processedTimeline = useMemo(() => {
    return MOCK_DATA
      .filter(item => filterPhase === 'All' || item.phase === filterPhase)
      .filter(item => filterType === 'All' || item.type === filterType)
      .sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
  }, [filterPhase, filterType]);

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-red-600 selection:text-white pb-20">
      
      {/* Sticky Header & Filters */}
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 shadow-xl">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-white">
              MCU <span className="text-red-600">Timeline</span>
            </h1>
            <p className="text-slate-400 text-sm tracking-widest uppercase mt-1">The Infinity Saga & Beyond</p>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto">
            <select 
              className="flex-1 md:flex-none bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-red-600 focus:outline-none"
              value={filterPhase} 
              onChange={e => setFilterPhase(e.target.value)}
            >
              <option value="All">All Phases</option>
              <option value="Phase 1">Phase 1</option>
              <option value="Phase 2">Phase 2</option>
              <option value="Phase 3">Phase 3</option>
              <option value="Phase 4">Phase 4</option>
              <option value="Phase 5">Phase 5</option>
            </select>
            
            <select 
              className="flex-1 md:flex-none bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-red-600 focus:outline-none"
              value={filterType} 
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="All">All Formats</option>
              <option value="Movie">Movies</option>
              <option value="TV Show">TV Shows</option>
            </select>
          </div>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="max-w-6xl mx-auto px-6 mt-16 relative">
        
        {/* The Central Line */}
        <div className="absolute top-0 bottom-0 left-[39px] md:left-1/2 transform md:-translate-x-1/2 w-0.5 bg-gradient-to-b from-red-600 via-red-800 to-slate-950 rounded-full z-0"></div>

        {processedTimeline.length === 0 ? (
          <div className="text-center py-20 text-slate-500">No releases found for these filters.</div>
        ) : (
          <div className="space-y-12">
            {processedTimeline.map((item, index) => {
              const isEven = index % 2 === 0;
              
              return (
                <div key={index} className={`relative flex items-center justify-between w-full md:flex-row ${isEven ? 'md:flex-row-reverse' : ''}`}>
                  
                  {/* Invisible Spacer for desktop alternating layout */}
                  <div className="hidden md:block w-[45%]"></div>

                  {/* Node Dot */}
                  <div className="absolute left-[8px] md:left-1/2 transform md:-translate-x-1/2 flex items-center justify-center z-20">
                    <div className="w-4 h-4 bg-red-500 rounded-full ring-4 ring-slate-950 shadow-[0_0_15px_rgba(220,38,38,0.8)]"></div>
                  </div>

                  {/* Content Card */}
                  <div className="ml-16 md:ml-0 w-full md:w-[45%] z-10">
                    <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 p-6 rounded-xl hover:bg-slate-800 hover:border-red-900/50 hover:shadow-[0_0_30px_rgba(220,38,38,0.1)] transition-all duration-300 group">
                      
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-red-500 font-mono text-xs uppercase tracking-wider font-bold">
                          {item.phase}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                          item.type === 'Movie' 
                            ? 'bg-blue-900/30 text-blue-400 border border-blue-800/50' 
                            : 'bg-purple-900/30 text-purple-400 border border-purple-800/50'
                        }`}>
                          {item.type}
                        </span>
                      </div>
                      
                      <h3 className="text-xl font-bold text-white mb-1 group-hover:text-red-400 transition-colors">
                        {item.title}
                      </h3>
                      
                      <p className="text-slate-400 text-sm">
                        {formatDate(item.releaseDate)}
                      </p>
                      
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}