import { describe, expect, it } from 'vitest';
import { closedStatusKind } from './placeStatus';
import { placeClosedStatus } from '../lib/listElements';

describe('estado de cierre', () => {
    it('un sitio abierto («OPERATIONAL» de Google) no sale como cerrado', () => {
        expect(closedStatusKind('OPERATIONAL')).toBeNull();
        expect(closedStatusKind(null)).toBeNull();
        expect(placeClosedStatus({ closedStatus: null, googleBusinessStatus: 'OPERATIONAL' } as never)).toBeNull();
    });

    it('distingue cierre definitivo y temporal en cualquier formato', () => {
        expect(closedStatusKind('permanently_closed')).toBe('permanent');
        expect(closedStatusKind('CLOSED_PERMANENTLY')).toBe('permanent');
        expect(closedStatusKind('temporarily_closed')).toBe('temporary');
        expect(closedStatusKind('CLOSED_TEMPORARILY')).toBe('temporary');
    });
});
