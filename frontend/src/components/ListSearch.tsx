import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { Search, List as ListIcon, Plus, ChevronDown, Check, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ListSearchProps {
    onSelect: (listId: string) => void;
    selectedListId: string | null;
    placeName?: string;
    placeTypes?: string[];
    suggestedListIds?: string[];
}

interface EnrichedList {
    id: string;
    name: string;
    parentListId?: string;
    parentListName?: string; // For display
    score: number;
    isSuggested?: boolean;
}

export const ListSearch: React.FC<ListSearchProps> = ({ onSelect, selectedListId, placeName, placeTypes, suggestedListIds }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [lists, setLists] = useState<EnrichedList[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Fetch Lists
    useEffect(() => {
        const fetchLists = async () => {
            if (!user) return;
            try {
                // Fetch Owned
                const qOwned = query(collection(db, 'lists'), where('userId', '==', user.uid));
                // Fetch Edited
                const qEdited = query(collection(db, 'lists'), where('editors', 'array-contains', user.uid));
                // Fetch Public lists so users can choose from across Listopic
                const qPublic = query(collection(db, 'lists'), where('isPublic', '==', true), limit(300));

                const [snapOwned, snapEdited, snapPublic] = await Promise.allSettled([
                    getDocs(qOwned),
                    getDocs(qEdited),
                    getDocs(qPublic)
                ]);

                const allDocs: any[] = [];
                if (snapOwned.status === 'fulfilled') {
                    snapOwned.value.docs.forEach(d => allDocs.push(d));
                } else {
                    console.error("ListSearch: Error fetching owned lists", snapOwned.reason);
                    if (snapOwned.reason?.code === 'permission-denied') {
                        throw new Error("Permisos insuficientes para ver tus listas.");
                    }
                }

                if (snapEdited.status === 'fulfilled') {
                    snapEdited.value.docs.forEach(d => allDocs.push(d));
                } else {
                    console.warn("ListSearch: Error fetching shared lists", snapEdited.reason);
                    // Don't fail everything if shared lists fail, but maybe log it?
                }

                if (snapPublic.status === 'fulfilled') {
                    snapPublic.value.docs.forEach(d => allDocs.push(d));
                } else {
                    console.warn("ListSearch: Error fetching public lists", snapPublic.reason);
                }

                const uniqueLists = new Map<string, any>();
                allDocs.forEach(d => {
                    if (!uniqueLists.has(d.id)) {
                        const data = d.data();

                        // Strict filter for Archives as requested
                        const nameLower = data.name.toLowerCase();
                        if (nameLower === 'quiero ir' || nameLower === 'ya fui') return;
                        // Filter out archives check.
                        // Relying primarily on 'type' field if it exists.
                        if (data.type === 'archive') return;

                        uniqueLists.set(d.id, { id: d.id, ...data });
                    }
                });

                // Calculate Initial Context Scores (Suggestions)
                const keywords = new Set<string>();
                if (placeTypes) placeTypes.forEach(t => t.split('_').forEach(w => keywords.add(w.toLowerCase())));
                if (placeName) placeName.split(' ').forEach(w => keywords.add(w.toLowerCase()));

                const processed: EnrichedList[] = Array.from(uniqueLists.values()).map(data => {
                    let score = 0;
                    const listNameLower = data.name.toLowerCase();

                    // Boost if suggested explicitly
                    let isSuggested = false;
                    if (suggestedListIds && suggestedListIds.includes(data.id)) {
                        score += 500;
                        isSuggested = true;
                    }

                    keywords.forEach(kw => {
                        if (kw.length > 2 && listNameLower.includes(kw)) {
                            score += 10;
                        }
                    });

                    return {
                        id: data.id,
                        name: data.name,
                        parentListId: data.parentListId,
                        parentListName: data.parentListId ? uniqueLists.get(data.parentListId)?.name : undefined,
                        score,
                        isSuggested
                    };
                });

                // Initial Sort: Score DESC, Name ASC
                processed.sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    return a.name.localeCompare(b.name);
                });

                setLists(processed);

                // Auto-select if only 1 list and nothing selected
                if (!selectedListId && processed.length === 1) {
                    onSelect(processed[0].id);
                }

            } catch (e: any) {
                console.error("Error fetching lists", e);
                setError(e.message || "Error cargando listas");
            } finally {
                setLoading(false);
            }
        };
        fetchLists();
    }, [user, placeName, placeTypes, suggestedListIds]);

    // Handle Open/Close & Focus
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm(''); // Reset search on close
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    // Selected Display Data
    const selectedList = lists.find(l => l.id === selectedListId);

    // Robust Searching / Filtering Logic
    const normalize = (value: string) => value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const filteredLists = useMemo(() => {
        if (!searchTerm.trim()) return lists;

        const lowerTerm = normalize(searchTerm);
        const terms = lowerTerm.split(' ').filter(t => t.length > 0);

        // Score based on search match
        const searchScored = lists.map(list => {
            let searchScore = 0;
            const nameLower = normalize(list.name);

            // Check each search term
            terms.forEach(term => {
                if (nameLower === term) searchScore += 100; // Exact match
                else if (nameLower.startsWith(term)) searchScore += 50; // Starts with
                else if (nameLower.includes(term)) searchScore += 20; // Contains
                else {
                    // Fuzzy check? (Simple typo tolerance for now omitted to keep it fast, but partial match is usually enough)
                }
            });

            if (list.parentListName && normalize(list.parentListName).includes(lowerTerm)) searchScore += 5; // Match parent name

            return { ...list, searchScore };
        });

        const matches = searchScored.filter(l => l.searchScore > 0);

        // Sort by search relevance
        matches.sort((a, b) => b.searchScore - a.searchScore);

        return matches;
    }, [lists, searchTerm]);

    const suggestions = filteredLists.filter(l => l.score > 0 && !searchTerm); // Show context suggestions only when NOT searching manually
    const others = filteredLists.filter(l => !suggestions.includes(l));

    return (
        <div className="relative font-sans" ref={containerRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-[var(--lt-card-strong)] border rounded-xl p-3 flex items-center justify-between transition-all group ${isOpen ? 'border-[var(--lt-accent-border)] ring-1 ring-[var(--lt-accent)]' : 'border-white/10 hover:border-white/20'
                    }`}
            >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-lg transition-colors ${selectedListId
                        ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]'
                        : 'bg-gray-700/50 text-gray-500 group-hover:text-gray-400'
                        }`}>
                        <ListIcon className="w-5 h-5" />
                    </div>

                    <div className="flex flex-col items-start truncate">
                        <span className={`font-bold truncate w-full text-left ${selectedList ? 'text-white' : 'text-gray-400'}`}>
                            {selectedList ? selectedList.name : 'Seleccionar Lista...'}
                        </span>
                        {selectedList?.parentListName && (
                            <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                <div className="w-1 h-1 rounded-full bg-gray-600"></div>
                                en {selectedList.parentListName}
                            </span>
                        )}
                    </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--lt-card-strong)] border border-white/10 rounded-xl shadow-2xl z-[50] max-h-[300px] flex flex-col animate-in fade-in zoom-in-95 duration-100 overflow-hidden">

                    {/* Search Header */}
                    <div className="p-2 border-b border-white/5 bg-[var(--lt-bg)]/50 sticky top-0 z-10">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar lista..."
                                className="w-full bg-[var(--lt-card-strong)] border border-white/10 rounded-lg pl-9 pr-8 py-2 text-sm text-white focus:outline-none focus:border-[var(--lt-accent-border)] transition-colors placeholder:text-gray-500"
                                onClick={(e) => e.stopPropagation()}
                            />
                            {searchTerm && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSearchTerm(''); searchInputRef.current?.focus(); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* List Content */}
                    <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                        {loading ? (
                            <div className="p-6 flex justify-center">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--lt-accent-border)]"></div>
                            </div>
                        ) : error ? (
                            <div className="p-4 text-center bg-red-500/10 m-2 rounded-lg">
                                <p className="text-red-400 text-xs font-bold mb-1">Error de conexión</p>
                                <p className="text-red-300/80 text-[10px] break-words">{error}</p>
                            </div>
                        ) : filteredLists.length === 0 ? (
                            <div className="p-6 text-center">
                                <p className="text-gray-500 text-sm mb-3">No se encontraron listas.</p>
                                <button
                                    onClick={() => navigate('/create')}
                                    className="px-4 py-2 bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] hover:bg-[var(--lt-accent)] hover:text-white rounded-lg text-xs font-bold transition-all"
                                >
                                    Crear "{searchTerm || 'Nueva Lista'}"
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {/* Suggestions */}
                                {suggestions.length > 0 && (
                                    <div className="mb-2">
                                        <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-[var(--lt-accent)] tracking-wider flex items-center gap-1 bg-[var(--lt-accent-soft)] mx-1 rounded">
                                            <Sparkles className="w-3 h-3" />
                                            Sugeridas
                                        </div>
                                        {suggestions.map(list => (
                                            <ListItem
                                                key={list.id}
                                                list={list}
                                                isSelected={selectedListId === list.id}
                                                onSelect={(id) => { onSelect(id); setIsOpen(false); }}
                                            />
                                        ))}
                                        <div className="h-px bg-white/5 my-2 mx-2" />
                                    </div>
                                )}

                                {/* Others / Search Results */}
                                {(suggestions.length > 0 ? others : filteredLists).map(list => (
                                    <ListItem
                                        key={list.id}
                                        list={list}
                                        isSelected={selectedListId === list.id}
                                        onSelect={(id) => { onSelect(id); setIsOpen(false); }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Fixed Footer for Creation */}
                    {!searchTerm && !error && (
                        <div className="p-2 border-t border-white/5 bg-[var(--lt-bg)]/30">
                            <button
                                onClick={() => navigate('/create')}
                                className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                                Crear Nueva Lista
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const ListItem = ({ list, isSelected, onSelect }: { list: EnrichedList, isSelected: boolean, onSelect: (id: string) => void }) => (
    <button
        type="button"
        onClick={() => onSelect(list.id)}
        className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between group transition-colors ${isSelected ? 'bg-[var(--lt-accent-soft)] text-[var(--lt-accent)]' : 'hover:bg-white/5 text-gray-300'
            }`}
    >
        <div className="min-w-0 pr-2">
            <div className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-100' : 'text-gray-200 group-hover:text-white'}`}>
                {list.name}
            </div>
            {list.parentListName && (
                <div className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                    <span className="opacity-50">en</span>
                    <span className="text-gray-400">{list.parentListName}</span>
                </div>
            )}
        </div>
        {isSelected && <Check className="w-4 h-4 text-[var(--lt-accent)] shrink-0" />}
        {!isSelected && list.isSuggested && (
            <span className="text-[10px] bg-[var(--lt-accent-soft)] text-[var(--lt-accent)] px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">
                Ya en lista
            </span>
        )}
    </button>
);
