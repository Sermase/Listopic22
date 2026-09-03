import React from 'react';
import { useLocation } from 'react-router-dom';
import { recordConnectionLocation, recordPageView } from '../services/AnalyticsService';
import { useAuth } from '../context/AuthContext';
import { useLocation as useDeviceLocation } from '../hooks/useLocation';

export const PageAnalyticsTracker: React.FC = () => {
    const location = useLocation();
    const { isJefe } = useAuth();
    const { location: deviceLocation } = useDeviceLocation();
    const geoSentRef = React.useRef(false);

    React.useEffect(() => {
        // Las comprobaciones internas del equipo no deben contaminar los datos.
        if (isJefe) return;
        const timeoutId = window.setTimeout(() => {
            void recordPageView(location.pathname).catch((error) => {
                console.warn('No se pudo registrar la vista de página.', error);
            });
        }, 250);
        return () => window.clearTimeout(timeoutId);
    }, [isJefe, location.pathname]);

    React.useEffect(() => {
        if (isJefe || geoSentRef.current || !deviceLocation) return;
        geoSentRef.current = true;
        void recordConnectionLocation(deviceLocation.latitude, deviceLocation.longitude).catch((error) => {
            geoSentRef.current = false;
            console.warn('No se pudo registrar la zona aproximada de conexion.', error);
        });
    }, [deviceLocation, isJefe]);

    return null;
};
