import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Bookmark, Share2, Edit, Trash2, Flag } from 'lucide-react';

interface ReviewCardMenuProps {
    isOwner: boolean;
    onShare: (e: React.MouseEvent) => void;
    onSave: (e: React.MouseEvent) => void;
    onEdit: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
    onReport: (e: React.MouseEvent) => void;
}

export const ReviewCardMenu: React.FC<ReviewCardMenuProps> = ({
    isOwner,
    onShare,
    onSave,
    onEdit,
    onDelete,
    onReport,
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMenuOpen(false);
        };
        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMenuOpen]);

    const wrap = (handler: (e: React.MouseEvent) => void) => (e: React.MouseEvent) => {
        setIsMenuOpen(false);
        handler(e);
    };

    return (
        <div className="relative z-20 shrink-0 self-start mt-1" ref={menuRef}>
            <button
                aria-label="Más opciones"
                className="text-gray-500 hover:text-white transition-colors p-1"
                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(prev => !prev); }}
            >
                <MoreHorizontal className="w-5 h-5" />
            </button>

            {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-[var(--lt-card-strong)] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden animate-fade-in origin-top-right z-50">
                    <button
                        onClick={wrap(onSave)}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                    >
                        <Bookmark className="w-4 h-4" /> Guardar
                    </button>
                    <button
                        onClick={wrap(onShare)}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                    >
                        <Share2 className="w-4 h-4" /> Compartir
                    </button>
                    <div className="h-px bg-white/10 my-1" />
                    {isOwner ? (
                        <>
                            <button
                                onClick={wrap(onEdit)}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                            >
                                <Edit className="w-4 h-4" /> Editar
                            </button>
                            <button
                                onClick={wrap(onDelete)}
                                className="w-full text-left px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-2 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> Eliminar
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={wrap(onReport)}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2 transition-colors"
                        >
                            <Flag className="w-4 h-4" /> Reportar
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
