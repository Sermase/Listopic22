import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Footer } from '../Footer';
import { LEGAL } from '../../config/legal';

export const LegalSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
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

export const LegalStrong: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="text-white font-medium">{children}</span>
);

const linkClass = 'text-[var(--lt-accent)] hover:underline transition-colors';

export const LegalLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
    <Link to={to} className={linkClass}>{children}</Link>
);

export const LegalExternal: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>{children}</a>
);

export const LegalMail: React.FC = () => (
    <a href={`mailto:${LEGAL.contactEmail}`} className={linkClass}>{LEGAL.contactEmail}</a>
);

interface LegalLayoutProps {
    title: string;
    icon: React.ReactNode;
    intro?: React.ReactNode;
    children: React.ReactNode;
}

export const LegalLayout: React.FC<LegalLayoutProps> = ({ title, icon, intro, children }) => (
    <>
        <div className="min-h-screen bg-[var(--lt-bg)] pb-8">
            <div className="relative h-40 bg-gradient-to-br from-indigo-900/60 via-[var(--lt-bg)] to-[var(--lt-bg)] flex items-end">
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--lt-bg)] to-transparent" />
                <div className="relative z-10 max-w-3xl mx-auto w-full px-4 sm:px-6 pb-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--lt-accent-soft)] border border-[var(--lt-accent-border)] flex items-center justify-center shrink-0 text-[var(--lt-accent)]">
                        {icon}
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-widest text-[var(--lt-accent)] font-bold mb-0.5">Listopic</p>
                        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">{title}</h1>
                    </div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
                <Link to="/about" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
                    <ArrowLeft className="w-4 h-4" /> Volver a Sobre Listopic
                </Link>

                <div className="bg-[var(--lt-card-strong)]/60 border border-white/10 rounded-3xl p-6 sm:p-8 mb-6">
                    <p className="text-xs text-gray-500 mb-6">Última actualización: {LEGAL.updatedAt}</p>
                    {intro && <div className="text-gray-300 text-sm leading-relaxed mb-8">{intro}</div>}
                    {children}
                </div>

                <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-gray-500 pb-8">
                    <Link to="/terms" className="hover:text-gray-300">Términos de uso</Link>
                    <Link to="/privacy" className="hover:text-gray-300">Privacidad</Link>
                    <Link to="/cookies" className="hover:text-gray-300">Cookies</Link>
                    <Link to="/aviso-legal" className="hover:text-gray-300">Aviso legal</Link>
                </nav>
            </div>
        </div>
        <Footer compact />
    </>
);
