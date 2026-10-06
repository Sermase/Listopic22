import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CanonicalPlaceItem } from '../../services/CanonicalItemService';

vi.mock('../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

const service = vi.hoisted(() => ({
    createBusinessItem: vi.fn(),
    getBusinessMenuSections: vi.fn(),
    updateBusinessMenuSections: vi.fn(),
    getPlaceReviewsForManager: vi.fn(),
    getMyItemProposals: vi.fn(),
    rebuildPlaceItems: vi.fn(),
    updateCanonicalItemBusinessData: vi.fn(),
    submitItemProposal: vi.fn(),
}));
vi.mock('../../services/BusinessProService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/BusinessProService')>()),
    ...service,
}));
const getCanonicalPlaceItems = vi.hoisted(() => vi.fn());
vi.mock('../../services/CanonicalItemService', () => ({ getCanonicalPlaceItems }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'owner-1' } }) }));
const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));

import { BusinessItemsSection } from './BusinessProSections';

const PLACE_ID = 'ChIJc7hBUzEvQg0R_skP3Lbqgrc';

const croqueta: CanonicalPlaceItem = {
    id: 'croqueta-prueba-1',
    canonicalName: 'Croqueta, la original',
    status: 'active',
    source: 'business',
    businessData: { group: 'Entrantes', price: '1,20 €' },
    stats: { reviewCount: 120, averageRating: 7 },
};
const bravas: CanonicalPlaceItem = {
    id: 'bravas',
    canonicalName: 'Bravas',
    status: 'active',
    source: 'community',
    businessData: {},
    stats: { reviewCount: 3, averageRating: 6.5 },
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

const callableError = (code: string, message: string, details?: unknown) =>
    Object.assign(new Error(message), { code: `functions/${code}`, details });

const renderSection = async () => {
    const user = userEvent.setup();
    render(<BusinessItemsSection placeId={PLACE_ID} />);
    await screen.findByText('Croqueta, la original');
    return user;
};

const nameInput = () => screen.getByLabelText('Nombre del plato o producto') as HTMLInputElement;

describe('BusinessItemsSection: añadir platos', () => {
    beforeEach(() => {
        Object.values(service).forEach((fn) => fn.mockReset());
        getCanonicalPlaceItems.mockReset().mockResolvedValue([croqueta, bravas]);
        service.getBusinessMenuSections.mockResolvedValue([{ name: 'Entrantes', order: 0 }, { name: 'Postres', order: 1 }]);
        service.getPlaceReviewsForManager.mockResolvedValue([]);
        service.getMyItemProposals.mockResolvedValue([]);
        service.updateBusinessMenuSections.mockResolvedValue(undefined);
        confirmMock.mockReset().mockResolvedValue(true);
    });

    it('crea con sección y precio sin recargar, abre su ficha y deja la sección para el siguiente', async () => {
        const pending = deferred<unknown>();
        service.createBusinessItem.mockReturnValue(pending.promise);
        const user = await renderSection();
        // El total sale de stats.reviewCount, no de las reseñas cargadas (limitadas).
        expect(screen.getByText(/120 valoraciones/)).toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText('Sección del plato'), 'Postres');
        await user.type(screen.getByLabelText('Precio del plato'), '6,5');
        // Enter dos veces (y un submit directo del formulario): solo una alta.
        await user.type(nameInput(), 'Tarta de queso{Enter}{Enter}');
        fireEvent.submit(nameInput().form as HTMLFormElement);
        expect(service.createBusinessItem).toHaveBeenCalledTimes(1);
        expect(service.createBusinessItem).toHaveBeenCalledWith(PLACE_ID, 'Tarta de queso', { group: 'Postres', price: '6,5' });

        await act(async () => pending.resolve({
            itemId: 'tarta-de-queso',
            name: 'Tarta de queso',
            item: {
                id: 'tarta-de-queso',
                canonicalName: 'Tarta de queso',
                status: 'active',
                source: 'business',
                businessData: { group: 'Postres', price: '6,50 €', allergens: [], available: true },
                stats: { reviewCount: 0, averageRating: null },
            },
        }));

        expect(await screen.findByText('«Tarta de queso» añadido a Postres.')).toBeInTheDocument();
        expect(screen.getByText('Editando: Tarta de queso')).toBeInTheDocument();
        expect(screen.getByDisplayValue('6,50 €')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Tarta de queso/ })).toBeInTheDocument();
        expect(getCanonicalPlaceItems).toHaveBeenCalledTimes(1);
        expect(nameInput().value).toBe('');
        expect((screen.getByLabelText('Precio del plato') as HTMLInputElement).value).toBe('');
        expect((screen.getByLabelText('Sección del plato') as HTMLSelectElement).value).toBe('Postres');
        expect(document.activeElement).toBe(nameInput());
    });

    it('si el plato ya existe abre ese y lo dice junto al formulario', async () => {
        service.createBusinessItem.mockRejectedValue(callableError(
            'already-exists',
            'Ya existe «Croqueta, la original» en tu carta. Antes se llamaba «Croqueta prueba 1».',
            { itemId: 'croqueta-prueba-1', canonicalName: 'Croqueta, la original' },
        ));
        const user = await renderSection();
        await user.type(nameInput(), 'Croqueta prueba 1{Enter}');

        expect(await screen.findByText('Ya estaba en tu carta como «Croqueta, la original»: te lo abro.')).toBeInTheDocument();
        expect(screen.getByText('Editando: Croqueta, la original')).toBeInTheDocument();
    });

    it('muestra los errores junto al formulario aunque no haya ningún plato abierto', async () => {
        service.createBusinessItem.mockRejectedValue(callableError('resource-exhausted', 'Has hecho demasiados cambios hoy en este negocio.'));
        const user = await renderSection();
        await user.type(nameInput(), 'Pulpo{Enter}');

        expect(await screen.findByText('Has hecho demasiados cambios hoy en este negocio.')).toBeInTheDocument();
        expect(screen.getByText('Selecciona un elemento de la lista.')).toBeInTheDocument();
        expect(nameInput().value).toBe('Pulpo');
    });

    it('cambiar de plato vacía la nota para el administrador', async () => {
        const user = await renderSection();
        await user.click(screen.getByRole('button', { name: /Croqueta, la original/ }));
        const note = screen.getByPlaceholderText('Ej. Es el mismo plato, escrito con errata.');
        await user.type(note, 'Es el mismo plato');
        await user.click(screen.getByRole('button', { name: /^Bravas/ }));
        expect((screen.getByPlaceholderText('Ej. Es el mismo plato, escrito con errata.') as HTMLInputElement).value).toBe('');
    });
});

describe('BusinessItemsSection: secciones', () => {
    beforeEach(() => {
        Object.values(service).forEach((fn) => fn.mockReset());
        getCanonicalPlaceItems.mockReset().mockResolvedValue([croqueta, bravas]);
        service.getBusinessMenuSections.mockResolvedValue([{ name: 'Entrantes', order: 0 }, { name: 'Postres', order: 1 }]);
        service.getPlaceReviewsForManager.mockResolvedValue([]);
        service.getMyItemProposals.mockResolvedValue([]);
        confirmMock.mockReset().mockResolvedValue(true);
    });

    it('se guardan al momento y una recarga mientras se guardan no las pisa', async () => {
        const save = deferred<void>();
        service.updateBusinessMenuSections.mockReturnValue(save.promise);
        // Un alta que choca con un plato que aún no está en la lista fuerza una recarga.
        const nuevo: CanonicalPlaceItem = { id: 'pulpo', canonicalName: 'Pulpo', status: 'active', businessData: {}, stats: { reviewCount: 0 } };
        service.createBusinessItem.mockRejectedValue(callableError('already-exists', 'Ya existe «Pulpo» en tu carta.', { itemId: 'pulpo', canonicalName: 'Pulpo' }));
        const user = await renderSection();
        getCanonicalPlaceItems.mockResolvedValue([croqueta, bravas, nuevo]);

        await user.type(screen.getByLabelText('Nueva sección'), 'Bebidas{Enter}');
        expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Entrantes', 'Postres', 'Bebidas']);
        expect(screen.getByText('Guardando...')).toBeInTheDocument();

        await user.type(nameInput(), 'Pulpo{Enter}');
        expect(await screen.findByText('Ya estaba en tu carta: te lo abro.')).toBeInTheDocument();
        expect(getCanonicalPlaceItems).toHaveBeenCalledTimes(2);
        expect(screen.getByLabelText('Quitar Bebidas')).toBeInTheDocument();

        await act(async () => save.resolve());
        expect(await screen.findByText('Guardado')).toBeInTheDocument();
        expect(screen.getByLabelText('Quitar Bebidas')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    });

    it('no deja tocarlas hasta leer las guardadas: un cambio temprano no borra las del servidor', async () => {
        const saved = deferred<Array<{ name: string; order: number }>>();
        service.getBusinessMenuSections.mockReturnValue(saved.promise);
        service.updateBusinessMenuSections.mockResolvedValue(undefined);
        const user = userEvent.setup();
        render(<BusinessItemsSection placeId={PLACE_ID} />);

        expect(screen.getByLabelText('Nueva sección')).toBeDisabled();
        await user.type(screen.getByLabelText('Nueva sección'), 'Bebidas{Enter}');
        expect(service.updateBusinessMenuSections).not.toHaveBeenCalled();

        await act(async () => saved.resolve([{ name: 'Entrantes', order: 0 }, { name: 'Postres', order: 1 }]));
        await screen.findByLabelText('Quitar Postres');
        await user.type(screen.getByLabelText('Nueva sección'), 'Bebidas{Enter}');
        expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Entrantes', 'Postres', 'Bebidas']);
    });

    it('si no se pueden leer las guardadas lo dice y no deja editarlas', async () => {
        service.getBusinessMenuSections.mockRejectedValue(new Error('offline'));
        await renderSection();

        expect(screen.getByText('No se pudieron cargar tus secciones. Recarga la página para editarlas.')).toBeInTheDocument();
        expect(screen.getByLabelText('Nueva sección')).toBeDisabled();
        expect(service.updateBusinessMenuSections).not.toHaveBeenCalled();
    });

    it('quitar una sección con platos pide confirmación y avisa de que pasan a «Sin sección»', async () => {
        service.updateBusinessMenuSections.mockResolvedValue(undefined);
        const user = await renderSection();

        confirmMock.mockResolvedValueOnce(false);
        await user.click(screen.getByLabelText('Quitar Entrantes'));
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
            title: '¿Quitar la sección «Entrantes»?',
            message: expect.stringContaining('Tiene 1 plato, que pasará a «Sin sección»'),
        }));
        expect(service.updateBusinessMenuSections).not.toHaveBeenCalled();

        await user.click(screen.getByLabelText('Quitar Entrantes'));
        await waitFor(() => expect(service.updateBusinessMenuSections).toHaveBeenCalledWith(PLACE_ID, ['Postres']));
        expect(await screen.findByText('Guardado')).toBeInTheDocument();

        // Sin platos no pregunta.
        confirmMock.mockClear();
        await user.click(screen.getByLabelText('Quitar Postres'));
        expect(confirmMock).not.toHaveBeenCalled();
        await waitFor(() => expect(service.updateBusinessMenuSections).toHaveBeenLastCalledWith(PLACE_ID, []));
    });

    it('un plato no se crea en una sección que se ha revertido', async () => {
        const save = deferred<void>();
        service.updateBusinessMenuSections.mockReturnValue(save.promise);
        service.createBusinessItem.mockReturnValue(new Promise(() => undefined));
        const user = await renderSection();

        await user.type(screen.getByLabelText('Nueva sección'), 'Bebidas{Enter}');
        await user.selectOptions(screen.getByLabelText('Sección del plato'), 'Bebidas');
        await act(async () => save.reject(callableError('resource-exhausted', 'Has hecho demasiados cambios hoy en este negocio.')));
        await waitFor(() => expect(screen.queryByLabelText('Quitar Bebidas')).not.toBeInTheDocument());

        await user.type(nameInput(), 'Caña{Enter}');
        expect(service.createBusinessItem).toHaveBeenCalledWith(PLACE_ID, 'Caña', { group: '', price: '' });
    });

    it('si falla el guardado vuelve a las secciones guardadas y lo dice en su tarjeta', async () => {
        service.updateBusinessMenuSections.mockRejectedValue(callableError('resource-exhausted', 'Has hecho demasiados cambios hoy en este negocio.'));
        const user = await renderSection();
        await user.click(screen.getByLabelText('Bajar Entrantes'));

        const card = screen.getByText('Secciones de la carta').closest('div.rounded-2xl') as HTMLElement;
        expect(await within(card).findByText(/Has hecho demasiados cambios hoy en este negocio\. Te muestro las que había guardadas\./)).toBeInTheDocument();
        const names = within(card).getAllByLabelText(/^Quitar /).map((button) => button.getAttribute('aria-label'));
        expect(names).toEqual(['Quitar Entrantes', 'Quitar Postres']);
    });
});
