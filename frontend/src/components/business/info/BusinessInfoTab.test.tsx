import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
    getInfo: vi.fn(),
    update: vi.fn(),
}));

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));
vi.mock('../../../services/BusinessInfoService', () => ({
    getBusinessInfoForManager: (...args: unknown[]) => mocks.getInfo(...args),
    updateBusinessInfoSection: (...args: unknown[]) => mocks.update(...args),
}));

import { ToastProvider } from '../../../context/ToastContext';
import { ConfirmProvider } from '../../../context/ConfirmContext';
import type { BusinessInfoSection } from '../../../types/businessInfo';
import { BusinessDirtyProvider, useLeaveGuard } from '../kit';
import { BusinessInfoTab } from './BusinessInfoTab';

type SectionDocs = Partial<Record<BusinessInfoSection, { version?: number; data?: object; hiddenFields?: string[] }>>;

const info = (sections: SectionDocs = {}) => ({
    sections: Object.fromEntries(Object.entries(sections).map(([section, doc]) => [section, {
        section,
        version: 1,
        hiddenFields: [],
        data: {},
        ...doc,
    }])),
});

const setDesktop = (desktop: boolean) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: desktop && query.includes('min-width: 1024px'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
    }));
};

const LocationProbe = () => <span data-testid="search">{useLocation().search}</span>;

const DirtyProbe = () => {
    const { dirtyLabels } = useLeaveGuard();
    return <span data-testid="dirty">{dirtyLabels.join('|')}</span>;
};

const renderTab = (url = '/negocio', props: Partial<ComponentProps<typeof BusinessInfoTab>> = {}) => render(
    <MemoryRouter initialEntries={[url]}>
        <ToastProvider>
            <ConfirmProvider>
                <BusinessDirtyProvider>
                    <BusinessInfoTab placeId="P1" place={{ name: 'Casa Pepe', phone: '963 12 34 56', website: 'https://casapepe.es' }} {...props} />
                    <LocationProbe />
                    <DirtyProbe />
                </BusinessDirtyProvider>
            </ConfirmProvider>
        </ToastProvider>
    </MemoryRouter>,
);

const saveButton = () => screen.queryByRole('button', { name: '💾 Guardar' });
const sectionNav = () => screen.getByRole('navigation', { name: 'Secciones de tu ficha' });

beforeEach(() => {
    mocks.getInfo.mockReset();
    mocks.update.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('BusinessInfoTab: carga', () => {
    it('si no carga, no enseña formularios y deja reintentar (X6)', async () => {
        setDesktop(true);
        mocks.getInfo.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(info());
        renderTab();
        expect(await screen.findByText(/No hemos podido cargar tu ficha/)).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByText(/Tu ficha está al 0 %/)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Identidad' })).toBeInTheDocument();
    });

    it('abre la primera sección sin completar', async () => {
        setDesktop(true);
        mocks.getInfo.mockResolvedValue(info({ identity: { data: { description: { es: 'Tortilla' } } }, contact: { data: { phone: '1' } } }));
        renderTab();
        expect(await screen.findByRole('heading', { name: 'Horarios' })).toBeInTheDocument();
        expect(screen.getByText(/Tu ficha está al 20 %/)).toBeInTheDocument();
    });
});

describe('BusinessInfoTab: datos que ya tiene la página', () => {
    it('con initialInfo no vuelve a pedir la ficha', async () => {
        setDesktop(true);
        renderTab('/negocio', { initialInfo: info({ identity: { data: { displayName: { es: 'Bar Pepe' } } } }) as never });
        expect(await screen.findByRole('heading', { name: 'Contacto' })).toBeInTheDocument();
        expect(mocks.getInfo).not.toHaveBeenCalled();
    });
});

describe('BusinessInfoTab: guardar (F4, F5)', () => {
    it('sin cambios no hay Guardar; con cambios guarda, relee y enseña lo del servidor', async () => {
        setDesktop(true);
        mocks.getInfo
            .mockResolvedValueOnce(info({ identity: { version: 0 } }))
            .mockResolvedValueOnce(info({ identity: { version: 1, data: { displayName: { es: 'Bar Pepe' } } } }));
        mocks.update.mockResolvedValue({ ok: true, section: 'identity', version: 1 });
        renderTab();

        const name = await screen.findByLabelText(/Nombre visible/);
        expect(name).toHaveAttribute('placeholder', 'Casa Pepe');
        expect(saveButton()).toBeNull();

        fireEvent.change(name, { target: { value: 'Bar Pepe  ' } });
        expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
        expect(screen.getByTestId('dirty').textContent).toBe('🪪 Identidad');
        expect(within(sectionNav()).getByText(', sin guardar')).toBeInTheDocument();

        // Volver al valor guardado: otra vez sin cambios, sin botón.
        fireEvent.change(name, { target: { value: '' } });
        expect(saveButton()).toBeNull();
        expect(screen.getByTestId('dirty').textContent).toBe('');

        fireEvent.change(name, { target: { value: 'Bar Pepe  ' } });
        await act(async () => {
            fireEvent.click(saveButton()!);
        });

        expect(mocks.update).toHaveBeenCalledTimes(1);
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
            placeId: 'P1',
            section: 'identity',
            data: expect.objectContaining({ displayName: { es: 'Bar Pepe  ' } }),
            hiddenFields: [],
            version: 0,
        }));
        expect(await screen.findByText('✅ Guardado')).toBeInTheDocument();
        expect(mocks.getInfo).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(screen.getByLabelText(/Nombre visible/)).toHaveValue('Bar Pepe'));
        expect(saveButton()).toBeNull();
        expect(screen.queryByText(/Hemos ajustado/)).not.toBeInTheDocument();
        expect(screen.getByText(/Tu ficha está al 10 %/)).toBeInTheDocument();
    });

    it('avisa si el servidor guardó algo distinto de lo enviado', async () => {
        setDesktop(true);
        mocks.getInfo
            .mockResolvedValueOnce(info())
            .mockResolvedValueOnce(info({ contact: { version: 2, data: { phone: '', email: 'hola@casapepe.es' } } }));
        mocks.update.mockResolvedValue({ ok: true, section: 'contact', version: 2 });
        renderTab('/negocio?section=contact');

        fireEvent.change(await screen.findByLabelText(/Teléfono/), { target: { value: '963 00 00 00' } });
        fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'hola@casapepe.es' } });
        await act(async () => {
            fireEvent.click(saveButton()!);
        });

        expect(await screen.findByText('⚠️ Hemos ajustado algunos datos')).toBeInTheDocument();
        expect(screen.getByText('Revisa el teléfono.')).toBeInTheDocument();
    });

    it('«Alguien cambió estos datos» ofrece recargar', async () => {
        setDesktop(true);
        mocks.getInfo
            .mockResolvedValueOnce(info({ identity: { version: 3, data: { displayName: { es: 'Viejo' } } } }))
            .mockResolvedValueOnce(info({ identity: { version: 4, data: { displayName: { es: 'Nuevo' } } } }));
        mocks.update.mockRejectedValue({ code: 'functions/aborted', message: 'Estos datos han cambiado.' });
        renderTab('/negocio?section=identity');

        fireEvent.change(await screen.findByLabelText(/Nombre visible/), { target: { value: 'Mío' } });
        await act(async () => {
            fireEvent.click(saveButton()!);
        });
        expect(await screen.findByText('🔄 Alguien cambió estos datos.')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
        });
        await waitFor(() => expect(screen.getByLabelText(/Nombre visible/)).toHaveValue('Nuevo'));
        expect(screen.queryByText('🔄 Alguien cambió estos datos.')).not.toBeInTheDocument();
    });

    it('el límite diario se explica', async () => {
        setDesktop(true);
        mocks.getInfo.mockResolvedValue(info());
        mocks.update.mockRejectedValue({ code: 'functions/resource-exhausted', message: 'Has hecho demasiados cambios hoy en este negocio.' });
        renderTab('/negocio?section=identity');
        fireEvent.change(await screen.findByLabelText(/Nombre visible/), { target: { value: 'X' } });
        await act(async () => {
            fireEvent.click(saveButton()!);
        });
        expect(await screen.findByText(/Has hecho muchos cambios hoy/)).toBeInTheDocument();
    });

    it('secciones vacías que se pueden dar por revisadas con «Guardar así»', async () => {
        setDesktop(true);
        mocks.getInfo
            .mockResolvedValueOnce(info({ accessibility: { version: 0 } }))
            .mockResolvedValueOnce(info({ accessibility: { version: 1 } }));
        mocks.update.mockResolvedValue({ ok: true, section: 'accessibility', version: 1 });
        renderTab('/negocio?section=accessibility');

        await screen.findByRole('heading', { name: 'Accesibilidad' });
        await act(async () => {
            fireEvent.click(await screen.findByRole('button', { name: 'Guardar así' }));
        });
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ section: 'accessibility', version: 0 }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar así' })).not.toBeInTheDocument());
    });
});

describe('BusinessInfoTab: navegación', () => {
    it('al dejar una sección con cambios pregunta; «Salir» descarta', async () => {
        setDesktop(true);
        mocks.getInfo.mockResolvedValue(info());
        renderTab('/negocio?section=identity');

        fireEvent.change(await screen.findByLabelText(/Nombre visible/), { target: { value: 'Algo' } });
        await act(async () => {
            fireEvent.click(within(sectionNav()).getByRole('button', { name: /Contacto/ }));
        });
        const dialog = screen.getByRole('alertdialog');
        expect(dialog).toHaveTextContent('Perderás los cambios en 🪪 Identidad.');

        await act(async () => {
            fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
        });
        expect(screen.getByRole('heading', { name: 'Identidad' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Nombre visible/)).toHaveValue('Algo');

        await act(async () => {
            fireEvent.click(within(sectionNav()).getByRole('button', { name: /Contacto/ }));
        });
        await act(async () => {
            fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir' }));
        });
        expect(screen.getByRole('heading', { name: 'Contacto' })).toBeInTheDocument();
        expect(screen.getByTestId('search').textContent).toBe('?section=contact');
        expect(screen.getByTestId('dirty').textContent).toBe('');
    });

    it('en móvil, ?section= abre el editor en un modal con la barra de guardar al pie', async () => {
        setDesktop(false);
        mocks.getInfo.mockResolvedValue(info({ pets: { data: { petPolicy: 'allowed', indoorAllowed: true } } }));
        renderTab('/negocio?tab=general&section=pets');

        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Mascotas')).toBeInTheDocument();
        expect(within(dialog).getByText('Todo guardado')).toBeInTheDocument();
        expect(within(dialog).getByRole('button', { name: 'También dentro' })).toHaveAttribute('aria-pressed', 'true');

        // F9: con «Solo en terraza» no se puede marcar «También dentro».
        fireEvent.click(within(dialog).getByRole('radio', { name: 'Solo en terraza' }));
        expect(within(dialog).queryByRole('button', { name: 'También dentro' })).not.toBeInTheDocument();
        expect(within(dialog).getByText('Cambios sin guardar')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cerrar' })[0]);
        });
        await act(async () => {
            fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir' }));
        });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('search').textContent).toBe('?tab=general');
        // La tarjeta de la sección sigue en la lista.
        expect(screen.getByRole('button', { name: /Mascotas/ })).toBeInTheDocument();
    });
});

describe('BusinessInfoTab: secciones', () => {
    it('pulsar el título de un grupo no marca nada (X2)', async () => {
        setDesktop(true);
        mocks.getInfo.mockResolvedValue(info());
        renderTab('/negocio?section=commercial');
        fireEvent.click(await screen.findByText('Formas de pago'));
        expect(screen.getByRole('button', { name: 'Tarjeta' })).toHaveAttribute('aria-pressed', 'false');
        expect(saveButton()).toBeNull();
    });

    it('horarios: conserva los dos turnos y no deja guardar una hora a medias (F2, F3)', async () => {
        setDesktop(true);
        mocks.getInfo.mockResolvedValueOnce(info({
            hours: { data: { weeklySchedule: [{ day: 0, closed: false, periods: [{ open: '13:00', close: '16:00' }, { open: '20:00', close: '23:30' }] }] } },
        })).mockResolvedValue(info());
        mocks.update.mockResolvedValue({ ok: true, section: 'hours', version: 2 });
        renderTab('/negocio?section=hours');

        expect(await screen.findByLabelText('Lunes, comida: abre')).toHaveValue('13:00');
        expect(screen.getByLabelText('Lunes, cena: cierra')).toHaveValue('23:30');

        fireEvent.change(screen.getByLabelText('Martes: abre'), { target: { value: '09:00' } });
        expect(saveButton()).toBeDisabled();
        expect(screen.getAllByText(/falta la hora de cierre/i).length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText('Martes: cierra'), { target: { value: '14:00' } });
        expect(saveButton()).toBeEnabled();
        await act(async () => {
            fireEvent.click(saveButton()!);
        });
        expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
            section: 'hours',
            data: expect.objectContaining({
                weeklySchedule: [
                    { day: 0, closed: false, periods: [{ open: '13:00', close: '16:00' }, { open: '20:00', close: '23:30' }] },
                    { day: 1, closed: false, periods: [{ open: '09:00', close: '14:00' }] },
                ],
            }),
        }));
    });

    it('reservas: proveedor sin guardar = «Otro / propio» y el texto del botón se puede vaciar (F7, F8)', async () => {
        setDesktop(true);
        mocks.getInfo.mockResolvedValue(info({ reservations: { data: { enabled: true, buttonText: 'Reservar' } } }));
        renderTab('/negocio?section=reservations');

        expect(await screen.findByRole('radio', { name: 'Otro / propio' })).toHaveAttribute('aria-checked', 'true');
        const text = screen.getByLabelText(/Texto del botón/);
        fireEvent.change(text, { target: { value: '' } });
        expect(text).toHaveValue('');
        expect(text).toHaveAttribute('placeholder', 'Reservar mesa');
        expect(screen.getByText('Sin enlace no se mostrará el botón.')).toBeInTheDocument();

        // Pegar un iframe lo detecta como widget.
        fireEvent.change(screen.getByLabelText(/Enlace de reservas/), { target: { value: '<iframe src="https://cm.example.com/w"></iframe>' } });
        expect(screen.getByRole('radio', { name: /Dentro de Listopic/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByText('✅ Widget detectado: se abrirá dentro de Listopic.')).toBeInTheDocument();
    });

    it('delivery: añadir enciende el interruptor, falta el enlace bloquea, quitar se puede deshacer (F11)', async () => {
        setDesktop(true);
        mocks.getInfo.mockResolvedValue(info({ deliveries: { data: { enabled: true, links: [{ provider: 'justeat', label: 'Pide ya', url: 'https://just-eat.es/bar' }] } } }));
        renderTab('/negocio?section=deliveries');

        fireEvent.click(await screen.findByRole('button', { name: 'Glovo' }));
        expect(screen.getByRole('switch', { name: /Mostrar pedidos a domicilio/ })).toHaveAttribute('aria-checked', 'true');
        expect(saveButton()).toBeDisabled();
        expect(screen.getByText('Falta el enlace de Glovo')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Quitar el enlace de Just Eat' }));
        expect(screen.queryByDisplayValue('Pide ya')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
        expect(screen.getByDisplayValue('Pide ya')).toBeInTheDocument();
        expect(screen.getAllByRole('listitem').filter((item) => item.textContent?.includes('Glovo')).length).toBeGreaterThan(0);
    });
});
