import React from 'react';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

/** Hoja inferior de las herramientas del chat (en escritorio, ventana centrada). */
export const ChatSheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
    useBodyScrollLock(true);
    return (
        <div
            className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full md:max-w-md max-h-[88vh] overflow-y-auto bg-[var(--lt-card-strong)] border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-4 pb-3 bg-[var(--lt-card-strong)]">
                    <h2 className="text-base font-bold text-white">{title}</h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5" aria-label="Cerrar">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-5">{children}</div>
            </div>
        </div>
    );
};
