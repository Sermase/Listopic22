/**
 * Dibujo de un plato (o sitio) cuando no hay foto: un emoji según el nombre,
 * sobre un fondo de su color (translúcido: vale en temas claros y oscuros).
 */
export interface DishArt {
    emoji: string;
    /** Tono del fondo (0–360). */
    hue: number;
}

// Del más concreto al más general: gana la primera que encaje.
const RULES: ReadonlyArray<[RegExp, string, number]> = [
    [/brava|patata|fritas|chips/, '🍟', 35],
    [/croquet/, '🧆', 30],
    [/tortilla/, '🍳', 48],
    [/tarta|cheesecake|pastel|bizcocho/, '🍰', 340],
    [/hamburgues|burger/, '🍔', 25],
    [/pizza|pizzer/, '🍕', 10],
    [/nacho|taco|tex.?mex|mexican/, '🌮', 40],
    [/burrito/, '🌯', 40],
    [/ensaladilla|ensalada|poke/, '🥗', 110],
    [/brunch|tortita|pancake|gofre|waffle/, '🥞', 38],
    [/churro|porra/, '🥨', 32],
    [/croissant|cruas|napolitana|bollo|panader|horno|pasteler/, '🥐', 36],
    [/helad|gelat/, '🍦', 320],
    [/sushi|maki|nigiri|japon/, '🍣', 200],
    [/ramen|udon|fideo|noodle|pho/, '🍜', 20],
    [/pasta|espagueti|spaghetti|lasa|macarr|ravioli|carbonara/, '🍝', 15],
    [/torrija|flan|natilla|crema catalana|arroz con leche/, '🍮', 40],
    [/paella|arroz|risotto/, '🥘', 45],
    [/bocadillo|bocata|montadito|sándwich|sandwich|pepito|serranito|mollete/, '🥖', 34],
    [/marisc|gamba|langost|cigal|mejill|almeja/, '🦐', 12],
    [/pulpo|calamar|chipir|sepia/, '🐙', 280],
    [/pescad|bacalao|merluza|atún|atun|salmón|salmon|boquer|sardin/, '🐟', 195],
    [/pollo|alita|nugget/, '🍗', 28],
    [/chuleta|entrecot|solomillo|carne|cachopo|costill|filete|steak|asado/, '🥩', 0],
    [/huevo|benedict/, '🍳', 48],
    [/queso|cheese/, '🧀', 50],
    [/chocolate|brownie|cacao/, '🍫', 20],
    [/donut|dónut|rosquill/, '🍩', 330],
    [/galleta|cookie/, '🍪', 32],
    [/postre/, '🍮', 40],
    [/café|cafe|cafeter|capuch|latte/, '☕', 25],
    [/vermú|vermut|vino|bodega|taberna|mesón|meson/, '🍷', 345],
    [/cervec|cerveza|caña|\bbar\b/, '🍺', 42],
    [/cóctel|coctel|mojito|\bgin\b/, '🍸', 300],
    [/(^|\s)té(\s|$)|matcha|\bchai\b/, '🍵', 120],
    [/kebab|shawarma|falafel/, '🥙', 30],
    [/dumpling|gyoza|dim sum|baozi/, '🥟', 38],
    [/curry|india/, '🍛', 35],
    [/sopa|caldo|cocido|potaje|fabada|lentej/, '🍲', 22],
    [/playa|\bcala\b/, '🏖️', 190],
];

const DEFAULT_ART: DishArt = { emoji: '🍽️', hue: 250 };

const clean = (s: string) => s.toLowerCase().normalize('NFC');

/** Dibujo para un nombre (plato, sitio o lista). */
export function dishArt(...names: ReadonlyArray<string | null | undefined>): DishArt {
    for (const name of names) {
        if (!name) continue;
        const text = clean(name);
        const rule = RULES.find(([re]) => re.test(text));
        if (rule) return { emoji: rule[1], hue: rule[2] };
    }
    return DEFAULT_ART;
}
