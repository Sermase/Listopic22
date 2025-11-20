import React from 'react';

const SkeletonCard: React.FC = () => {
  return (
    <div className="bg-surface rounded-3xl border border-slate-100 shadow-soft h-full flex flex-col overflow-hidden">
      <div className="h-24 bg-slate-100 animate-pulse"></div>
      <div className="p-6 pt-8 flex-1 flex flex-col gap-4">
        <div className="space-y-2">
             <div className="h-5 bg-slate-200 rounded w-3/4 animate-pulse"></div>
             <div className="h-3 bg-slate-200 rounded w-1/3 animate-pulse"></div>
        </div>
        <div className="h-20 bg-slate-50 rounded-xl animate-pulse border border-slate-100"></div>
        <div className="mt-auto pt-3 border-t border-slate-100 flex justify-between">
            <div className="h-4 w-8 bg-slate-200 rounded animate-pulse"></div>
            <div className="h-4 w-16 bg-slate-200 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonCard;