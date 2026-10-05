import React from 'react';
import { Link } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import { LEGAL } from '../../config/legal';

interface MyDataRequestProps {
    uid: string;
    email: string | null;
}

/**
 * Derecho de acceso y portabilidad: la persona lo pide por correo (prellenado)
 * y un jefe lo genera desde Developer → Exportar datos (PDF + JSON).
 */
export const MyDataRequest: React.FC<MyDataRequestProps> = ({ uid, email }) => {
    const subject = 'Solicitud de copia de mis datos (RGPD)';
    const body = [
        'Hola,',
        '',
        'Quiero recibir una copia de todos mis datos personales en Listopic (derecho de acceso y portabilidad, arts. 15 y 20 del RGPD).',
        '',
        `Correo de la cuenta: ${email || '(escríbelo aquí)'}`,
        `Identificador de usuario: ${uid}`,
        '',
        'Gracias.',
    ].join('\n');
    const href = `mailto:${LEGAL.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    return (
        <div className="bg-black/20 border border-white/10 rounded-2xl p-4 space-y-3">
            <div>
                <h4 className="text-white font-bold text-sm flex items-center gap-2">
                    <FileDown className="w-4 h-4 text-[var(--lt-accent)]" /> Tus datos
                </h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Puedes pedir una copia de todo lo que Listopic guarda sobre ti. Te la enviaremos a tu correo, en PDF y en JSON, en un plazo máximo de un mes. Escríbenos desde el correo de tu cuenta.
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <a
                    href={href}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] text-white hover:bg-[var(--lt-accent)]/30 transition-colors"
                >
                    Solicitar mis datos
                </a>
                <Link to="/privacy" className="text-xs text-gray-400 hover:text-white underline-offset-2 hover:underline">
                    Política de privacidad
                </Link>
            </div>
        </div>
    );
};
