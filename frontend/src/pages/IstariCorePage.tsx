import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Sparkles, Target, Heart, ExternalLink } from 'lucide-react';
import { Footer } from '../components/Footer';
import { useAppConfig } from '../context/AppConfigContext';

const ValueCard: React.FC<{ emoji: string; title: string; text: string }> = ({ emoji, title, text }) => (
    <div className="bg-[var(--lt-card-strong)]/60 border border-white/10 rounded-3xl p-6 flex flex-col gap-3 hover:border-[var(--lt-accent-border)] transition-colors">
        <span className="text-3xl">{emoji}</span>
        <h3 className="text-base font-bold text-white">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{text}</p>
    </div>
);

export const IstariCorePage: React.FC = () => {
    const config = useAppConfig();
    return (
        <>
        <div className="min-h-screen bg-[var(--lt-bg)] pb-8">

            {/* Hero */}
            <div className="relative overflow-hidden" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4rem)' }}>
                <div className="absolute inset-0 bg-gradient-to-br from-violet-900/40 via-indigo-900/20 to-[var(--lt-bg)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--lt-bg)] via-transparent to-transparent" />
                <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 pt-10 pb-14">
                    <img
                        src="/images/istari-core-logo.png"
                        alt="Istari Core"
                        className="w-28 sm:w-36 h-auto object-contain mb-4 drop-shadow-[0_0_30px_rgba(139,92,246,0.4)]"
                    />
                    <p className="text-gray-400 text-sm max-w-xs">Un proyecto, una persona, muchas ganas.</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6">

                {/* Misión */}
                <div className="bg-[var(--lt-card-strong)]/60 border border-white/10 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] flex items-center justify-center shrink-0">
                            <Target className="w-4 h-4 text-[var(--lt-accent)]" />
                        </div>
                        <h2 className="text-base font-bold text-white uppercase tracking-widest text-xs text-[var(--lt-accent)]">Misión</h2>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                        Hacer cosas que merezca la pena usar. Sin más. Útiles, bien hechas, honestas sobre lo que son. Si alguien abre la app y piensa "esto sí que funciona", ya hemos cumplido.
                    </p>
                </div>

                {/* Visión */}
                <div className="bg-[var(--lt-card-strong)]/60 border border-white/10 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4 text-violet-400" />
                        </div>
                        <h2 className="text-base font-bold text-white uppercase tracking-widest text-xs text-violet-400">Visión</h2>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                        Seguir siendo pequeños y hacer cosas buenas. No hay prisa por crecer, hay ganas de hacerlo bien. Si dentro de diez años alguien sigue usando algo que construimos hoy, eso es más que suficiente.
                    </p>
                </div>

                {/* Valores */}
                <div>
                    <div className="flex items-center gap-3 mb-4 px-1">
                        <div className="w-9 h-9 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center shrink-0">
                            <Heart className="w-4 h-4 text-pink-400" />
                        </div>
                        <h2 className="text-xs font-bold text-pink-400 uppercase tracking-widest">Valores</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ValueCard
                            emoji="📣"
                            title="Comunicación ante todo"
                            text="Si algo funciona mal, si algo se puede mejorar o si hay nuevas ideas que llevar a cabo, encantados de escucharlas."
                        />
                        <ValueCard
                            emoji="🔍"
                            title="Los detalles que nadie pide"
                            text="La animación que dura 200ms en vez de 300. El texto que dice exactamente lo correcto. Nadie lo pide, pero se nota cuando falta."
                        />
                        <ValueCard
                            emoji="🕹️"
                            title="Que sea divertido hacerlo"
                            text="Si construir esto se convierte en una obligación, algo ha ido mal. El día que deje de apetecer, paramos y lo pensamos."
                        />
                        <ValueCard
                            emoji="🐢"
                            title="Sin prisa"
                            text="No hay inversores, no hay fecha límite artificial. Eso es un lujo y lo sabemos. Lo usamos para hacerlo bien."
                        />
                        <ValueCard
                            emoji="🪞"
                            title="Decir la verdad"
                            text="Beta es beta. Un bug es un bug. Intentaremos siempre llamar a cada cosa por lo que es."
                        />
                        <ValueCard
                            emoji="⚡"
                            title="Que se note el cariño"
                            text="Hay apps que se sienten frías y apps que se sienten vivas. No sabemos explicar bien la diferencia, pero sí reconocerla."
                        />
                    </div>
                </div>

                {/* Proyectos */}
                <div className="bg-[var(--lt-card-strong)]/60 border border-white/10 rounded-3xl p-6">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Nuestros proyectos</h2>
                    <div className="space-y-4">
                        <Link
                            to="/about"
                            className="flex items-center justify-between group hover:opacity-80 transition-opacity"
                        >
                            <div className="flex items-center gap-4">
                                <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shrink-0">
                                    <div className="w-4 h-4 bg-white rounded-full" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">Listopic</p>
                                    <p className="text-xs text-gray-500">Descubre, lista y comparte lugares</p>
                                </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-[var(--lt-accent)] transition-colors shrink-0" />
                        </Link>

                        {config.showLab && (
                            <Link
                                to="/lab"
                                className="flex items-center justify-between group hover:opacity-80 transition-opacity pt-4 border-t border-white/5"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center shadow-lg shrink-0 text-xl">
                                        🧠
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">Simulador Clínico</p>
                                        <p className="text-xs text-gray-500">El Ciclo de la Reactividad · Experimento interactivo</p>
                                    </div>
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-violet-400 transition-colors shrink-0" />
                            </Link>
                        )}
                    </div>
                </div>

                {/* Contacto */}
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <p className="text-gray-500 text-sm">¿Tienes una idea o quieres colaborar?</p>
                    <a
                        href="mailto:istaricore@gmail.com"
                        className="inline-flex items-center gap-2 text-[var(--lt-accent)] hover:text-[var(--lt-accent)] transition-colors font-medium text-sm"
                    >
                        <Mail className="w-4 h-4" />
                        istaricore@gmail.com
                    </a>
                </div>

            </div>
        </div>
        <Footer compact />
        </>
    );
};
