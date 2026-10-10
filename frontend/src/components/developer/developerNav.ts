/**
 * developerNav: secciones de la barra lateral de Developer (§1.5 del diseño).
 *
 * Cada entrada: { id, label, icon, activeClass, badgeKey?, badgeTone? }.
 * `activeClass` va escrita tal cual: Tailwind 4 solo genera las clases que
 * encuentra literalmente en el código (nada de `border-${color}-500`).
 * `badgeKey` enlaza con DeveloperPendingCounts.badges (hooks/useDeveloperInbox).
 *
 * API
 *   DEVELOPER_NAV_SECTIONS: DeveloperNavSection[]
 *   developerTabLabel(tab): string          «Pendientes», «Reportes»… (cabecera móvil)
 */
import {
    Activity,
    Archive,
    BarChart3,
    Building2,
    ClipboardList,
    CloudLightning,
    Database,
    FileDown,
    Flag,
    FlaskConical,
    Inbox,
    List as ListIcon,
    MapPin,
    MapPinned,
    Megaphone,
    MessageSquare,
    Palette,
    RefreshCw,
    ScrollText,
    SlidersHorizontal,
    Sparkles,
    Tag,
    Trophy,
    Users,
    type LucideIcon,
} from 'lucide-react';
import type { SidebarBadgeTab } from '../../hooks/useDeveloperInbox';
import type { DeveloperActiveTab } from './developerTabs';

export type DeveloperBadgeTone = 'accent' | 'red' | 'amber';

export interface DeveloperNavItem {
    id: DeveloperActiveTab;
    label: string;
    icon: LucideIcon;
    /** Borde y fondo de la pestaña activa (cadena literal). */
    activeClass: string;
    badgeKey?: SidebarBadgeTab;
    /** Color del contador «por revisar». */
    badgeTone?: DeveloperBadgeTone;
}

export interface DeveloperNavSection {
    id: string;
    label: string;
    items: DeveloperNavItem[];
}

const ACCENT = 'border-[var(--lt-accent-border)] bg-[var(--lt-accent-soft)]';

export const DEVELOPER_NAV_SECTIONS: DeveloperNavSection[] = [
    {
        id: 'inbox',
        label: 'Bandeja',
        items: [
            { id: 'pending', label: 'Pendientes', icon: Inbox, activeClass: ACCENT, badgeKey: 'pending', badgeTone: 'accent' },
        ],
    },
    {
        id: 'moderation',
        label: 'Moderación',
        items: [
            { id: 'reports', label: 'Reportes', icon: Flag, activeClass: 'border-red-500 bg-red-500/5', badgeKey: 'reports', badgeTone: 'red' },
        ],
    },
    {
        id: 'business',
        label: 'Negocios y planes',
        items: [
            { id: 'businessClaims', label: 'Solicitudes negocio', icon: ClipboardList, activeClass: 'border-emerald-500 bg-emerald-500/5', badgeKey: 'businessClaims', badgeTone: 'amber' },
            { id: 'businessManagers', label: 'Gestor negocios', icon: Building2, activeClass: 'border-emerald-500 bg-emerald-500/5' },
            { id: 'plans', label: 'Planes', icon: Sparkles, activeClass: 'border-amber-500 bg-amber-500/5', badgeKey: 'plans', badgeTone: 'amber' },
            { id: 'proProposals', label: 'Patrocinios y Pro', icon: Megaphone, activeClass: 'border-indigo-400 bg-indigo-400/5', badgeKey: 'proProposals', badgeTone: 'amber' },
        ],
    },
    {
        id: 'content',
        label: 'Contenido',
        items: [
            { id: 'lists', label: 'Listas', icon: ListIcon, activeClass: ACCENT },
            { id: 'places', label: 'Lugares', icon: MapPin, activeClass: 'border-green-500 bg-green-500/5' },
            { id: 'reviews', label: 'Reseñas', icon: MessageSquare, activeClass: 'border-amber-500 bg-amber-500/5' },
            { id: 'tags', label: 'Etiquetas', icon: Tag, activeClass: 'border-pink-500 bg-pink-500/5' },
            { id: 'usuarios', label: 'Usuarios', icon: Users, activeClass: ACCENT },
            { id: 'proyectos', label: 'Proyectos', icon: FlaskConical, activeClass: 'border-indigo-400 bg-indigo-400/5' },
            { id: 'gamification', label: 'Gamificación', icon: Trophy, activeClass: 'border-amber-500 bg-amber-500/5' },
        ],
    },
    {
        id: 'system',
        label: 'Sistema',
        items: [
            { id: 'console', label: 'Consola de Datos', icon: Database, activeClass: ACCENT },
            { id: 'algolia', label: 'Algolia Sync', icon: CloudLightning, activeClass: 'border-cyan-500 bg-cyan-500/5' },
            { id: 'maintenance', label: 'Mantenimiento', icon: RefreshCw, activeClass: 'border-emerald-500 bg-emerald-500/5' },
            { id: 'backups', label: 'Backups', icon: Archive, activeClass: 'border-emerald-500 bg-emerald-500/5' },
            { id: 'branding', label: 'Marca & SEO', icon: Palette, activeClass: ACCENT },
            { id: 'others', label: 'OTROS', icon: SlidersHorizontal, activeClass: 'border-amber-500 bg-amber-500/5' },
            { id: 'rgpd', label: 'RGPD / Datos', icon: FileDown, activeClass: 'border-violet-500 bg-violet-500/5' },
            { id: 'audit', label: 'Audit Log', icon: ScrollText, activeClass: 'border-rose-500 bg-rose-500/5' },
            { id: 'apiusage', label: 'API Usage', icon: Activity, activeClass: 'border-[var(--lt-accent)] bg-[var(--lt-accent-soft)]' },
        ],
    },
    {
        id: 'analytics',
        label: 'Analítica',
        items: [
            { id: 'analytics', label: 'Analítica páginas', icon: BarChart3, activeClass: 'border-violet-400 bg-violet-400/5' },
            { id: 'geoAnalytics', label: 'Mapas analíticos', icon: MapPinned, activeClass: 'border-cyan-400 bg-cyan-400/5' },
        ],
    },
];

const LABELS = new Map<string, string>(
    DEVELOPER_NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.id, item.label] as const)),
);

export const developerTabLabel = (tab: string): string => LABELS.get(tab) ?? 'Developer';
