import { useCallback, useEffect, useMemo, useState } from 'react';

type InstallMethod = 'native' | 'ios' | 'manual' | null;

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
}

type ExtendedNavigator = Navigator & {
    standalone?: boolean;
};

const DISPLAY_MODE_QUERY = '(display-mode: standalone)';
const MOBILE_QUERY = '(max-width: 1024px), (pointer: coarse)';

const isIosDevice = (): boolean => {
    if (typeof window === 'undefined') return false;

    const { userAgent, platform, maxTouchPoints } = window.navigator;
    return /iPad|iPhone|iPod/i.test(userAgent)
        || (platform === 'MacIntel' && maxTouchPoints > 1);
};

const isMobileDevice = (): boolean => {
    if (typeof window === 'undefined') return false;

    const mediaMatches = window.matchMedia(MOBILE_QUERY).matches;
    const userAgentMatches = /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    return mediaMatches || userAgentMatches;
};

const isStandaloneApp = (): boolean => {
    if (typeof window === 'undefined') return false;

    return window.matchMedia(DISPLAY_MODE_QUERY).matches
        || Boolean((window.navigator as ExtendedNavigator).standalone)
        || document.referrer.startsWith('android-app://');
};

const hasSecureInstallContext = (): boolean => {
    if (typeof window === 'undefined') return false;

    return window.isSecureContext
        || window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1';
};

const isChromiumLike = (): boolean => {
    if (typeof window === 'undefined') return false;

    const ua = window.navigator.userAgent;
    return /(Chrome|Chromium|Edg|OPR|Brave)/i.test(ua) && !/(Firefox|FxiOS)/i.test(ua);
};

export const usePwaInstall = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [installMethod, setInstallMethod] = useState<InstallMethod>(null);

    const syncEnvironment = useCallback((promptEvent?: BeforeInstallPromptEvent | null) => {
        const mobile = isMobileDevice();
        const installed = isStandaloneApp();
        const nextPrompt = promptEvent ?? deferredPrompt;

        setIsMobile(mobile);
        setIsInstalled(installed);

        if (!mobile || installed) {
            setInstallMethod(null);
            return;
        }

        if (nextPrompt) {
            setInstallMethod('native');
            return;
        }

        setInstallMethod(isIosDevice() ? 'ios' : 'manual');
    }, [deferredPrompt]);

    useEffect(() => {
        syncEnvironment();

        const displayModeMedia = window.matchMedia(DISPLAY_MODE_QUERY);

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            const promptEvent = event as BeforeInstallPromptEvent;
            setDeferredPrompt(promptEvent);
            syncEnvironment(promptEvent);
        };

        const handleAppInstalled = () => {
            setDeferredPrompt(null);
            syncEnvironment(null);
        };

        const handleEnvironmentChange = () => {
            syncEnvironment();
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);
        window.addEventListener('resize', handleEnvironmentChange);

        if (typeof displayModeMedia.addEventListener === 'function') {
            displayModeMedia.addEventListener('change', handleEnvironmentChange);
        } else {
            displayModeMedia.addListener(handleEnvironmentChange);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
            window.removeEventListener('resize', handleEnvironmentChange);

            if (typeof displayModeMedia.removeEventListener === 'function') {
                displayModeMedia.removeEventListener('change', handleEnvironmentChange);
            } else {
                displayModeMedia.removeListener(handleEnvironmentChange);
            }
        };
    }, [syncEnvironment]);

    const triggerInstall = useCallback(async (): Promise<InstallMethod> => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;

            if (outcome === 'accepted') {
                setDeferredPrompt(null);
                syncEnvironment(null);
            }

            return 'native';
        }

        return installMethod;
    }, [deferredPrompt, installMethod, syncEnvironment]);

    const isSecureInstallContext = useMemo(() => hasSecureInstallContext(), []);
    const chromiumLike = useMemo(() => isChromiumLike(), []);

    const manualInstallSteps = useMemo(() => {
        if (installMethod === 'ios') {
            return [
                'Abre esta página en Safari.',
                'Pulsa Compartir.',
                'Elige "Añadir a pantalla de inicio".',
            ];
        }

        return [
            'Abre el menú del navegador.',
            'Toca "Instalar app" o "Añadir a pantalla de inicio".',
            'Confirma la instalación.',
        ];
    }, [installMethod]);

    const installButtonLabel = useMemo(() => {
        if (installMethod === 'ios') return 'Añadir a inicio';
        if (installMethod === 'manual') return 'Cómo instalar';
        return 'Instalar App';
    }, [installMethod]);

    const installHelpText = useMemo(() => {
        if (installMethod === 'ios') {
            return 'Safari en iPhone y iPad no ofrece el prompt beforeinstallprompt. La instalación se hace desde Compartir.';
        }

        if (!isSecureInstallContext) {
            return 'El prompt nativo solo aparece en HTTPS o en localhost. Si estás entrando desde una IP local o una URL http, el navegador no lo mostrará.';
        }

        if (!chromiumLike) {
            return 'El prompt nativo suele estar disponible en navegadores basados en Chromium. En otros navegadores la instalación se hace desde el menú del navegador.';
        }

        return 'Si no aparece el prompt nativo, normalmente el navegador todavía no considera esta visita instalable o estás probando en un entorno de desarrollo no válido.';
    }, [chromiumLike, installMethod, isSecureInstallContext]);

    return {
        installMethod,
        isInstalled,
        isInstallVisible: isMobile && !isInstalled && installMethod !== null,
        installButtonLabel,
        installHelpText,
        isSecureInstallContext,
        manualInstallSteps,
        triggerInstall,
    };
};
