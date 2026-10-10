import { describe, expect, it } from 'vitest';
import {
    DEVELOPER_TABS,
    buildTabSearchParams,
    isDeveloperTab,
    mergeNavigateParams,
    parseDeveloperTab,
    readDeveloperUrlState,
} from './developerTabs';
import { DEVELOPER_NAV_SECTIONS, developerTabLabel } from './developerNav';

const params = (query: string) => new URLSearchParams(query);

describe('parseDeveloperTab / readDeveloperUrlState', () => {
    it('la pestaña por defecto es Pendientes y cualquier id conocido vale (sin lista blanca)', () => {
        expect(parseDeveloperTab(null)).toBe('pending');
        expect(parseDeveloperTab('')).toBe('pending');
        expect(parseDeveloperTab('nope')).toBe('pending');
        expect(parseDeveloperTab('reports')).toBe('reports');
        expect(parseDeveloperTab('proProposals')).toBe('proProposals');
        expect(isDeveloperTab('console')).toBe(true);
        expect(isDeveloperTab(3)).toBe(false);
    });

    it('lee view, status y focus, con claimId como alias de focus', () => {
        expect(readDeveloperUrlState(params('tab=businessClaims&claimId=u1_p1'))).toEqual({
            tab: 'businessClaims',
            view: null,
            status: null,
            focus: 'u1_p1',
        });
        expect(readDeveloperUrlState(params('tab=proProposals&view=history&status=rejected&focus=a&claimId=b'))).toEqual({
            tab: 'proProposals',
            view: 'history',
            status: 'rejected',
            focus: 'a',
        });
        expect(readDeveloperUrlState(params('view=%20%20'))).toEqual({ tab: 'pending', view: null, status: null, focus: null });
    });
});

describe('buildTabSearchParams (goToTab)', () => {
    it('cambia de pestaña y descarta los parámetros de la anterior', () => {
        const next = buildTabSearchParams(params('tab=businessClaims&claimId=x&view=resolved&status=approved&path=/a&utm=keep'), 'reports');
        expect(next.get('tab')).toBe('reports');
        expect(next.get('claimId')).toBeNull();
        expect(next.get('view')).toBeNull();
        expect(next.get('status')).toBeNull();
        expect(next.get('path')).toBeNull();
        expect(next.get('utm')).toBe('keep');
    });

    it('pone los que se le pasan (vista, foco y ?path= de Analítica)', () => {
        const next = buildTabSearchParams(params(''), 'proProposals', { view: 'inbox', focus: 'p1', status: '' });
        expect(next.toString()).toBe('tab=proProposals&view=inbox&focus=p1');
        expect(buildTabSearchParams(params(''), 'analytics', { path: '/list/1' }).get('path')).toBe('/list/1');
    });

    it('una pestaña desconocida cae en Pendientes', () => {
        expect(buildTabSearchParams(params('tab=reports'), 'inventada').get('tab')).toBe('pending');
    });
});

describe('mergeNavigateParams (onNavigate de cada pestaña)', () => {
    it('undefined no toca, vacío o null quita', () => {
        const next = mergeNavigateParams(params('tab=reports&view=resolved&status=rejected&focus=r1'), { status: '', focus: null });
        expect(next.toString()).toBe('tab=reports&view=resolved');
    });

    it('fija la vista y el estado sin perder la pestaña', () => {
        const next = mergeNavigateParams(params('tab=businessClaims'), { view: 'resolved', status: 'approved' });
        expect(next.toString()).toBe('tab=businessClaims&view=resolved&status=approved');
    });

    it('focus sustituye al alias claimId', () => {
        expect(mergeNavigateParams(params('tab=businessClaims&claimId=old'), { focus: 'new' }).toString())
            .toBe('tab=businessClaims&focus=new');
        expect(mergeNavigateParams(params('tab=businessClaims&claimId=old'), { focus: null }).toString())
            .toBe('tab=businessClaims');
        expect(mergeNavigateParams(params('tab=businessClaims&claimId=old'), { view: 'pending' }).get('claimId')).toBe('old');
    });
});

describe('DEVELOPER_NAV_SECTIONS', () => {
    it('cada pestaña aparece una sola vez en la barra lateral', () => {
        const ids = DEVELOPER_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.id));
        expect(new Set(ids).size).toBe(ids.length);
        expect([...ids].sort()).toEqual([...DEVELOPER_TABS].sort());
        expect(DEVELOPER_NAV_SECTIONS.map((section) => section.label)).toEqual([
            'Bandeja', 'Moderación', 'Negocios y planes', 'Contenido', 'Sistema', 'Analítica',
        ]);
        expect(developerTabLabel('pending')).toBe('Pendientes');
        expect(developerTabLabel('raro')).toBe('Developer');
    });

    it('las clases activas son literales (Tailwind 4 no genera clases construidas)', () => {
        DEVELOPER_NAV_SECTIONS.flatMap((section) => section.items).forEach((item) => {
            expect(item.activeClass).not.toContain('${');
            expect(item.activeClass).toMatch(/^border-\S+ bg-\S+$/);
        });
    });
});
