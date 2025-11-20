
import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import ListopicCard from './components/MovieCard';
import SkeletonCard from './components/SkeletonCard';
import GenreChips from './components/GenreChips';
import CreateListModal from './components/AIAssistant';
import ListView from './components/ListView';
import ProfileView from './components/ProfileView';
import FeedCard from './components/FeedCard';
import { TopicList, LoadingState, ViewState, FeedActivity } from './types';
import { MOCK_LISTS, MOCK_USER, MOCK_FEED } from './constants';
import { Plus, Compass, Users } from 'lucide-react';

const App: React.FC = () => {
  const [loading, setLoading] = useState<LoadingState>(LoadingState.LOADING);
  const [lists, setLists] = useState<TopicList[]>([]);
  const [feed, setFeed] = useState<FeedActivity[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  
  // Home Tab State
  const [homeTab, setHomeTab] = useState<'FOLLOWING' | 'DISCOVER'>('FOLLOWING');
  
  // Routing State
  const [view, setView] = useState<ViewState>('HOME');
  const [selectedList, setSelectedList] = useState<TopicList | null>(null);

  // Simulate API fetch
  useEffect(() => {
    setLoading(LoadingState.LOADING);
    const timer = setTimeout(() => {
      setLists(MOCK_LISTS);
      setFeed(MOCK_FEED);
      setLoading(LoadingState.SUCCESS);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const filteredLists = selectedCategory === 'all' 
    ? lists 
    : lists.filter(l => l.category === selectedCategory);

  const handleNavigate = (newView: ViewState) => {
    if (newView === 'CREATE') {
        setIsWizardOpen(true);
    } else {
        setView(newView);
        if(newView !== 'LIST_DETAIL') setSelectedList(null);
        window.scrollTo(0,0);
    }
  };

  const handleListClick = (list: TopicList) => {
    setSelectedList(list);
    setView('LIST_DETAIL');
    window.scrollTo(0,0);
  };

  return (
    <div className="min-h-screen bg-background pb-20 relative">
      <Navbar currentView={view} onNavigate={handleNavigate} />
      
      {/* Router Switch */}
      {view === 'HOME' && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            
            {/* Top Toggle Switch */}
            <div className="flex bg-slate-200/50 p-1.5 rounded-2xl mb-6 backdrop-blur-sm sticky top-20 z-30 shadow-sm border border-white/50">
                <button 
                    onClick={() => setHomeTab('FOLLOWING')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${homeTab === 'FOLLOWING' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Users className="w-4 h-4" /> Following
                </button>
                <button 
                    onClick={() => setHomeTab('DISCOVER')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${homeTab === 'DISCOVER' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Compass className="w-4 h-4" /> Discover
                </button>
            </div>

            {/* Content based on Tab */}
            {homeTab === 'FOLLOWING' ? (
                <div className="space-y-6 pb-12 animate-fade-in">
                    {loading === LoadingState.LOADING ? (
                        [1,2].map(i => <SkeletonCard key={i} />)
                    ) : (
                        feed.map(activity => (
                            <FeedCard key={activity.id} activity={activity} />
                        ))
                    )}
                    
                    {/* End of feed suggestion */}
                    <div className="text-center py-8">
                        <p className="text-slate-400 text-sm">You're all caught up!</p>
                        <button onClick={() => setHomeTab('DISCOVER')} className="text-primary font-bold text-sm mt-2">Discover new lists</button>
                    </div>
                </div>
            ) : (
                <div className="animate-fade-in pb-12">
                    <div className="mb-6">
                        <h2 className="text-xl font-display font-bold text-slate-800 mb-2">Explore Categories</h2>
                        <GenreChips selectedGenre={selectedCategory} onSelect={setSelectedCategory} />
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        {loading === LoadingState.LOADING ? (
                            Array.from({ length: 4 }).map((_, index) => (
                                <SkeletonCard key={index} />
                            ))
                        ) : (
                            filteredLists.map((list) => (
                                <ListopicCard 
                                    key={list.id} 
                                    list={list} 
                                    onClick={() => handleListClick(list)}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
      )}

      {view === 'LIST_DETAIL' && selectedList && (
        <ListView list={selectedList} onBack={() => handleNavigate('HOME')} />
      )}

      {view === 'PROFILE' && (
        <ProfileView user={MOCK_USER} />
      )}

      {/* Floating Action Button (Only on Home) */}
      {view === 'HOME' && (
        <button 
            onClick={() => setIsWizardOpen(true)}
            className="fixed bottom-8 right-8 z-40 bg-brand-gradient w-16 h-16 rounded-full flex items-center justify-center shadow-2xl shadow-primary/40 hover:scale-110 hover:rotate-90 transition-all duration-300 text-white group"
            aria-label="Create List"
        >
            <Plus className="w-8 h-8" />
            <span className="absolute right-full mr-4 bg-slate-900 text-white px-3 py-1 rounded-lg text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                New Post
            </span>
        </button>
      )}

      <CreateListModal isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />

    </div>
  );
};

export default App;
