import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { EditListForm } from '../components/EditListForm';

export const EditListPage: React.FC = () => {
    const { listId } = useParams<{ listId: string }>();
    const navigate = useNavigate();

    if (!listId) return null;

    return (
        <div className="min-h-screen bg-[#0b1021] text-gray-100 pt-safe-24 pb-20 px-4">
            <div className="max-w-2xl mx-auto">
                <button onClick={() => navigate(-1)} className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Cancelar
                </button>

                <h1 className="text-3xl font-bold font-display text-white mb-8">Editar Lista</h1>

                <EditListForm
                    listId={listId}
                    onSuccess={() => navigate(`/list/${listId}`)}
                    onCancel={() => navigate(-1)}
                    onDeleted={() => navigate('/')}
                />
            </div>
        </div>
    );
};
