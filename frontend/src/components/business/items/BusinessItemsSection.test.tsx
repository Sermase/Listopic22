import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

const service = vi.hoisted(() => ({
    createBusinessItem: vi.fn(),
    getBusinessMenuSections: vi.fn(),
    updateBusinessMenuSections: vi.fn(),
    getPlaceReviewsForManager: vi.fn(),
    getMyItemProposals: vi.fn(),
    rebuildPlaceItems: vi.fn(),
    updateCanonicalItemBusinessData: vi.fn(),
    updateBusinessMenuItems: vi.fn(),
    submitItemProposal: vi.fn(),
}));
vi.mock('../../../services/BusinessProService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../services/BusinessProService')>()),
    ...service,
}));
const getCanonicalPlaceItems = vi.hoisted(() => vi.fn());
vi.mock('../../../services/CanonicalItemService', () => ({ getCanonicalPlaceItems }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'owner-1' } }) }));
const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const docs = vi.hoisted(() => ({
    'places/place-1': { name: 'Bar Pepe', types: ['restaurant', 'bar'] },
    'lists/tartas': { name: 'Tartas de queso', isPublic: true },
    'lists/privada': { name: 'Mis favoritas', isPublic: false },
} as Record<string, Record<string, unknown>>));
vi.mock('../../../lib/queryCache', () => ({
    getCachedDoc: vi.fn(async (collection: string, id: string) => docs[`${collection}/${id}`] ?? null),
}));

// ListSearch lee Firestore: aquí basta con poder elegir una lista.
const listSearchProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock('../../ListSearch', () => ({
    ListSearch: (props: { onSelect: (id: string) => void; selectedListId: string | null }) => {
        listSearchProps.last = props as unknown as Record<string, unknown>;
        return (
            <div>
                <button type="button" onClick={() => props.onSelect('tartas')}>Lista Tartas</button>
                <button type="button" onClick={() => props.onSelect('privada')}>Lista privada</button>
                <span>Elegida: {props.selectedListId ?? 'ninguna'}</span>
            </div>
        );
    },
}));

import { BusinessItemsSection } from './BusinessItemsSection';

const PLACE_ID = 'place-1';

const croqueta: CanonicalPlaceItem = {
    id: 'croqueta-prueba-1',
    canonicalName: 'Croqueta, la original',
    status: 'active',
    source: 'business',
    linkedListIds: ['croquetas'],
    businessData: { group: 'Entrantes', price: '1,20 €', allergens: ['gluten'], available: true },
    stats: { reviewCount: 120, averageRating: 7 },
};
const bravas: CanonicalPlaceItem = {
    id: 'bravas',
    canonicalName: 'Bravas',
    status: 'active',
    source: 'community',
    businessData: { group: 'Entrantes' },
    stats: { reviewCount: 3, averageRating: 6.5 },
};
const pulpo: CanonicalPlaceItem = {
    id: 'pulpo',
    canonicalName: 'Pulpo',
    status: 'active',
    source: 'community',
    businessData: {},
    stats: { reviewCount: 1, averageRating: 9 },
};

const FULL_CROQUETA = {
    group: 'Entrantes',
    price: '1,20 €',
    discount: '',
    ingredients: '',
    description: '',
    allergens: ['gluten'],
    available: true,
    menuOrder: null,
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const callableError = (code: string, message: string, details?: unknown) =>
    Object.assign(new Error(message), { code: `functions/${code}`, details });

const renderSection = async (props: { placeName?: string; placeTypes?: string[] } = {}) => {
    const user = userEvent.setup();
    render(
        <MemoryRouter>
            <BusinessItemsSection placeId={PLACE_ID} {...props} />
        </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Croqueta, la original' });
    await screen.findByRole('region', { name: 'Sección Entrantes' });
    return user;
};

const sectionCard = (name: string) => screen.getByRole('region', { name: `Sección ${name}` });
const dialog = () => screen.getByRole('dialog');
const toastMessages = () => showToast.mock.calls.map(([payload]) => `${payload.title ?? ''} ${payload.message ?? ''}`.trim());

beforeEach(() => {
    Object.values(service).forEach((fn) => fn.mockReset());
    getCanonicalPlaceItems.mockReset().mockResolvedValue([croqueta, bravas, pulpo]);
    service.getBusinessMenuSections.mockResolvedValue([{ name: 'Entrantes', order: 0 }, { name: 'Postres', order: 1 }]);
    service.getPlaceReviewsForManager.mockResolvedValue([]);
    service.getMyItemProposals.mockResolvedValue([]);
    service.updateBusinessMenuSections.mockResolvedValue(undefined);
    service.updateCanonicalItemBusinessData.mockImplementation(async (_placeId: string, _itemId: string, data: unknown) => data);
    service.updateBusinessMenuItems.mockImplementation(async (_placeId: string, items: unknown) => items);
    confirmMock.mockReset().mockResolvedValue(true);
    showToast.mockReset();
    listSearchProps.last = null;
    try {
        localStorage.clear();
    } catch {
        // sin almacenamiento
    }
});

describe('Tu carta: tablero', () => {
    it('agrupa por secciones, deja los platos sin sección en su cajón y resume la carta', async () => {
        await renderSection();
        expect(within(sectionCard('Entrantes')).getByRole('button', { name: 'Croqueta, la original' })).toBeInTheDocument();
        expect(within(sectionCard('Entrantes')).getByRole('button', { name: 'Bravas' })).toBeInTheDocument();
        expect(within(screen.getByRole('region', { name: 'Sin sección' })).getByRole('button', { name: 'Pulpo' })).toBeInTheDocument();
        expect(within(sectionCard('Postres')).getByText(/Nada por aquí todavía/)).toBeInTheDocument();

        const pills = screen.getByRole('list', { name: 'Resumen de la carta' });
        expect(within(pills).getByText(/3 platos/)).toBeInTheDocument();
        expect(within(pills).getByText(/1 con precio/)).toBeInTheDocument();
        expect(within(pills).getByRole('button', { name: /1 sin sección/ })).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('no muestra todo «Sin sección» mientras se leen las secciones', async () => {
        const sections = deferred<Array<{ name: string; order: number }>>();
        service.getBusinessMenuSections.mockReturnValue(sections.promise);
        render(<MemoryRouter><BusinessItemsSection placeId={PLACE_ID} /></MemoryRouter>);
        await waitFor(() => expect(getCanonicalPlaceItems).toHaveBeenCalled());
        await act(async () => undefined);
        expect(screen.queryByRole('region', { name: 'Sin sección' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Cargando tu carta')).toBeInTheDocument();

        await act(async () => sections.resolve([{ name: 'Entrantes', order: 0 }]));
        expect(await screen.findByRole('region', { name: 'Sección Entrantes' })).toBeInTheDocument();
    });

    it('el precio se edita en la fila y se guarda con la ficha completa (y nada si no cambia)', async () => {
        const user = await renderSection();
        const row = sectionCard('Entrantes');
        await user.click(within(row).getByRole('button', { name: /Precio de Croqueta, la original/ }));
        const input = within(row).getByRole('textbox', { name: 'Precio de Croqueta, la original' });
        await user.clear(input);
        await user.type(input, '1,5{Enter}');
        expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledTimes(1);
        expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledWith(PLACE_ID, 'croqueta-prueba-1', { ...FULL_CROQUETA, price: '1,50 €' });
        expect(await within(row).findByRole('button', { name: /Precio de Croqueta, la original:\s?1,50 €/ })).toBeInTheDocument();

        // Mismo precio: no se llama.
        await user.click(within(row).getByRole('button', { name: /Precio de Croqueta, la original/ }));
        await user.type(within(row).getByRole('textbox', { name: 'Precio de Croqueta, la original' }), '{Enter}');
        expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledTimes(1);
    });

    it('si falla el precio vuelve al de antes y lo dice', async () => {
        service.updateCanonicalItemBusinessData.mockRejectedValue(callableError('resource-exhausted', 'Demasiados cambios.'));
        const user = await renderSection();
        const row = sectionCard('Entrantes');
        await user.click(within(row).getByRole('button', { name: /Precio de Croqueta, la original/ }));
        const input = within(row).getByRole('textbox', { name: 'Precio de Croqueta, la original' });
        await user.clear(input);
        await user.type(input, '9{Enter}');
        await waitFor(() => expect(toastMessages()).toContain('😕 No se pudo guardar el precio'));
        expect(within(row).getByRole('button', { name: /Precio de Croqueta, la original:\s?1,20 €/ })).toBeInTheDocument();
    });

    it('la disponibilidad cambia al momento y se guarda una vez, con la ficha completa', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            render(<MemoryRouter><BusinessItemsSection placeId={PLACE_ID} /></MemoryRouter>);
            await screen.findByRole('region', { name: 'Sección Entrantes' });
            const toggle = () => screen.getByRole('button', { name: /^Croqueta, la original: (en carta|agotado)/ });

            await user.click(toggle());
            expect(toggle()).toHaveAccessibleName(/agotado/);
            // Dos toques seguidos (vuelve a como estaba): no se guarda nada.
            await user.click(toggle());
            await act(async () => { vi.advanceTimersByTime(700); });
            expect(service.updateCanonicalItemBusinessData).not.toHaveBeenCalled();

            await user.click(toggle());
            await act(async () => { vi.advanceTimersByTime(700); });
            expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledTimes(1);
            expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledWith(PLACE_ID, 'croqueta-prueba-1', { ...FULL_CROQUETA, available: false });
        } finally {
            vi.useRealTimers();
        }
    });

    it('«Mover a…» lleva el plato a otra sección sin arrastrar', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Más acciones de Pulpo' }));
        await user.click(screen.getByRole('menuitem', { name: /Mover a/ }));
        await user.click(within(dialog()).getByRole('radio', { name: /Postres/ }));
        await user.click(within(dialog()).getByRole('button', { name: 'Mover' }));

        expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledWith(PLACE_ID, 'pulpo', expect.objectContaining({ group: 'Postres', menuOrder: null }));
        expect(await within(sectionCard('Postres')).findByRole('button', { name: 'Pulpo' })).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Sin sección' })).not.toBeInTheDocument();
    });

    it('si mover falla, el plato vuelve a su sitio y se avisa', async () => {
        service.updateCanonicalItemBusinessData.mockRejectedValue(callableError('permission-denied', 'Sin Pro.'));
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Más acciones de Pulpo' }));
        await user.click(screen.getByRole('menuitem', { name: /Mover a/ }));
        await user.click(within(dialog()).getByRole('radio', { name: /Postres/ }));
        await user.click(within(dialog()).getByRole('button', { name: 'Mover' }));

        await waitFor(() => expect(toastMessages().some((text) => text.includes('No se pudo mover el plato'))).toBe(true));
        expect(within(screen.getByRole('region', { name: 'Sin sección' })).getByRole('button', { name: 'Pulpo' })).toBeInTheDocument();
    });
});

describe('Tu carta: secciones', () => {
    it('se guardan al momento y una recarga mientras se guardan no las pisa', async () => {
        const save = deferred<void>();
        service.updateBusinessMenuSections.mockReturnValue(save.promise);
        service.createBusinessItem.mockRejectedValue(callableError('already-exists', 'Ya existe «Calamares» en tu carta.', { itemId: 'calamares', canonicalName: 'Calamares' }));
        const user = await renderSection();
        const calamares: CanonicalPlaceItem = { id: 'calamares', canonicalName: 'Calamares', status: 'active', businessData: {}, stats: { reviewCount: 0 } };
        getCanonicalPlaceItems.mockResolvedValue([croqueta, bravas, pulpo, calamares]);

        await user.click(within(screen.getByLabelText('Secciones rápidas')).getByRole('button', { name: /Bebidas/ }));
        expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Entrantes', 'Postres', 'Bebidas']);
        expect(sectionCard('Bebidas')).toBeInTheDocument();

        // Un alta que choca con un plato que aún no está en la lista fuerza una recarga.
        await user.click(screen.getByRole('button', { name: '＋ Añadir plato' }));
        await user.click(within(dialog()).getByRole('button', { name: 'Ahora no' }));
        await user.type(within(dialog()).getByLabelText(/Nombre del plato/), 'Calamares');
        await user.click(within(dialog()).getByRole('button', { name: /Añadir plato/ }));
        await waitFor(() => expect(toastMessages()).toContain('Ya estaba en tu carta: te lo abro.'));
        expect(getCanonicalPlaceItems).toHaveBeenCalledTimes(2);
        expect(sectionCard('Bebidas')).toBeInTheDocument();

        await act(async () => save.resolve());
        await waitFor(() => expect(toastMessages()).toContain('✅ Secciones guardadas'));
        expect(sectionCard('Bebidas')).toBeInTheDocument();
    });

    it('no deja tocarlas hasta leer las guardadas: un cambio temprano no borra las del servidor', async () => {
        const saved = deferred<Array<{ name: string; order: number }>>();
        service.getBusinessMenuSections.mockReturnValue(saved.promise);
        const user = userEvent.setup();
        render(<MemoryRouter><BusinessItemsSection placeId={PLACE_ID} /></MemoryRouter>);
        await waitFor(() => expect(getCanonicalPlaceItems).toHaveBeenCalled());
        expect(service.updateBusinessMenuSections).not.toHaveBeenCalled();

        await act(async () => saved.resolve([{ name: 'Entrantes', order: 0 }, { name: 'Postres', order: 1 }]));
        const input = await screen.findByLabelText('Nombre de la sección nueva');
        expect(input).toBeEnabled();
        await user.type(input, 'Para compartir{Enter}');
        expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Entrantes', 'Postres', 'Para compartir']);
    });

    it('si no se pueden leer las guardadas lo dice, agrupa por lo que tienen los platos y no deja editarlas', async () => {
        service.getBusinessMenuSections.mockRejectedValue(new Error('offline'));
        render(<MemoryRouter><BusinessItemsSection placeId={PLACE_ID} /></MemoryRouter>);
        expect(await screen.findByText(/No se pudieron cargar tus secciones/)).toBeInTheDocument();
        expect(await screen.findByRole('region', { name: 'Sección Entrantes' })).toBeInTheDocument();
        expect(screen.getByLabelText('Nombre de la sección nueva')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Arrastrar la sección Entrantes' })).toBeDisabled();
        expect(service.updateBusinessMenuSections).not.toHaveBeenCalled();
    });

    it('subir y bajar reordena con espera y un solo guardado', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            render(<MemoryRouter><BusinessItemsSection placeId={PLACE_ID} /></MemoryRouter>);
            await screen.findByRole('region', { name: 'Sección Entrantes' });
            await user.click(screen.getByRole('button', { name: 'Bajar la sección Entrantes' }));
            await user.click(screen.getByRole('button', { name: 'Bajar la sección Postres' }));
            expect(service.updateBusinessMenuSections).not.toHaveBeenCalled();
            await act(async () => { vi.advanceTimersByTime(900); });
            expect(service.updateBusinessMenuSections).toHaveBeenCalledTimes(1);
            expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Entrantes', 'Postres']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('si falla el guardado vuelve a las secciones guardadas y lo dice', async () => {
        service.updateBusinessMenuSections.mockRejectedValue(callableError('resource-exhausted', 'Has hecho demasiados cambios hoy en este negocio.'));
        const user = await renderSection();
        await user.type(screen.getByLabelText('Nombre de la sección nueva'), 'Vinos{Enter}');

        await waitFor(() => expect(toastMessages().some((text) => text.includes('Te muestro las que había guardadas.'))).toBe(true));
        expect(screen.queryByRole('region', { name: 'Sección Vinos' })).not.toBeInTheDocument();
        expect(sectionCard('Postres')).toBeInTheDocument();
    });

    it('renombrar una sección se lleva sus platos en un solo lote', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Opciones de la sección Entrantes' }));
        await user.click(screen.getByRole('menuitem', { name: /Renombrar/ }));
        const field = within(dialog()).getByLabelText(/Nombre de la sección/);
        await user.clear(field);
        await user.type(field, 'Para picar');
        await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));

        await waitFor(() => expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Para picar', 'Postres']));
        expect(service.updateBusinessMenuItems).toHaveBeenCalledTimes(1);
        const [, batch] = service.updateBusinessMenuItems.mock.calls[0];
        expect(batch).toEqual([
            { itemId: 'croqueta-prueba-1', data: { ...FULL_CROQUETA, group: 'Para picar' } },
            { itemId: 'bravas', data: expect.objectContaining({ group: 'Para picar', price: '', available: true }) },
        ]);
        expect(await within(sectionCard('Para picar')).findByRole('button', { name: 'Bravas' })).toBeInTheDocument();
    });

    it('con Functions anteriores (sin updateBusinessMenuItems) guarda plato a plato y no da error', async () => {
        // Callable aún sin desplegar: 404 sin CORS, el SDK lo da como 'internal'.
        service.updateBusinessMenuItems.mockRejectedValue(callableError('internal', 'internal'));
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Opciones de la sección Entrantes' }));
        await user.click(screen.getByRole('menuitem', { name: /Renombrar/ }));
        const field = within(dialog()).getByLabelText(/Nombre de la sección/);
        await user.clear(field);
        await user.type(field, 'Para picar');
        await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));

        await waitFor(() => expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledTimes(2));
        expect(service.updateBusinessMenuItems).toHaveBeenCalledTimes(1);
        expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledWith(PLACE_ID, 'croqueta-prueba-1', { ...FULL_CROQUETA, group: 'Para picar' });
        expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledWith(PLACE_ID, 'bravas', expect.objectContaining({ group: 'Para picar' }));
        expect(await within(sectionCard('Para picar')).findByRole('button', { name: 'Bravas' })).toBeInTheDocument();
        expect(showToast.mock.calls.some(([payload]) => payload.variant === 'error')).toBe(false);
    });

    it('un error real del lote (platos que ya no existen) no se reintenta plato a plato', async () => {
        service.updateBusinessMenuItems.mockRejectedValue(callableError('not-found', 'Uno de los platos ya no existe. Recarga la carta.', { itemIds: ['bravas'] }));
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Opciones de la sección Entrantes' }));
        await user.click(screen.getByRole('menuitem', { name: /Renombrar/ }));
        const field = within(dialog()).getByLabelText(/Nombre de la sección/);
        await user.clear(field);
        await user.type(field, 'Para picar');
        await user.click(within(dialog()).getByRole('button', { name: 'Guardar' }));

        await waitFor(() => expect(toastMessages().some((text) => text.includes('Recarga la carta'))).toBe(true));
        expect(service.updateCanonicalItemBusinessData).not.toHaveBeenCalled();
    });

    it('quitar una sección con platos pregunta qué hacer con ellos', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Opciones de la sección Entrantes' }));
        await user.click(screen.getByRole('menuitem', { name: /Eliminar sección/ }));
        expect(within(dialog()).getByText(/«Entrantes» tiene 2 platos/)).toBeInTheDocument();
        await user.click(within(dialog()).getByRole('radio', { name: /Moverlos a/ }));
        await user.click(within(dialog()).getAllByRole('radio', { name: /Postres/ })[0]);
        await user.click(within(dialog()).getByRole('button', { name: /Eliminar sección/ }));

        await waitFor(() => expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Postres']));
        expect(service.updateBusinessMenuItems).toHaveBeenCalledWith(PLACE_ID, [
            { itemId: 'croqueta-prueba-1', data: { ...FULL_CROQUETA, group: 'Postres' } },
            { itemId: 'bravas', data: expect.objectContaining({ group: 'Postres', menuOrder: null }) },
        ]);
        expect(await within(sectionCard('Postres')).findByRole('button', { name: 'Bravas' })).toBeInTheDocument();
    });

    it('quitar una sección vacía no pregunta', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Opciones de la sección Postres' }));
        await user.click(screen.getByRole('menuitem', { name: /Eliminar sección/ }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Entrantes']));
        expect(service.updateBusinessMenuItems).not.toHaveBeenCalled();
        expect(service.updateCanonicalItemBusinessData).not.toHaveBeenCalled();
    });

    it('carta vacía: crea las secciones típicas de una vez', async () => {
        getCanonicalPlaceItems.mockResolvedValue([]);
        service.getBusinessMenuSections.mockResolvedValue([]);
        const user = userEvent.setup();
        render(<MemoryRouter><BusinessItemsSection placeId={PLACE_ID} /></MemoryRouter>);
        await user.click(await screen.findByRole('button', { name: /Crear secciones típicas/ }));
        expect(service.updateBusinessMenuSections).toHaveBeenCalledTimes(1);
        expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Entrantes', 'Principales', 'Postres', 'Bebidas']);
    });
});

describe('Tu carta: nuevo plato', () => {
    it('crea con sección, precio y lista sin recargar, una sola vez, y deja la sección para el siguiente', async () => {
        const pending = deferred<unknown>();
        service.createBusinessItem.mockReturnValue(pending.promise);
        const user = await renderSection();

        await user.click(within(sectionCard('Postres')).getByRole('button', { name: /Añadir plato en Postres/ }));
        expect(within(dialog()).getByRole('radio', { name: /Postres/ })).toHaveAttribute('aria-checked', 'true');
        await user.type(within(dialog()).getByLabelText(/Precio/), '6,5');
        await user.click(within(dialog()).getByRole('button', { name: 'Lista Tartas' }));
        // Las listas de la carta se sugieren; el sitio se lee si la página no lo pasa.
        await waitFor(() => expect(listSearchProps.last).toMatchObject({ suggestedListIds: ['croquetas'], placeName: 'Bar Pepe', placeTypes: ['restaurant', 'bar'] }));

        const name = within(dialog()).getByLabelText(/Nombre del plato/);
        await user.type(name, 'Tarta de queso');
        await waitFor(() => expect(within(dialog()).getByRole('button', { name: /Añadir plato/ })).toBeEnabled());
        // Doble toque y un envío del formulario (Enter): solo una alta.
        await user.dblClick(within(dialog()).getByRole('button', { name: /Añadir plato/ }));
        fireEvent.submit(name.closest('form') as HTMLFormElement);
        expect(service.createBusinessItem).toHaveBeenCalledTimes(1);
        expect(service.createBusinessItem).toHaveBeenCalledWith(PLACE_ID, 'Tarta de queso', { group: 'Postres', price: '6,50 €' }, 'tartas');

        await act(async () => pending.resolve({
            itemId: 'tarta-de-queso',
            name: 'Tarta de queso',
            item: {
                id: 'tarta-de-queso',
                canonicalName: 'Tarta de queso',
                status: 'active',
                source: 'business',
                linkedListIds: ['tartas'],
                businessData: { group: 'Postres', price: '6,50 €', allergens: [], available: true },
                stats: { reviewCount: 0, averageRating: null },
            },
        }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(await within(sectionCard('Postres')).findByRole('button', { name: 'Tarta de queso' })).toBeInTheDocument();
        expect(within(sectionCard('Postres')).getByRole('button', { name: 'Completar ficha →' })).toBeInTheDocument();
        expect(within(sectionCard('Postres')).getByText('Nuevo')).toBeInTheDocument();
        expect(toastMessages()).toContain('🎉 ¡Plato añadido! «Tarta de queso» ya está en Postres.');
        expect(getCanonicalPlaceItems).toHaveBeenCalledTimes(1);

        // El siguiente plato empieza en la misma sección.
        await user.click(screen.getByRole('button', { name: '＋ Añadir plato' }));
        expect(within(dialog()).getByRole('radio', { name: /Postres/ })).toHaveAttribute('aria-checked', 'true');
    });

    it('con Functions anteriores (no guardan la lista) añade el plato y avisa de que la lista no se guardó', async () => {
        service.createBusinessItem.mockResolvedValue({
            itemId: 'tarta-de-queso',
            name: 'Tarta de queso',
            item: {
                id: 'tarta-de-queso',
                canonicalName: 'Tarta de queso',
                status: 'active',
                source: 'business',
                linkedListIds: [],
                businessData: { group: 'Postres', price: '', allergens: [], available: true },
                stats: { reviewCount: 0, averageRating: null },
            },
        });
        const user = await renderSection();
        await user.click(within(sectionCard('Postres')).getByRole('button', { name: /Añadir plato en Postres/ }));
        await user.click(within(dialog()).getByRole('button', { name: 'Lista Tartas' }));
        await user.type(within(dialog()).getByLabelText(/Nombre del plato/), 'Tarta de queso');
        await waitFor(() => expect(within(dialog()).getByRole('button', { name: /Añadir plato/ })).toBeEnabled());
        await user.click(within(dialog()).getByRole('button', { name: /Añadir plato/ }));

        expect(await within(sectionCard('Postres')).findByRole('button', { name: 'Tarta de queso' })).toBeInTheDocument();
        await waitFor(() => expect(toastMessages().some((text) => text.includes('La lista de Listopic no se ha podido guardar todavía'))).toBe(true));
    });

    it('avisa antes de enviar si el plato ya está y deja abrir su ficha', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: '＋ Añadir plato' }));
        await user.type(within(dialog()).getByLabelText(/Nombre del plato/), 'croqueta la original');
        expect(within(dialog()).getByText(/Ya tienes «Croqueta, la original» en la carta/)).toBeInTheDocument();
        expect(within(dialog()).getByRole('button', { name: /Añadir plato/ })).toBeDisabled();

        await user.click(within(dialog()).getByRole('button', { name: 'Abrir ficha' }));
        expect(await screen.findByRole('tab', { name: /Ficha/ })).toBeInTheDocument();
        expect(dialog()).toHaveTextContent('Croqueta, la original');
    });

    it('si el servidor dice que ya existe abre ese plato y lo dice', async () => {
        service.createBusinessItem.mockRejectedValue(callableError(
            'already-exists',
            'Ya existe «Croqueta, la original» en tu carta. Antes se llamaba «Croqueta prueba 1».',
            { itemId: 'croqueta-prueba-1', canonicalName: 'Croqueta, la original' },
        ));
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: '＋ Añadir plato' }));
        await user.click(within(dialog()).getByRole('button', { name: 'Ahora no' }));
        await user.type(within(dialog()).getByLabelText(/Nombre del plato/), 'Croqueta prueba 1');
        await user.click(within(dialog()).getByRole('button', { name: /Añadir plato/ }));

        await waitFor(() => expect(toastMessages()).toContain('Ya estaba en tu carta como «Croqueta, la original»: te lo abro.'));
        expect(service.createBusinessItem).toHaveBeenCalledWith(PLACE_ID, 'Croqueta prueba 1', { group: '', price: '' }, null);
        expect(await screen.findByRole('tab', { name: /Ficha/ })).toBeInTheDocument();
    });

    it('muestra los errores junto al botón y no pierde lo escrito', async () => {
        service.createBusinessItem.mockRejectedValue(callableError('resource-exhausted', 'Has hecho demasiados cambios hoy en este negocio.'));
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: '＋ Añadir plato' }));
        await user.click(within(dialog()).getByRole('button', { name: 'Ahora no' }));
        await user.type(within(dialog()).getByLabelText(/Nombre del plato/), 'Pulpo a feira');
        await user.click(within(dialog()).getByRole('button', { name: /Añadir plato/ }));

        expect(await within(dialog()).findByRole('alert')).toHaveTextContent(/muchos cambios hoy/);
        expect(within(dialog()).getByLabelText(/Nombre del plato/)).toHaveValue('Pulpo a feira');
    });

    it('una lista privada no vale: lo dice y no deja añadir hasta elegir otra o «Ahora no»', async () => {
        service.createBusinessItem.mockReturnValue(new Promise(() => undefined));
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: '＋ Añadir plato' }));
        await user.type(within(dialog()).getByLabelText(/Nombre del plato/), 'Flan');
        await user.click(within(dialog()).getByRole('button', { name: 'Lista privada' }));
        expect(await within(dialog()).findByText(/«Mis favoritas» es privada/)).toBeInTheDocument();
        expect(within(dialog()).getByRole('button', { name: /Añadir plato/ })).toBeDisabled();

        await user.click(within(dialog()).getByRole('button', { name: 'Ahora no' }));
        await user.click(within(dialog()).getByRole('button', { name: /Añadir plato/ }));
        expect(service.createBusinessItem).toHaveBeenCalledWith(PLACE_ID, 'Flan', { group: '', price: '' }, null);
    });
});

describe('Tu carta: ficha del plato', () => {
    it('guarda la ficha completa: alérgenos, ingredientes y promoción', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Bravas' }));
        const sheet = dialog();
        await user.click(within(sheet).getByRole('button', { name: /Huevo/ }));
        const ingredients = within(sheet).getByLabelText(/Ingredientes/);
        await user.type(ingredients, 'patata, alioli{Enter}');
        expect(within(sheet).getByText('patata')).toBeInTheDocument();
        await user.click(within(sheet).getByRole('button', { name: /2x1/ }));
        await user.click(within(sheet).getByRole('button', { name: /Guardar ficha/ }));

        await waitFor(() => expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledTimes(1));
        expect(service.updateCanonicalItemBusinessData).toHaveBeenCalledWith(PLACE_ID, 'bravas', {
            group: 'Entrantes',
            price: '',
            discount: '2x1',
            ingredients: 'patata, alioli',
            description: '',
            allergens: ['huevo'],
            available: true,
            menuOrder: null,
        });
        await waitFor(() => expect(toastMessages()).toContain('✅ Ficha de «Bravas» guardada'));
    });

    it('cerrar con cambios sin guardar pregunta antes', async () => {
        confirmMock.mockResolvedValueOnce(false);
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Bravas' }));
        await user.type(within(dialog()).getByLabelText(/Descripción/), 'Con salsa brava de la casa');
        await user.click(within(dialog()).getAllByRole('button', { name: 'Cerrar' })[0]);
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Salir sin guardar?' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        await user.click(within(dialog()).getAllByRole('button', { name: 'Cerrar' })[0]);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(service.updateCanonicalItemBusinessData).not.toHaveBeenCalled();
    });

    it('la nota para el equipo empieza vacía con cada plato', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Bravas' }));
        await user.click(within(dialog()).getByRole('tab', { name: /Correcciones/ }));
        await user.type(within(dialog()).getByLabelText(/Nota para el equipo/), 'Es el mismo plato');
        await user.click(within(dialog()).getAllByRole('button', { name: 'Cerrar' })[0]);

        await user.click(screen.getByRole('button', { name: 'Pulpo' }));
        await user.click(within(dialog()).getByRole('tab', { name: /Correcciones/ }));
        expect(within(dialog()).getByLabelText(/Nota para el equipo/)).toHaveValue('');
    });

    it('propone un nombre nuevo con la nota y lo dice junto al botón', async () => {
        service.submitItemProposal.mockResolvedValue(undefined);
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Bravas' }));
        await user.click(within(dialog()).getByRole('tab', { name: /Correcciones/ }));
        await user.type(within(dialog()).getByLabelText(/Nota para el equipo/), 'Errata');
        await user.type(within(dialog()).getByLabelText(/Nombre nuevo/), 'Patatas bravas');
        expect(within(dialog()).getByText('«Patatas bravas»')).toBeInTheDocument();
        await user.click(within(dialog()).getByRole('button', { name: 'Proponer nombre nuevo' }));

        expect(service.submitItemProposal).toHaveBeenCalledWith(PLACE_ID, 'rename', { itemId: 'bravas', newName: 'Patatas bravas' }, 'Errata');
        expect(await within(dialog()).findByText(/¡Enviada!/)).toBeInTheDocument();
        expect(within(dialog()).getByLabelText(/Nota para el equipo/)).toHaveValue('');
    });

    it('mueve una valoración a otro plato y enseña cómo se escribió', async () => {
        service.getPlaceReviewsForManager.mockResolvedValue([{
            refPath: 'lists/l1/reviews/r1',
            itemId: 'bravas',
            itemName: 'Bravas',
            originalItemName: 'Brabas',
            authorName: 'Ana',
            overallRating: 8,
            comment: 'Muy ricas',
            createdAtMs: Date.UTC(2026, 9, 1),
        }]);
        service.submitItemProposal.mockResolvedValue(undefined);
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Más acciones de Bravas' }));
        await user.click(screen.getByRole('menuitem', { name: /Valoraciones/ }));
        expect(await within(dialog()).findByText(/Escrito como «Brabas»/)).toBeInTheDocument();
        await user.click(within(dialog()).getByRole('button', { name: /Mover a otro plato/ }));
        await user.click(within(dialog()).getByRole('button', { name: /Pulpo/ }));
        await user.click(within(dialog()).getByRole('button', { name: 'Proponer' }));

        expect(service.submitItemProposal).toHaveBeenCalledWith(PLACE_ID, 'reassign_review', { reviewPath: 'lists/l1/reviews/r1', targetItemId: 'pulpo' }, undefined);
        expect(await within(dialog()).findByText(/¡Enviada!/)).toBeInTheDocument();
    });
});

describe('Tu carta: historial de propuestas', () => {
    it('se abre con el número de pendientes y se vuelve a leer al abrir', async () => {
        const now = Date.now();
        service.getMyItemProposals.mockResolvedValue([
            { id: 'p1', placeId: PLACE_ID, type: 'rename', status: 'pending', payload: { itemId: 'bravas', currentName: 'Brabas', newName: 'Bravas' }, createdAtMs: now },
            { id: 'p2', placeId: PLACE_ID, type: 'merge', status: 'rejected', adminNotes: 'No es el mismo', payload: { sourceItemName: 'Croquetas', targetItemName: 'Croqueta, la original' }, createdAtMs: now - (30 * 24 * 60 * 60 * 1000) },
        ]);
        const user = await renderSection();
        const history = await screen.findByRole('button', { name: 'Historial de propuestas, 1 pendientes' });
        expect(service.getMyItemProposals).toHaveBeenCalledTimes(1);

        await user.click(history);
        expect(service.getMyItemProposals).toHaveBeenCalledTimes(2);
        const modal = dialog();
        expect(await within(modal).findByText('Hoy')).toBeInTheDocument();
        expect(within(modal).getByText('Antes')).toBeInTheDocument();
        expect(within(modal).getByText(/No es el mismo/)).toBeInTheDocument();

        await user.click(within(modal).getByRole('tab', { name: /Pendientes/ }));
        expect(within(modal).queryByText(/No es el mismo/)).not.toBeInTheDocument();
        expect(within(modal).getByText('«Bravas»')).toBeInTheDocument();
    });

    it('sin propuestas: todo limpio', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: 'Historial de propuestas' }));
        expect(await within(dialog()).findByText('Todo limpio.')).toBeInTheDocument();
    });
});
