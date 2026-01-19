import React from 'react';
import { X, MessageSquare, Copy } from 'lucide-react';

import type { PlaceDetails } from '../hooks/usePlaceDetails';
import { ShareCard } from './ShareCard';
import type { ReviewEntity } from '../hooks/useListDetails';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    url?: string;
    text?: string;
    place?: PlaceDetails; // Optional place data for generating card
    review?: ReviewEntity; // Optional review data for generating card
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, title = "Compartir", url = window.location.href, text = "", place, review }) => {
    const shareCardTriggerRef = React.useRef<() => void>(() => { });

    if (!isOpen) return null;

    const handleShare = (platform: 'whatsapp' | 'clipboard' | 'image') => {
        const fullText = text ? `${text} ${url}` : url;

        if (platform === 'whatsapp') {
            window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank');
        } else if (platform === 'clipboard') {
            navigator.clipboard.writeText(fullText);
            // Ideally show a toast here, but simple alert for now if needed or just close
            onClose();
        } else if (platform === 'image') {
            if (place || review) {
                shareCardTriggerRef.current();
                // We don't close immediately as generation takes a sec. ShareCard handles its own flow/modals.
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            {/* Share Card Hidden Component (Mounted but off-screen if place is present) */}
            {(place || review) && <ShareCard place={place} review={review} triggerRef={shareCardTriggerRef} />}

            <div className="bg-[#151b2e] rounded-2xl w-full max-w-sm border border-white/10 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => handleShare('whatsapp')}
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/20 transition-all"
                    >
                        <MessageSquare className="w-8 h-8 mb-2" />
                        <span className="font-bold">WhatsApp</span>
                    </button>
                    <button
                        onClick={() => handleShare('clipboard')}
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
                    >
                        <Copy className="w-8 h-8 mb-2" />
                        <span className="font-bold">Copiar</span>
                    </button>
                    {(place || review) && (
                        <button
                            onClick={() => handleShare('image')}
                            className="col-span-2 flex flex-row items-center justify-center p-4 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all gap-3"
                        >
                            <div className="bg-indigo-500/20 p-2 rounded-lg">
                                {/* Simple Image Icon */}
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                            </div>
                            <div className="flex flex-col items-start">
                                <span className="font-bold text-sm">Tarjeta Imagen</span>
                                <span className="text-xs opacity-70">Para Stories de Instagram</span>
                            </div>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
