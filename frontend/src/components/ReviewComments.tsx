import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Send, Trash2 } from 'lucide-react';
import { useAuthPrompt } from '../context/AuthPromptContext';

interface Comment {
    id: string;
    userId: string;
    userName: string;
    userPhoto?: string;
    text: string;
    createdAt: any;
}

interface ReviewCommentsProps {
    listId: string;
    reviewId: string;
    placeId?: string;
    onClose?: () => void;
    onCommentChange?: (increment: number) => void;
}

export const ReviewComments: React.FC<ReviewCommentsProps> = ({ listId, reviewId, placeId, onClose, onCommentChange }) => {
    const { user } = useAuth();
    const { openAuthPrompt } = useAuthPrompt();
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [pageSize, setPageSize] = useState(20);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        if (!listId || !reviewId) return;

        // Path: lists/{listId}/reviews/{reviewId}/comments
        // Query newest-first with a hard limit; we reverse in memory for chronological display.
        const q = query(
            collection(db, 'lists', listId, 'reviews', reviewId, 'comments'),
            orderBy('createdAt', 'desc'),
            limit(pageSize)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
            setComments(docs.reverse());
            setHasMore(snapshot.size >= pageSize);
        });
        return () => unsubscribe();
    }, [listId, reviewId, pageSize]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !user || !listId || !reviewId) return;

        setSubmitting(true);
        try {
            const userProfileSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
            const userProfile = userProfileSnap && userProfileSnap.exists() ? userProfileSnap.data() : null;
            const commentAuthorName = typeof userProfile?.username === 'string' && userProfile.username.trim()
                ? userProfile.username.trim()
                : (user.displayName || 'Usuario');
            const commentAuthorPhoto = (userProfile && typeof userProfile.photoUrl === 'string' && userProfile.photoUrl.trim())
                ? userProfile.photoUrl.trim()
                : (user.photoURL || null);

            await addDoc(collection(db, 'lists', listId, 'reviews', reviewId, 'comments'), {
                userId: user.uid,
                userName: commentAuthorName,
                userPhoto: commentAuthorPhoto,
                text: newComment.trim(),
                createdAt: serverTimestamp()
            });
            setNewComment('');
            if (onCommentChange) onCommentChange(1);
        } catch (error) {
            console.error("Error posting comment:", error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!confirm("¿Borrar comentario?") || !listId || !reviewId) return;
        try {
            await deleteDoc(doc(db, 'lists', listId, 'reviews', reviewId, 'comments', commentId));
            if (onCommentChange) onCommentChange(-1);
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="bg-[var(--lt-bg)]/50 border-t border-white/5 p-4 animate-in slide-in-from-top-2 duration-200">
            {/* List */}
            <div className="space-y-4 mb-4 max-h-60 overflow-y-auto custom-scrollbar">
                {comments.length === 0 && (
                    <p className="text-gray-500 text-xs text-center italic">Sé el primero en comentar...</p>
                )}
                {hasMore && (
                    <button
                        type="button"
                        onClick={() => setPageSize(prev => prev + 20)}
                        className="w-full text-[11px] text-gray-400 hover:text-gray-200 py-1 transition-colors"
                    >
                        Cargar comentarios anteriores
                    </button>
                )}
                {comments.map(comment => (
                    <div key={comment.id} className="flex gap-3 group">
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/10">
                            <img src={comment.userPhoto || `https://ui-avatars.com/api/?name=${comment.userName}`} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1">
                            <div className="bg-white/5 rounded-2xl rounded-tl-none p-3 relative">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-xs text-gray-300">{comment.userName}</span>
                                    {comment.createdAt && (
                                        <span className="text-[10px] text-gray-600">
                                            {formatDistanceToNow(comment.createdAt?.toDate ? comment.createdAt.toDate() : new Date(), { locale: es })}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-200">{comment.text}</p>

                                {user?.uid === comment.userId && (
                                    <button
                                        onClick={() => handleDelete(comment.id)}
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            {user ? (
                <form onSubmit={handleSubmit} className="flex gap-2 relative">
                    <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Escribe un comentario..."
                        className="flex-1 bg-black/20 border border-white/10 rounded-full px-4 py-2 text-sm text-white outline-none focus:border-[var(--lt-accent-border)] transition-colors"
                        disabled={submitting}
                    />
                    <button
                        type="submit"
                        disabled={!newComment.trim() || submitting}
                        className="p-2 bg-[var(--lt-accent)] rounded-full text-white disabled:opacity-50 hover:bg-[var(--lt-accent)] transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            ) : (
                <button
                    type="button"
                    onClick={() => openAuthPrompt('comentar esta reseña')}
                    className="w-full rounded-full border border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)] px-4 py-2 text-sm font-bold text-[var(--lt-accent)] transition-colors hover:bg-[var(--lt-accent)]/20"
                >
                    Inicia sesión para comentar
                </button>
            )}
        </div>
    );
};
