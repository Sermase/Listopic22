import React from 'react';
import { Link } from 'react-router-dom';

const InstagramIcon = () => (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
);

export const Footer: React.FC<{ compact?: boolean }> = ({ compact }) => {
    return (
        <footer className={`w-full border-t border-white/5 bg-[#0d1225] ${compact ? 'mt-4' : 'mt-16'}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
                {/* Desktop: 3 columnas / Mobile: apilado centrado */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">

                    {/* Logo + copyright */}
                    <div className="flex flex-col items-center md:items-start gap-2">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-600 blur-lg opacity-30 rounded-xl" />
                                <div className="relative w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                                    <div className="w-3 h-3 bg-white rounded-full" />
                                </div>
                            </div>
                            <span className="text-base font-display font-bold text-white">Listopic</span>
                        </div>
                        <p className="text-xs text-gray-600">© {new Date().getFullYear()} Istari Core</p>
                    </div>

                    {/* Links */}
                    <nav className="flex flex-wrap justify-center md:justify-center gap-x-6 gap-y-3 text-sm">
                        <Link to="/about" className="text-gray-500 hover:text-white transition-colors">
                            Sobre Listopic
                        </Link>
                        <Link to="/privacy" className="text-gray-500 hover:text-white transition-colors">
                            Política de Privacidad
                        </Link>
                        <Link to="/istari-core" className="text-gray-500 hover:text-white transition-colors">
                            Istari Core
                        </Link>
                        <a href="mailto:istaricore@gmail.com" className="text-gray-500 hover:text-white transition-colors">
                            Contacto
                        </a>
                    </nav>

                    {/* Redes sociales */}
                    <div className="flex justify-center md:justify-end">
                        <a
                            href="https://www.instagram.com/listopic/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-gray-500 hover:text-pink-400 transition-colors group"
                        >
                            <InstagramIcon />
                            <span className="text-sm group-hover:text-pink-400 transition-colors">@listopic</span>
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
};
