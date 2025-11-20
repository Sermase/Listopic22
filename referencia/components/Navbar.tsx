import React from 'react';
import { Layout, Search, Bell, PlusCircle, Trophy, User } from 'lucide-react';
import { ViewState } from '../types';
import { MOCK_USER } from '../constants';

interface NavbarProps {
    currentView: ViewState;
    onNavigate: (view: ViewState) => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  return (
    <nav className="sticky top-0 z-50 bg-surface/90 backdrop-blur-xl border-b border-slate-200 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Logo */}
        <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onNavigate('HOME')}
        >
          <div className="bg-brand-gradient p-2 rounded-xl shadow-lg shadow-primary/30">
            <Layout className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-slate-800 tracking-tight hidden sm:block">
            Listopic
          </span>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center space-x-1 bg-slate-100 p-1 rounded-full border border-slate-200">
          <button 
            onClick={() => onNavigate('HOME')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${currentView === 'HOME' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Discover
          </button>
          <button 
             onClick={() => onNavigate('PROFILE')}
             className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${currentView === 'PROFILE' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
          >
            My Profile
          </button>
        </div>

        {/* Actions & Profile */}
        <div className="flex items-center gap-3 sm:gap-4">
            <button className="p-2 text-text-muted hover:text-primary transition-colors hidden sm:block">
                <Search className="w-5 h-5" />
            </button>
            
            {/* Gamification Badge */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-full">
                <Trophy className="w-4 h-4 text-yellow-600" />
                <span className="text-xs font-bold text-yellow-700">Lvl {MOCK_USER.level} Curator</span>
            </div>

            <button 
                onClick={() => onNavigate('CREATE')}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 shadow-lg shadow-slate-300/50 transition-all hover:scale-105 active:scale-95"
            >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Create</span>
            </button>

            <div 
                onClick={() => onNavigate('PROFILE')}
                className="w-9 h-9 rounded-full bg-slate-200 border-2 border-white shadow-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
            >
                <img src={MOCK_USER.avatar} alt="User" />
            </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;