import React, { useState } from 'react';
import { ArrowLeft, Share2, Heart, MessageCircle, Trophy, BarChart3, List as ListIcon, Info } from 'lucide-react';
import { TopicList, ListItem } from '../types';

interface ListViewProps {
    list: TopicList;
    onBack: () => void;
}

const ListView: React.FC<ListViewProps> = ({ list, onBack }) => {
    const [activeTab, setActiveTab] = useState<'ranking' | 'compare'>('ranking');

    // Sort items by score
    const sortedItems = [...list.items].sort((a, b) => b.totalScore - a.totalScore);

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
            <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-800 mb-6 transition-colors font-medium">
                <ArrowLeft className="w-5 h-5 mr-1" /> Back to Discovery
            </button>

            {/* Header */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand-gradient opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center relative z-10">
                    <div className="text-7xl bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-soft animate-bounce-slow">
                        {list.emoji}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-3 py-1 rounded-full bg-indigo-50 text-primary text-xs font-bold uppercase tracking-wider border border-indigo-100">
                                {list.category}
                            </span>
                            <span className="text-slate-400 text-xs font-medium">• {list.createdAt}</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 mb-2">
                            {list.title}
                        </h1>
                        <div className="flex items-center gap-2">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${list.author}`} alt={list.author} className="w-6 h-6 rounded-full border border-white shadow-sm" />
                            <p className="text-slate-600 text-sm">Curated by <span className="font-bold text-slate-800">@{list.author}</span></p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="p-3 rounded-full bg-slate-50 hover:bg-pink-50 text-slate-400 hover:text-pink-500 transition-colors border border-slate-200 hover:border-pink-200">
                            <Heart className="w-5 h-5" />
                        </button>
                        <button className="p-3 rounded-full bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-500 transition-colors border border-slate-200 hover:border-blue-200">
                            <Share2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-slate-100/50 p-1 rounded-2xl w-fit mx-auto sm:mx-0">
                <button 
                    onClick={() => setActiveTab('ranking')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'ranking' ? 'bg-white text-slate-800 shadow-sm scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <ListIcon className="w-4 h-4" /> Ranking
                </button>
                <button 
                    onClick={() => setActiveTab('compare')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'compare' ? 'bg-white text-slate-800 shadow-sm scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <BarChart3 className="w-4 h-4" /> Compare
                </button>
            </div>

            {/* Content */}
            <div className="space-y-4">
                {activeTab === 'ranking' ? (
                    sortedItems.map((item, index) => (
                        <div key={item.id} className="group bg-white rounded-2xl p-4 border border-slate-100 shadow-soft hover:shadow-md transition-all flex gap-4 items-center">
                            <div className={`
                                w-10 h-10 flex items-center justify-center rounded-xl font-display font-bold text-lg shrink-0
                                ${index === 0 ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : 
                                  index === 1 ? 'bg-slate-200 text-slate-700 border border-slate-300' : 
                                  index === 2 ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-slate-50 text-slate-500'}
                            `}>
                                {index + 1}
                            </div>
                            
                            <img src={item.imageUrl} alt={item.name} className="w-20 h-20 rounded-xl object-cover hidden sm:block" />
                            
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-slate-800 text-lg">{item.name}</h3>
                                {item.tags && (
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                        {item.tags.map(t => (
                                            <span key={t} className="text-[10px] px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-slate-500 font-medium uppercase">{t}</span>
                                        ))}
                                    </div>
                                )}
                                {item.comment && (
                                    <p className="text-sm text-slate-500 mt-2 italic border-l-2 border-slate-200 pl-2 line-clamp-2">
                                        "{item.comment}"
                                    </p>
                                )}
                            </div>

                            <div className="text-right shrink-0 pl-2 border-l border-slate-100">
                                <div className="text-3xl font-display font-bold text-slate-800 group-hover:text-primary transition-colors">
                                    {item.totalScore}
                                </div>
                                <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Score</div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Comparison Logic */}
                        {list.criteria.map(criterion => (
                            <div key={criterion.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-bold text-slate-800">{criterion.label}</h4>
                                    <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-500">Weight: {criterion.weight}x</span>
                                </div>
                                <div className="space-y-4">
                                    {sortedItems.map(item => (
                                        <div key={item.id} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium text-slate-700 truncate pr-2 w-24">{item.name}</span>
                                                <span className="font-mono font-bold text-slate-900">{item.scores[criterion.id]}</span>
                                            </div>
                                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{ 
                                                        width: `${item.scores[criterion.id] * 10}%`,
                                                        backgroundColor: item.id === sortedItems[0].id ? '#4f46e5' : '#94a3b8' // Highlight winner
                                                    }} 
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ListView;