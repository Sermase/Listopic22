import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from './sentryScrub';

describe('sentryScrub', () => {
    it('tapa correos', () => {
        expect(scrubText('No existe ana.perez+1@gmail.com en la lista')).toBe('No existe [correo] en la lista');
    });

    it('filtra parámetros sensibles y deja el resto', () => {
        expect(scrubUrl('https://listopic.es/__/auth/action?mode=resetPassword&oobCode=ABC123&apiKey=AIza&lang=es#x'))
            .toBe('https://listopic.es/__/auth/action?mode=resetPassword&oobCode=[filtrado]&apiKey=[filtrado]&lang=es#x');
        expect(scrubUrl('https://listopic.es/search?type=items&zone=city:Valladolid')).toBe('https://listopic.es/search?type=items&zone=city:Valladolid');
        expect(scrubUrl('https://listopic.es/lists/abc')).toBe('https://listopic.es/lists/abc');
    });

    it('evento sin usuario, sin cookies y con texto limpio', () => {
        const event = scrubEvent({
            user: { id: 'uid', email: 'a@b.es', ip_address: '1.2.3.4' },
            message: 'Fallo para a@b.es',
            request: { url: 'https://listopic.es/login?email=a@b.es', cookies: { s: '1' }, headers: { 'User-Agent': 'UA', Referer: 'https://x' } },
            exception: { values: [{ value: 'Usuario a@b.es no encontrado' }] },
            breadcrumbs: [{ message: 'console a@b.es', data: { url: 'https://x.es/?token=t' } }],
        });
        expect(event.user).toBeUndefined();
        expect(event.message).toBe('Fallo para [correo]');
        expect(event.request).toEqual({ url: 'https://listopic.es/login?email=[filtrado]', headers: { 'User-Agent': 'UA' } });
        expect(event.exception?.values?.[0].value).toBe('Usuario [correo] no encontrado');
        expect(event.breadcrumbs?.[0]).toEqual({ message: 'console [correo]', data: { url: 'https://x.es/?token=[filtrado]' } });
    });

    it('migas de navegación', () => {
        expect(scrubBreadcrumb({ data: { from: '/a?code=1', to: '/b' } })).toEqual({ data: { from: '/a?code=[filtrado]', to: '/b' } });
    });
});
