import React from 'react';
import { Cookie } from 'lucide-react';
import { LegalLayout, LegalSection, LegalStrong, LegalLink, LegalMail } from '../components/legal/LegalLayout';

interface StorageRow {
    name: string;
    purpose: string;
    duration: string;
}

// Lo que Listopic guarda en el dispositivo. Todo es técnico o una preferencia
// que pide el usuario (exento de consentimiento, art. 22.2 LSSI). Si se añade
// algo de analítica o publicidad, hará falta banner de consentimiento.
const ROWS: StorageRow[] = [
    { name: 'Sesión de Firebase (IndexedDB)', purpose: 'Mantener tu sesión iniciada de forma segura.', duration: 'Hasta que cierres sesión' },
    { name: 'listopic-theme', purpose: 'Recordar el tema de color que eliges.', duration: 'Persistente' },
    { name: 'listopic_map_layer', purpose: 'Recordar la capa de mapa que eliges.', duration: 'Persistente' },
    { name: 'Zona y filtros de búsqueda', purpose: 'Recordar la zona, la distancia y las búsquedas recientes que eliges.', duration: 'Persistente o hasta cerrar la pestaña' },
    { name: 'listopic_location', purpose: 'No volver a pedir tu ubicación en cada página, solo si diste permiso.', duration: 'Hasta cerrar la pestaña' },
    { name: 'listopic_review_draft_*', purpose: 'Guardar el borrador de una reseña para que no lo pierdas.', duration: 'Hasta publicarla o descartarla' },
    { name: 'listopic:new-version-reload-at', purpose: 'Recargar una sola vez cuando hay una versión nueva de la app.', duration: 'Hasta cerrar la pestaña' },
    { name: 'Caché de la app (service worker)', purpose: 'Que la app cargue rápido y funcione con mala conexión.', duration: 'Hasta la siguiente versión' },
];

export const CookiesPage: React.FC = () => (
    <LegalLayout
        title="Política de Cookies"
        icon={<Cookie className="w-6 h-6" />}
        intro={<p>Listopic <LegalStrong>no usa cookies de publicidad ni de analítica</LegalStrong>, ni propias ni de terceros. Solo guarda en tu dispositivo lo imprescindible para funcionar y las preferencias que tú eliges. Por eso no te mostramos un banner de cookies: la ley (art. 22.2 de la LSSI) no exige consentimiento para este tipo de almacenamiento.</p>}
    >
        <LegalSection title="1. Qué guardamos en tu dispositivo">
            <div className="overflow-x-auto -mx-1">
                <table className="w-full text-left text-xs border-separate border-spacing-y-1">
                    <thead>
                        <tr className="text-gray-400 uppercase tracking-wider">
                            <th className="px-2 py-1 font-bold">Nombre</th>
                            <th className="px-2 py-1 font-bold">Para qué</th>
                            <th className="px-2 py-1 font-bold">Duración</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ROWS.map((row) => (
                            <tr key={row.name} className="bg-black/20 align-top">
                                <td className="px-2 py-2 text-white font-mono break-all rounded-l-lg">{row.name}</td>
                                <td className="px-2 py-2">{row.purpose}</td>
                                <td className="px-2 py-2 text-gray-400 rounded-r-lg">{row.duration}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-3">Todo es de Listopic (primera parte). Nada de esto se usa para seguirte entre sitios ni para publicidad.</p>
        </LegalSection>

        <LegalSection title="2. Estadísticas sin cookies">
            <p>Para contar visitas usamos un identificador aleatorio que vive solo en la memoria de la pestaña mientras la tienes abierta: <LegalStrong>no se guarda en tu dispositivo</LegalStrong> y desaparece al recargar o cerrar. En el servidor solo se guarda una huella no reversible que caduca a los 40 días.</p>
        </LegalSection>

        <LegalSection title="3. Servicios de terceros">
            <p>Al cargar un mapa, tu navegador pide las imágenes a Esri (ArcGIS) u OpenStreetMap, y al usar el buscador de lugares se conecta a Google Maps. Estos servicios reciben tu dirección IP para poder responder y aplican sus propias políticas. Listopic no les pide que guarden cookies de publicidad.</p>
        </LegalSection>

        <LegalSection title="4. Cómo borrar estos datos">
            <p>Puedes borrar el almacenamiento de Listopic desde la configuración de tu navegador (Privacidad → Datos de sitios) o, en la app, borrando los datos de la aplicación. Si lo haces, se cerrará tu sesión y volverán las preferencias por defecto.</p>
        </LegalSection>

        <LegalSection title="5. Cambios y contacto">
            <p>Si algún día añadimos cookies que requieran tu consentimiento, te lo pediremos antes de usarlas. Dudas: <LegalMail />. Más información en la <LegalLink to="/privacy">Política de privacidad</LegalLink>.</p>
        </LegalSection>
    </LegalLayout>
);
