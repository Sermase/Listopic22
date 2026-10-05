import React from 'react';
import { Scale } from 'lucide-react';
import { LegalLayout, LegalSection, LegalStrong, LegalLink, LegalMail } from '../components/legal/LegalLayout';
import { LEGAL, LEGAL_OWNER_NAME } from '../config/legal';

export const LegalNoticePage: React.FC = () => (
    <LegalLayout
        title="Aviso Legal"
        icon={<Scale className="w-6 h-6" />}
        intro={<p>Información sobre quién está detrás de Listopic, conforme a la Ley 34/2002 de Servicios de la Sociedad de la Información (LSSI).</p>}
    >
        <LegalSection title="1. Titular">
            <ul className="list-disc list-inside space-y-1">
                <li><LegalStrong>Titular:</LegalStrong> {LEGAL_OWNER_NAME} (persona física)</li>
                {LEGAL.ownerNif.trim() && <li><LegalStrong>NIF:</LegalStrong> {LEGAL.ownerNif}</li>}
                {LEGAL.ownerAddress.trim() && <li><LegalStrong>Domicilio:</LegalStrong> {LEGAL.ownerAddress}</li>}
                <li><LegalStrong>Nombre del proyecto:</LegalStrong> {LEGAL.brand} (nombre creativo, sin sociedad constituida)</li>
                <li><LegalStrong>Correo electrónico:</LegalStrong> <LegalMail /></li>
            </ul>
            <p className="mt-2">Listopic es un proyecto personal, gratuito y sin actividad comercial en este momento.</p>
        </LegalSection>

        <LegalSection title="2. Objeto">
            <p>Listopic es una plataforma para crear listas de lugares, escribir reseñas y compartir recomendaciones. Su uso se rige por los <LegalLink to="/terms">Términos de uso</LegalLink>, la <LegalLink to="/privacy">Política de privacidad</LegalLink> y la <LegalLink to="/cookies">Política de cookies</LegalLink>.</p>
        </LegalSection>

        <LegalSection title="3. Propiedad intelectual">
            <p>El diseño, el código y la marca Listopic pertenecen a su titular. El contenido que publican los usuarios es de cada uno de ellos, que nos concede la licencia descrita en los Términos de uso. Parte de la información de los lugares procede de Google Maps.</p>
        </LegalSection>

        <LegalSection title="4. Contenido de los usuarios">
            <p>Las opiniones publicadas son responsabilidad de quien las escribe. Si ves contenido ilegal o que vulnera tus derechos, usa la opción «Reportar» o escríbenos a <LegalMail />: lo revisaremos y, si procede, lo retiraremos con rapidez.</p>
        </LegalSection>

        <LegalSection title="5. Ley aplicable">
            <p>Este sitio se rige por la ley española.</p>
        </LegalSection>
    </LegalLayout>
);
