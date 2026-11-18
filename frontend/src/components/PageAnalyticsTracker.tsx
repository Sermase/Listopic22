import React from 'react';
import { useLocation } from 'react-router-dom';
import { recordConnectionLocation, recordPageView } from '../services/AnalyticsService';
import { useLocation as useDeviceLocation } from '../hooks/useLocation';

export const PageAnalyticsTracker: React.FC = () => {
    const location = useLocation();
    const { location: deviceLocation } = useDeviceLocation();
    const geoSentRef = React.useRef(false);

    React.useEffect(() => {
        // Las visitas de los jefes también se registran, pero el servidor las
        // apunta aparte para poder quitarlas de las estadísticas.
        const timeoutId = window.setTimeout(() => {
            void recordPageView(location.pathname).catch((error) => {
                console.warn('No se pudo registrar la vista de página.', error);
            });
        }, 250);
        return () => window.clearTimeout(timeoutId);
    }, [location.pathname]);

    React.useEffect(() => {
        if (geoSentRef.current || !deviceLocation) return;
        geoSentRef.current = true;
        void recordConnectionLocation(deviceLocation.latitude, deviceLocation.longitude).catch((error) => {
            geoSentRef.current = false;
            console.warn('No se pudo registrar la zona aproximada de conexion.', error);
        });
    }, [deviceLocation]);

    return null;
};
