import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { useLists } from '../hooks/useLists';
import { useReviews } from '../hooks/useReviews';
import { Settings, Calendar, Users as UsersIcon, List as ListIcon, Star, UserPlus, UserCheck, MessageCircle, Power, MapPin as MapPinIcon } from 'lucide-react';
import { doc, setDoc, deleteDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { signOut } from 'firebase/auth';
import { ReviewCard } from '../components/ReviewCard';
import { ChatService } from '../services/ChatService';
import { FollowingSection } from '../components/profile/FollowingSection';

export const ProfilePage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { userId: paramUserId } = useParams<{ userId: string }>();
    const [activeTab, setActiveTab] = useState<'lists' | 'reviews' | 'following'>('reviews');
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editRange, setEditRange] = useState<string>('50'); // Default to 50 if undefined
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    // Determine target user ID
    const targetUserId = paramUserId || user?.uid;
    const isOwnProfile = user?.uid === targetUserId;

    // Hooks
    const { profile, loading: loadingProfile, error: errorProfile } = useUserProfile(targetUserId);
    const { lists, loading: loadingLists } = useLists('recent', targetUserId);
    const { reviews: fetchedReviews, loading: loadingReviews } = useReviews({ type: 'recent', userId: targetUserId });
    const [localReviews, setLocalReviews] = useState<any[]>([]);

    const mainLists = lists.filter(l => !l.parentListId);
    const subLists = lists.filter(l => !!l.parentListId);

    useEffect(() => {
        if (fetchedReviews) {
            setLocalReviews(fetchedReviews);
        }
    }, [fetchedReviews]);

    const handleDeleteReview = (id: string) => {
        setLocalReviews(prev => prev.filter(r => r.id !== id));
    };

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

    // Image Upload Handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const processFile = async (file: File) => {
        if (!user) return;
        if (!file.type.startsWith('image/')) {
            alert("Solo se permiten archivos de imagen");
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert("La imagen no debe superar los 5MB");
            return;
        }

        setUploading(true);
        try {
            const storageRef = ref(storage, `profile_images/${user.uid}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            await setDoc(doc(db, 'users', user.uid), {
                photoUrl: downloadURL
            }, { merge: true });

            // Reload to show changes (simple approach)
            window.location.reload();
        } catch (error) {
            console.error("Error uploading image:", error);
            alert("Error al subir la imagen");
        } finally {
            setUploading(false);
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

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

            const currentUserRef = doc(db, 'users', user.uid);
            const targetUserRef = doc(db, 'users', targetUserId);

            if (isFollowing) {
                await deleteDoc(followingRef);
                await deleteDoc(followerRef); // Should ideally be server-side for security/consistency

                // Decrement counters
                await updateDoc(currentUserRef, { followingCount: increment(-1) });
                await updateDoc(targetUserRef, { followersCount: increment(-1) });

                setIsFollowing(false);
            } else {
                await setDoc(followingRef, {
                    uid: targetUserId,
                    followedAt: new Date(),
                    // Store basic info to avoid extra fetches on feed
                    displayName: profile?.displayName || profile?.username,
                    photoUrl: profile?.photoUrl
                });
                await setDoc(followerRef, {
                    uid: user.uid,
                    followedAt: new Date()
                });

                // Increment counters
                await updateDoc(currentUserRef, { followingCount: increment(1) });
                await updateDoc(targetUserRef, { followersCount: increment(1) });

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
                {isOwnProfile && (
                    <div className="absolute top-24 right-4 flex items-center gap-2 z-20">
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className="p-2 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-md transition-all border border-white/10"
                            title="Preferencias"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={async () => {
                                await signOut(auth);
                                navigate('/login');
                            }}
                            className="p-2 text-white/70 hover:text-red-400 bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-md transition-all border border-white/10"
                            title="Cerrar Sesión"
                        >
                            <Power className="w-5 h-5" />
                        </button>
                    </div>
                )}
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

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-gray-400">
                            {/* Followers */}
                            <div className="flex flex-col items-center md:items-start">
                                <span className="text-white font-bold text-lg">{profile.followersCount || 0}</span>
                                <span className="text-xs">Seguidores</span>
                            </div>

                            <div className="w-px h-8 bg-white/10 mx-2"></div>

                            {/* Reviews */}
                            <div className="flex flex-col items-center md:items-start">
                                <span className="text-white font-bold text-lg">{profile.reviewsCount || 0}</span>
                                <span className="text-xs">Reseñas</span>
                            </div>

                            <div className="w-px h-8 bg-white/10 mx-2"></div>

                            {/* Following Groups */}
                            <div className="flex gap-6">
                                <div className="flex flex-col items-center md:items-start" title="Usuarios seguidos">
                                    <span className="text-white font-bold text-lg">{profile.followingUsersCount || profile.followingCount || 0}</span>
                                    <span className="text-xs flex items-center gap-1"><UsersIcon className="w-3 h-3" /> Usuarios seguidos</span>
                                </div>
                                <div className="flex flex-col items-center md:items-start" title="Listas seguidas">
                                    <span className="text-white font-bold text-lg">{profile.followingListsCount || 0}</span>
                                    <span className="text-xs flex items-center gap-1"><ListIcon className="w-3 h-3" /> Listas seguidas</span>
                                </div>
                                <div className="flex flex-col items-center md:items-start" title="Lugares guardados/seguidos">
                                    <span className="text-white font-bold text-lg">{profile.followingPlacesCount || 0}</span>
                                    <span className="text-xs flex items-center gap-1"><MapPinIcon className="w-3 h-3" /> Lugares seguidos</span>
                                </div>
                            </div>
                        </div>

                        {profile.createdAt && (
                            <div className="mt-4 flex justify-center md:justify-start text-xs text-gray-500">
                                <span className="flex items-center gap-2">
                                    <Calendar className="w-3 h-3" />
                                    Miembro desde {new Date((profile.createdAt as any).seconds * 1000).getFullYear()}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 mb-4 md:mb-2 w-full md:w-auto justify-center">
                        {isOwnProfile ? (
                            // Settings moved to top right
                            null
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
                    <div className="bg-[#151b2e] border border-white/10 rounded-xl p-6 mb-8 animate-fade-in space-y-6">

                        {/* Avatar Settings */}
                        <div>
                            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                <UsersIcon className="w-4 h-4 text-indigo-400" /> Avatar
                            </h3>
                            <div className="flex flex-col gap-4">
                                <div className="flex gap-4">
                                    {/* Google Option */}
                                    <button
                                        onClick={async () => {
                                            if (!user.photoURL) return;
                                            try {
                                                await setDoc(doc(db, 'users', user.uid), {
                                                    photoUrl: user.photoURL
                                                }, { merge: true });
                                                // Force reload profile by relying on useUserProfile effect or optimistic update
                                                // Ideally we'd have a refresh function from the hook, but let's just wait for real-time listener or effect
                                                window.location.reload();
                                            } catch (e) {
                                                console.error("Error setting Google photo", e);
                                            }
                                        }}
                                        className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${profile.photoUrl === user.photoURL
                                            ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500'
                                            : 'bg-black/20 border-white/10 hover:border-white/30'
                                            }`}
                                    >
                                        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                                            {user.photoURL ? (
                                                <img src={user.photoURL} alt="Google" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-gray-700"></div>
                                            )}
                                        </div>
                                        <span className="text-xs font-bold text-gray-300">Google</span>
                                    </button>

                                    {/* Custom Option / Drag & Drop Zone */}
                                    <div
                                        className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all relative overflow-hidden group ${profile.photoUrl !== user.photoURL
                                            ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500'
                                            : 'bg-black/20 border-white/10 hover:border-white/30'
                                            } ${dragActive ? 'border-dashed border-indigo-400 bg-indigo-500/10' : ''}`}
                                        onDragEnter={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDragOver={handleDrag}
                                        onDrop={handleDrop}
                                        onClick={() => document.getElementById('file-upload')?.click()}
                                    >
                                        <input
                                            type="file"
                                            id="file-upload"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => e.target.files && e.target.files[0] && processFile(e.target.files[0])}
                                        />

                                        {uploading ? (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                            </div>
                                        ) : null}

                                        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 grayscale group-hover:grayscale-0 transition-all">
                                            <img src={profile.photoUrl || `https://ui-avatars.com/api/?name=${profile.displayName}`} alt="Custom" className="w-full h-full object-cover" />
                                        </div>
                                        <span className="text-xs font-bold text-gray-300">
                                            {dragActive ? 'Suelta aquí' : 'Personal'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-gray-400 text-xs uppercase font-bold">O arrastra tu imagen aquí</label>
                                    <p className="text-[10px] text-gray-500">
                                        Haz clic en "Personal" o arrastra una imagen para subirla. Máx 5MB.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Search Preferences */}
                        <div>
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
                                        <option value="2">2 km</option>
                                        <option value="5">5 km</option>
                                        <option value="10">10 km</option>
                                        <option value="50">50 km</option>
                                        <option value="100">100 km</option>
                                        <option value="500">500 km</option>
                                        <option value="999999">Sin límite</option>
                                    </select>
                                </div>
                                <p className="text-[10px] text-gray-500 mt-1">Este rango se aplicará automáticamente cuando inicies nueva sesión.</p>
                                <button
                                    onClick={savePreferences}
                                    className="mt-2 w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg"
                                >
                                    Guardar Preferencias
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs Navigation */}
                <div className="flex gap-8 border-b border-white/10 mb-8 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('reviews')}
                        className={`pb-4 px-2 font-bold text-sm flex items-center gap-2 transition-colors relative ${activeTab === 'reviews' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <Star className="w-4 h-4" /> Reseñas ({localReviews.length})
                        {activeTab === 'reviews' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('lists')}
                        className={`pb-4 px-2 font-bold text-sm flex items-center gap-2 transition-colors relative ${activeTab === 'lists' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <ListIcon className="w-4 h-4" /> Listas ({lists.length})
                        {activeTab === 'lists' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('following')}
                        className={`pb-4 px-2 font-bold text-sm flex items-center gap-2 transition-colors relative ${activeTab === 'following' ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        <UserCheck className="w-4 h-4" /> Siguiendo ({profile.followingCount || 0})
                        {activeTab === 'following' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-full" />}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="min-h-[300px]">
                    {activeTab === 'reviews' && (
                        <>
                            {loadingReviews ? (
                                <div className="py-20 text-center text-gray-500">Cargando reseñas...</div>
                            ) : localReviews.length === 0 ? (
                                <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-xl">
                                    <p className="text-gray-500">No hay reseñas recientes.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {localReviews.map(review => (
                                        <ReviewCard key={review.id} review={review} onDelete={handleDeleteReview} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'lists' && (
                        <>
                            {loadingLists ? (
                                <div className="py-20 text-center text-gray-500">Cargando listas...</div>
                            ) : (
                                <div className="space-y-12">
                                    {/* Created Lists Section */}
                                    <section>
                                        <h3 className="text-lg font-bold text-white mb-4 pl-2 border-l-4 border-indigo-500">Mis Listas Publicadas</h3>
                                        {mainLists.length === 0 ? (
                                            <div className="py-8 text-center border border-dashed border-white/5 rounded-xl bg-white/5">
                                                <p className="text-gray-500 text-sm">No hay listas principales creadas aún.</p>
                                                {isOwnProfile && (
                                                    <Link to="/create" className="text-indigo-400 hover:underline text-sm mt-2 block">Crear mi primera lista</Link>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {mainLists.map(list => (
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

                                    {/* Sublists Section - Only show if there are sublists */}
                                    {subLists.length > 0 && (
                                        <section>
                                            <h3 className="text-lg font-bold text-white mb-4 pl-2 border-l-4 border-indigo-500">Mis Sublistas</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {subLists.map(list => (
                                                    <Link key={list.id} to={`/list/${list.id}`} className="block group">
                                                        <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all h-full flex flex-col opacity-80 hover:opacity-100">
                                                            <div className="h-32 bg-gray-800 relative">
                                                                {list.photoUrl ? (
                                                                    <img src={list.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                        <ListIcon className="w-8 h-8 text-gray-600" />
                                                                    </div>
                                                                )}
                                                                <div className="absolute top-2 left-2 bg-indigo-600/90 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider">
                                                                    Sublista
                                                                </div>
                                                            </div>
                                                            <div className="p-3 flex-1 flex flex-col">
                                                                <h3 className="text-white font-bold text-sm mb-1 truncate">{list.name}</h3>
                                                                <div className="flex justify-between items-center text-[10px] text-gray-500 mt-auto">
                                                                    <span>{list.itemCount || 0} items</span>
                                                                    {list.createdAt && <span>{new Date((list.createdAt as any).seconds * 1000).toLocaleDateString()}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'following' && (
                        <FollowingSection targetUserId={targetUserId} />
                    )}
                </div>
            </div>
        </div >
    );
};
