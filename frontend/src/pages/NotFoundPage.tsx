import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Search } from 'lucide-react';
import { useAppConfig } from '../context/AppConfigContext';
import { isSurpriseOn } from '../lib/surprises';
import { LostPlate } from '../components/surprises/LostPlate';

export const NotFoundPage: React.FC = () => {
    const config = useAppConfig();
    const game = isSurpriseOn(config, 'lostPlate');
    return (
        <div
            className="min-h-screen bg-[var(--lt-bg)] flex items-center justify-center px-6"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 5rem)' }}
        >
            <div className="max-w-sm w-full text-center">
                {!game && (
                    <div className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)]">
                        <Compass className="w-8 h-8 text-[var(--lt-accent)]" />
                    </div>
                )}
                <h1 className="text-2xl font-bold text-[var(--lt-text)] mb-2">Esta página no existe</h1>
                {game ? (
                    <LostPlate />
                ) : (
                    <p className="text-[var(--lt-text-muted)] mb-8">
                        Puede que el enlace esté mal escrito o que el contenido se haya borrado.
                    </p>
                )}
                <div className="flex flex-col gap-3">
                    <Link to="/" className="btn-primary justify-center">
                        <Compass className="w-4 h-4" />
                        <span>Ir a Descubrir</span>
                    </Link>
                    <Link to="/search" className="btn-glass justify-center">
                        <Search className="w-4 h-4" />
                        <span>Buscar en Listopic</span>
                    </Link>
                </div>
            </div>
        </div>
    );
};
