import { fireSurprise, isSurpriseOn, reviewSurprises, type ReviewSurpriseInput } from '../../lib/surprises';
import { THEME_GRACES, characterLine, scoopColors, type ThemeCharacter } from '../../lib/themeCharacters';
import type { ThemeId } from '../../context/ThemeContext';
import { claimSecretBadge, claimThemeBadges, type SecretBadgeId } from '../../services/SurpriseService';

const BADGE_FOR: Partial<Record<string, SecretBadgeId>> = {
    lateNight: 'AVE_NOCTURNA',
    spicy: 'PALADAR_DE_HIERRO',
};

export interface CelebrateTheme {
    theme: ThemeId;
    /** El personaje que habla (null si no tiene o está callado). */
    character: ThemeCharacter | null;
    /** Si el tema ya tiene su gracia (Medianoche y Mediodía, con su medalla). */
    graceUnlocked: boolean;
}

/** Tras publicar una valoración: las reacciones, la gracia del tema y las medallas secretas que tocan. */
export function celebrateReview(
    config: { surprises?: Partial<Record<string, boolean>> },
    input: ReviewSurpriseInput,
    isNew: boolean,
    look?: CelebrateTheme,
): void {
    const badges = isSurpriseOn(config, 'secretBadges');
    const characterOn = !!look?.character && isSurpriseOn(config, look.theme === 'abuela' ? 'abuela' : 'themeCharacters');
    const character = characterOn ? look!.character : null;
    const reactions = reviewSurprises({ ...input, character })
        .filter((s) => isSurpriseOn(config, s.id));
    reactions.forEach((s, i) => {
        window.setTimeout(() => fireSurprise(s.effect), i * 900);
        const badge = BADGE_FOR[s.id];
        if (badge && badges) void claimSecretBadge(badge);
    });

    // La gracia del tema, después de las reacciones. Solo al publicar, no al editar.
    let after = reactions.length * 900;
    const grace = look ? THEME_GRACES[look.theme] : undefined;
    if (isNew && grace && look?.graceUnlocked && isSurpriseOn(config, 'themeGraces')) {
        window.setTimeout(() => fireSurprise({
            kind: 'grace',
            grace: grace.id,
            text: grace.id === 'neon' || grace.id === 'chalk' ? character?.published : undefined,
            scoops: grace.id === 'icecream' ? scoopColors(input.scores, input.criteria) : undefined,
        }), after + 300);
        after += 3600;
    }
    // Y el personaje comenta, si no ha dicho ya nada con las reacciones (la Abuela ya habla sola).
    const spoke = reactions.some((s) => s.effect.kind === 'rain' || s.effect.kind === 'broken' || s.effect.kind === 'bubble');
    if (isNew && character && !character.chatty && !spoke) {
        const line = characterLine(character);
        if (line) window.setTimeout(() => fireSurprise({ kind: 'bubble', emoji: character.emoji, text: line }), after + 400);
    }

    // Escalera de temas: no depende del interruptor de sorpresas de cada uno.
    if (isNew && config.surprises?.themeLadder !== false) void claimThemeBadges();
    // Tres valoraciones en un domingo: «Bien comido» y el tema Abuela. Las cuenta el servidor
    // en toda la cuenta (valen las de otros dispositivos), así que se pregunta en cada una.
    if (isNew && badges && isSurpriseOn(config, 'abuela') && (input.now ?? new Date()).getDay() === 0) {
        void claimSecretBadge('BIEN_COMIDO');
    }
}
