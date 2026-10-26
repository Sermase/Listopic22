import { fireSurprise, isSurpriseOn, reviewSurprises, type ReviewSurpriseInput } from '../../lib/surprises';
import { claimSecretBadge, type SecretBadgeId } from '../../services/SurpriseService';

const BADGE_FOR: Partial<Record<string, SecretBadgeId>> = {
    lateNight: 'AVE_NOCTURNA',
    spicy: 'PALADAR_DE_HIERRO',
};

/** Tras publicar una valoración: las reacciones y las medallas secretas que tocan. */
export function celebrateReview(
    config: { surprises?: Partial<Record<string, boolean>> },
    input: ReviewSurpriseInput,
    isNew: boolean,
): void {
    const badges = isSurpriseOn(config, 'secretBadges');
    reviewSurprises(input)
        .filter((s) => isSurpriseOn(config, s.id))
        .forEach((s, i) => {
            window.setTimeout(() => fireSurprise(s.effect), i * 900);
            const badge = BADGE_FOR[s.id];
            if (badge && badges) void claimSecretBadge(badge);
        });
    // Tres valoraciones en un domingo: «Bien comido» y el tema Abuela. Las cuenta el servidor
    // en toda la cuenta (valen las de otros dispositivos), así que se pregunta en cada una.
    if (isNew && badges && isSurpriseOn(config, 'abuela') && (input.now ?? new Date()).getDay() === 0) {
        void claimSecretBadge('BIEN_COMIDO');
    }
}
