import React from "react";
import { Link } from "react-router-dom";

interface ListRatingStats {
  listId: string;
  listName: string;
  reviewsCount: number;
  averageRating: number;
}

interface AdvancedProfileStats {
  totalReviews: number;
  averageRating: number;
  ratedListsCount: number;
  uniquePlacesCount: number;
  reviewsWithPhotoCount: number;
  statsByList: Record<
    string,
    {
      listId: string;
      listName: string;
      reviewsCount: number;
      averageRating: number;
    }
  >;
}

interface Props {
  statsLoading: boolean;
  statsError: string | null;
  advancedStats: AdvancedProfileStats;
  sortedStatsPerList: ListRatingStats[];
  statsListSort: "reviews_desc" | "rating_desc";
  onSortChange: (sort: "reviews_desc" | "rating_desc") => void;
  formatStatRating: (value: number) => string;
  onCloseModal: () => void;
}

const ProfileStatsTab: React.FC<Props> = ({
  statsLoading,
  statsError,
  advancedStats,
  sortedStatsPerList,
  statsListSort,
  onSortChange,
  formatStatRating,
  onCloseModal,
}) => {
  if (statsLoading) {
    return (
      <div className="py-20 text-center text-gray-500">
        Cargando estadísticas...
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="py-10 px-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
        {statsError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
          <div className="text-[11px] uppercase tracking-wider text-gray-400">
            Media global
          </div>
          <div className="text-3xl font-black text-white mt-1">
            {formatStatRating(advancedStats.averageRating)}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
          <div className="text-[11px] uppercase tracking-wider text-gray-400">
            Reseñas analizadas
          </div>
          <div className="text-3xl font-black text-white mt-1">
            {advancedStats.totalReviews}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 p-4">
          <div className="text-[11px] uppercase tracking-wider text-gray-400">
            Listas valoradas
          </div>
          <div className="text-3xl font-black text-white mt-1">
            {advancedStats.ratedListsCount}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#151b2e]/70 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">
            Media por lista
          </h3>
          <span className="text-[11px] text-gray-400">
            Reseñas y valoración media
          </span>
        </div>
        <div className="px-4 py-2 border-b border-white/10">
          <div className="inline-flex rounded-lg border border-white/10 bg-[#0f1424] p-1">
            <button
              type="button"
              onClick={() => onSortChange("reviews_desc")}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                statsListSort === "reviews_desc"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              Más reseñas
            </button>
            <button
              type="button"
              onClick={() => onSortChange("rating_desc")}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                statsListSort === "rating_desc"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              Mejor valoradas
            </button>
          </div>
        </div>
        {sortedStatsPerList.length === 0 ? (
          <div className="py-10 text-center text-gray-500 text-sm">
            No hay datos de valoración por lista.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {sortedStatsPerList.map((listStat) => (
              <Link
                key={listStat.listId}
                to={`/list/${listStat.listId}`}
                onClick={onCloseModal}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {listStat.listName}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {listStat.reviewsCount} reseñas
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-gray-400">
                    Media
                  </div>
                  <div className="text-lg font-black text-indigo-300">
                    {formatStatRating(listStat.averageRating)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileStatsTab;
