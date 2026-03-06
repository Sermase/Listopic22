import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        // Optional: Show a full-page loader while checking auth state
        return (
            <div className="min-h-screen bg-[#0b1021] flex items-center justify-center">
                <Loader className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    if (!user) {
        // Redirect to login page, but save the current location they were trying to go to
        // We can pass `state` to the Navigate component to be used by LoginPage
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};
