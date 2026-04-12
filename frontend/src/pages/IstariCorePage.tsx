import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Sparkles, Target, Heart, ExternalLink } from 'lucide-react';
import { Footer } from '../components/Footer';

const ValueCard: React.FC<{ emoji: string; title: string; text: string }> = ({ emoji, title, text }) => (
    <div className="bg-[#151b2e]/60 border border-white/10 rounded-3xl p-6 flex flex-col gap-3 hover:border-indigo-500/20 transition-colors">
        <span className="text-3xl">{emoji}</span>
        <h3 className="text-base font-bold text-white">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{text}</p>
    </div>
);

export const IstariCorePage: React.FC = () => {
    return (
        <>
        <div className="min-h-screen bg-[#0b1021] pb-8">

            {/* Hero */}
            <div className="relative overflow-hidden" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4rem)' }}>
                <div className="absolute inset-0 bg-gradient-to-br from-violet-900/40 via-indigo-900/20 to-[#0b1021]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-transparent to-transparent" />
                <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 pt-10 pb-14">
                    <img
                        src="/images/istari-core-logo.png"
                        alt="Istari Core"
                        className="w-28 sm:w-36 h-auto object-contain mb-4 drop-shadow-[0_0_30px_rgba(139,92,246,0.4)]"
                    />
                    <p className="text-gray-400 text-sm max-w-xs">Construimos herramientas con alma.</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6">

                {/* Misión */}
                <div className="bg-[#151b2e]/60 border border-white/10 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                            <Target className="w-4 h-4 text-indigo-400" />
                        </div>
                        <h2 className="text-base font-bold text-white uppercase tracking-widest text-xs text-indigo-400">Misión</h2>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                        Crear productos digitales que la gente quiera usar de verdad — útiles, bien diseñados y honestos. Herramientas que resuelvan problemas reales sin añadir ruido innecesario.
                    </p>
                </div>

                {/* Visión */}
                <div className="bg-[#151b2e]/60 border border-white/10 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4 text-violet-400" />
                        </div>
                        <h2 className="text-base font-bold text-white uppercase tracking-widest text-xs text-violet-400">Visión</h2>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed">
                        Un estudio pequeño con impacto grande. Queremos demostrar que se pueden construir productos excelentes disfrutando de cada paso del camino — sin prisa, sin atajos, saboreando el proceso tanto como el resultado.
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
                            emoji="🎯"
                            title="Simplicidad deliberada"
                            text="Lo más difícil es hacer algo simple. Cada decisión de diseño busca quitar, no añadir."
                        />
                        <ValueCard
                            emoji="🎨"
                            title="El detalle importa"
                            text="La diferencia entre bueno y memorable está en los detalles que nadie pide pero todos notan."
                        />
                        <ValueCard
                            emoji="🕹️"
                            title="Disfruta el proceso"
                            text="No hay destino que justifique un camino sin alma. Construimos con curiosidad, humor y ganas de aprender."
                        />
                        <ValueCard
                            emoji="🌱"
                            title="Crece despacio, crece bien"
                            text="Sin atajos. Cada versión mejor que la anterior, dando pasos conscientes y saboreando cada hito."
                        />
                        <ValueCard
                            emoji="🤝"
                            title="Honestidad"
                            text="Con los usuarios, con el producto y con nosotros mismos. Prometemos lo que podemos cumplir."
                        />
                        <ValueCard
                            emoji="✨"
                            title="Magia en lo cotidiano"
                            text="Las mejores herramientas hacen sentir al usuario que tiene superpoderes. Eso es lo que perseguimos."
                        />
                    </div>
                </div>

                {/* Proyectos */}
                <div className="bg-[#151b2e]/60 border border-white/10 rounded-3xl p-6">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Nuestros proyectos</h2>
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
                        <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors shrink-0" />
                    </Link>
                </div>

                {/* Contacto */}
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <p className="text-gray-500 text-sm">¿Tienes una idea o quieres colaborar?</p>
                    <a
                        href="mailto:istaricore@gmail.com"
                        className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors font-medium text-sm"
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
