import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

import type { BusinessInfoDocument, BusinessInfoSection, BusinessSectionData } from '../../../types/businessInfo';
import {
    adjustedFields,
    buildSavePayload,
    cleanInstagram,
    cleanPetsData,
    cleanWeeklySchedule,
    comparable,
    emptySectionDoc,
    isLikelyUrl,
    normalizeSections,
    petPolicyPatch,
    sectionDirty,
    sectionInvalidReason,
    serverUrl,
    showsPetAmenities,
} from './fichaModel';

const docOf = <S extends BusinessInfoSection>(section: S, data: BusinessSectionData[S], extra: Partial<BusinessInfoDocument<S>> = {}): BusinessInfoDocument<S> => ({
    ...emptySectionDoc(section),
    data,
    ...extra,
});

describe('fichaModel: cambios sin guardar', () => {
    it('marcar y desmarcar, o un vacío que el servidor guarda, no cuentan como cambio', () => {
        const saved = docOf('family', { babyChanging: false, notes: '' }, { version: 2 });
        expect(sectionDirty(saved, docOf('family', {}))).toBe(false);
        expect(sectionDirty(saved, docOf('family', { highChairs: false, notes: '  ' }))).toBe(false);
        expect(sectionDirty(saved, docOf('family', { highChairs: true }))).toBe(true);
    });

    it('«Sin indicar» (unknown) es lo mismo que nada en mascotas y contaminación cruzada', () => {
        expect(sectionDirty(docOf('pets', { petPolicy: '' as never }), docOf('pets', { petPolicy: 'unknown' }))).toBe(false);
        expect(sectionDirty(docOf('dietary', {}), docOf('dietary', { crossContaminationRisk: 'unknown' }))).toBe(false);
        expect(sectionDirty(docOf('dietary', {}), docOf('dietary', { crossContaminationRisk: 'possible' }))).toBe(true);
    });

    it('ocultar el teléfono de Google es un cambio', () => {
        const saved = docOf('contact', {});
        expect(sectionDirty(saved, { ...saved, hiddenFields: ['phone'] })).toBe(true);
        expect(sectionDirty({ ...saved, hiddenFields: ['website', 'phone'] }, { ...saved, hiddenFields: ['phone', 'website'] })).toBe(false);
    });

    it('comparable recorta textos y quita vacíos', () => {
        expect(comparable({ a: ' x ', b: '', c: [], d: { e: false }, f: 0 })).toEqual({ a: 'x', f: 0 });
    });

    it('normalizeSections rellena las 10 secciones aunque falten', () => {
        const sections = normalizeSections({ sections: { pets: { version: 3, data: { waterBowls: true } } } } as never);
        expect(sections.pets.version).toBe(3);
        expect(sections.pets.data.waterBowls).toBe(true);
        expect(sections.identity.version).toBe(0);
        expect(sections.identity.hiddenFields).toEqual([]);
        expect(Object.keys(sections)).toHaveLength(10);
    });
});

describe('fichaModel: lo que se envía', () => {
    it('horario: guarda todos los turnos válidos y quita los vacíos (F2, F3)', () => {
        expect(cleanWeeklySchedule([
            { day: 2, closed: false, periods: [{ open: '13:00', close: '16:00' }, { open: '20:00', close: '23:30' }] },
            { day: 0, closed: false, periods: [{ open: '9:00', close: '14:00' }, { open: '', close: '' }] },
            { day: 1, closed: false, periods: [{ open: '', close: '' }] },
            { day: 6, closed: true, periods: [{ open: '10:00', close: '12:00' }] },
        ])).toEqual([
            { day: 0, closed: false, periods: [{ open: '09:00', close: '14:00' }] },
            { day: 2, closed: false, periods: [{ open: '13:00', close: '16:00' }, { open: '20:00', close: '23:30' }] },
            { day: 6, closed: true, periods: [] },
        ]);
    });

    it('mascotas: sin contradicciones con la política (F9)', () => {
        expect(cleanPetsData({ petPolicy: 'terrace_only', indoorAllowed: true, waterBowls: true }))
            .toMatchObject({ indoorAllowed: false, waterBowls: true });
        expect(cleanPetsData({ petPolicy: 'not_allowed', indoorAllowed: true, requiresLeash: true }))
            .toMatchObject({ indoorAllowed: false, requiresLeash: false });
        expect(buildSavePayload(docOf('pets', { petPolicy: 'assistance_only', petMenu: true })).data).toMatchObject({ petMenu: false });
    });

    it('mascotas sin política: lo guardado se enseña y no se borra al guardar', () => {
        const legacy = { petPolicy: 'unknown' as const, waterBowls: true, notes: 'Perros sí' };
        expect(showsPetAmenities(legacy)).toBe(true);
        expect(showsPetAmenities({ petPolicy: 'unknown' })).toBe(false);
        expect(showsPetAmenities({ petPolicy: 'not_allowed', waterBowls: true })).toBe(false);
        expect(buildSavePayload(docOf('pets', legacy)).data).toMatchObject({ waterBowls: true });
    });

    it('mascotas: cambiar de política deriva los booleanos y apaga lo que se esconde', () => {
        expect(petPolicyPatch('terrace_only', { indoorAllowed: true })).toMatchObject({
            petPolicy: 'terrace_only', petFriendly: true, allowsDogs: true, terraceOnly: true, indoorAllowed: false,
        });
        expect(petPolicyPatch('not_allowed', { waterBowls: true, treatsAvailable: true })).toMatchObject({
            petFriendly: false, waterBowls: false, treatsAvailable: false,
        });
        expect(petPolicyPatch('dogs_only', { petPolicy: 'unknown' })).toMatchObject({ allowsCats: false, indoorAllowed: true });
    });

    it('delivery: el interruptor se apaga sin enlaces', () => {
        expect(buildSavePayload(docOf('deliveries', { enabled: true, links: [] })).data).toMatchObject({ enabled: false, links: [] });
    });
});

describe('fichaModel: lo que bloquea Guardar', () => {
    it('email y web con mala pinta', () => {
        expect(sectionInvalidReason(docOf('contact', { email: 'pepe@' }))).toBe('Revisa el email');
        expect(sectionInvalidReason(docOf('contact', { website: 'mibar' }))).toBe('Revisa la web');
        expect(sectionInvalidReason(docOf('contact', { email: 'Hola@MiBar.es', website: 'mibar.es' }))).toBeNull();
    });

    it('horario con una hora a medias (no los días sin indicar ni los cerrados)', () => {
        expect(sectionInvalidReason(docOf('hours', { weeklySchedule: [{ day: 0, periods: [{ open: '13:00', close: '' }] }] })))
            .toBe('Lunes: falta la hora de cierre');
        expect(sectionInvalidReason(docOf('hours', { weeklySchedule: [
            { day: 1, periods: [{ open: '', close: '' }] },
            { day: 2, closed: true, periods: [{ open: '13:00', close: '' }] },
        ] }))).toBeNull();
    });

    it('enlaces de delivery vacíos o raros', () => {
        expect(sectionInvalidReason(docOf('deliveries', { links: [{ provider: 'glovo', url: '' }] }))).toBe('Falta el enlace de Glovo');
        expect(sectionInvalidReason(docOf('deliveries', { links: [{ provider: 'justeat', url: 'nope' }] }))).toBe('Revisa el enlace de Just Eat');
        expect(sectionInvalidReason(docOf('deliveries', { links: [{ provider: 'glovo', url: 'glovoapp.com/es/bar' }] }))).toBeNull();
    });

    it('urls como el servidor', () => {
        expect(serverUrl('mibar.es')).toBe('https://mibar.es/');
        expect(serverUrl('javascript:alert(1)')).toBe('');
        expect(isLikelyUrl('https://mibar.es/carta')).toBe(true);
        expect(isLikelyUrl('mibar')).toBe(false);
        expect(cleanInstagram('https://www.instagram.com/bar.pepe/?hl=es')).toBe('bar.pepe');
        expect(cleanInstagram('@@bar pepe!')).toBe('barpepe');
    });
});

describe('fichaModel: lo que ajustó el servidor', () => {
    it('no avisa de lo que el servidor hace siempre (https, minúsculas, valores por defecto)', () => {
        expect(adjustedFields('contact', { website: 'mibar.es', email: 'Hola@MiBar.es ' }, { website: 'https://mibar.es/', email: 'hola@mibar.es', phone: '', instagram: '' })).toEqual([]);
        expect(adjustedFields('reservations',
            { enabled: true, embedUrl: '<iframe src="https://cm.com/w"></iframe>', externalUrl: '', buttonText: '' },
            { enabled: true, embedUrl: 'https://cm.com/w', externalUrl: 'https://cm.com/w', buttonText: 'Reservar mesa', provider: 'custom', displayMode: 'modal' },
        )).toEqual([]);
    });

    it('avisa de lo que se perdió o cambió', () => {
        expect(adjustedFields('contact', { email: 'no-valido@x' }, { email: '' })).toEqual(['el email']);
        expect(adjustedFields('reservations', { enabled: true, externalUrl: '' }, { enabled: false })).toEqual(['el botón de reservar']);
        expect(adjustedFields('hours',
            { weeklySchedule: [{ day: 0, closed: false, periods: [{ open: '09:00', close: '14:00' }] }] },
            { weeklySchedule: [] },
        )).toEqual(['el horario semanal']);
    });
});
