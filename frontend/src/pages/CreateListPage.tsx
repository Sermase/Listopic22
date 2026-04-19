import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { CreateListForm } from '../components/CreateListForm';
import { useAuth } from '../context/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';

export const CreateListPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { profile, loading } = useUserProfile(user?.uid);

    const isJefe = Boolean(profile && (
        (Array.isArray(profile.userType) && profile.userType.includes('jefe')) ||
        profile.userType === 'jefe'
    ));

    const handleSuccess = (newListId: string) => {
        navigate(`/list/${newListId}`);
    };

    const handleCancel = () => {
        navigate(-1);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--lt-bg)] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[var(--lt-accent-border)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!isJefe) {
        return (
            <div className="min-h-screen bg-[var(--lt-bg)] text-gray-100 flex flex-col items-center justify-center gap-4">
                <Lock className="w-12 h-12 text-gray-600" />
                <h1 className="text-xl font-bold text-white">Acceso restringido</h1>
                <p className="text-gray-400 text-sm">Solo el administrador puede crear listas principales.</p>
                <button onClick={() => navigate(-1)} className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] text-sm mt-2">Volver</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] text-gray-100 pt-safe-24 pb-20 px-4">
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
