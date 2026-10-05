import React from 'react';
import { FileText } from 'lucide-react';
import { LegalLayout, LegalSection, LegalStrong, LegalLink, LegalMail } from '../components/legal/LegalLayout';
import { LEGAL, LEGAL_OWNER_NAME } from '../config/legal';

export const TermsPage: React.FC = () => (
    <LegalLayout
        title="Términos de Uso"
        icon={<FileText className="w-6 h-6" />}
        intro={
            <div className="bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] rounded-2xl p-4">
                <p>
                    <LegalStrong>Antes de empezar, la verdad:</LegalStrong> Listopic es un proyecto personal, gratuito y sin ánimo de lucro, hecho por una persona y no por una empresa. Está en fase beta. Estos términos explican qué puedes esperar de Listopic y qué esperamos de ti.
                </p>
            </div>
        }
    >
        <LegalSection title="1. Quién presta el servicio">
            <p>Listopic lo desarrolla y mantiene <LegalStrong>{LEGAL_OWNER_NAME}</LegalStrong>, a título personal, bajo el nombre creativo <LegalStrong>{LEGAL.brand}</LegalStrong>. {LEGAL.brand} no es una sociedad ni una marca registrada.</p>
            <p>Contacto: <LegalMail />. Tienes los datos completos en el <LegalLink to="/aviso-legal">Aviso legal</LegalLink>.</p>
        </LegalSection>

        <LegalSection title="2. Aceptación y edad mínima">
            <p>Puedes ver el contenido público de Listopic sin cuenta. Para crear una cuenta tienes que leer y aceptar expresamente estos Términos y la <LegalLink to="/privacy">Política de privacidad</LegalLink>, y confirmar que tienes <LegalStrong>{LEGAL.minAge} años o más</LegalStrong>. Guardamos la versión que aceptas y la fecha.</p>
            <p>Si no estás de acuerdo con estos términos, no crees una cuenta.</p>
        </LegalSection>

        <LegalSection title="3. Qué es Listopic y en qué estado está">
            <p>Listopic es una plataforma para crear listas de lugares, escribir reseñas, compartir fotos y descubrir recomendaciones de otras personas. Hoy es <LegalStrong>gratuita</LegalStrong> y no hay planes de pago activos. Si algún día los hay, tendrán sus propias condiciones y te pediremos aceptarlas antes de contratar nada.</p>
            <p>Está en <LegalStrong>fase beta</LegalStrong>: puede haber errores, interrupciones y cambios de funciones. Si encuentras algo roto, cuéntanoslo.</p>
        </LegalSection>

        <LegalSection title="4. Tu cuenta">
            <ul className="list-disc list-inside space-y-1">
                <li>Usa datos veraces y una sola cuenta por persona.</li>
                <li>Guarda tu contraseña: eres responsable de lo que se haga con tu cuenta.</li>
                <li>Si crees que alguien ha entrado sin tu permiso, escríbenos cuanto antes.</li>
            </ul>
        </LegalSection>

        <LegalSection title="5. Normas de uso">
            <p>Al usar Listopic te comprometes a no publicar ni hacer nada de lo siguiente:</p>
            <ul className="list-disc list-inside space-y-1">
                <li>Contenido ilegal, violento, de odio, acoso, amenazas o que discrimine a nadie.</li>
                <li>Datos personales de otras personas sin su permiso, ni fotos en las que se identifique a alguien sin su consentimiento.</li>
                <li>Reseñas falsas, de tu propio negocio o pagadas sin indicarlo.</li>
                <li>Contenido que infrinja derechos de autor, de marca o de imagen de terceros.</li>
                <li>Spam, publicidad no solicitada o suplantar a otra persona.</li>
                <li>Intentar saltarte la seguridad, sobrecargar el servicio o extraer datos de forma masiva.</li>
            </ul>
        </LegalSection>

        <LegalSection title="6. Tu contenido">
            <p>Lo que publicas (listas, reseñas, valoraciones, fotos, comentarios) <LegalStrong>sigue siendo tuyo</LegalStrong>.</p>
            <p>Para poder mostrarlo nos concedes una licencia <LegalStrong>gratuita, no exclusiva y mundial</LegalStrong> para alojarlo, reproducirlo, adaptarlo al formato de la app (por ejemplo, recortar una foto o generar una imagen para compartir) y mostrarlo dentro de Listopic y en los enlaces que se compartan. No lo venderemos ni lo cederemos a terceros para otros fines.</p>
            <p>La licencia dura mientras el contenido esté publicado. Si al borrar tu cuenta eliges conservar tus aportaciones de forma anónima, la licencia continúa solo sobre ese contenido, ya sin tu nombre ni tu foto.</p>
            <p>Al publicar algo garantizas que tienes derecho a hacerlo, en especial sobre las fotos que subes.</p>
        </LegalSection>

        <LegalSection title="7. Denuncias y moderación">
            <p>Si ves contenido ilegal o que incumple estas normas, denúncialo con la opción «Reportar» o escribiéndonos a <LegalMail />, indicando el contenido y el motivo. Revisaremos cada aviso.</p>
            <p>Podemos retirar contenido o suspender cuentas que incumplan estos términos. Si lo hacemos, te explicaremos el motivo y podrás responder a ese mismo correo para pedir que lo revisemos.</p>
        </LegalSection>

        <LegalSection title="8. Dar de baja tu cuenta">
            <p>Puedes borrar tu cuenta cuando quieras desde <LegalStrong>Perfil → Editar perfil → Eliminar cuenta</LegalStrong>, o pedírnoslo por correo (lo haremos en un plazo máximo de 30 días).</p>
            <ul className="list-disc list-inside space-y-1">
                <li>Se borran siempre tu perfil, tu foto de perfil, tus seguidores y seguidos, tus notificaciones, tus chats privados y tus mensajes en chats de grupo.</li>
                <li>Tú eliges qué pasa con tus aportaciones (reseñas, fotos, comentarios, mensajes en foros y sublistas): <LegalStrong>borrarlas</LegalStrong> o <LegalStrong>conservarlas de forma anónima</LegalStrong>, firmadas como «Usuario eliminado».</li>
            </ul>
        </LegalSection>

        <LegalSection title="9. Responsabilidad">
            <p>Listopic es un servicio gratuito en beta y no podemos garantizar que esté siempre disponible ni libre de errores. Te recomendamos no usarla como único sitio donde guardar información importante.</p>
            <p>Las reseñas y opiniones son de quien las publica. No respondemos del contenido de otros usuarios salvo que, sabiendo que es ilegal, no lo retiremos con diligencia.</p>
            <p>Nada de lo anterior limita los derechos que te reconoce la ley como consumidor ni nuestra responsabilidad en los casos en que la ley no permite limitarla.</p>
        </LegalSection>

        <LegalSection title="10. Servicios de terceros">
            <p>Parte de la información de los lugares (nombre, dirección, fotos, horario) procede de Google Maps y se muestra según sus condiciones. Los enlaces a sitios externos se rigen por las condiciones de esos sitios.</p>
        </LegalSection>

        <LegalSection title="11. Cambios en estos términos">
            <p>Si cambiamos algo importante te avisaremos en la app y te pediremos que aceptes la nueva versión antes de seguir usando tu cuenta. Si no estás de acuerdo, puedes borrar tu cuenta en cualquier momento.</p>
        </LegalSection>

        <LegalSection title="12. Ley aplicable">
            <p>Estos términos se rigen por la ley española. Si eres consumidor, puedes acudir a los tribunales de tu domicilio.</p>
        </LegalSection>

        <LegalSection title="13. Contacto">
            <p>¿Dudas, sugerencias o algo que no funciona? Escríbenos a <LegalMail />. Respondemos de verdad.</p>
        </LegalSection>
    </LegalLayout>
);
