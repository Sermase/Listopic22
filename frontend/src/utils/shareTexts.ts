import type { ShareEntityPayload } from '../types/share';

// Textos de compartir con gancho, por tipo de entidad. El objetivo es que el
// mensaje ya cuente algo (nota, lugar, autor) antes de que abran el link.

const formatScore = (value?: number): string | null =>
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1).replace('.', ',') : null;

export const buildShareText = (entity: ShareEntityPayload): string => {
    const score = formatScore(entity.score);

    switch (entity.type) {
        case 'review': {
            const dish = entity.title || 'Mi reseña';
            const place = entity.subtitle ? ` en ${entity.subtitle}` : '';
            return score
                ? `⭐ ${score} · ${dish}${place}. Mi reseña en Listopic:`
                : `${dish}${place} — mi reseña en Listopic:`;
        }
        case 'place': {
            const name = entity.title || 'Este sitio';
            const extra = [score ? `⭐ ${score}` : null, entity.city || null].filter(Boolean).join(' · ');
            return extra ? `${name} (${extra}) en Listopic:` : `${name}, en Listopic:`;
        }
        case 'list':
        case 'sublist': {
            const name = entity.title || 'Una lista';
            const count = entity.reviewCount && entity.reviewCount > 0 ? ` · ${entity.reviewCount} reseñas` : '';
            return `📋 ${name}${count}, votada por la comunidad en Listopic:`;
        }
        case 'group': {
            const dish = entity.title || 'Este plato';
            const place = entity.subtitle ? ` de ${entity.subtitle}` : '';
            return score
                ? `⭐ ${score} · ${dish}${place}, según la comunidad de Listopic:`
                : `${dish}${place}, opiniones reales en Listopic:`;
        }
        case 'profile': {
            const name = entity.title || 'Un perfil';
            return `${name} en Listopic — sus reseñas y listas:`;
        }
        default:
            return entity.title && entity.title !== 'Listopic'
                ? `${entity.title} — en Listopic:`
                : 'Mira esto en Listopic:';
    }
};
