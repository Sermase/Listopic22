import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BusinessVisualData } from '../../../services/BusinessProService';

vi.mock('../../../firebase', () => ({ auth: {}, db: {}, functions: {}, storage: {} }));

const service = vi.hoisted(() => ({
    getBusinessVisual: vi.fn(),
    updateBusinessVisual: vi.fn(),
    uploadBusinessHeroImage: vi.fn(),
}));
vi.mock('../../../services/BusinessProService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../services/BusinessProService')>()),
    ...service,
}));

const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../../context/ConfirmContext', () => ({ useConfirm: () => confirmMock }));
const confetti = vi.hoisted(() => vi.fn());
vi.mock('canvas-confetti', () => ({ default: confetti }));

vi.mock('./usePlaceShowcase', () => ({
    usePlaceShowcase: () => ({
        loading: false,
        name: 'Bar Pepe',
        address: 'C/ Mayor 3, Valencia',
        photoUrl: 'https://img.example.com/local.jpg',
        rating: { average: 7.4, count: 12 },
        photos: [
            { id: 'p1', url: 'https://img.example.com/sala.jpg', caption: 'La sala' },
            { id: 'p2', url: 'https://img.example.com/plato.jpg' },
        ],
        photosFailed: false,
    }),
}));

const probeImage = vi.hoisted(() => vi.fn(async () => true));
vi.mock('./coverMedia', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./coverMedia')>()),
    probeImage,
}));

const screenSize = vi.hoisted(() => ({ desktop: true }));
vi.mock('./useMediaQuery', () => ({ useMediaQuery: () => screenSize.desktop }));

// El editor de recorte usa canvas: aquí basta con ver qué recibe y devolver una foto.
const editorProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null, blob: null as Blob | null }));
vi.mock('../../PhotoEditorModal', () => ({
    PhotoEditorModal: (props: { onConfirm: (photos: Array<{ blob: Blob; dataUrl: string; isMain: boolean }>) => void; lockedAspect?: string }) => {
        editorProps.last = props as unknown as Record<string, unknown>;
        return (
            <button type="button" onClick={() => props.onConfirm([{ blob: editorProps.blob ?? new Blob(['jpg'], { type: 'image/jpeg' }), dataUrl: '', isMain: true }])}>
                Usar esta foto
            </button>
        );
    },
}));

import { BusinessVisualSection } from './BusinessVisualSection';

const PLACE_ID = 'place-1';
const EMPTY: BusinessVisualData = { accentColor: '', visualStyle: 'editorial', heroText: '', heroImageUrl: '' };
const CUSTOM: BusinessVisualData = {
    accentColor: '#e4572e',
    visualStyle: 'warm',
    heroText: 'Cocina de mercado',
    heroImageUrl: 'https://img.example.com/portada.jpg',
};

const renderSection = () => render(<BusinessVisualSection placeId={PLACE_ID} placeName="Bar Pepe" />);
const saveButton = () => screen.queryByRole('button', { name: /Guardar y publicar/ });
const phraseField = () => screen.getByRole('textbox', { name: 'Tu frase' });

beforeEach(() => {
    vi.clearAllMocks();
    screenSize.desktop = true;
    editorProps.blob = null;
    confirmMock.mockResolvedValue(true);
    probeImage.mockResolvedValue(true);
    service.getBusinessVisual.mockResolvedValue(EMPTY);
    service.updateBusinessVisual.mockImplementation(async (_placeId: string, data: BusinessVisualData) => data);
});

describe('BusinessVisualSection', () => {
    it('never shows a form after a failed load (a save would wipe the cover, phrase and colour)', async () => {
        service.getBusinessVisual.mockRejectedValueOnce(new Error('offline'));
        renderSection();

        expect(await screen.findByText(/No hemos podido cargar tu escaparate/)).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'Tu frase' })).not.toBeInTheDocument();
        expect(saveButton()).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByText(/Tu página aún lleva el look estándar/)).toBeInTheDocument();
        expect(service.getBusinessVisual).toHaveBeenCalledTimes(2);
    });

    it('marks Listopic when no colour is saved and shows no save bar while clean', async () => {
        renderSection();
        const listopic = await screen.findByRole('radio', { name: /Listopic/ });
        expect(listopic).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: /El mío/ })).toHaveAttribute('aria-checked', 'false');
        expect(saveButton()).not.toBeInTheDocument();
        expect(screen.getByRole('group', { name: '0 de 4 pasos listos' })).toBeInTheDocument();
    });

    it('saves the full object and then shows what the server stored', async () => {
        service.getBusinessVisual.mockResolvedValue(CUSTOM);
        service.updateBusinessVisual.mockImplementation(async (_placeId: string, data: BusinessVisualData) => ({ ...data, heroText: 'Tapas y vermú' }));
        renderSection();

        const field = await screen.findByRole('textbox', { name: 'Tu frase' });
        await userEvent.clear(field);
        await userEvent.type(field, 'Tapas y vermú <3');
        await userEvent.click(screen.getByRole('radio', { name: /Noche/ }));
        await userEvent.click(saveButton()!);

        expect(service.updateBusinessVisual).toHaveBeenCalledTimes(1);
        expect(service.updateBusinessVisual).toHaveBeenCalledWith(PLACE_ID, {
            ...CUSTOM,
            heroText: 'Tapas y vermú <3',
            visualStyle: 'night',
        });
        expect(await screen.findByText(/¡Publicado! Así te ven ya en Listopic/)).toBeInTheDocument();
        expect(phraseField()).toHaveValue('Tapas y vermú');
        expect(saveButton()).not.toBeInTheDocument();
        // 4 de 4 tras guardar: confeti (una vez por negocio y navegador).
        await waitFor(() => expect(confetti).toHaveBeenCalledTimes(1));
    });

    it('keeps the phrase within the server limit and warns past two lines', async () => {
        renderSection();
        const field = await screen.findByRole('textbox', { name: 'Tu frase' });
        expect(field).toHaveAttribute('maxLength', '300');
        expect(screen.queryByText(/solo se ven 2 líneas/)).not.toBeInTheDocument();
        fireEvent.change(field, { target: { value: 'a'.repeat(121) } });
        expect(screen.getByText(/solo se ven 2 líneas/)).toBeInTheDocument();
    });

    it('asks before an idea replaces the phrase', async () => {
        service.getBusinessVisual.mockResolvedValue({ ...EMPTY, heroText: 'La mía' });
        renderSection();
        await screen.findByRole('textbox', { name: 'Tu frase' });

        confirmMock.mockResolvedValueOnce(false);
        await userEvent.click(screen.getByRole('button', { name: /Música en directo los jueves/ }));
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Reemplazar tu frase?' }));
        expect(phraseField()).toHaveValue('La mía');

        await userEvent.click(screen.getByRole('button', { name: /Música en directo los jueves/ }));
        expect(phraseField()).toHaveValue('Música en directo los jueves');
    });

    it('validates the custom hex: expands #abc and blocks saving anything that is not a colour', async () => {
        service.getBusinessVisual.mockResolvedValue({ ...EMPTY, heroText: 'Hola' });
        renderSection();
        await userEvent.type(await screen.findByRole('textbox', { name: 'Tu frase' }), '!');

        await userEvent.click(screen.getByRole('radio', { name: /El mío/ }));
        const hex = screen.getByRole('textbox', { name: 'Código del color' });
        await userEvent.type(hex, 'rojo');
        fireEvent.blur(hex);
        expect(hex).toHaveAccessibleDescription(/Usa un color tipo #e4572e/);
        expect(hex).toHaveAttribute('aria-invalid', 'true');
        expect(saveButton()).toBeDisabled();

        await userEvent.clear(hex);
        await userEvent.type(hex, 'abc');
        fireEvent.blur(hex);
        expect(hex).toHaveValue('#aabbcc');
        expect(saveButton()).toBeEnabled();
        await userEvent.click(saveButton()!);
        expect(service.updateBusinessVisual).toHaveBeenCalledWith(PLACE_ID, expect.objectContaining({ accentColor: '#aabbcc', heroText: 'Hola!' }));
    });

    it('checks a pasted link before using it as the cover', async () => {
        renderSection();
        await userEvent.click(await screen.findByRole('button', { name: /Pegar un enlace/ }));
        const link = screen.getByRole('textbox', { name: 'Enlace de la foto' });

        probeImage.mockResolvedValueOnce(false);
        await userEvent.type(link, 'foto.jpg{Enter}');
        expect(await screen.findByText('Ese enlace no parece una imagen 🤔')).toBeInTheDocument();
        expect(probeImage).toHaveBeenCalledWith('https://foto.jpg/');
        expect(saveButton()).not.toBeInTheDocument();

        await userEvent.clear(link);
        await userEvent.type(link, 'cdn.example.com/portada.jpg{Enter}');
        expect(await screen.findByRole('img', { name: 'Tu portada' })).toHaveAttribute('src', 'https://cdn.example.com/portada.jpg');
        await userEvent.click(saveButton()!);
        expect(service.updateBusinessVisual).toHaveBeenCalledWith(PLACE_ID, { ...EMPTY, heroImageUrl: 'https://cdn.example.com/portada.jpg' });
    });

    it('a cover that fails to load is reported and cannot be published', async () => {
        renderSection();
        await userEvent.click(await screen.findByRole('button', { name: /Elegir de las fotos del local/ }));
        const dialog = await screen.findByRole('dialog');
        await userEvent.click(within(dialog).getByRole('button', { name: /Usar «La sala» de portada/ }));

        const cover = await screen.findByRole('img', { name: 'Tu portada' });
        expect(cover).toHaveAttribute('src', 'https://img.example.com/sala.jpg');
        fireEvent.error(cover);
        expect(await screen.findByText(/Esta foto no se puede ver/)).toBeInTheDocument();
        expect(saveButton()).toBeDisabled();

        await userEvent.click(screen.getByRole('button', { name: /Quitar/ }));
        expect(saveButton()).not.toBeInTheDocument();
    });

    it('uploads a 16:9 crop and uses its URL', async () => {
        let finishUpload: (url: string) => void = () => undefined;
        service.uploadBusinessHeroImage.mockImplementation(() => new Promise<string>((resolve) => {
            finishUpload = resolve;
        }));
        const { container } = renderSection();
        await screen.findByRole('button', { name: /Arrastra una foto o toca para elegirla/ });

        const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
        fireEvent.change(input, { target: { files: [new File(['x'], 'sala.jpg', { type: 'image/jpeg' })] } });
        expect(editorProps.last).toMatchObject({ lockedAspect: '16:9', maxPhotos: 1 });
        await userEvent.click(screen.getByRole('button', { name: 'Usar esta foto' }));

        expect(service.uploadBusinessHeroImage).toHaveBeenCalledWith(PLACE_ID, expect.any(Blob));
        expect(await screen.findByText(/Subiendo tu portada/)).toBeInTheDocument();
        finishUpload('https://storage.example.com/business-hero.jpg');
        expect(await screen.findByRole('img', { name: 'Tu portada' })).toHaveAttribute('src', 'https://storage.example.com/business-hero.jpg');
        expect(saveButton()).toBeEnabled();
    });

    it('does not upload a crop that Storage would reject for its size', async () => {
        editorProps.blob = new Blob([new Uint8Array(10 * 1024 * 1024)], { type: 'image/jpeg' });
        const { container } = renderSection();
        await screen.findByRole('button', { name: /Arrastra una foto o toca para elegirla/ });

        const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
        fireEvent.change(input, { target: { files: [new File(['x'], 'enorme.jpg', { type: 'image/jpeg' })] } });
        await userEvent.click(screen.getByRole('button', { name: 'Usar esta foto' }));

        expect(await screen.findByText(/Esta foto pesa demasiado/)).toBeInTheDocument();
        expect(service.uploadBusinessHeroImage).not.toHaveBeenCalled();
        expect(saveButton()).not.toBeInTheDocument();
    });

    it('goes back to the place photo with «Usar la foto actual del local»', async () => {
        service.getBusinessVisual.mockResolvedValue({ ...EMPTY, heroImageUrl: 'https://img.example.com/portada.jpg' });
        renderSection();
        await userEvent.click(await screen.findByRole('button', { name: /Usar la foto actual del local/ }));

        expect(screen.queryByRole('img', { name: 'Tu portada' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Arrastra una foto o toca para elegirla/ })).toBeInTheDocument();
        // Sin portada ya no hay nada que devolver: el chip desaparece.
        expect(screen.queryByRole('button', { name: /Usar la foto actual del local/ })).not.toBeInTheDocument();
        await userEvent.click(saveButton()!);
        expect(service.updateBusinessVisual).toHaveBeenCalledWith(PLACE_ID, EMPTY);
    });

    it('goes back to the standard look after confirming (still needs saving)', async () => {
        service.getBusinessVisual.mockResolvedValue(CUSTOM);
        renderSection();
        await userEvent.click(await screen.findByRole('button', { name: /Volver al look estándar de Listopic/ }));
        expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Volver al look estándar?', destructive: true }));
        expect(service.updateBusinessVisual).not.toHaveBeenCalled();

        await userEvent.click(saveButton()!);
        expect(service.updateBusinessVisual).toHaveBeenCalledWith(PLACE_ID, EMPTY);
    });

    it('shows friendly copy when the save is rejected', async () => {
        service.updateBusinessVisual.mockRejectedValueOnce(Object.assign(new Error('limit'), { code: 'functions/resource-exhausted' }));
        renderSection();
        await userEvent.click(await screen.findByRole('radio', { name: /Albahaca/ }));
        await userEvent.click(saveButton()!);
        expect(await screen.findByText(/Has hecho muchos cambios hoy/)).toBeInTheDocument();
        expect(screen.queryByText(/¡Publicado!/)).not.toBeInTheDocument();
    });

    it('on mobile the steps are an accordion with a summary when closed', async () => {
        screenSize.desktop = false;
        service.getBusinessVisual.mockResolvedValue({ ...EMPTY, heroImageUrl: 'https://img.example.com/portada.jpg' });
        renderSection();

        // Abre el primer paso sin hacer: la frase.
        const phrase = await screen.findByRole('button', { name: /Tu frase/ });
        const cover = screen.getByRole('button', { name: /Portada/ });
        expect(phrase).toHaveAttribute('aria-expanded', 'true');
        expect(cover).toHaveAttribute('aria-expanded', 'false');
        expect(within(cover).getByText('foto propia ✅')).toBeInTheDocument();

        await userEvent.click(cover);
        expect(cover).toHaveAttribute('aria-expanded', 'true');
        expect(phrase).toHaveAttribute('aria-expanded', 'false');
    });
});
