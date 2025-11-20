
import React from 'react';
import { CATEGORIES } from '../constants';

interface GenreChipsProps {
  selectedGenre: string;
  onSelect: (id: string) => void;
}

const GenreChips: React.FC<GenreChipsProps> = ({ selectedGenre, onSelect }) => {
  return (
    <div className="w-full overflow-x-auto no-scrollbar py-4">
      <div className="flex space-x-3 px-1">
        {CATEGORIES.map((cat) => {
          const isActive = selectedGenre === cat.id;
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`
                flex items-center gap-2 whitespace-nowrap px-5 py-3 rounded-2xl text-sm font-bold transition-all duration-300
                border
                ${isActive 
                  ? `bg-slate-900 text-white border-slate-900 shadow-lg scale-105` 
                  : `${cat.bg} ${cat.color} border-transparent hover:brightness-95`
                }
              `}
            >
              {Icon && <Icon className={`w-4 h-4 ${isActive ? 'text-white' : cat.color}`} />}
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default GenreChips;
