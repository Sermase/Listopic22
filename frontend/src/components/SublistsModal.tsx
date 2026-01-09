import React from 'react';
import { X, List as ListIcon, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type ListEntity } from '../hooks/useLists';

interface SublistsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sublists: ListEntity[];
    parentListName: string;
}

export const SublistsModal: React.FC<SublistsModalProps> = ({ isOpen, onClose, sublists, parentListName }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#151b2e] w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0b1021]/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <ListIcon className="w-5 h-5 text-indigo-400" />
                            Sublistas Disponibles
                        </h2>
                        <p className="text-xs text-gray-500">Versiones de "{parentListName}" creadas por la comunidad</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {sublists.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            No hay sublistas disponibles.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {sublists.map(sublist => (
                                <Link
                                    key={sublist.id}
                                    to={`/list/${sublist.id}`}
                                    onClick={onClose}
                                    className="block group bg-[#0b1021] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all flex flex-col"
                                >
                                    <div className="h-32 bg-gray-800 relative">
                                        {sublist.photoUrl ? (
                                            <img src={sublist.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                <ListIcon className="w-8 h-8 text-gray-600" />
                                            </div>
                                        )}
                                        {/* Badges */}
                                        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                                            <span className="bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-white">
                                                {sublist.itemCount} items
                                            </span>
                                            {!sublist.isPublic && (
                                                <span className="bg-purple-600/90 px-2 py-0.5 rounded text-[10px] font-bold text-white border border-purple-400/30">
                                                    Privada
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-3 flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h4 className="text-white font-bold text-sm mb-1 truncate group-hover:text-indigo-400 transition-colors">
                                                {sublist.name}
                                            </h4>
                                            <p className="text-xs text-gray-500 truncate">
                                                Por {sublist.authorName || "Anónimo"}
                                            </p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 shrink-0 mt-1" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
