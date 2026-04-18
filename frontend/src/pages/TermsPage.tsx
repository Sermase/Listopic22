import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Footer } from '../components/Footer';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-violet-500 rounded-full inline-block" />
            {title}
        </h2>
        <div className="text-gray-300 text-sm leading-relaxed space-y-2 pl-3">
            {children}
        </div>
    </section>
);

export const TermsPage: React.FC = () => {
    return (
        <>
            <div className="min-h-screen bg-[var(--lt-bg)] pb-8">
                {/* Header */}
                <div className="relative h-40 bg-gradient-to-br from-violet-900/60 via-[var(--lt-bg)] to-[var(--lt-bg)] flex items-end">
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--lt-bg)] to-transparent" />
                    <div className="relative z-10 max-w-3xl mx-auto w-full px-4 sm:px-6 pb-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                            <FileText className="w-6 h-6 text-violet-400" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-violet-400 font-bold mb-0.5">Listopic</p>
                            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">Términos de Uso</h1>
                        </div>
                    </div>
                </div>

                <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
                    <Link to="/about" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
                        <ArrowLeft className="w-4 h-4" /> Volver a Sobre Listopic
                    </Link>

                    <div className="bg-[var(--lt-card-strong)]/60 border border-white/10 rounded-3xl p-6 sm:p-8 mb-6">
                        <p className="text-xs text-gray-500 mb-2">Última actualización: 13 de abril de 2026</p>

                        {/* Intro honesta */}
                        <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4 mb-8">
                            <p className="text-violet-300 text-sm leading-relaxed">
                                <span className="font-bold text-white">Antes de empezar, la verdad:</span> Listopic es un proyecto indie, creado por una persona de forma independiente, sin empresa registrada y sin ánimo de lucro por ahora. Nacimos para jugar a crear, para disfrutar del proceso y ofrecer algo genuino con utilidad directa. La app está en fase de pruebas activas (beta). Úsala con ese espíritu en mente.
                            </p>
                        </div>

                        <Section title="1. Quiénes somos">
                            <p>Listopic es un proyecto personal desarrollado bajo el nombre <span className="text-white font-medium">Istari Core</span>, un nombre creativo sin entidad jurídica registrada actualmente. No somos una empresa, no somos una startup financiada — somos alguien que disfruta creando herramientas útiles y bien pensadas.</p>
                            <p>Puedes contactarnos en: <a href="mailto:istaricore@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">istaricore@gmail.com</a></p>
                        </Section>

                        <Section title="2. Estado de la aplicación">
                            <p>Listopic se encuentra en <span className="text-white font-medium">fase beta</span>. Esto significa que:</p>
                            <ul className="list-disc list-inside space-y-1 mt-2">
                                <li>Puede haber errores, interrupciones o cambios inesperados.</li>
                                <li>Las funcionalidades pueden cambiar, añadirse o eliminarse.</li>
                                <li>No garantizamos disponibilidad continua del servicio.</li>
                            </ul>
                            <p className="mt-2">Te pedimos paciencia y, si encuentras algo roto, que nos lo cuentes. Lo arreglamos.</p>
                        </Section>

                        <Section title="3. Uso del servicio">
                            <p>Listopic es una plataforma para crear listas de lugares, escribir reseñas y descubrir recomendaciones. Al usarla, aceptas hacerlo de forma razonable y respetuosa.</p>
                            <p>Básicamente: no hagas cosas malas. No publiques contenido falso, ofensivo, ilegal, ni que dañe a otras personas. No intentes romper la app a propósito. El sentido común es el mejor término de uso.</p>
                        </Section>

                        <Section title="4. Tu contenido">
                            <p>Lo que publiques en Listopic (reseñas, listas, fotos) sigue siendo tuyo. No reclamamos propiedad sobre tu contenido.</p>
                            <p>Nos das permiso implícito para mostrarlo dentro de la aplicación. Nada más.</p>
                            <p>Si publicas algo que infringe derechos de terceros o es claramente inapropiado, podemos eliminarlo.</p>
                        </Section>

                        <Section title="5. Tu cuenta">
                            <p>Eres responsable de lo que haces con tu cuenta. Si crees que alguien ha accedido sin tu permiso, escríbenos y lo gestionamos juntos.</p>
                            <p>Nos reservamos el derecho de suspender cuentas que usen la app de forma abusiva, aunque esperamos que eso nunca ocurra.</p>
                        </Section>

                        <Section title="6. Privacidad">
                            <p>Tratamos tus datos con cuidado y respeto. Puedes leer todos los detalles en nuestra <Link to="/privacy" className="text-indigo-400 hover:text-indigo-300 transition-colors">Política de Privacidad</Link>, que cumple con el RGPD europeo.</p>
                            <p>Resumen: recogemos lo mínimo necesario para que la app funcione. No vendemos tus datos. Nunca.</p>
                        </Section>

                        <Section title="7. Eliminación de cuenta">
                            <p>Puedes eliminar tu cuenta y tus datos en cualquier momento desde la sección <span className="text-white font-medium">Editar Perfil</span> dentro de la aplicación. Al hacerlo, podrás elegir si deseas borrar también todas tus reseñas y aportes, o si prefieres conservarlos de forma anónima para no romper el contenido colaborativo. En cualquier caso, tus datos personales, listas de seguimiento y notificaciones se borran permanentemente.</p>
                            <p className="mt-2">También puedes pedir que lo hagamos nosotros escribiéndonos a <a href="mailto:istaricore@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">istaricore@gmail.com</a>. Lo procesaremos en un plazo máximo de 30 días.</p>
                        </Section>

                        <Section title="8. Limitación de responsabilidad">
                            <p>Listopic se ofrece tal cual, sin garantías. Somos un proyecto indie en beta — hacemos todo lo que podemos, pero no podemos garantizar que todo funcione siempre perfectamente.</p>
                            <p>No somos responsables de pérdidas de datos, interrupciones del servicio o cualquier daño derivado del uso de la app. Úsala sabiendo que estás participando en algo en construcción.</p>
                        </Section>

                        <Section title="9. Cambios en la app y en estos términos">
                            <p>Podemos modificar Listopic o estos términos cuando sea necesario. Si hay cambios importantes, te avisamos dentro de la app. El hecho de seguir usando Listopic tras un cambio implica que lo aceptas.</p>
                        </Section>

                        <Section title="10. Contacto">
                            <p>¿Dudas, sugerencias, algo que no funciona o simplemente quieres saludar?</p>
                            <p className="mt-1"><a href="mailto:istaricore@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">istaricore@gmail.com</a> — respondemos de verdad.</p>
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
