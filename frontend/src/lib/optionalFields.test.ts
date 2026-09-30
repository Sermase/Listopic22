import { describe, expect, it, vi } from 'vitest';
import { writeWithOptionalFields } from './optionalFields';

const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });

describe('writeWithOptionalFields', () => {
    it('escribe con los campos nuevos si se aceptan', async () => {
        const write = vi.fn(async (withOptional: boolean) => withOptional);
        await expect(writeWithOptionalFields(write)).resolves.toBe(true);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('repite sin ellos si las reglas los rechazan', async () => {
        const write = vi.fn(async (withOptional: boolean) => { if (withOptional) throw denied; return 'ok'; });
        await expect(writeWithOptionalFields(write)).resolves.toBe('ok');
        expect(write).toHaveBeenNthCalledWith(2, false);
    });

    it('no reintenta otros errores', async () => {
        const write = vi.fn(async () => { throw new Error('red'); });
        await expect(writeWithOptionalFields(write)).rejects.toThrow('red');
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('si también falla sin los campos, propaga el error', async () => {
        const write = vi.fn(async () => { throw denied; });
        await expect(writeWithOptionalFields(write)).rejects.toBe(denied);
        expect(write).toHaveBeenCalledTimes(2);
    });
});
