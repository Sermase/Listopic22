
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Trophy, Settings, Share2, MessageCircle, List, Grid, UserPlus, MapPin } from 'lucide-react';
import FeedCard from './FeedCard';
import ListopicCard from './MovieCard';

interface ProfileViewProps {
    user: UserProfile;
}

const ProfileView: React.FC<ProfileViewProps> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'reviews' | 'lists' | 'badges'>('reviews');

    return (
        <div className="max-w-4xl mx-auto pb-24">
            
            {/* --- Hero Section --- */}
            <div className="bg-white md:rounded-b-3xl shadow-soft border-b border-slate-100 overflow-hidden mb-6 relative">
                {/* Cover Image */}
                <div className="h-48 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 relative">
                    <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                </div>

                <div className="px-4 sm:px-8 pb-8">
                    <div className="relative -mt-16 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 mb-6">
                        {/* Avatar */}
                        <div className="relative group">
                            <div className="w-32 h-32 rounded-full border-4 border-white shadow-xl bg-white overflow-hidden">
                                <img src={user.avatar} alt={user.name} className="w-full h-full" />
                            </div>
                            <div className="absolute -bottom-2 right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full border-2 border-white shadow-sm flex items-center gap-1">
                                <Trophy className="w-3 h-3" /> Lvl {user.level}
                            </div>
                        </div>

                        {/* Name & Bio */}
                        <div className="text-center md:text-left flex-1">
                            <h1 className="text-3xl font-display font-bold text-slate-900">{user.name}</h1>
                            <p className="text-slate-500 font-medium mb-1">{user.handle}</p>
                            <p className="text-slate-600 text-sm max-w-md mx-auto md:mx-0">{user.bio}</p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-2 md:mt-0">
                            <button className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-slate-300/50 hover:bg-slate-800 transition-all">
                                Edit Profile
                            </button>
                            <button className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors">
                                <Settings className="w-5 h-5" />
                            </button>
                            <button className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors">
                                <Share2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="flex flex-wrap items-center justify-center md:justify-between gap-6 border-t border-slate-100 pt-6">
                        
                        {/* Social Counts */}
                        <div className="flex gap-8">
                            <div className="text-center cursor-pointer hover:opacity-70 transition-opacity">
                                <div className="text-xl font-bold text-slate-900">{user.followers}</div>
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Followers</div>
                            </div>
                            <div className="text-center cursor-pointer hover:opacity-70 transition-opacity">
                                <div className="text-xl font-bold text-slate-900">{user.following}</div>
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Following</div>
                            </div>
                        </div>

                        {/* XP Bar (Gamification) */}
                        <div className="flex-1 max-w-xs min-w-[200px]">
                            <div className="flex justify-between text-xs font-bold mb-2">
                                <span className="text-indigo-600">{user.rankTitle}</span>
                                <span className="text-slate-400">{user.xp} / {user.maxXp} XP</span>
                            </div>
                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200 relative">
                                <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full" style={{width: `${(user.xp / user.maxXp) * 100}%`}}></div>
                            </div>
                            <div className="text-[10px] text-slate-400 text-right mt-1">Next Reward: Custom Theme</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Tabs Navigation --- */}
            <div className="px-4 mb-6 sticky top-16 z-20">
                <div className="bg-slate-100/80 backdrop-blur-md p-1.5 rounded-2xl flex shadow-sm border border-white/50 max-w-md mx-auto md:mx-0">
                    <button 
                        onClick={() => setActiveTab('reviews')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'reviews' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <MessageCircle className="w-4 h-4" /> Reviews
                    </button>
                    <button 
                        onClick={() => setActiveTab('lists')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'lists' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <List className="w-4 h-4" /> My Lists
                    </button>
                    <button 
                        onClick={() => setActiveTab('badges')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'badges' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Trophy className="w-4 h-4" /> Badges
                    </button>
                </div>
            </div>

            {/* --- Content Area --- */}
            <div className="px-4 animate-fade-in">
                
                {activeTab === 'reviews' && (
                    <div className="max-w-2xl mx-auto md:mx-0 space-y-6">
                        {user.myReviews.map(review => (
                            <FeedCard key={review.id} activity={review} />
                        ))}
                        {user.myReviews.length === 0 && (
                            <div className="text-center py-12 text-slate-400">
                                <p>No reviews yet. Start exploring!</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'lists' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {user.myLists.map(list => (
                            <ListopicCard 
                                key={list.id} 
                                list={list} 
                                onClick={() => {}} // In real app, navigate to list
                            />
                        ))}
                        <button className="border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center h-64 text-slate-400 hover:text-primary hover:border-primary hover:bg-indigo-50/30 transition-all group">
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                <UserPlus className="w-6 h-6" />
                            </div>
                            <span className="font-bold">Create New List</span>
                        </button>
                    </div>
                )}

                {activeTab === 'badges' && (
                    <div className="bg-white rounded-3xl p-8 shadow-soft border border-slate-100">
                         <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {user.badges.map(badge => {
                                const Icon = badge.icon;
                                const isLocked = !badge.unlockedAt; // Logic if we had locked badges in the array
                                return (
                                    <div key={badge.id} className="group relative flex flex-col items-center text-center p-4 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all hover:-translate-y-1">
                                        <div className={`w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform ${badge.color}`}>
                                            <Icon className="w-7 h-7" />
                                        </div>
                                        <h4 className="font-bold text-slate-800 text-sm">{badge.name}</h4>
                                        <p className="text-[10px] text-slate-400 mt-1 leading-tight px-2">{badge.description}</p>
                                        
                                        {badge.unlockedAt && (
                                            <span className="mt-2 text-[10px] font-mono bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                                                {badge.unlockedAt}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                             
                             {/* Mock Locked Badges */}
                             {[1,2,3].map(i => (
                                 <div key={i} className="flex flex-col items-center text-center p-4 rounded-2xl border border-dashed border-slate-200 opacity-60 grayscale">
                                    <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                                        <Trophy className="w-7 h-7 text-slate-300" />
                                    </div>
                                    <h4 className="font-bold text-slate-400 text-sm">Secret Badge</h4>
                                    <p className="text-[10px] text-slate-300 mt-1">???</p>
                                 </div>
                             ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default ProfileView;
