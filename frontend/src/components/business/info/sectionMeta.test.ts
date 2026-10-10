import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

import type { BusinessInfoDocument, BusinessInfoSection, BusinessSectionData } from '../../../types/businessInfo';
import {
    SECTION_GROUPS,
    SECTION_META,
    SECTION_ORDER,
    completionPercent,
    firstIncompleteSection,
    sectionStatus,
    sectionSummary,
} from './sectionMeta';

const ALL_SECTIONS: BusinessInfoSection[] = [
    'identity', 'contact', 'commercial', 'accessibility', 'family', 'pets', 'dietary', 'hours', 'reservations', 'deliveries',
];

const docOf = <S extends BusinessInfoSection>(section: S, data: BusinessSectionData[S], version = 0): BusinessInfoDocument<S> => ({
    section,
    schemaVersion: 1,
    source: 'business_user',
    status: 'active',
    tier: 'free',
    version,
    hiddenFields: [],
    data,
});

const emptySections = (): Record<BusinessInfoSection, BusinessInfoDocument> => Object.fromEntries(
    ALL_SECTIONS.map((section) => [section, docOf(section, {})]),
) as Record<BusinessInfoSection, BusinessInfoDocument>;

describe('sectionMeta', () => {
    it('cada sección está en un grupo, una sola vez', () => {
        expect([...SECTION_ORDER].sort()).toEqual([...ALL_SECTIONS].sort());
        expect(SECTION_GROUPS.map((group) => group.title)).toEqual(['Lo básico', 'Qué ofreces', 'Para quién es', 'Pide o reserva']);
        ALL_SECTIONS.forEach((section) => {
            const meta = SECTION_META[section];
            expect(meta.id).toBe(section);
            expect(SECTION_GROUPS.find((group) => group.id === meta.group)?.sections).toContain(section);
        });
    });

    it('identidad: completa con nombre o descripción', () => {
        expect(sectionStatus(docOf('identity', {}))).toBe('empty');
        expect(sectionStatus(docOf('identity', { languages: ['Español'] }))).toBe('partial');
        expect(sectionStatus(docOf('identity', { description: { es: 'Tortilla de la abuela' } }))).toBe('complete');
        expect(sectionStatus(docOf('identity', { displayName: { es: '   ' } }))).toBe('empty');
    });

    it('comercial: precio, una cocina y un pago', () => {
        expect(sectionStatus(docOf('commercial', { priceRange: 'medium', cuisineTypes: ['Tapas'] }))).toBe('partial');
        expect(sectionStatus(docOf('commercial', { priceRange: 'medium', cuisineTypes: ['Tapas'], paymentMethods: ['Bizum'] }))).toBe('complete');
        expect(sectionSummary(docOf('commercial', { priceRange: 'medium', cuisineTypes: ['tapas'], services: ['WiFi', 'Terraza'] })))
            .toBe('💶 €€ · 🍢 Tapas · 2 servicios');
    });

    it('accesibilidad, familias, mascotas y dietas: completas al guardarlas aunque no marquen nada', () => {
        (['accessibility', 'family', 'pets', 'dietary'] as const).forEach((section) => {
            expect(sectionStatus(docOf(section, {}, 0))).toBe('empty');
            expect(sectionStatus(docOf(section, {}, 1))).toBe('complete');
        });
        expect(sectionStatus(docOf('pets', { waterBowls: true }, 0))).toBe('partial');
    });

    it('horarios: al menos un día cerrado o con un turno válido', () => {
        expect(sectionStatus(docOf('hours', { weeklySchedule: [{ day: 0, periods: [{ open: '09:00', close: '' }] }] }))).toBe('partial');
        expect(sectionStatus(docOf('hours', { weeklySchedule: [{ day: 0, periods: [{ open: '09:00', close: '14:00' }] }] }))).toBe('complete');
        expect(sectionStatus(docOf('hours', { weeklySchedule: [{ day: 6, closed: true, periods: [] }] }))).toBe('complete');
    });

    it('reservas: activadas y con enlace', () => {
        expect(sectionStatus(docOf('reservations', { enabled: true }))).toBe('partial');
        expect(sectionStatus(docOf('reservations', { enabled: true, externalUrl: 'https://reservas.example' }))).toBe('complete');
        expect(sectionStatus(docOf('reservations', { enabled: false, externalUrl: 'https://reservas.example' }))).toBe('partial');
    });

    it('delivery: un enlace o guardada', () => {
        expect(sectionStatus(docOf('deliveries', {}))).toBe('empty');
        expect(sectionStatus(docOf('deliveries', {}, 2))).toBe('complete');
        expect(sectionStatus(docOf('deliveries', { links: [{ provider: 'glovo', url: 'https://glovo.example' }] }))).toBe('complete');
        expect(sectionSummary(docOf('deliveries', { links: [{ provider: 'glovo', url: 'x' }, { url: 'y' }] }))).toBe('🟡 Glovo · 🔗 Otro');
    });

    it('resume con emoji y corta a tres', () => {
        const pets = docOf('pets', { petPolicy: 'dogs_only', waterBowls: true, requiresLeash: true, petMenu: true, treatsAvailable: true }, 1);
        expect(sectionSummary(pets)).toBe('🐶 Solo perros · 💧 Cuencos de agua · 🦴 Chuches +2');
        expect(sectionSummary(docOf('family', {}))).toBe('');
    });

    it('progreso y primera sección pendiente', () => {
        const sections = emptySections();
        expect(completionPercent(sections)).toBe(0);
        expect(firstIncompleteSection(sections)).toBe('identity');
        sections.identity = docOf('identity', { displayName: { es: 'Casa Pepe' } });
        sections.contact = docOf('contact', { phone: '963 12 34 56' });
        expect(firstIncompleteSection(sections)).toBe('hours');
        expect(completionPercent(sections)).toBe(20);
        SECTION_ORDER.forEach((section) => {
            sections[section] = { ...sections[section], version: 1 };
        });
        sections.hours = docOf('hours', { weeklySchedule: [{ day: 0, closed: true }] }, 1);
        sections.commercial = docOf('commercial', { priceRange: 'low', cuisineTypes: ['Bar'], paymentMethods: ['Efectivo'] }, 1);
        sections.reservations = docOf('reservations', { enabled: true, embedUrl: 'https://widget.example' }, 1);
        expect(completionPercent(sections)).toBe(100);
        expect(firstIncompleteSection(sections)).toBeNull();
    });
});
