
import React from 'react';
import { Heart, MessageCircle, MapPin, MoreHorizontal, Share2 } from 'lucide-react';
import { FeedActivity } from '../types';

interface FeedCardProps {
  activity: FeedActivity;
}

const FeedCard: React.FC<FeedCardProps> = ({ activity }) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-soft mb-6 overflow-hidden hover:shadow-hover transition-shadow duration-300">
      
      {/* User Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={activity.user.avatar} alt={activity.user.name} className="w-10 h-10 rounded-full border border-slate-100" />
            <div className="absolute -bottom-1 -right-1 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
              L7
            </div>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">{activity.user.name}</h4>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>{activity.user.handle}</span>
              <span>•</span>
              <span>{activity.timestamp}</span>
            </div>
          </div>
        </div>
        <button className="text-slate-400 hover:text-slate-600">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Context Line */}
      <div className="px-4 pb-2 text-sm text-slate-600 flex items-center gap-1">
        ranked <span className="font-bold text-slate-900">{activity.content.placeName}</span> in 
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-xs font-bold border border-slate-200">
          {activity.content.emoji} {activity.content.listTitle}
        </span>
      </div>

      {/* Main Visual Content */}
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        <img src={activity.content.placeImage} alt={activity.content.placeName} className="w-full h-full object-cover" />
        
        {/* Floating Rating Badge */}
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-lg flex flex-col items-center border border-white/50">
          <span className="text-2xl font-display font-extrabold text-slate-900">{activity.content.rating}</span>
          <div className="flex gap-0.5">
             {[...Array(5)].map((_, i) => (
                 <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < Math.round(activity.content.rating/2) ? 'bg-primary' : 'bg-slate-200'}`}></div>
             ))}
          </div>
        </div>
        
        {/* Location Tag */}
        {activity.content.placeLocation && (
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-black/80 cursor-pointer transition-colors">
                <MapPin className="w-3 h-3" /> {activity.content.placeLocation}
            </div>
        )}
      </div>

      {/* Review Content */}
      <div className="p-4">
        <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
            {activity.content.scores.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-100 shrink-0">
                    <span className="text-xs text-slate-500 font-semibold uppercase">{s.label}</span>
                    <span className={`text-sm font-bold ${s.score >= 9 ? 'text-emerald-600' : s.score >= 7 ? 'text-indigo-600' : 'text-slate-600'}`}>
                        {s.score}
                    </span>
                </div>
            ))}
        </div>

        <p className="text-slate-700 text-sm leading-relaxed mb-4">
            "{activity.content.comment}"
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="flex items-center gap-4">
                <button className="flex items-center gap-1.5 text-slate-500 hover:text-pink-500 transition-colors group">
                    <Heart className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold">{activity.likes}</span>
                </button>
                <button className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-500 transition-colors">
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-xs font-bold">{activity.comments}</span>
                </button>
            </div>
            <button className="text-slate-400 hover:text-slate-600">
                <Share2 className="w-5 h-5" />
            </button>
        </div>
      </div>

    </div>
  );
};

export default FeedCard;
