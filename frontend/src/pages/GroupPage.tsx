import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, doc, getDoc, collectionGroup } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, MessageSquare, MapPin, List as ListIcon, Plus, X, Camera, Bookmark, Share2 } from 'lucide-react';
import { ReviewCard } from '../components/ReviewCard';
import { AddReviewForm } from '../components/AddReviewForm';
import { SaveToArchiveModal } from '../components/SaveToArchiveModal';
import { ShareModal } from '../components/ShareModal';
import { type ReviewEntity } from '../hooks/useListDetails';

// Helper for Criteria Colors
const getScoreColor = (score: number) => {
    if (score >= 9) return 'from-emerald-400 to-emerald-600';
    if (score >= 7) return 'from-indigo-400 to-indigo-600';
    if (score >= 5) return 'from-yellow-400 to-yellow-600';
    return 'from-red-400 to-red-600';
};

// Simple List Selector Component
const ListSelector = ({ onSelect, onCancel }: { onSelect: (listId: string) => void, onCancel: () => void }) => {
    const { user } = useAuth();
    const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLists = async () => {
            if (!user) return;
            try {
                const q = query(collection(db, 'lists'), where('ownerId', '==', user.uid));
                const snap = await getDocs(q);
                setLists(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
            } catch (e) {
                console.error("Error fetching user lists", e);
            } finally {
                setLoading(false);
            }
        };
        fetchLists();
    }, [user]);

    if (loading) return <div className="p-4 text-center text-gray-400">Cargando tus listas...</div>;

    return (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#151b2e] rounded-xl w-full max-w-sm border border-white/10 shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0b1021]/50">
                    <h3 className="font-bold text-white">Guardar en Lista</h3>
                    <button onClick={onCancel}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
                </div>
                <div className="p-2 overflow-y-auto max-h-60 custom-scrollbar">
                    {lists.length > 0 ? lists.map(list => (
                        <button
                            key={list.id}
                            onClick={() => onSelect(list.id)}
                            className="w-full text-left p-3 hover:bg-white/5 rounded-lg text-gray-300 hover:text-white transition-colors flex items-center gap-3"
                        >
                            <div className="w-8 h-8 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                <ListIcon className="w-4 h-4" />
                            </div>
                            <span className="font-bold truncate">{list.name}</span>
                        </button>
                    )) : (
                        <div className="p-4 text-center text-gray-500">
                            No tienes listas creadas.
                            <Link to="/create" className="block text-indigo-400 mt-2 font-bold hover:underline">Crear Lista Nueva</Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const GroupPage: React.FC = () => {
    const { placeId, itemName } = useParams<{ placeId: string; itemName: string }>();
    const decodedName = decodeURIComponent(itemName || '');

    const [reviews, setReviews] = useState<ReviewEntity[]>([]);
    const [placeName, setPlaceName] = useState('');
    const [loading, setLoading] = useState(true);

    // Navigation Context
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const fromListId = searchParams.get('listId');
    const [fromListName, setFromListName] = useState('');

    useEffect(() => {
        if (fromListId) {
            getDoc(doc(db, 'lists', fromListId)).then(s => {
                if (s.exists()) setFromListName(s.data().name);
            });
        }
    }, [fromListId]);

    // Logic for "Valorar"
    const [isFlowOpen, setIsFlowOpen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!placeId || !decodedName) return;
            setLoading(true);
            try {
                console.log("Fetching Group Data for:", { placeId, decodedName });

                // Try strict query first
                let feats: ReviewEntity[] = [];
                try {
                    const q = query(
                        collectionGroup(db, 'reviews'),
                        where('placeId', '==', placeId),
                        where('itemName', '==', decodedName),
                        orderBy('createdAt', 'desc')
                    );
                    const snap = await getDocs(q);
                    feats = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ReviewEntity[];
                    console.log("Strict Query Results:", feats.length);
                } catch (idxError) {
                    console.warn("Strict query failed (possible missing index), falling back to client-side filter", idxError);
                }

                // Fallback: If strict query gave 0 or failed, fetch all reviews for place and filter
                if (feats.length === 0) {
                    const fallbackQ = query(
                        collectionGroup(db, 'reviews'),
                        where('placeId', '==', placeId)
                    );
                    const fallbackSnap = await getDocs(fallbackQ);
                    const allPlaceReviews = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ReviewEntity[];
                    console.log("Fallback: All Place Reviews:", allPlaceReviews.length);
                    // Loose match (ignore case/trim)
                    feats = allPlaceReviews.filter(r =>
                        r.itemName?.toLowerCase().trim() === decodedName.toLowerCase().trim()
                    );
                    console.log("Fallback: Filtered Matches:", feats.length);
                }

                setReviews(feats);

                const pSnap = await getDoc(doc(db, 'places', placeId));
                if (pSnap.exists()) {
                    setPlaceName(pSnap.data().name);
                }
            } catch (error) {
                console.error("Error fetching group data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [placeId, decodedName]);

    // Aggregate Stats (Overall + Criteria)
    const stats = useMemo(() => {
        if (!reviews.length) return null;

        const total = reviews.reduce((acc, r) => acc + (r.overallRating || 0), 0);

        // Aggregate Criteria Scores
        const criteriaSums: Record<string, number> = {};
        const criteriaCounts: Record<string, number> = {};
        const labels: Record<string, string> = {};

        reviews.forEach(r => {
            if (r.scores) {
                Object.entries(r.scores).forEach(([k, v]) => {
                    criteriaSums[k] = (criteriaSums[k] || 0) + v;
                    criteriaCounts[k] = (criteriaCounts[k] || 0) + 1;
                    if (r.criteriaDefinition?.[k]?.label) labels[k] = r.criteriaDefinition[k].label;
                });
            }
        });

        const criteria = Object.keys(criteriaSums).map(k => ({
            key: k,
            label: labels[k] || k,
            avg: criteriaSums[k] / criteriaCounts[k],
            count: criteriaCounts[k]
        })).sort((a, b) => b.avg - a.avg);

        // Collect Photos
        const photos = reviews.map(r => r.photoUrl).filter(Boolean) as string[];

        return {
            avg: total / reviews.length,
            count: reviews.length,
            mainPhoto: photos[0],
            photos, // All photos
            criteria
        };
    }, [reviews]);

    // Aggregate Lists
    const relatedLists = useMemo(() => {
        return [...new Set(reviews.map(r => r.listId).filter(Boolean))];
    }, [reviews]);

    const [listsDetails, setListsDetails] = useState<{ id: string, name: string, author: string }[]>([]);

    // List Comparison States
    const [listStats, setListStats] = useState<Record<string, number> | null>(null);
    const [primaryListName, setPrimaryListName] = useState('');

    // Fetch Details for Related Lists
    useEffect(() => {
        const fetchListDetails = async () => {
            const details: any[] = [];
            for (const lid of relatedLists.slice(0, 5)) {
                try {
                    const s = await getDoc(doc(db, 'lists', lid));
                    if (s.exists()) details.push({ id: lid, name: s.data().name, author: s.data().authorName });
                } catch (e) { }
            }
            setListsDetails(details);
        };
        if (relatedLists.length > 0) fetchListDetails();
    }, [relatedLists]);

    // Fetch Stats for Primary Comparison List
    useEffect(() => {
        const fetchListStats = async () => {
            if (relatedLists.length === 0) return;
            const primaryId = relatedLists[0]; // Pick the first list

            try {
                // Get List Name
                const lSnap = await getDoc(doc(db, 'lists', primaryId));
                if (lSnap.exists()) setPrimaryListName(lSnap.data().name);

                // Get All Reviews for this List to calculate averages
                const q = query(collectionGroup(db, 'reviews'), where('listId', '==', primaryId));
                const snap = await getDocs(q);
                const lReviews = snap.docs.map(d => d.data() as ReviewEntity);

                if (lReviews.length === 0) return;

                const avgs: Record<string, number> = {};
                const counts: Record<string, number> = {};

                lReviews.forEach(r => {
                    if (r.scores) {
                        Object.entries(r.scores).forEach(([k, v]) => {
                            avgs[k] = (avgs[k] || 0) + v;
                            counts[k] = (counts[k] || 0) + 1;
                        });
                    }
                });

                Object.keys(avgs).forEach(k => {
                    avgs[k] = avgs[k] / (counts[k] || 1);
                });

                setListStats(avgs);

            } catch (e) {
                console.error("Error fetching comparison stats", e);
            }
        };
        fetchListStats();
    }, [relatedLists]);


    if (loading) {
        return (
            <div className="min-h-screen pt-32 flex justify-center bg-[#0b1021]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0b1021] pb-20">
            {/* Hero */}
            <div className="relative h-[400px] w-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-[#0b1021]/60 to-black/40 z-10" />
                {stats?.mainPhoto ? (
                    <img src={stats.mainPhoto} className="w-full h-full object-cover opacity-80" alt={decodedName} />
                ) : (
                    <div className="w-full h-full bg-gray-800" />
                )}

                <div className="absolute top-24 left-4 z-20 flex flex-col items-start gap-2">
                    {fromListId && (
                        <Link to={`/list/${fromListId}`} className="inline-flex items-center text-white hover:text-white transition-colors bg-indigo-600/90 backdrop-blur-md px-4 py-2 rounded-full text-sm font-bold border border-white/20 hover:scale-105 shadow-xl">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Volver a {fromListName || 'Lista'}
                        </Link>
                    )}
                    <Link to={`/place/${placeId}`} className={`inline-flex items-center text-white/80 hover:text-white transition-colors bg-black/40 backdrop-blur-md px-4 py-2 rounded-full text-sm font-medium border border-white/10 hover:border-white/30 ${fromListId ? 'text-xs py-1.5 px-3 opacity-80' : ''}`}>
                        {fromListId ? <MapPin className="w-3 h-3 mr-1.5" /> : <ArrowLeft className="w-4 h-4 mr-2" />}
                        {fromListId ? 'Ver Lugar' : 'Volver al Lugar'}
                    </Link>
                </div>

                <div className="absolute bottom-0 left-0 w-full p-4 sm:p-8 z-20">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border border-white/20 bg-white/10 text-gray-200 backdrop-blur-sm">
                                        Plato Destacado
                                    </span>
                                </div>
                                <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-2 shadow-sm text-shadow-lg">{decodedName}</h1>
                                <Link to={`/place/${placeId}`} className="text-xl text-indigo-300 hover:text-white flex items-center gap-2 font-medium">
                                    <MapPin className="w-5 h-5 opacity-70" />
                                    {placeName || 'Lugar Desconocido'}
                                </Link>
                            </div>

                            {stats && (
                                <div className="flex items-center gap-4 bg-black/50 backdrop-blur-md p-4 rounded-xl border border-white/10">
                                    <div className="text-center">
                                        <div className="text-4xl font-bold text-emerald-400">{stats.avg.toFixed(1)}</div>
                                        <div className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Media</div>
                                    </div>
                                    <div className="w-px h-10 bg-white/20 mx-2" />
                                    <div>
                                        <div className="flex items-center gap-2 text-white font-bold">
                                            <MessageSquare className="w-4 h-4 text-gray-400" />
                                            {stats.count}
                                        </div>
                                        <div className="text-xs text-gray-400">Opiniones</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-4xl mx-auto px-4 pt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Main Content: Reviews */}
                <div className="md:col-span-2 space-y-8">

                    {/* Photo Grid */}
                    {stats && stats.photos.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                                <Camera className="w-5 h-5 text-indigo-500" />
                                Fotos de la Comunidad ({stats.photos.length})
                            </h2>
                            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide snap-x">
                                {stats.photos.map((url, i) => (
                                    <div key={i} className="flex-shrink-0 w-32 h-32 rounded-lg overflow-hidden border border-white/10 snap-start">
                                        <img src={url} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" alt={`Foto ${i}`} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Detailed Criteria Scores (Moved to Main) */}
                    {stats && stats.criteria.length > 0 && (
                        <div className="bg-[#151b2e] rounded-xl border border-white/10 p-5 mb-8">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/5 pb-2 flex justify-between items-center">
                                <span>Puntuaciones Detalladas</span>
                                {listStats && primaryListName && (
                                    <span className="text-[10px] text-gray-500 normal-case font-normal flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-white/30"></span> Media de "{primaryListName}"
                                    </span>
                                )}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                                {stats.criteria.map((c, i) => {
                                    const listAvg = listStats?.[c.key];
                                    return (
                                        <div key={i}>
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="text-gray-400 text-xs font-medium">{c.label}</span>
                                                <div className="flex items-center gap-2">
                                                    {listAvg && (
                                                        <span className="text-[10px] text-gray-500 font-mono" title={`Media de la lista: ${listAvg.toFixed(1)}`}>
                                                            (L: {listAvg.toFixed(1)})
                                                        </span>
                                                    )}
                                                    <span className="text-emerald-400 font-bold font-mono text-sm">{c.avg.toFixed(1)}</span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                                                {/* List Avg Marker */}
                                                {listAvg && (
                                                    <div
                                                        className="absolute top-0 bottom-0 w-1 bg-white/40 z-10 shadow-[0_0_4px_rgba(255,255,255,0.5)]"
                                                        style={{ left: `${Math.min(listAvg * 10, 100)}%` }}
                                                    />
                                                )}

                                                <div
                                                    className={`h-full rounded-full bg-gradient-to-r ${getScoreColor(c.avg)}`}
                                                    style={{ width: `${c.avg * 10}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center pb-4 border-b border-white/10">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-indigo-500" />
                            Opiniones ({reviews.length})
                        </h2>
                        <button
                            onClick={() => setIsFlowOpen(true)}
                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-transform hover:scale-105"
                        >
                            <Plus className="w-4 h-4" />
                            Valorar
                        </button>
                    </div>

                    {reviews.length > 0 ? (
                        <div className="space-y-6">
                            {reviews.map(review => (
                                <ReviewCard key={review.id} review={review} />
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 bg-[#151b2e] rounded-xl border border-white/10 text-center">
                            <h3 className="text-lg font-bold text-white mb-2">Sé el primero en opinar</h3>
                            <p className="text-gray-400 mb-6 text-sm">Nadie ha escrito una reseña detallada sobre este plato aún.</p>
                            <p className="text-[10px] text-gray-600 font-mono mb-4">Debug: "{decodedName}" @ {placeId}</p>
                            <button
                                onClick={() => setIsFlowOpen(true)}
                                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold transition-all"
                            >
                                Añadir Reseña
                            </button>
                        </div>
                    )}
                </div>

                {/* Sidebar: Details & Lists */}
                <div className="space-y-6">

                    {/* Actions */}
                    <div className="bg-[#151b2e] p-3 rounded-xl border border-white/10 grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setIsSaveModalOpen(true)}
                            className="flex flex-col items-center justify-center p-3 rounded-xl border border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all gap-1"
                        >
                            <Bookmark className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Guardar</span>
                        </button>
                        <button
                            onClick={() => setIsShareModalOpen(true)}
                            className="flex flex-col items-center justify-center p-3 rounded-xl border border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all gap-1"
                        >
                            <Share2 className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Compartir</span>
                        </button>
                    </div>



                    {/* Lists */}
                    <div className="bg-[#151b2e] rounded-xl border border-white/10 p-5 hidden md:block">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/5 pb-2">
                            Aparece en {relatedLists.length} Listas
                        </h3>
                        {listsDetails.length > 0 ? (
                            <div className="space-y-3">
                                {listsDetails.map(l => (
                                    <Link key={l.id} to={`/list/${l.id}`} className="block group">
                                        <div className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors">
                                            <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-500 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                                <ListIcon className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-gray-200 font-bold text-sm truncate group-hover:text-indigo-400 transition-colors">{l.name}</div>
                                                <div className="text-xs text-gray-500 truncate">Por {l.author || 'Usuario'}</div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-gray-500 text-xs italic">Cargando listas...</div>
                        )}
                    </div>
                </div>
            </main>

            {/* Modals */}
            {isFlowOpen && !selectedListId && (
                <ListSelector
                    onSelect={(lid) => setSelectedListId(lid)}
                    onCancel={() => setIsFlowOpen(false)}
                />
            )}
            {isFlowOpen && selectedListId && (
                <AddReviewForm
                    listId={selectedListId}
                    prefillPlaceId={placeId}
                    prefillItemName={decodedName}
                    onClose={() => {
                        setIsFlowOpen(false);
                        setSelectedListId(null);
                    }}
                    onSuccess={() => window.location.reload()}
                />
            )}

            <SaveToArchiveModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                item={{
                    itemId: `${placeId}_${decodedName}`, // Composite ID for group
                    type: 'group',
                    name: decodedName,
                    subtitle: placeName,
                    route: `/group/${placeId}/${encodeURIComponent(decodedName)}`,
                    photoUrl: stats?.mainPhoto,
                    placeId: placeId
                }}
            />

            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                title={`Compartir ${decodedName}`}
                text={`¡Mira lo que dicen sobre ${decodedName} en ${placeName}!`}
            />
        </div>
    );
};
