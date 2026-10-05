import React from 'react';
import { Shield } from 'lucide-react';
import { LegalLayout, LegalSection, LegalStrong, LegalLink, LegalExternal, LegalMail } from '../components/legal/LegalLayout';
import { LEGAL, LEGAL_OWNER_NAME } from '../config/legal';

const Purpose: React.FC<{ what: string; basis: string }> = ({ what, basis }) => (
    <li><LegalStrong>{what}</LegalStrong> — {basis}</li>
);

export const PrivacyPage: React.FC = () => (
    <LegalLayout
        title="Política de Privacidad"
        icon={<Shield className="w-6 h-6" />}
        intro={<p>Esta política explica qué datos personales trata Listopic, para qué, con qué base legal, con quién se comparten y cómo puedes ejercer tus derechos, conforme al Reglamento General de Protección de Datos (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).</p>}
    >
        <LegalSection title="1. Responsable del tratamiento">
            <p><LegalStrong>{LEGAL_OWNER_NAME}</LegalStrong>, persona física que desarrolla Listopic como proyecto personal bajo el nombre {LEGAL.brand}.</p>
            <p>Correo de contacto para privacidad: <LegalMail />. Más datos en el <LegalLink to="/aviso-legal">Aviso legal</LegalLink>.</p>
        </LegalSection>

        <LegalSection title="2. Qué datos tratamos">
            <p><LegalStrong>Cuenta:</LegalStrong> nombre, correo electrónico y foto de perfil (de Google si entras con Google). La contraseña la gestiona Firebase Authentication y nunca la vemos.</p>
            <p><LegalStrong>Perfil:</LegalStrong> nombre de usuario, nombre y apellidos si los añades, biografía, localidad y tus preferencias (tema, mapa, distancia, notificaciones).</p>
            <p><LegalStrong>Lo que publicas y haces:</LegalStrong> listas, reseñas, valoraciones, fotos, comentarios, reacciones, mensajes en chats y foros, a quién sigues y quién te sigue, y tus archivos de lugares.</p>
            <p><LegalStrong>Ubicación:</LegalStrong> solo si das permiso en tu dispositivo, para mostrarte lugares cercanos. Para estadísticas solo se envía una zona aproximada (redondeada a unos 10 km), nunca tu posición exacta.</p>
            <p><LegalStrong>Notificaciones push:</LegalStrong> el identificador de tu dispositivo para enviártelas, si las activas.</p>
            <p><LegalStrong>Aceptación de condiciones:</LegalStrong> la versión de los Términos y de esta política que aceptaste, la fecha y tu confirmación de edad.</p>
            <p><LegalStrong>Datos técnicos:</LegalStrong> registros del servidor, informes de errores sin datos de usuario ni dirección IP, y una huella no reversible y temporal de la IP para frenar abusos (por ejemplo, demasiadas peticiones seguidas).</p>
            <p><LegalStrong>Estadísticas de visitas:</LegalStrong> páginas vistas, tipo de dispositivo y origen general de la visita, de forma agregada. No guardamos tu IP ni un historial de navegación, y no usamos cookies ni identificadores guardados en tu dispositivo para ello.</p>
        </LegalSection>

        <LegalSection title="3. Para qué y con qué base legal">
            <ul className="list-disc list-inside space-y-2">
                <Purpose what="Crear y gestionar tu cuenta, mostrar tu perfil y tu contenido, chats y funciones sociales" basis="ejecución del contrato que aceptas al registrarte (art. 6.1.b RGPD)." />
                <Purpose what="Mostrarte lugares cercanos con tu ubicación y enviarte notificaciones push" basis="tu consentimiento, que das y retiras desde los permisos del dispositivo (art. 6.1.a)." />
                <Purpose what="Seguridad, prevención de abusos, corrección de errores y copias de seguridad" basis="interés legítimo en mantener el servicio seguro y funcionando (art. 6.1.f)." />
                <Purpose what="Estadísticas agregadas de uso" basis="interés legítimo en saber qué partes de la app se usan, sin identificarte (art. 6.1.f)." />
                <Purpose what="Atender denuncias de contenido y moderar" basis="interés legítimo y cumplimiento de las obligaciones legales de los servicios de alojamiento (art. 6.1.c y f)." />
                <Purpose what="Guardar tu aceptación de condiciones y el registro de tus solicitudes de derechos" basis="obligación de poder demostrar que cumplimos (art. 5.2 y 6.1.c)." />
            </ul>
            <p className="mt-2">No tomamos decisiones automatizadas con efectos jurídicos sobre ti ni elaboramos perfiles con fines publicitarios.</p>
        </LegalSection>

        <LegalSection title="4. Qué es público">
            <p>Son visibles para cualquiera: tu nombre de usuario, nombre visible, foto, biografía, localidad, estadísticas, tus listas públicas, reseñas, fotos y comentarios. Tu correo electrónico nunca es público. Los chats privados solo los ven sus participantes.</p>
        </LegalSection>

        <LegalSection title="5. Con quién compartimos datos">
            <p><LegalStrong>No vendemos tus datos ni los cedemos a terceros</LegalStrong>, salvo obligación legal. Usamos estos proveedores, que tratan datos por cuenta nuestra (encargados del tratamiento):</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
                <li><LegalStrong>Google Firebase</LegalStrong> (Google Ireland / Google LLC): cuentas, base de datos, archivos, funciones del servidor, alojamiento web y notificaciones. <LegalExternal href="https://firebase.google.com/support/privacy">Privacidad</LegalExternal></li>
                <li><LegalStrong>Google Maps Platform</LegalStrong>: búsqueda y datos de lugares. Al usar el buscador de lugares tu navegador se conecta a Google. <LegalExternal href="https://policies.google.com/privacy">Privacidad</LegalExternal></li>
                <li><LegalStrong>Algolia</LegalStrong> (Algolia SAS): buscador de listas, lugares y perfiles públicos. <LegalExternal href="https://www.algolia.com/policies/privacy">Privacidad</LegalExternal></li>
                <li><LegalStrong>Sentry</LegalStrong> (Functional Software, Inc.): informes de errores de la app, sin datos de usuario ni IP. <LegalExternal href="https://sentry.io/privacy/">Privacidad</LegalExternal></li>
                <li><LegalStrong>Esri (ArcGIS) y OpenStreetMap</LegalStrong>: imágenes de los mapas. Al cargar un mapa tu navegador les pide las imágenes y reciben tu IP. <LegalExternal href="https://www.esri.com/en-us/privacy/overview">Esri</LegalExternal> · <LegalExternal href="https://osmfoundation.org/wiki/Privacy_Policy">OpenStreetMap</LegalExternal></li>
            </ul>
        </LegalSection>

        <LegalSection title="6. Transferencias internacionales">
            <p>La base de datos, los archivos y las funciones del servidor están en la región <LegalStrong>europe-west1 (Bélgica)</LegalStrong>. Aun así, algunos proveedores (Google LLC, Algolia, Sentry, Esri) pueden tratar datos en Estados Unidos. Esas transferencias se amparan en el Marco de Privacidad de Datos UE-EE. UU. o en las cláusulas contractuales tipo de la Comisión Europea, según el proveedor.</p>
        </LegalSection>

        <LegalSection title="7. Cuánto tiempo los guardamos">
            <ul className="list-disc list-inside space-y-1">
                <li><LegalStrong>Cuenta y contenido:</LegalStrong> mientras tengas la cuenta.</li>
                <li><LegalStrong>Al borrar tu cuenta:</LegalStrong> se borran al momento tu perfil, foto, seguidores, notificaciones, chats privados y mensajes en grupos. Tus reseñas, fotos, comentarios y mensajes de foros se borran o se conservan de forma anónima, según elijas.</li>
                <li><LegalStrong>Copias de seguridad:</LegalStrong> semanales; se conservan un máximo de 8 semanas y después se sobrescriben.</li>
                <li><LegalStrong>Registro de tu baja o de tus solicitudes:</LegalStrong> solo el identificador interno, la fecha y el tipo de operación, durante 3 años, para poder demostrar que las atendimos.</li>
                <li><LegalStrong>Marcas de visita de la analítica:</LegalStrong> 40 días. <LegalStrong>Informes de errores:</LegalStrong> 90 días como máximo.</li>
            </ul>
        </LegalSection>

        <LegalSection title="8. Tus derechos">
            <p>Puedes ejercer en cualquier momento tus derechos de <LegalStrong>acceso, rectificación, supresión, oposición, limitación y portabilidad</LegalStrong>, y retirar tu consentimiento sin que eso afecte a lo hecho antes.</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
                <li><LegalStrong>Copia de tus datos (acceso y portabilidad):</LegalStrong> pídela desde <LegalStrong>Perfil → Editar perfil</LegalStrong> («Solicitar mis datos») o escribiendo a <LegalMail /> desde el correo de tu cuenta. Te enviaremos un PDF legible y un archivo JSON reutilizable.</li>
                <li><LegalStrong>Rectificación:</LegalStrong> edita tu perfil o escríbenos.</li>
                <li><LegalStrong>Supresión:</LegalStrong> borra tu cuenta desde Editar perfil o escríbenos.</li>
            </ul>
            <p className="mt-2">Respondemos en un plazo máximo de <LegalStrong>un mes</LegalStrong> (ampliable dos meses más en casos complejos, avisándote), sin coste. Si la petición no llega desde el correo de la cuenta, podemos pedirte que confirmes tu identidad.</p>
            <p className="mt-2">Si crees que no hemos tratado bien tus datos, puedes reclamar ante la <LegalExternal href="https://www.aepd.es">Agencia Española de Protección de Datos (AEPD)</LegalExternal>.</p>
        </LegalSection>

        <LegalSection title="9. Menores de edad">
            <p>Listopic no está dirigida a menores de <LegalStrong>{LEGAL.minAge} años</LegalStrong> y al registrarte debes confirmar tu edad. Si detectamos una cuenta de un menor de esa edad la eliminaremos. Si eres padre, madre o tutor y crees que tu hijo o hija tiene cuenta, escríbenos a <LegalMail />. Más información en <LegalLink to="/child-safety">Seguridad infantil</LegalLink>.</p>
        </LegalSection>

        <LegalSection title="10. Seguridad">
            <p>Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito (HTTPS) y en reposo, reglas de acceso por usuario en la base de datos y los archivos, y registros de las acciones de administración. Ningún sistema es infalible; si hubiera una brecha que te afecte, te avisaremos cuando la ley lo exija.</p>
        </LegalSection>

        <LegalSection title="11. Cookies y almacenamiento local">
            <p>Solo usamos almacenamiento técnico o de preferencias que tú eliges, por eso no hay banner de cookies. El detalle está en la <LegalLink to="/cookies">Política de cookies</LegalLink>.</p>
        </LegalSection>

        <LegalSection title="12. Cambios en esta política">
            <p>Si la cambiamos de forma relevante te avisaremos en la app y te pediremos que aceptes la nueva versión. La fecha de arriba indica la versión vigente.</p>
        </LegalSection>
    </LegalLayout>
);
