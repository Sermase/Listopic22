import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Footer } from '../components/Footer';

const SAFETY_CONTACT_EMAIL = 'istaricore@gmail.com';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-rose-500 rounded-full inline-block" />
            {title}
        </h2>
        <div className="text-gray-300 text-sm leading-relaxed space-y-2 pl-3">
            {children}
        </div>
    </section>
);

export const ChildSafetyPage: React.FC = () => {
    return (
        <>
            <div className="min-h-screen bg-[var(--lt-bg)] pb-8">
                <div className="relative h-40 bg-gradient-to-br from-rose-950/70 via-[var(--lt-bg)] to-[var(--lt-bg)] flex items-end">
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--lt-bg)] to-transparent" />
                    <div className="relative z-10 max-w-3xl mx-auto w-full px-4 sm:px-6 pb-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
                            <ShieldAlert className="w-6 h-6 text-rose-300" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-rose-300 font-bold mb-0.5">Listopic</p>
                            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">Estándares de seguridad infantil</h1>
                        </div>
                    </div>
                </div>

                <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
                    <Link to="/about" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
                        <ArrowLeft className="w-4 h-4" /> Volver a Sobre Listopic
                    </Link>

                    <div className="bg-[var(--lt-card-strong)]/60 border border-white/10 rounded-3xl p-6 sm:p-8 mb-6">
                        <p className="text-xs text-gray-500 mb-6">Última actualización: 19 de mayo de 2026</p>

                        <p className="text-gray-300 text-sm leading-relaxed mb-8">
                            Listopic no permite contenido, conducta ni actividad que facilite, promueva, solicite o distribuya explotación y abuso sexual infantil, incluido material de abuso sexual infantil. Estos estándares se aplican a todas las cuentas, perfiles, listas, reseñas, comentarios, mensajes, imágenes y cualquier otro contenido disponible en Listopic.
                        </p>

                        <Section title="1. Prohibición de EASI">
                            <p>Queda estrictamente prohibido publicar, compartir, solicitar, enlazar, almacenar o facilitar contenido relacionado con explotación y abuso sexual infantil (EASI), material de abuso sexual infantil o cualquier intento de captación, sexualización, acoso, extorsión o daño sexual hacia menores.</p>
                            <p>También prohibimos contenido que normalice, glorifique, instruya, encubra o coordine estas conductas, aunque se presente de forma indirecta, codificada o ficticia.</p>
                        </Section>

                        <Section title="2. Denuncia dentro de la aplicación">
                            <p>Listopic permite denunciar contenido, perfiles y comportamientos desde la propia app mediante la opción de reportar. Para casos de seguridad infantil, selecciona el motivo <span className="text-white font-medium">Seguridad infantil / EASI</span> y añade los detalles necesarios para que podamos revisarlo con urgencia.</p>
                            <p>Si una persona menor está en peligro inmediato, contacta antes con los servicios de emergencia o con las fuerzas de seguridad de tu país.</p>
                        </Section>

                        <Section title="3. Revisión y acciones">
                            <p>Los reportes de seguridad infantil se priorizan. Cuando detectamos o recibimos una denuncia creíble, revisamos el contenido, restringimos o eliminamos material infractor, y podemos suspender o cancelar cuentas implicadas.</p>
                            <p>Cuando corresponde, conservamos la información necesaria para la investigación y remitimos los casos a las autoridades nacionales o regionales competentes, de acuerdo con la legislación aplicable.</p>
                        </Section>

                        <Section title="4. Prevención y moderación">
                            <p>Aplicamos controles de cuenta, límites contra abuso, herramientas de reporte, revisión administrativa y retirada de contenido para reducir riesgos en la comunidad.</p>
                            <p>Listopic no está dirigida a menores de 16 años. Si detectamos una cuenta de una persona menor de esa edad, podemos eliminarla y retirar los datos asociados según nuestra <Link to="/privacy" className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">Política de Privacidad</Link>.</p>
                        </Section>

                        <Section title="5. Cooperación con autoridades">
                            <p>Listopic cumple las leyes de seguridad infantil pertinentes. Ante indicios de EASI o material de abuso sexual infantil, actuamos para impedir su difusión y cooperamos con autoridades competentes dentro de los límites legales aplicables.</p>
                        </Section>

                        <Section title="6. Contacto de seguridad infantil">
                            <p>La persona de contacto designada para asuntos de seguridad infantil, prevención de EASI y cumplimiento de estos estándares puede ser contactada en:</p>
                            <p className="mt-1">
                                <a href={`mailto:${SAFETY_CONTACT_EMAIL}`} className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors font-medium">
                                    {SAFETY_CONTACT_EMAIL}
                                </a>
                            </p>
                            <p>Este contacto está destinado a comunicaciones sobre cumplimiento, prevención, denuncia y respuesta ante riesgos de explotación y abuso sexual infantil en Listopic.</p>
                        </Section>
                    </div>

                    <div className="text-center pb-8">
                        <Link to="/about" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Volver a Sobre Listopic
                        </Link>
                    </div>
                </div>
            </div>
            <Footer compact />
        </>
    );
};
