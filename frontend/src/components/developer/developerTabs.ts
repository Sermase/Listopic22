/**
 * developerTabs: pestañas de /developer y el contrato de URL que comparten.
 *
 * La URL decide la pestaña (se lee en cada render, así funcionan los enlaces de
 * emails y notificaciones también estando ya dentro de /developer):
 *   ?tab=<id>&view=<pending|resolved|inbox|active|history|…>&status=<filtro>&focus=<docId>
 *   `claimId` se acepta como alias de `focus` (emails de solicitudes ya enviados).
 *
 * API
 *   DEVELOPER_TABS (as const), type DeveloperActiveTab, DEFAULT_DEVELOPER_TAB = 'pending'
 *   isDeveloperTab(value) / parseDeveloperTab(value)       desconocida o vacía → 'pending'
 *   readDeveloperUrlState(searchParams): { tab, view, status, focus }
 *   buildTabSearchParams(current, tab, params?)            goToTab: cambia de pestaña (push) y
 *                                                          descarta view/status/focus/claimId/path
 *                                                          de la anterior (salvo los que pases)
 *   mergeNavigateParams(current, params)                   onNavigate de una pestaña (replace):
 *                                                          undefined = no tocar; '' o null = quitar
 *
 * Contrato de cada pestaña con colas: DeveloperTabProps
 *   { focusId?, view?, status?, onNavigate({ view?, status?, focus? }) }
 * Para enlazar a otra pestaña: GoToTab = (tab, { view?, status?, focus?, path? }) => void
 */

export const DEVELOPER_TABS = [
    'pending',
    'console',
    'algolia',
    'maintenance',
    'gamification',
    'reports',
    'businessClaims',
    'businessManagers',
    'plans',
    'proProposals',
    'backups',
    'branding',
    'others',
    'proyectos',
    'lists',
    'places',
    'reviews',
    'tags',
    'usuarios',
    'rgpd',
    'audit',
    'apiusage',
    'analytics',
    'geoAnalytics',
] as const;

export type DeveloperActiveTab = typeof DEVELOPER_TABS[number];

export const DEFAULT_DEVELOPER_TAB: DeveloperActiveTab = 'pending';

const TAB_IDS: ReadonlySet<string> = new Set(DEVELOPER_TABS);

export const isDeveloperTab = (value: unknown): value is DeveloperActiveTab =>
    typeof value === 'string' && TAB_IDS.has(value);

export const parseDeveloperTab = (value: string | null | undefined): DeveloperActiveTab =>
    (isDeveloperTab(value) ? value : DEFAULT_DEVELOPER_TAB);

export interface DeveloperNavigateParams {
    view?: string | null;
    status?: string | null;
    focus?: string | null;
}

/** Props que DeveloperPage pasa a las pestañas con colas (reportes, solicitudes, planes, Pro…). */
export interface DeveloperTabProps {
    focusId?: string | null;
    view?: string | null;
    status?: string | null;
    /** Cambia view/status/focus de la pestaña actual (replace en la URL). */
    onNavigate: (params: DeveloperNavigateParams) => void;
}

export interface GoToTabParams extends DeveloperNavigateParams {
    /** ?path= de Analítica páginas. */
    path?: string | null;
}

/** Enlace a otra pestaña (push en la URL). */
export type GoToTab = (tab: string, params?: GoToTabParams) => void;

export interface DeveloperUrlState {
    tab: DeveloperActiveTab;
    view: string | null;
    status: string | null;
    focus: string | null;
}

const clean = (value: string | null): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
};

export const readDeveloperUrlState = (params: URLSearchParams): DeveloperUrlState => ({
    tab: parseDeveloperTab(params.get('tab')),
    view: clean(params.get('view')),
    status: clean(params.get('status')),
    focus: clean(params.get('focus')) ?? clean(params.get('claimId')),
});

/** Parámetros que pertenecen a una pestaña y no deben pasar a otra. */
const TAB_SCOPED_KEYS = ['view', 'status', 'focus', 'claimId', 'path'] as const;
const GO_TO_KEYS = ['view', 'status', 'focus', 'path'] as const;
const NAVIGATE_KEYS = ['view', 'status', 'focus'] as const;

export function buildTabSearchParams(
    current: URLSearchParams,
    tab: string,
    params: GoToTabParams = {},
): URLSearchParams {
    const next = new URLSearchParams(current);
    TAB_SCOPED_KEYS.forEach((key) => next.delete(key));
    next.set('tab', parseDeveloperTab(tab));
    GO_TO_KEYS.forEach((key) => {
        const value = params[key]?.trim();
        if (value) next.set(key, value);
    });
    return next;
}

export function mergeNavigateParams(current: URLSearchParams, params: DeveloperNavigateParams): URLSearchParams {
    const next = new URLSearchParams(current);
    NAVIGATE_KEYS.forEach((key) => {
        const value = params[key];
        if (value === undefined) return;
        // `focus` sustituye al alias antiguo: si no, el claimId volvería a enfocar.
        if (key === 'focus') next.delete('claimId');
        const trimmed = value?.trim();
        if (trimmed) next.set(key, trimmed);
        else next.delete(key);
    });
    return next;
}
