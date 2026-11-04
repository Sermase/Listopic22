const test = require('node:test');
const assert = require('node:assert');
const { buildPublicProfile } = require('../modules/lib/public-profile');

test('el espejo público lleva medallas, fechas y premios, y nada privado', () => {
    const out = buildPublicProfile('u1', {
        username: 'ana', badges: ['PIONERO'], badgeDates: { PIONERO: 1 },
        abilityPrefs: { ring: 'gold' }, themePreference: 'neon', email: 'ana@x.es', uxPreferences: { vegan: true },
    });
    assert.deepStrictEqual(out, {
        uid: 'u1', username: 'ana', badges: ['PIONERO'], badgeDates: { PIONERO: 1 },
        abilityPrefs: { ring: 'gold' }, themePreference: 'neon',
    });
});
