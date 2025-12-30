import React from 'react';
import { X, MessageSquare, Copy } from 'lucide-react';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    url?: string;
    text?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, title = "Compartir", url = window.location.href, text = "" }) => {
    if (!isOpen) return null;

    const handleShare = (platform: 'whatsapp' | 'clipboard') => {
        const fullText = text ? `${text} ${url}` : url;

        if (platform === 'whatsapp') {
            window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank');
        } else if (platform === 'clipboard') {
            navigator.clipboard.writeText(fullText);
            // Ideally show a toast here, but simple alert for now if needed or just close
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
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
                </div>
            </div>
        </div>
    );
};
