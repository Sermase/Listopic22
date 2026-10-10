/**
 * Estilos de portada de Business Pro (`visualStyle`). Los usan la ficha
 * pública (PlacePage) y la vista previa de 🎨 Imagen, así que lo que se ve al
 * elegir es exactamente lo que se publica.
 *
 *   const hero = heroStyleOf(proVisual?.visualStyle);
 *   <EntityHero className={hero.hero} imageClassName={hero.image}>
 *     <h1 className={cn('… font-display …', hero.title)}>…</h1>
 *
 * 'editorial' es el look de siempre de Listopic (y el valor por defecto que
 * ya tienen guardado todos los negocios), así que no añade nada: cambiarlo
 * restilaría páginas que nunca eligieron estilo.
 *
 * Solo tocan la foto, el velo y la tipografía (no el texto ni sus colores), así
 * que los 4 temas siguen legibles: el texto va sobre el degradado al fondo del tema.
 */
import type { BusinessVisualStyle } from '../../../services/BusinessProService';

export interface HeroStyleClasses {
    /** Clases extra del <section> de EntityHero (fondo bajo la foto, velo). */
    hero: string;
    /** Clases extra de la foto (filtros). */
    image: string;
    /** Clases extra del título (tipografía, brillo). */
    title: string;
    /** Clases extra de la frase destacada. */
    phrase: string;
}

export const HERO_STYLE_CLASSES: Record<BusinessVisualStyle, HeroStyleClasses> = {
    // 📰 El de siempre: titular grande, foto con velo suave.
    editorial: { hero: '', image: '', title: '', phrase: '' },
    // 🤍 Foto luminosa, poco filtro: sin velo de opacidad y el degradado más ligero.
    clean: {
        hero: '[&>div:first-child]:opacity-60',
        image: 'opacity-100 brightness-[1.06] saturate-[1.05]',
        title: 'font-sans font-extrabold tracking-tight',
        phrase: 'not-italic',
    },
    // 🔥 Tonos tostados: foto cálida sobre fondo tostado y titular con serifa.
    warm: {
        hero: 'bg-[#3a1e0c]',
        image: 'sepia-[.35] saturate-[1.3] brightness-[.98]',
        title: 'font-serif tracking-normal',
        phrase: '',
    },
    // 🌙 Oscuro y con brillo: foto en penumbra con más contraste y titular que brilla.
    night: {
        hero: 'bg-black',
        image: 'brightness-[.62] contrast-[1.2] saturate-[1.35]',
        title: 'tracking-tight [text-shadow:0_0_26px_var(--lt-accent)]',
        phrase: '',
    },
};

const VALID_STYLES = Object.keys(HERO_STYLE_CLASSES) as BusinessVisualStyle[];

/** Clases del estilo (cualquier valor desconocido o vacío = editorial). */
export const heroStyleOf = (style: unknown): HeroStyleClasses => (
    VALID_STYLES.includes(style as BusinessVisualStyle) ? HERO_STYLE_CLASSES[style as BusinessVisualStyle] : HERO_STYLE_CLASSES.editorial
);
