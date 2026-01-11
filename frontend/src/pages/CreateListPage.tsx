import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CreateListForm } from '../components/CreateListForm';

export const CreateListPage: React.FC = () => {
    const navigate = useNavigate();

    const handleSuccess = (newListId: string) => {
        navigate(`/list/${newListId}`);
    };

    const handleCancel = () => {
        navigate(-1);
    };

    return (
        <div className="min-h-screen bg-[#0b1021] text-gray-100 pt-24 pb-20 px-4">
            <div className="max-w-3xl mx-auto">
                <button onClick={handleCancel} className="flex items-center text-gray-400 hover:text-white mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Cancelar
                </button>

                <h1 className="text-3xl font-bold font-display text-white mb-8">Crear Nueva Lista</h1>

                <CreateListForm
                    onSuccess={handleSuccess}
                    onCancel={handleCancel}
                />
            </div>
        </div>
    );
};
