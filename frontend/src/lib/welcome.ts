/** Bienvenida de la primera visita: se recuerda en el navegador. */
export const WELCOME_SEEN_KEY = 'listopic_welcome_seen_v1';
export const WELCOME_EVENT = 'listopic:welcome';

export const welcomeSeen = (): boolean => {
    try { return localStorage.getItem(WELCOME_SEEN_KEY) === '1'; } catch { return true; }
};

export const markWelcomeSeen = () => {
    try { localStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch { /* opcional */ }
};

/** Vuelve a abrir la bienvenida (desde Ayuda). */
export const reopenWelcome = () => {
    window.dispatchEvent(new Event(WELCOME_EVENT));
};
