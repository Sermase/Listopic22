import React, { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthForm, type AuthFormMode } from '../components/AuthForm';

type LoginLocationState = {
    from?: { pathname?: string; search?: string; hash?: string };
};

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const initialMode: AuthFormMode = searchParams.get('mode') === 'register' ? 'register' : 'login';

    const handleAuthenticated = useCallback(() => {
        const from = (location.state as LoginLocationState | null)?.from;
        const destination = from?.pathname
            ? `${from.pathname}${from.search || ''}${from.hash || ''}`
            : '/';
        navigate(destination, { replace: true });
    }, [location.state, navigate]);

    return (
        <div className="min-h-screen bg-[var(--lt-bg)] flex items-center justify-center p-4">
            <div className="bg-[var(--lt-card-strong)] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                <AuthForm initialMode={initialMode} onAuthenticated={handleAuthenticated} />
            </div>
        </div>
    );
};
