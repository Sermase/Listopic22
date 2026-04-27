import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '../context/AppConfigContext';
import { ArrowLeft } from 'lucide-react';

export const LabPage: React.FC = () => {
    const config = useAppConfig();
    const navigate = useNavigate();

    if (!config.showLab) {
        return (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-900 text-white gap-4">
                <div className="text-6xl">🔒</div>
                <h1 className="text-xl font-bold text-slate-300">Acceso restringido</h1>
                <button
                    onClick={() => navigate('/')}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm transition-colors"
                >
                    Volver al inicio
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black">
            <button
                onClick={() => navigate(-1)}
                aria-label="Volver atrás"
                className="absolute top-4 left-4 z-50 p-2 bg-black/50 backdrop-blur rounded-full text-white hover:bg-black/70 transition-colors border border-white/10"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>
            <iframe
                src="/lab/simulator.html"
                className="w-full h-full border-0"
                title="El baile de los apegos"
                allow="fullscreen"
            />
        </div>
    );
};
