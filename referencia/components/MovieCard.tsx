import React from 'react';
import { Heart, Eye, Trophy, ChevronRight } from 'lucide-react';
import { TopicList } from '../types';

interface ListopicCardProps {
  list: TopicList;
  onClick: () => void;
}

const ListopicCard: React.FC<ListopicCardProps> = ({ list, onClick }) => {
  const winner = list.items.reduce((prev, current) => (prev.totalScore > current.totalScore) ? prev : current);

  return (
    <div 
        onClick={onClick}
        className="group bg-surface rounded-3xl border border-slate-100 shadow-soft hover:shadow-hover transition-all duration-300 hover:-translate-y-1 flex flex-col h-full overflow-hidden cursor-pointer relative"
    >
      
      {/* Header Gradient */}
      <div className="h-24 bg-gradient-to-r from-slate-100 to-slate-50 relative">
        <div className="absolute -bottom-6 left-6 bg-white p-3 rounded-2xl shadow-md text-3xl border border-slate-50 transition-transform group-hover:scale-110 duration-300">
            {list.emoji}
        </div>
        <div className="absolute top-3 right-3 bg-white/50 backdrop-blur-md px-2 py-1 rounded-lg text-xs font-bold text-slate-600 flex items-center gap-1">
            <Eye className="w-3 h-3" /> {list.views > 1000 ? (list.views/1000).toFixed(1) + 'k' : list.views}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 pt-8 flex-1 flex flex-col">
        <div className="mb-4">
            <h3 className="font-display font-bold text-slate-800 text-lg leading-tight group-hover:text-primary transition-colors line-clamp-1">
                {list.title}
            </h3>
            <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                by <span className="font-semibold text-slate-700">@{list.author}</span>
            </p>
        </div>

        {/* Mini Graph / Winner Preview */}
        <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-3 h-3 text-yellow-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Top Pick</span>
            </div>
            <div className="flex items-center gap-3">
                <img src={winner.imageUrl} alt={winner.name} className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{winner.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                         <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-gradient" style={{ width: `${(winner.totalScore / 10) * 100}%` }}></div>
                         </div>
                         <span className="text-xs font-bold text-primary">{winner.totalScore}</span>
                    </div>
                </div>
            </div>
        </div>
        
        {/* Footer */}
        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="flex items-center gap-1 text-slate-400 hover:text-secondary transition-colors">
                <Heart className="w-4 h-4" />
                <span className="text-xs font-medium">{list.likes}</span>
            </div>
            <div className="flex items-center text-primary font-bold text-xs group-hover:translate-x-1 transition-transform">
                View Ranking <ChevronRight className="w-3 h-3 ml-0.5" />
            </div>
        </div>
      </div>
    </div>
  );
};

export default ListopicCard;