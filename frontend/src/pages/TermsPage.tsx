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
        <div className="min-h-screen bg-[#0b1021] pb-8">
            {/* Header */}
            <div className="relative h-40 bg-gradient-to-br from-violet-900/60 via-[#0b1021] to-[#0b1021] flex items-end">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] to-transparent" />
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

                <div className="bg-[#151b2e]/60 border border-white/10 rounded-3xl p-6 sm:p-8 mb-6">
                    <p className="text-xs text-gray-500 mb-6">Última actualización: 13 de abril de 2026</p>

                    <p className="text-gray-300 text-sm leading-relaxed mb-8">
                        Estos Términos de Uso regulan el acceso y uso de la aplicación Listopic, operada por Istari Core. Al usar Listopic, aceptas estos términos en su totalidad. Si no estás de acuerdo, no uses la aplicación.
                    </p>

                    <Section title="1. Descripción del servicio">
                        <p>Listopic es una plataforma digital que permite a los usuarios crear listas de lugares, escribir y compartir reseñas, descubrir recomendaciones de otros usuarios e interactuar con una comunidad de personas con intereses similares.</p>
                        <p>El servicio está disponible como aplicación web en <span className="text-white">listopic.es</span> y como aplicación móvil para Android.</p>
                    </Section>

                    <Section title="2. Aceptación de los términos">
                        <p>Al crear una cuenta, acceder a la aplicación o usar cualquiera de sus funciones, declaras que:</p>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            <li>Tienes al menos 16 años de edad.</li>
                            <li>Has leído y aceptas estos Términos de Uso y la <Link to="/privacy" className="text-indigo-400 hover:text-indigo-300 transition-colors">Política de Privacidad</Link>.</li>
                            <li>Tienes capacidad legal para aceptar este acuerdo.</li>
                        </ul>
                    </Section>

                    <Section title="3. Registro y cuenta">
                        <p>Para acceder a todas las funciones de Listopic necesitas crear una cuenta. Eres responsable de:</p>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            <li>Mantener la confidencialidad de tus credenciales de acceso.</li>
                            <li>Toda la actividad que se realice desde tu cuenta.</li>
                            <li>Notificarnos inmediatamente si detectas un acceso no autorizado a tu cuenta.</li>
                        </ul>
                        <p className="mt-2">Nos reservamos el derecho de suspender o eliminar cuentas que incumplan estos términos.</p>
                    </Section>

                    <Section title="4. Contenido del usuario">
                        <p><span className="text-white font-medium">Tu contenido es tuyo.</span> Conservas todos los derechos sobre las listas, reseñas, fotos y demás contenido que publiques en Listopic.</p>
                        <p>Al publicar contenido en Listopic, nos concedes una licencia no exclusiva, gratuita y mundial para mostrar, distribuir y promocionar dicho contenido dentro del servicio y en nuestras comunicaciones.</p>
                        <p className="mt-2"><span className="text-white font-medium">Contenido prohibido.</span> No está permitido publicar contenido que:</p>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            <li>Sea falso, engañoso o fraudulento.</li>
                            <li>Infrinja derechos de propiedad intelectual de terceros.</li>
                            <li>Contenga discurso de odio, acoso o amenazas.</li>
                            <li>Sea pornográfico, violento o ilegal.</li>
                            <li>Incluya spam, publicidad no autorizada o malware.</li>
                            <li>Vulnere la privacidad de terceros.</li>
                        </ul>
                    </Section>

                    <Section title="5. Conducta del usuario">
                        <p>Al usar Listopic te comprometes a:</p>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            <li>Usar el servicio únicamente con fines legales y personales, no comerciales.</li>
                            <li>No intentar acceder a sistemas o datos a los que no tienes autorización.</li>
                            <li>No usar bots, scrapers u otras herramientas automatizadas sin permiso expreso.</li>
                            <li>No suplantar la identidad de otras personas o entidades.</li>
                            <li>Respetar a los demás usuarios de la comunidad.</li>
                        </ul>
                    </Section>

                    <Section title="6. Propiedad intelectual">
                        <p>Todos los elementos de Listopic — nombre, logotipo, diseño, código, interfaz y contenido propio — son propiedad de Istari Core y están protegidos por las leyes de propiedad intelectual aplicables.</p>
                        <p>Queda prohibida la reproducción, distribución o modificación de cualquier parte de Listopic sin autorización expresa y por escrito de Istari Core.</p>
                    </Section>

                    <Section title="7. Eliminación de cuenta y datos">
                        <p>Puedes solicitar la eliminación de tu cuenta y todos tus datos personales en cualquier momento contactando con nosotros en <a href="mailto:istaricore@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">istaricore@gmail.com</a>.</p>
                        <p>Una vez solicitada la eliminación, tus datos serán borrados de forma definitiva en un plazo máximo de 30 días, salvo que la ley nos obligue a conservarlos por un período determinado.</p>
                    </Section>

                    <Section title="8. Modificaciones del servicio">
                        <p>Istari Core se reserva el derecho de modificar, suspender o interrumpir Listopic (total o parcialmente) en cualquier momento, con o sin previo aviso. No seremos responsables de ningún daño derivado de dichas interrupciones.</p>
                    </Section>

                    <Section title="9. Limitación de responsabilidad">
                        <p>Listopic se proporciona «tal cual», sin garantías de ningún tipo. En la medida máxima permitida por la ley:</p>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            <li>No garantizamos que el servicio esté libre de errores o disponible ininterrumpidamente.</li>
                            <li>No somos responsables del contenido publicado por los usuarios.</li>
                            <li>No somos responsables de daños indirectos, incidentales o consecuentes derivados del uso del servicio.</li>
                        </ul>
                    </Section>

                    <Section title="10. Modificaciones de los términos">
                        <p>Podemos actualizar estos Términos de Uso ocasionalmente. Te notificaremos los cambios significativos mediante un aviso en la app. Si continúas usando Listopic tras la publicación de los cambios, se considerará que los aceptas.</p>
                    </Section>

                    <Section title="11. Ley aplicable">
                        <p>Estos términos se rigen por la legislación española. Para cualquier controversia derivada del uso de Listopic, las partes se someten a los juzgados y tribunales competentes según la normativa española aplicable.</p>
                    </Section>

                    <Section title="12. Contacto">
                        <p>Para cualquier consulta sobre estos términos:</p>
                        <p className="mt-1"><span className="text-white font-medium">Istari Core</span> — <a href="mailto:istaricore@gmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">istaricore@gmail.com</a></p>
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
