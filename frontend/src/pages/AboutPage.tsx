import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Mail, Shield, Star, List, MapPin, Users } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Footer } from '../components/Footer';

const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener noreferrer');
};

export const AboutPage: React.FC = () => {
    const handlePrivacyClick = (e: React.MouseEvent) => {
        if (Capacitor.isNativePlatform()) {
            e.preventDefault();
            openExternal('https://listopic.es/privacy');
        }
    };

    return (
        <>
        <div className="min-h-screen bg-[#0b1021] pb-8">
            {/* Hero — padding-top para compensar la navbar fija */}
            <div className="relative overflow-hidden" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4rem)' }}>
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 via-cyan-900/20 to-[#0b1021]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1021] via-transparent to-transparent" />
                <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 pt-10 pb-12">
                    <div className="relative mb-3">
                        <div className="absolute inset-0 bg-blue-600 blur-2xl opacity-30 rounded-2xl" />
                        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-xl">
                            <div className="w-6 h-6 bg-white rounded-full shadow-sm" />
                        </div>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-display font-bold text-white">Listopic</h1>
                    <p className="text-gray-400 text-sm mt-1">Descubre, lista y comparte</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4">

                {/* Qué es Listopic */}
                <div className="bg-[#151b2e]/60 border border-white/10 rounded-3xl p-6">
                    <h2 className="text-lg font-bold text-white mb-3">¿Qué es Listopic?</h2>
                    <p className="text-gray-300 text-sm leading-relaxed mb-4">
                        Listopic es una app para crear listas de lugares, descubrir recomendaciones y compartir reseñas con tu comunidad. Organiza tus sitios favoritos, descubre nuevos rincones y conecta con personas que comparten tus gustos.
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { icon: List, label: 'Listas' },
                            { icon: MapPin, label: 'Lugares' },
                            { icon: Users, label: 'Comunidad' },
                        ].map(({ icon: Icon, label }) => (
                            <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/5">
                                <Icon className="w-5 h-5 text-indigo-400" />
                                <span className="text-xs text-gray-400 font-medium">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Play Store */}
                <button
                    onClick={() => openExternal('https://play.google.com/store/apps/details?id=app.listopic.web')}
                    className="w-full flex items-center justify-between p-5 bg-[#151b2e]/60 border border-white/10 rounded-3xl hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20 flex items-center justify-center shrink-0">
                            <Star className="w-5 h-5 text-green-400" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-bold text-white">Disponible en Google Play</p>
                            <p className="text-xs text-gray-500">Descarga la app para Android</p>
                        </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-indigo-400 transition-colors shrink-0" />
                </button>

                {/* Istari Core */}
                <div className="bg-[#151b2e]/60 border border-white/10 rounded-3xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                            <span className="text-indigo-400 font-bold text-sm">IC</span>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white">Istari Core</h2>
                            <p className="text-xs text-gray-500">Desarrollador</p>
                        </div>
                    </div>
                    <p className="text-gray-300 text-sm leading-relaxed mb-4">
                        Listopic es desarrollado y mantenido por Istari Core. Nuestro objetivo es crear herramientas útiles, sencillas y bien diseñadas para el día a día.
                    </p>
                    <a
                        href="mailto:istaricore@gmail.com"
                        className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                    >
                        <Mail className="w-4 h-4" />
                        istaricore@gmail.com
                    </a>
                </div>

                {/* Privacidad */}
                <Link
                    to="/privacy"
                    onClick={handlePrivacyClick}
                    className="flex items-center justify-between p-5 bg-[#151b2e]/60 border border-white/10 rounded-3xl hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                            <Shield className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white">Política de Privacidad</p>
                            <p className="text-xs text-gray-500">RGPD · Datos y derechos</p>
                        </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-indigo-400 transition-colors shrink-0" />
                </Link>

                {/* Footer */}
            </div>
        </div>
        <Footer compact />
        </>
    );
};
