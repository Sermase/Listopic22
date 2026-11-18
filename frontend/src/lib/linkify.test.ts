import { describe, expect, it } from 'vitest';
import { splitLinks } from './linkify';

describe('splitLinks', () => {
    it('separa enlaces http, https y www, sin el punto final', () => {
        expect(splitLinks('Bases: https://x.es/bases. Y www.tartas.com, ya.')).toEqual([
            { text: 'Bases: ' },
            { text: 'https://x.es/bases', href: 'https://x.es/bases' },
            { text: '. Y ' },
            { text: 'www.tartas.com', href: 'https://www.tartas.com' },
            { text: ', ya.' },
        ]);
    });
    it('no enlaza javascript: ni texto sin URL', () => {
        expect(splitLinks('javascript:alert(1) hola')).toEqual([{ text: 'javascript:alert(1) hola' }]);
    });
});
