import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { Footer } from '../components/Footer';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-1 h-5 bg-[var(--lt-accent)] rounded-full inline-block" />
            {title}
        </h2>
        <div className="text-gray-300 text-sm leading-relaxed space-y-2 pl-3">
            {children}
        </div>
    </section>
);

export const PrivacyPage: React.FC = () => {
    return (
        <>
            <div className="min-h-screen bg-[var(--lt-bg)] pb-8">
                {/* Header */}
                <div className="relative h-40 bg-gradient-to-br from-indigo-900/60 via-[var(--lt-bg)] to-[var(--lt-bg)] flex items-end">
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--lt-bg)] to-transparent" />
                    <div className="relative z-10 max-w-3xl mx-auto w-full px-4 sm:px-6 pb-6 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] flex items-center justify-center shrink-0">
                            <Shield className="w-6 h-6 text-[var(--lt-accent)]" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-[var(--lt-accent)] font-bold mb-0.5">Listopic</p>
                            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">Política de Privacidad</h1>
                        </div>
                    </div>
                </div>

                <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
                    {/* Back link */}
                    <Link to="/about" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
                        <ArrowLeft className="w-4 h-4" /> Volver a Sobre Listopic
                    </Link>

                    <div className="bg-[var(--lt-card-strong)]/60 border border-white/10 rounded-3xl p-6 sm:p-8 mb-6">
                        <p className="text-xs text-gray-500 mb-6">Última actualización: 12 de abril de 2026</p>

                        <p className="text-gray-300 text-sm leading-relaxed mb-8">
                            En Listopic nos tomamos muy en serio la privacidad de nuestros usuarios. Esta política explica qué datos recogemos, cómo los usamos y cuáles son tus derechos, de acuerdo con el Reglamento General de Protección de Datos (RGPD) de la Unión Europea y la legislación española aplicable.
                        </p>

                        <Section title="1. Responsable del tratamiento">
                            <p><span className="text-white font-medium">Istari Core</span></p>
                            <p>Correo electrónico: <a href="mailto:istaricore@gmail.com" className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">istaricore@gmail.com</a></p>
                        </Section>

                        <Section title="2. Datos que recogemos">
                            <p><span className="text-white font-medium">Datos de cuenta:</span> nombre, dirección de correo electrónico y foto de perfil, obtenidos mediante Google Sign-In o registro manual con contraseña.</p>
                            <p><span className="text-white font-medium">Contenido generado por el usuario:</span> listas, reseñas, valoraciones, comentarios y fotografías que publicas en la app.</p>
                            <p><span className="text-white font-medium">Datos de uso:</span> actividad dentro de la app (listas visitadas, reseñas realizadas, interacciones sociales).</p>
                            <p><span className="text-white font-medium">Datos de ubicación:</span> únicamente si concedes permiso explícito, para mostrar lugares cercanos a tu posición.</p>
                            <p><span className="text-white font-medium">Datos técnicos:</span> identificador de instalación y sistema operativo, recogidos automáticamente por Firebase para el correcto funcionamiento del servicio.</p>
                        </Section>

                        <Section title="3. Finalidad del tratamiento">
                            <ul className="list-disc list-inside space-y-1">
                                <li>Gestionar tu cuenta y autenticar tu acceso al servicio.</li>
                                <li>Proporcionar las funcionalidades de Listopic (listas, reseñas, chats, notificaciones).</li>
                                <li>Permitir la interacción social entre usuarios (seguir, compartir, comentar).</li>
                                <li>Mejorar la aplicación mediante análisis de uso agregado y anónimo.</li>
                                <li>Garantizar la seguridad y el correcto funcionamiento del servicio.</li>
                            </ul>
                        </Section>

                        <Section title="4. Base legal del tratamiento">
                            <p><span className="text-white font-medium">Ejecución del contrato:</span> el tratamiento de tus datos de cuenta y contenido es necesario para prestarte el servicio de Listopic (art. 6.1.b RGPD).</p>
                            <p><span className="text-white font-medium">Consentimiento:</span> para el acceso a tu ubicación y el envío de notificaciones push (art. 6.1.a RGPD). Puedes retirar tu consentimiento en cualquier momento desde los ajustes del dispositivo.</p>
                            <p><span className="text-white font-medium">Interés legítimo:</span> para garantizar la seguridad, prevenir fraudes y mejorar el rendimiento de la app (art. 6.1.f RGPD).</p>
                        </Section>

                        <Section title="5. Proveedores de servicios (terceros)">
                            <p>Para ofrecer Listopic utilizamos los siguientes servicios de terceros, que actúan como encargados del tratamiento y solo procesan datos según nuestras instrucciones:</p>
                            <ul className="list-disc list-inside space-y-2 mt-2">
                                <li>
                                    <span className="text-white font-medium">Google Firebase</span> (Google LLC) — autenticación, base de datos (Firestore), almacenamiento de archivos y notificaciones push.{' '}
                                    <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">Política de privacidad</a>
                                </li>
                                <li>
                                    <span className="text-white font-medium">Algolia</span> (Algolia SAS) — motor de búsqueda para contenidos de la app.{' '}
                                    <a href="https://www.algolia.com/policies/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">Política de privacidad</a>
                                </li>
                            </ul>
                        </Section>

                        <Section title="6. Transferencias internacionales">
                            <p>Los datos se almacenan en servidores de Google Firebase ubicados en la región <span className="text-white font-medium">europe-west1 (Bélgica)</span>, dentro del Espacio Económico Europeo. No realizamos transferencias de datos fuera del EEE.</p>
                        </Section>

                        <Section title="7. Conservación de datos">
                            <ul className="list-disc list-inside space-y-1">
                                <li><span className="text-white font-medium">Datos de cuenta y contenido:</span> mientras mantengas tu cuenta activa o hasta que la elimines desde la configuración de tu perfil.</li>
                                <li><span className="text-white font-medium">Eliminación de cuenta:</span> Al borrar tu cuenta desde la app, tu información personal (perfil, seguidores, notificaciones) se borra de forma definitiva e inmediata. Puedes decidir si eliminas también tus reseñas y listas o si las conservas de forma anónima.</li>
                                <li><span className="text-white font-medium">Datos técnicos:</span> máximo 14 meses desde su recogida.</li>
                            </ul>
                        </Section>

                        <Section title="8. Uso de Cookies">
                            <p>Listopic utiliza exclusivamente cookies técnicas y de sesión estrictamente necesarias para el funcionamiento de la aplicación, como mantener tu sesión de usuario activa y segura (gestionadas por Google Firebase). No utilizamos cookies de terceros para publicidad, rastreo ni análisis de comportamiento. Por ello, conforme a la normativa de protección de datos (RGPD/LSSI), no es necesario un banner de consentimiento expreso para cookies.</p>
                        </Section>

                        <Section title="9. Tus derechos">
                            <p>De acuerdo con el RGPD, tienes los siguientes derechos sobre tus datos personales:</p>
                            <ul className="list-disc list-inside space-y-1 mt-2">
                                <li><span className="text-white font-medium">Acceso:</span> solicitar una copia de los datos que tratamos sobre ti.</li>
                                <li><span className="text-white font-medium">Rectificación:</span> corregir datos inexactos o incompletos.</li>
                                <li><span className="text-white font-medium">Supresión:</span> solicitar la eliminación de tu cuenta y todos tus datos.</li>
                                <li><span className="text-white font-medium">Portabilidad:</span> recibir tus datos en un formato estructurado y de uso común.</li>
                                <li><span className="text-white font-medium">Oposición y limitación:</span> oponerte o limitar ciertos tratamientos basados en interés legítimo.</li>
                                <li><span className="text-white font-medium">Retirar el consentimiento:</span> en cualquier momento, sin efecto retroactivo.</li>
                            </ul>
                            <p className="mt-3">Para ejercer cualquiera de estos derechos, escríbenos a: <a href="mailto:istaricore@gmail.com" className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">istaricore@gmail.com</a></p>
                            <p className="mt-2">Si consideras que el tratamiento de tus datos no es conforme al RGPD, puedes presentar una reclamación ante la <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">Agencia Española de Protección de Datos (AEPD)</a>.</p>
                        </Section>

                        <Section title="10. Menores de edad">
                            <p>Listopic no está dirigida a menores de <span className="text-white font-medium">16 años</span>. No recogemos conscientemente datos personales de menores. Si detectamos que un usuario es menor de 16 años, procederemos a eliminar su cuenta y datos de forma inmediata. Si eres el padre, madre o tutor de un menor que ha creado una cuenta, contáctanos en <a href="mailto:istaricore@gmail.com" className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">istaricore@gmail.com</a>.</p>
                        </Section>

                        <Section title="11. Seguridad">
                            <p>Aplicamos medidas técnicas y organizativas adecuadas para proteger tus datos personales, incluyendo cifrado en tránsito (HTTPS/TLS), cifrado en reposo en Firebase, y control de acceso mediante autenticación. Sin embargo, ningún sistema de transmisión por internet es completamente seguro.</p>
                        </Section>

                        <Section title="12. Cambios en esta política">
                            <p>Podemos actualizar esta política ocasionalmente. Te notificaremos los cambios significativos mediante un aviso en la app o por correo electrónico. La fecha de «Última actualización» al inicio del documento refleja siempre la versión vigente.</p>
                        </Section>

                        <Section title="13. Contacto">
                            <p>Para cualquier consulta sobre privacidad o protección de datos:</p>
                            <p className="mt-1"><span className="text-white font-medium">Istari Core</span> — <a href="mailto:istaricore@gmail.com" className="text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors">istaricore@gmail.com</a></p>
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
