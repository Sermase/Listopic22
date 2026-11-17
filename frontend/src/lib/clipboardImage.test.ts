import { describe, expect, it } from 'vitest';
import { imageFromPaste } from './clipboardImage';

const transfer = (items: Array<{ kind: string; type: string; file: File | null }>) => ({
    items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file })),
    files: [],
}) as unknown as DataTransfer;

describe('imageFromPaste', () => {
    it('devuelve la imagen pegada', () => {
        const png = new File(['x'], '', { type: 'image/png' });
        const file = imageFromPaste(transfer([{ kind: 'string', type: 'text/plain', file: null }, { kind: 'file', type: 'image/png', file: png }]));
        expect(file?.type).toBe('image/png');
        expect(file?.name).toBe('pegada.png');
    });

    it('null si lo pegado es texto', () => {
        expect(imageFromPaste(transfer([{ kind: 'string', type: 'text/plain', file: null }]))).toBeNull();
        expect(imageFromPaste(null)).toBeNull();
    });
});
