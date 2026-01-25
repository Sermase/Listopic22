import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where, documentId } from 'firebase/firestore';
import { db } from '../../firebase';
import { Users, List as ListIcon, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FollowingSectionProps {
    targetUserId: string;
}

export const FollowingSection: React.FC<FollowingSectionProps> = ({ targetUserId }) => {
    const [subTab, setSubTab] = useState<'users' | 'lists' | 'places'>('users');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchItems = async () => {
            setLoading(true);
            setItems([]);
            try {
                let collectionName = '';
                let targetCollection = '';

                if (subTab === 'users') { collectionName = 'following'; targetCollection = 'users'; }
                else if (subTab === 'lists') { collectionName = 'followingLists'; targetCollection = 'lists'; }
                else if (subTab === 'places') { collectionName = 'followingPlaces'; targetCollection = 'places'; }

                // 1. Get IDs from the "following" subcollection
                const qIds = query(collection(db, 'users', targetUserId, collectionName));
                const snapIds = await getDocs(qIds);

                if (snapIds.empty) {
                    setItems([]);
                    return;
                }

                const ids = snapIds.docs.map(d => d.id); // The doc ID in subcollection is usually the Entity ID

                // 2. Fetch full details (Batching by 10 due to 'in' query limits)
                // Note: Firestore 'in' limit is 10 or 30 depending on client. 10 is safe.
                const chunks = [];
                for (let i = 0; i < ids.length; i += 10) {
                    chunks.push(ids.slice(i, i + 10));
                }

                const fetchedItems: any[] = [];

                for (const chunk of chunks) {
                    try {
                        const qDetails = query(
                            collection(db, targetCollection),
                            where(documentId(), 'in', chunk)
                        );
                        const snapDetails = await getDocs(qDetails);
                        fetchedItems.push(...snapDetails.docs.map(d => ({ id: d.id, ...d.data() })));
                    } catch (e) {
                        console.warn(`Error fetching chunk for ${targetCollection}`, e);
                    }
                }

                // If fetching places, they might be in 'places' collection or might need Google Sync. 
                // Assuming they are cached in 'places' collection for now.

                setItems(fetchedItems);

            } catch (err) {
                console.error("Error fetching following items", err);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, [subTab, targetUserId]);

    return (
        <div className="animate-fade-in">
            {/* Sub-tabs Pills */}
            <div className="flex gap-4 mb-6">
                <button
                    onClick={() => setSubTab('users')}
                    className={`px-4 py-2 rounded-full text-xs font-bold border transition-all flex items-center gap-2 ${subTab === 'users' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                >
                    <Users className="w-3 h-3" /> Usuarios
                </button>
                <button
                    onClick={() => setSubTab('lists')}
                    className={`px-4 py-2 rounded-full text-xs font-bold border transition-all flex items-center gap-2 ${subTab === 'lists' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                >
                    <ListIcon className="w-3 h-3" /> Listas
                </button>
                <button
                    onClick={() => setSubTab('places')}
                    className={`px-4 py-2 rounded-full text-xs font-bold border transition-all flex items-center gap-2 ${subTab === 'places' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                >
                    <MapPin className="w-3 h-3" /> Lugares
                </button>
            </div>

            {/* List */}
            {loading ? (
                <div className="py-20 text-center text-gray-500">Cargando...</div>
            ) : items.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-white/5 rounded-xl bg-white/5">
                    <p className="text-gray-400 mb-1">Nada por aquí.</p>
                    <p className="text-xs text-gray-600">No sigues {subTab === 'users' ? 'usuarios' : subTab === 'lists' ? 'listas' : 'lugares'} todavía.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map(item => (
                        <Link
                            key={item.id}
                            to={subTab === 'users' ? `/profile/${item.id}` : subTab === 'lists' ? `/list/${item.id}` : `/place/${item.id}`}
                            className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all group flex flex-col"
                        >
                            <div className="h-32 bg-gray-800 relative">
                                <img
                                    src={item.photoUrl || item.placePhoto || item.mainImageUrl || `https://ui-avatars.com/api/?name=${item.name || item.displayName || item.placeName || '?'}`}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                            </div>
                            <div className="p-3">
                                <h4 className="text-white font-bold text-sm truncate">{item.displayName || item.name || item.placeName || 'Sin nombre'}</h4>
                                <p className="text-gray-500 text-[10px] truncate">
                                    {subTab === 'users' && `@${item.username || 'user'}`}
                                    {subTab === 'lists' && (item.itemCount !== undefined ? `${item.itemCount} items` : 'Lista')}
                                    {subTab === 'places' && (item.placeAddress || item.address || item.vicinity || 'Lugar')}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};
