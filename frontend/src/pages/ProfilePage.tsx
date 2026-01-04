import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { useLists } from '../hooks/useLists';
import { useReviews } from '../hooks/useReviews';
import { Settings, Calendar, Users as UsersIcon, List as ListIcon, Star, UserPlus, UserCheck, MessageCircle } from 'lucide-react';
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ReviewCard } from '../components/ReviewCard';
import { ChatService } from '../services/ChatService';

export const ProfilePage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { userId: paramUserId } = useParams<{ userId: string }>();
    const [activeTab, setActiveTab] = useState<'lists' | 'reviews'>('reviews');
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editRange, setEditRange] = useState<string>('50'); // Default to 50 if undefined

    // Determine target user ID
    const targetUserId = paramUserId || user?.uid;
    const isOwnProfile = user?.uid === targetUserId;

    // Hooks
    const { profile, loading: loadingProfile, error: errorProfile } = useUserProfile(targetUserId);
    const { lists, loading: loadingLists } = useLists('recent', targetUserId);
    const { reviews, loading: loadingReviews } = useReviews({ type: 'recent', userId: targetUserId });

    // Check Follow Status
    useEffect(() => {
        if (!user || isOwnProfile || !targetUserId) return;

        const checkFollow = async () => {
            const docRef = doc(db, 'users', user.uid, 'following', targetUserId);
            const snap = await getDoc(docRef);
            setIsFollowing(snap.exists());
        };
        checkFollow();
    }, [user, targetUserId, isOwnProfile]);

    useEffect(() => {
        if (profile?.defaultDistanceKm) {
            setEditRange(String(profile.defaultDistanceKm));
        }
    }, [profile]);

    const savePreferences = async () => {
        if (!user) return;
        try {
            const val = parseInt(editRange);
            await setDoc(doc(db, 'users', user.uid), {
                defaultDistanceKm: isNaN(val) ? 50 : val
            }, { merge: true });

            // Update session too if generic
            sessionStorage.removeItem('sessionRange');

            setIsEditing(false);
        } catch (err) {
            console.error("Error saving preferences:", err);
            alert("Error al guardar preferencias");
        }
    };

    const handleMessage = async () => {
        if (!user || !targetUserId) return;
        try {
            const chatId = await ChatService.createPrivateChat(user.uid, targetUserId);
            navigate(`/chats/${chatId}`);
        } catch (error) {
            console.error("Error creating chat:", error);
        }
    };

    const handleFollowToggle = async () => {
        if (!user || !targetUserId) return;
        setFollowLoading(true);
        try {
            const followingRef = doc(db, 'users', user.uid, 'following', targetUserId);
            const followerRef = doc(db, 'users', targetUserId, 'followers', user.uid);

            if (isFollowing) {
                await deleteDoc(followingRef);
                await deleteDoc(followerRef); // Should ideally be server-side for security/consistency
                setIsFollowing(false);
            } else {
                await setDoc(followingRef, {
                    uid: targetUserId,
                    followedAt: new Date(),
                    // Store basic info to avoid extra fetches on feed
                    displayName: profile?.displayName || profile?.username,
                    photoUrl: profile?.photoUrl
                });
                // This part is insecure if rules strictly forbid writing to others' subcollections, 
                // but often 'followers' is writable by authenticated users in social apps prototype.
                // Otherwise, Cloud Function is needed.
                await setDoc(followerRef, {
                    uid: user.uid,
                    followedAt: new Date()
                });
                setIsFollowing(true);
            }
        } catch (error) {
            console.error("Follow error:", error);
            alert("Error al seguir/dejar de seguir. Inténtalo de nuevo.");
        } finally {
            setFollowLoading(false);
        }
    };

    if (!targetUserId) {
        return (
            <div className="min-h-screen pt-40 px-4 text-center text-gray-400">
                Debes iniciar sesión para ver tu perfil.
            </div>
        );
    }

    if (loadingProfile) {
        return (
            <div className="min-h-screen pt-32 text-center text-gray-500">
                Cargando perfil...
            </div>
        );
    }

    if (errorProfile || !profile) {
        return (
            <div className="min-h-screen pt-40 px-4 text-center">
                <div className="text-2xl text-white font-bold mb-4">Perfil no encontrado</div>
                <p className="text-gray-400">El usuario que buscas no existe o ha sido eliminado.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0b1021] pb-20">
            {/* Header / Banner */}
            <div className={`h-64 relative bg-gradient-to-b from-indigo-900/40 to-[#0b1021] ${profile.photoUrl ? 'bg-cover bg-center' : ''}`} style={profile.photoUrl ? { backgroundImage: `linear-gradient(to bottom, rgba(11,16,33,0.3), #0b1021), url(${profile.photoUrl})` } : {}}>
                <div className="absolute inset-0 bg-[#0b1021]/60 blur-xl"></div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 relative -mt-32 z-10">
                <div className="flex flex-col md:flex-row items-end gap-6 mb-8">
                    {/* Avatar */}
                    <div className="w-40 h-40 rounded-full bg-[#0b1021] p-2 shrink-0">
                        <div className="w-full h-full rounded-full bg-gray-700 overflow-hidden border-4 border-[#151b2e] shadow-2xl relative group">
                            <img
                                src={profile.photoUrl || `https://ui-avatars.com/api/?name=${profile.displayName || profile.username || 'User'}`}
                                alt={profile.username}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 w-full text-center md:text-left mb-2">
                        <h1 className="text-3xl font-bold text-white mb-2 flex flex-col md:flex-row items-center md:items-end gap-2 md:gap-4">
                            {profile.displayName || profile.username || 'Usuario'}
                            <span className="text-lg text-indigo-400 font-normal">@{profile.username || 'user'}</span>
                        </h1>
                        <p className="text-gray-400 mb-6 max-w-lg mx-auto md:mx-0 leading-relaxed">
                            {profile.bio || "Sin biografía..."}
                        </p>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 text-sm text-gray-500">
                            <span className="flex items-center gap-2 text-white font-bold">
                                {profile.followersCount || 0} <span className="text-gray-500 font-normal">Seguidores</span>
                            </span>
                            <span className="flex items-center gap-2 text-white font-bold">
                                {profile.followingCount || 0} <span className="text-gray-500 font-normal">Siguiendo</span>
                            </span>
                            {profile.createdAt && (
                                <span className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Miembro desde {new Date((profile.createdAt as any).seconds * 1000).getFullYear()}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 mb-4 md:mb-2 w-full md:w-auto justify-center">
                        {isOwnProfile ? (
                            <button
                                onClick={() => isEditing ? savePreferences() : setIsEditing(true)}
                                className={`px-6 py-2 rounded-lg text-white border transition-colors flex items-center gap-2 ${isEditing ? 'bg-indigo-600 border-indigo-600 hover:bg-indigo-500' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}
                            >
                                <Settings className="w-4 h-4" />
                                {isEditing ? 'Guardar Preferencias' : 'Preferencias'}
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleFollowToggle}
                                    disabled={followLoading}
                                    className={`px-6 py-2 rounded-lg border font-bold transition-all flex items-center gap-2 ${isFollowing
                                        ? 'bg-transparent border-white/20 text-white hover:border-red-500 hover:text-red-500'
                                        : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-500'
                                        }`}
                                >
                                    {isFollowing ? (
                                        <><UserCheck className="w-4 h-4" /> Siguiendo</>
                                    ) : (
                                        <><UserPlus className="w-4 h-4" /> Seguir</>
                                    )}
                                </button>
                                <button
                                    onClick={handleMessage}
                                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Preferences Form */}
                {isEditing && isOwnProfile && (
                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6 mb-8 animate-fade-in">
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            <Settings className="w-4 h-4 text-indigo-400" /> Preferencias de Búsqueda
                        </h3>
                        <div className="flex flex-col gap-2 max-w-xs">
                            <label className="text-gray-400 text-xs uppercase font-bold">Rango de distancia por defecto</label>
                            <div className="flex items-center gap-3">
                                <select
                                    value={editRange}
                                    onChange={(e) => setEditRange(e.target.value)}
                                    className="bg-black/20 border border-white/10 rounded-lg text-white px-3 py-2 outline-none focus:border-indigo-500 w-full"
                                >
                                    <option value="1">1 km</option>
                                    <option value="5">5 km</option>
                                    <option value="10">10 km</option>
                                    <option value="25">25 km</option>
                                    <option value="50">50 km</option>
                                    <option value="100">100 km</option>
                                    <option value="999999">Sin límite</option>
                                </select>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">Este rango se aplicará automáticamente cuando inicies nueva sesión.</p>
                        </div>
                    </div>
                )}

                {/* Tabs Navigation */}
                <div className="flex gap-8 border-b border-white/10 mb-8 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('lists')}
                        className={`pb-4 px-2 font-bold text-sm flex items-center gap-2 transition-colors relative ${activeTab === 'lists' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <ListIcon className="w-4 h-4" /> Listas ({lists.length})
                        {activeTab === 'lists' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('reviews')}
                        className={`pb-4 px-2 font-bold text-sm flex items-center gap-2 transition-colors relative ${activeTab === 'reviews' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <Star className="w-4 h-4" /> Reseñas ({reviews.length})
                        {activeTab === 'reviews' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="min-h-[300px]">
                    {activeTab === 'lists' ? (
                        <>
                            {loadingLists ? (
                                <div className="py-20 text-center text-gray-500">Cargando listas...</div>
                            ) : (
                                <div className="space-y-12">
                                    {/* Created Lists Section */}
                                    <section>
                                        <h3 className="text-lg font-bold text-white mb-4 pl-2 border-l-4 border-indigo-500">Creadas</h3>
                                        {lists.length === 0 ? (
                                            <div className="py-8 text-center border border-dashed border-white/5 rounded-xl bg-white/5">
                                                <p className="text-gray-500 text-sm">No hay listas creadas aún.</p>
                                                {isOwnProfile && (
                                                    <Link to="/create" className="text-indigo-400 hover:underline text-sm mt-2 block">Crear mi primera lista</Link>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {lists.map(list => (
                                                    <Link key={list.id} to={`/list/${list.id}`} className="block group">
                                                        <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all h-full flex flex-col">
                                                            <div className="h-40 bg-gray-800 relative">
                                                                {list.photoUrl ? (
                                                                    <img src={list.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                        <ListIcon className="w-10 h-10 text-gray-600" />
                                                                    </div>
                                                                )}
                                                                {list.avgScore ? <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs font-bold text-white">⭐ {list.avgScore.toFixed(1)}</div> : null}
                                                                {(list as any).parentListId && (
                                                                    <div className="absolute bottom-2 left-2 bg-indigo-600/90 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider">
                                                                        Sublista
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="p-4 flex-1 flex flex-col">
                                                                <h3 className="text-white font-bold text-lg mb-1 truncate">{list.name}</h3>
                                                                <p className="text-gray-500 text-xs mb-3 flex-1 line-clamp-2">{list.description}</p>
                                                                <div className="flex justify-between items-center text-xs text-gray-400 mt-2 pt-2 border-t border-white/5">
                                                                    <span>{list.itemCount || 0} lugares</span>
                                                                    {list.createdAt && <span>{new Date((list.createdAt as any).seconds * 1000).toLocaleDateString()}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    {/* Liked/Followed Lists Section */}
                                    <section>
                                        <h3 className="text-lg font-bold text-white mb-4 pl-2 border-l-4 border-pink-500">Siguiendo</h3>
                                        {/* <FollowedListsSection targetUserId={targetUserId} /> */}
                                        <p className="text-gray-500 text-sm">Próximamente...</p>
                                    </section>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {loadingReviews ? (
                                <div className="py-20 text-center text-gray-500">Cargando reseñas...</div>
                            ) : reviews.length === 0 ? (
                                <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-xl">
                                    <p className="text-gray-500">No hay reseñas recientes.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {reviews.map(review => (
                                        <ReviewCard key={review.id} review={review} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
