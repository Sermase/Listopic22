import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader } from 'lucide-react';
import { EditListForm } from './EditListForm';

interface EditListModalProps {
    listId: string;
    onClose: () => void;
    onSaved?: () => void;
    onDeleted?: () => void;
}

const FORM_ID = 'edit-list-modal-form';

export const EditListModal: React.FC<EditListModalProps> = ({ listId, onClose, onSaved, onDeleted }) => {
    const [saving, setSaving] = useState(false);

    const handleSuccess = () => {
        onSaved?.();
        onClose();
    };

    const handleDeleted = () => {
        onDeleted?.();
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col sm:items-center sm:justify-center sm:bg-black/70 sm:backdrop-blur-sm bg-[#0b1021]">
            {/* Backdrop solo en sm+ para cerrar al hacer clic fuera */}
            <div
                className="hidden sm:block absolute inset-0"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-white/10 bg-[#0b1021] overflow-hidden">

                {/* Cabecera fija */}
                <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-[#0b1021]">
                    <h2 className="text-lg font-bold text-white">Editar Lista</h2>
                    <button
                        aria-label="Cerrar"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Contenido con scroll */}
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                    <EditListForm
                        listId={listId}
                        onSuccess={handleSuccess}
                        onCancel={onClose}
                        onDeleted={handleDeleted}
                        formId={FORM_ID}
                        onSavingChange={setSaving}
                    />
                </div>

                {/* Pie fijo */}
                <div className="shrink-0 flex gap-3 px-4 sm:px-6 py-4 border-t border-white/10 bg-[#0b1021]">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form={FORM_ID}
                        disabled={saving}
                        className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
