import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { EditListForm } from './EditListForm';

interface EditListModalProps {
    listId: string;
    onClose: () => void;
    onSaved?: () => void;
    onDeleted?: () => void;
}

export const EditListModal: React.FC<EditListModalProps> = ({ listId, onClose, onSaved, onDeleted }) => {
    const handleSuccess = () => {
        onSaved?.();
        onClose();
    };

    const handleDeleted = () => {
        onDeleted?.();
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-2xl bg-[#0b1021] rounded-2xl border border-white/10 p-6 relative" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Editar Lista</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <EditListForm
                    listId={listId}
                    onSuccess={handleSuccess}
                    onCancel={onClose}
                    onDeleted={handleDeleted}
                />
            </div>
        </div>,
        document.body
    );
};
