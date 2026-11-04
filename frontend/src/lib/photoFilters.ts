/**
 * Filtros de foto (premio de la medalla «Ojo de Halcón»). Cada filtro es una cadena de
 * filtros CSS: la vista previa usa el CSS tal cual y la foto final aplica las mismas
 * matrices (las de la especificación Filter Effects) píxel a píxel, porque
 * CanvasRenderingContext2D.filter no funciona en Safari.
 */

type Step = ['brightness' | 'contrast' | 'saturate' | 'sepia' | 'grayscale', number] | ['hue', number];

export interface PhotoFilter {
    id: string;
    name: string;
    emoji: string;
    steps: Step[];
}

/** En el orden en que se desbloquean (uno cada 7 fotos). */
export const PHOTO_FILTERS: PhotoFilter[] = [
    { id: 'terraza', name: 'Terraza', emoji: '☀️', steps: [['brightness', 1.06], ['saturate', 1.3], ['sepia', 0.12]] },
    { id: 'byn', name: 'Blanco y negro', emoji: '🎬', steps: [['grayscale', 1], ['contrast', 1.15]] },
    { id: 'bodegon', name: 'Bodegón', emoji: '🍷', steps: [['contrast', 1.2], ['saturate', 1.1], ['brightness', 0.92], ['sepia', 0.18]] },
    { id: 'mercado', name: 'Mercado', emoji: '🥬', steps: [['contrast', 1.12], ['saturate', 1.5]] },
    { id: 'recuerdo', name: 'Recuerdo', emoji: '📼', steps: [['sepia', 0.45], ['contrast', 0.9], ['brightness', 1.07], ['saturate', 0.85]] },
    { id: 'neon', name: 'Neón', emoji: '🌃', steps: [['hue', -14], ['saturate', 1.8], ['contrast', 1.18]] },
];

export const photoFilterById = (id: string | null | undefined) => PHOTO_FILTERS.find((f) => f.id === id);

export const filterCss = (filter: PhotoFilter | undefined): string | undefined =>
    filter?.steps.map(([kind, value]) => (kind === 'hue' ? `hue-rotate(${value}deg)` : `${kind}(${value})`)).join(' ');

/** Matriz afín 3×4 (fila: r, g, b, desplazamiento en 0..1). */
type Affine = number[][];

const linear = (m: number[][], offset = 0): Affine => m.map((row) => [...row, offset]);

const stepMatrix = ([kind, v]: Step): Affine => {
    switch (kind) {
        case 'brightness':
            return linear([[v, 0, 0], [0, v, 0], [0, 0, v]]);
        case 'contrast':
            return linear([[v, 0, 0], [0, v, 0], [0, 0, v]], 0.5 - 0.5 * v);
        case 'saturate':
            return linear([
                [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v],
                [0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v],
                [0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v],
            ]);
        case 'sepia': {
            const a = 1 - Math.min(1, v);
            return linear([
                [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a],
                [0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a],
                [0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a],
            ]);
        }
        case 'grayscale': {
            const a = 1 - Math.min(1, v);
            return linear([
                [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a],
                [0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a],
                [0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a],
            ]);
        }
        case 'hue': {
            const rad = (v * Math.PI) / 180;
            const c = Math.cos(rad);
            const s = Math.sin(rad);
            return linear([
                [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
                [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
                [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
            ]);
        }
    }
};

/** b ∘ a: primero a, luego b. */
const compose = (a: Affine, b: Affine): Affine => b.map((row) => [
    row[0] * a[0][0] + row[1] * a[1][0] + row[2] * a[2][0],
    row[0] * a[0][1] + row[1] * a[1][1] + row[2] * a[2][1],
    row[0] * a[0][2] + row[1] * a[1][2] + row[2] * a[2][2],
    row[0] * a[0][3] + row[1] * a[1][3] + row[2] * a[2][3] + row[3],
]);

export const filterMatrix = (filter: PhotoFilter): Affine =>
    filter.steps.reduce<Affine>((acc, step) => compose(acc, stepMatrix(step)), linear([[1, 0, 0], [0, 1, 0], [0, 0, 1]]));

/** Aplica el filtro a unos píxeles RGBA (se cambian en el sitio). */
export function applyFilterToPixels(data: Uint8ClampedArray, filter: PhotoFilter): void {
    const [r, g, b] = filterMatrix(filter);
    const ro = r[3] * 255;
    const go = g[3] * 255;
    const bo = b[3] * 255;
    for (let i = 0; i < data.length; i += 4) {
        const R = data[i];
        const G = data[i + 1];
        const B = data[i + 2];
        data[i] = r[0] * R + r[1] * G + r[2] * B + ro;
        data[i + 1] = g[0] * R + g[1] * G + g[2] * B + go;
        data[i + 2] = b[0] * R + b[1] * G + b[2] * B + bo;
    }
}

export function applyFilterToCanvas(canvas: HTMLCanvasElement, filter: PhotoFilter | undefined): void {
    if (!filter) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyFilterToPixels(image.data, filter);
    ctx.putImageData(image, 0, 0);
}
