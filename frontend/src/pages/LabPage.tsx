import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppConfig } from '../context/AppConfigContext';
import { ArrowLeft } from 'lucide-react';

export const LabPage: React.FC = () => {
    const config = useAppConfig();
    const navigate = useNavigate();
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

    const requestSimulatorBack = React.useCallback(() => {
        const simulatorWindow = iframeRef.current?.contentWindow;
        if (!simulatorWindow) {
            navigate(-1);
            return;
        }
        simulatorWindow.postMessage({ type: 'listopic-simulator-back' }, window.location.origin);
    }, [navigate]);

    React.useEffect(() => {
        const handleLabBack = () => requestSimulatorBack();
        const handleSimulatorMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === 'listopic-simulator-exit') {
                navigate(-1);
            }
        };

        window.addEventListener('listopic:lab-back', handleLabBack);
        window.addEventListener('message', handleSimulatorMessage);
        return () => {
            window.removeEventListener('listopic:lab-back', handleLabBack);
            window.removeEventListener('message', handleSimulatorMessage);
        };
    }, [navigate, requestSimulatorBack]);

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
                onClick={requestSimulatorBack}
                aria-label="Volver atrás"
                className="absolute left-4 z-50 min-h-11 min-w-11 rounded-full border border-white/10 bg-black/50 p-2 text-white backdrop-blur transition-colors hover:bg-black/70"
                style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
            >
                <ArrowLeft className="w-5 h-5" />
            </button>
            <iframe
                ref={iframeRef}
                src="/lab/simulator.html"
                className="w-full h-full border-0"
                title="El baile de los apegos"
                allow="fullscreen"
            />
        </div>
    );
};
