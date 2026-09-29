import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Search } from 'lucide-react';

export const NotFoundPage: React.FC = () => (
    <div
        className="min-h-screen bg-[var(--lt-bg)] flex items-center justify-center px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 5rem)' }}
    >
        <div className="max-w-sm w-full text-center">
            <div className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)]">
                <Compass className="w-8 h-8 text-[var(--lt-accent)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--lt-text)] mb-2">Esta página no existe</h1>
            <p className="text-[var(--lt-text-muted)] mb-8">
                Puede que el enlace esté mal escrito o que el contenido se haya borrado.
            </p>
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
