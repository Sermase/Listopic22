import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { useLists } from '../hooks/useLists';
import { useReviews } from '../hooks/useReviews';
import { Settings, Calendar, Users as UsersIcon, List as ListIcon, Star, UserPlus, UserCheck, MessageCircle, Power, MapPin as MapPinIcon, Bug, Flag, MoreVertical } from 'lucide-react';
import { ReportModal } from '../components/ReportModal';
import { doc, setDoc, deleteDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { signOut } from 'firebase/auth';
import { ReviewCard } from '../components/ReviewCard';
import { ChatService } from '../services/ChatService';
import { FollowingSection } from '../components/profile/FollowingSection';
import { BadgeDisplay } from '../components/profile/BadgeDisplay';
import { collection, query, where, getDocs, limit, documentId, FieldPath } from 'firebase/firestore';

// Helper Component for List Cards
const ListGrid = ({ lists, emptyMessage, isSublist = false }: { lists: any[], emptyMessage: string, isSublist?: boolean }) => {
    if (lists.length === 0) {
        return (
            <div className="py-8 text-center border border-dashed border-white/5 rounded-xl bg-white/5">
                <p className="text-gray-500 text-sm">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lists.map(list => (
                <Link key={list.id} to={`/list/${list.id}`} className="block group">
                    <div className="bg-[#151b2e] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all h-full flex flex-col opacity-90 hover:opacity-100">
                        <div className={`${isSublist ? 'h-32' : 'h-40'} bg-gray-800 relative`}>
                            {list.photoUrl ? (
                                <img src={list.photoUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                    <ListIcon className={`${isSublist ? 'w-8 h-8' : 'w-10 h-10'} text-gray-600`} />
                                </div>
                            )}
                            {isSublist && (
                                <div className="absolute top-2 left-2 bg-indigo-600/90 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider">
                                    Sublista
                                </div>
                            )}
                            {!list.isPublic && (
                                <div className="absolute top-2 right-2 bg-red-500/90 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1">
                                    Privada
                                </div>
                            )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                            <h3 className="text-white font-bold text-lg mb-1 truncate">{list.name}</h3>
                            <p className="text-gray-500 text-xs mb-3 flex-1 line-clamp-2">{list.description}</p>
                            <div className="flex justify-between items-center text-xs text-gray-400 mt-2 pt-2 border-t border-white/5">
                                <span>{list.itemCount || 0} lugares</span>
                                {list.ownerName && <span className="text-indigo-400">de {list.ownerName}</span>}
                            </div>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
};

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
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);

    // Determine target user ID
    const targetUserId = paramUserId || user?.uid;
    const isOwnProfile = user?.uid === targetUserId;

    // Hooks
    const { profile, loading: loadingProfile, error: errorProfile } = useUserProfile(targetUserId);
    const { lists: ownedLists, loading: loadingLists } = useLists('recent', targetUserId, isOwnProfile); // Pass isOwnProfile to include private
    const { reviews: fetchedReviews, loading: loadingReviews } = useReviews({ type: 'recent', userId: targetUserId });
    const [localReviews, setLocalReviews] = useState<any[]>([]);

    // Additional List States
    const [guestLists, setGuestLists] = useState<any[]>([]);
    const [followedLists, setFollowedLists] = useState<any[]>([]);
    const [loadingExtraLists, setLoadingExtraLists] = useState(false);

    // Derived Lists
    const mainCreatedLists = ownedLists.filter(l => !l.parentListId);
    const subCreatedLists = ownedLists.filter(l => !!l.parentListId);

    const mainFollowedLists = followedLists.filter(l => !l.parentListId);
    const subFollowedLists = followedLists.filter(l => !!l.parentListId);

    // Fetch Guest & Followed Lists
    useEffect(() => {
        if (!targetUserId) return;

        const fetchExtra = async () => {
            setLoadingExtraLists(true);
            try {
                // 1. Guest Lists (Where I am an editor)
                // Note: 'editors' array-contains query
                // FIX: Only fetch guest lists if viewing own profile to avoid permission errors (can't query private lists of others)
                // or ensure we rely on Algolia for complex search. For now, strict check.
                let validGuest: any[] = [];
                if (isOwnProfile) {
                    try {
                        const qGuest = query(collection(db, 'lists'), where('editors', 'array-contains', targetUserId), limit(20));
                        const snapGuest = await getDocs(qGuest);
                        validGuest = snapGuest.docs.map(d => ({ id: d.id, ...d.data() }));
                    } catch (e: any) {
                        console.warn("Guest lists query failed (likely missing index or permission)", e);
                        // Don't crash, just empty
                    }
                }
                setGuestLists(validGuest);

                // 2. Followed Lists (From 'followingLists' subcollection)
                const qFollowed = query(collection(db, 'users', targetUserId, 'followingLists'));
                const snapFollowed = await getDocs(qFollowed);

                if (!snapFollowed.empty) {
                    const followedIds = snapFollowed.docs.map(d => d.id);
                    // Fetch full details for the first 20 to check isPublic/parentListId
                    // Firestore 'in' query supports max 10/30 depending on version. 10 safe.
                    // We'll batch or just fetch individual if few.
                    const chunks = [];
                    for (let i = 0; i < followedIds.length; i += 10) {
                        chunks.push(followedIds.slice(i, i + 10));
                    }

                    let allFollowedDetails: any[] = [];
                    for (const chunk of chunks) {
                        try {
                            // Only fetch PUBLIC lists to avoid permission errors.
                            // If a user follows a private list, it won't be shown here, which is standard behavior
                            // unless we implement a specific 'sharedWithMe' check.
                            const qDetails = query(
                                collection(db, 'lists'),
                                where(documentId(), 'in', chunk),
                                where('isPublic', '==', true)
                            );
                            const capsShot = await getDocs(qDetails);
                            allFollowedDetails.push(...capsShot.docs.map(d => ({ id: d.id, ...d.data() })));
                        } catch (chunkError) {
                            console.warn("Error fetching chunk of lists", chunkError);
                        }
                    }

                    // Filter Privacy
                    // If viewing another profile, only show their followed lists if those lists are PUBLIC.
                    // Private lists followed by someone else shouldn't be exposed details unless viewer has access.
                    // We'll stick to isPublic == true.
                    // Also filter out any that failed to fetch (deleted).
                    const validFollowed = allFollowedDetails.filter(l => l.isPublic || (user && (l.userId === user.uid || l.editors?.includes(user.uid))));
                    setFollowedLists(validFollowed);
                } else {
                    setFollowedLists([]);
                }

            } catch (e) {
                console.error("Error fetching extra lists", e);
            } finally {
                setLoadingExtraLists(false);
            }
        };

        fetchExtra();
    }, [targetUserId, isOwnProfile, user]);

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
            // We do NOT write to the target user's 'followers' collection nor update their counts client-side.
            // This is now handled by the backend trigger 'onUserFollowingWrite' in 'functions/modules/social.js'
            // to ensure security and consistency.

            if (isFollowing) {
                // 1. Unfollow (Trigger delete)
                await deleteDoc(followingRef);
                setIsFollowing(false);
            } else {
                // 1. Follow (Trigger create)
                await setDoc(followingRef, {
                    uid: targetUserId,
                    followedAt: new Date(),
                    // Optional: Store snapshot for optimistic feed rendering
                    displayName: profile?.displayName || profile?.username,
                    photoUrl: profile?.photoUrl
                });
                setIsFollowing(true);
            }
        } catch (error) {
            console.error("Follow error:", error);
            alert("Error al seguir/dejar de seguir. Inténtalo de nuevo.");
            setIsFollowing(!isFollowing); // Revert optimistic UI if failed
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
                <div className="absolute inset-0 bg-[#0b1021]/60 blur-xl"></div>
                {/* Removed top-right buttons from here */}
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 relative -mt-32 z-10">
                {/* TOP SECTION: Avatar + Identity + Desktop Actions */}
                <div className="flex flex-row items-end gap-4 md:gap-8 mb-6">
                    {/* Avatar (Left) */}
                    <div className="group relative shrink-0">
                        <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full bg-[#0b1021] p-1.5 md:p-2">
                            <div className="w-full h-full rounded-full bg-gray-700 overflow-hidden border-4 border-[#151b2e] shadow-2xl relative">
                                <img
                                    src={profile.photoUrl || `https://ui-avatars.com/api/?name=${profile.displayName || profile.username || 'User'}`}
                                    alt={profile.username}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Identity (Right of Avatar) */}
                    <div className="flex-1 min-w-0 pb-1 md:pb-4 flex flex-col justify-end">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                            <div>
                                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight flex flex-col md:flex-row md:items-end gap-1 md:gap-3">
                                    <span className="truncate">{profile.displayName || profile.username || 'Usuario'}</span>
                                    {profile.username && <span className="text-base sm:text-lg text-indigo-400 font-normal truncate">@{profile.username}</span>}
                                </h1>
                            </div>

                            {/* DESKTOP ACTIONS */}
                            <div className="hidden md:flex items-center gap-3">
                                {isOwnProfile ? (
                                    <div className="flex items-center gap-2">
                                        {((Array.isArray(profile.userType) && profile.userType.includes('jefe')) || profile.userType === 'jefe') && (
                                            <Link to="/developer" className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                                                <Bug className="w-5 h-5" />
                                            </Link>
                                        )}
                                        <button onClick={() => setIsEditing(!isEditing)} className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                                            <Settings className="w-5 h-5" />
                                        </button>
                                        <button onClick={async () => { await signOut(auth); navigate('/login'); }} className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                            <Power className="w-5 h-5" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleFollowToggle}
                                            disabled={followLoading}
                                            className={`px-6 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${isFollowing
                                                ? 'bg-[#151b2e] border border-white/20 text-white hover:border-red-500 hover:text-red-500'
                                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
                                                }`}
                                        >
                                            {isFollowing ? <><UserCheck className="w-4 h-4" /> Siguiendo</> : <><UserPlus className="w-4 h-4" /> Seguir</>}
                                        </button>
                                        <button
                                            onClick={handleMessage}
                                            className="px-4 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-white hover:bg-white/10 transition-colors shadow-lg"
                                        >
                                            <MessageCircle className="w-5 h-5" />
                                        </button>

                                        <div className="relative">
                                            <button
                                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                                className="px-3 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                            >
                                                <MoreVertical className="w-5 h-5" />
                                            </button>
                                            {isMenuOpen && (
                                                <div className="absolute right-0 mt-2 w-48 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden animate-fade-in z-50 origin-top-right">
                                                    <button
                                                        onClick={() => { setIsMenuOpen(false); setShowReportModal(true); }}
                                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                                                    >
                                                        <Flag className="w-4 h-4" /> Reportar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* BIO + MOBILE ACTIONS + STATS */}
                <div className="space-y-6 md:space-y-8">
                    {/* Bio */}
                    {profile.bio && (
                        <p className="text-gray-400 text-sm max-w-2xl leading-relaxed">
                            {profile.bio}
                        </p>
                    )}

                    {/* MOBILE ACTIONS */}
                    <div className="md:hidden flex items-center gap-3">
                        {isOwnProfile ? (
                            <div className="flex items-center gap-2 w-full">
                                {((Array.isArray(profile.userType) && profile.userType.includes('jefe')) || profile.userType === 'jefe') && (
                                    <Link to="/developer" className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-indigo-400">
                                        <Bug className="w-5 h-5" />
                                    </Link>
                                )}
                                <button onClick={() => setIsEditing(!isEditing)} className="flex-1 p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 text-sm font-bold">
                                    Editar Perfil
                                </button>
                                <button onClick={async () => { await signOut(auth); navigate('/login'); }} className="p-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-300 text-red-400">
                                    <Power className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 w-full">
                                <button
                                    onClick={handleFollowToggle}
                                    disabled={followLoading}
                                    className={`flex-1 px-4 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${isFollowing
                                        ? 'bg-[#151b2e] border border-white/20 text-white'
                                        : 'bg-indigo-600 text-white'
                                        }`}
                                >
                                    {isFollowing ? 'Siguiendo' : 'Seguir'}
                                </button>
                                <button
                                    onClick={handleMessage}
                                    className="px-4 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-white shadow-lg"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                </button>
                                <div className="relative">
                                    <button
                                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                                        className="px-3 py-2.5 rounded-xl bg-[#151b2e] border border-white/10 text-gray-400"
                                    >
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                    {isMenuOpen && (
                                        <div className="absolute right-0 mt-2 w-48 bg-[#151b2e] border border-white/10 rounded-xl shadow-2xl py-1 z-50">
                                            <button
                                                onClick={() => { setIsMenuOpen(false); setShowReportModal(true); }}
                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 flex items-center gap-2"
                                            >
                                                <Flag className="w-4 h-4" /> Reportar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* DASHBOARD CARD: STATS + LEVEL */}
                    <div className="bg-[#151b2e] border border-white/5 rounded-2xl p-4 md:p-6 mb-6">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-2 md:gap-8 mb-4 md:mb-6">
                            {[
                                { label: 'Seguidores', value: profile.followersCount || 0 },
                                { label: 'Reseñas', value: profile.reviewsCount || 0 },
                                { label: 'Usuarios', value: profile.followingUsersCount || profile.followingCount || 0, icon: UsersIcon },
                                { label: 'Listas', value: profile.followingListsCount || 0, icon: ListIcon }
                            ].map((stat, i) => (
                                <div key={i} className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 md:bg-transparent md:p-0">
                                    <span className="text-white font-bold text-lg md:text-2xl mb-1">{stat.value}</span>
                                    <span className="text-[9px] md:text-xs text-gray-400 uppercase tracking-wider text-center flex flex-col md:flex-row items-center gap-1">
                                        {stat.icon && <stat.icon className="w-3 h-3 md:w-4 md:h-4 mb-0.5 md:mb-0" />}
                                        {stat.label}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Level Bar (Full Width in Card) */}
                        {(() => {
                            const xp = profile.xp || 0;
                            const level = Math.floor(Math.sqrt(xp / 50)) + 1;
                            const nextLevelXp = 50 * Math.pow(level, 2);
                            const currentLevelBaseXp = 50 * Math.pow(level - 1, 2);
                            const progress = Math.min(100, Math.max(0, ((xp - currentLevelBaseXp) / (nextLevelXp - currentLevelBaseXp)) * 100));

                            return (
                                <div className="flex items-center gap-3 relative">
                                    <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center font-bold text-white text-sm shadow-lg border border-[#151b2e] z-10">
                                        {level}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-end mb-1.5">
                                            <span className="text-[10px] font-bold text-gray-400 tracking-wider">NIVEL {level}</span>
                                            <span className="text-[10px] text-amber-500 font-mono font-bold">{Math.floor(xp)} / {nextLevelXp} XP</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* BADGES SECTION */}
                    {profile.badges && profile.badges.length > 0 && (
                        <div className="pt-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Star className="w-3 h-3 text-amber-500" /> Medallas
                            </h3>
                            <BadgeDisplay earnedBadgeIds={profile.badges?.map((b: any) => typeof b === 'string' ? b : b.id) || []} />
                        </div>
                    )}

                    {profile.createdAt && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            Miembro desde {new Date((profile.createdAt as any).seconds * 1000).getFullYear()}
                        </div>
                    )}
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
                                            if (!user?.photoURL) return;
                                            try {
                                                await setDoc(doc(db, 'users', user!.uid), {
                                                    photoUrl: user!.photoURL
                                                }, { merge: true });
                                                // Force reload profile by relying on useUserProfile effect or optimistic update
                                                // Ideally we'd have a refresh function from the hook, but let's just wait for real-time listener or effect
                                                window.location.reload();
                                            } catch (e) {
                                                console.error("Error setting Google photo", e);
                                            }
                                        }}
                                        className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${profile.photoUrl === user?.photoURL
                                            ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500'
                                            : 'bg-black/20 border-white/10 hover:border-white/30'
                                            }`}
                                    >
                                        <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                                            {user?.photoURL ? (
                                                <img src={user.photoURL} alt="Google" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-gray-700"></div>
                                            )}
                                        </div>
                                        <span className="text-xs font-bold text-gray-300">Google</span>
                                    </button>

                                    {/* Custom Option / Drag & Drop Zone */}
                                    <div
                                        className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-2 transition-all relative overflow-hidden group ${profile.photoUrl !== user?.photoURL
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
                        <ListIcon className="w-4 h-4" /> Listas ({ownedLists.length + guestLists.length + followedLists.length})
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
                            {loadingLists || loadingExtraLists ? (
                                <div className="py-20 text-center text-gray-500">Cargando listas...</div>
                            ) : (
                                <div className="space-y-16">

                                    {/* 1. Created Lists */}
                                    <section>
                                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                                            Listas Creadas
                                        </h3>
                                        <ListGrid
                                            lists={mainCreatedLists}
                                            emptyMessage="No hay listas públicas creadas aún."
                                        />
                                    </section>

                                    {/* 2. Created Sublists */}
                                    {subCreatedLists.length > 0 && (
                                        <section>
                                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                                <span className="w-1.5 h-6 bg-purple-500 rounded-full"></span>
                                                Sublistas Creadas
                                            </h3>
                                            <ListGrid
                                                lists={subCreatedLists}
                                                emptyMessage="No hay sublistas."
                                                isSublist={true}
                                            />
                                        </section>
                                    )}

                                    {/* 3. Guest Lists */}
                                    {guestLists.length > 0 && (
                                        <section>
                                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                                <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                                                Listas como Invitado / Editor
                                            </h3>
                                            <ListGrid
                                                lists={guestLists}
                                                emptyMessage="No participas en ninguna lista."
                                            />
                                        </section>
                                    )}

                                    {/* 4. Followed Lists */}
                                    {mainFollowedLists.length > 0 && (
                                        <section>
                                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                                <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                                                Listas Seguidas
                                            </h3>
                                            <ListGrid
                                                lists={mainFollowedLists}
                                                emptyMessage="No sigues ninguna lista."
                                            />
                                        </section>
                                    )}

                                    {/* 5. Followed Sublists */}
                                    {subFollowedLists.length > 0 && (
                                        <section>
                                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                                <span className="w-1.5 h-6 bg-teal-500 rounded-full"></span>
                                                Sublistas Seguidas
                                            </h3>
                                            <ListGrid
                                                lists={subFollowedLists}
                                                emptyMessage="No sigues ninguna sublista."
                                                isSublist={true}
                                            />
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


            <ReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                targetId={targetUserId!}
                targetName={profile.displayName || profile.username || 'Usuario'}
                targetType="user"
                itemName="Perfil de Usuario"
            />
        </div >
    );
};
