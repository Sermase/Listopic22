export interface BadgePreset {
  id: string;
  name: string;
  description: string;
  descriptionPublic: string;
  logicNotes: string;
  category: "GENERAL" | "EXPERT" | "SPECIAL" | "HIDDEN" | "FUNNY" | "CORE";
  type:
    | "custom"
    | "review_count"
    | "photo_count"
    | "place_count"
    | "lists_count"
    | "followers_count"
    | "following_count"
    | "level_reached";
  threshold: number;
  icon: string;
  xpReward: number;
  active: boolean;
  rarity?: "common" | "rare" | "epic";
}

export interface BadgePresetPack {
  id: string;
  name: string;
  description: string;
  theme: string;
  badges: BadgePreset[];
}

const coreBadges: BadgePreset[] = [
  {
    id: "PIONERO",
    name: "Pionero",
    description: "Tu primera resena publicada. Ya no hay vuelta atras.",
    descriptionPublic: "Publica tu primera resena.",
    logicNotes: "Ideal como medalla de arranque. review_count >= 1",
    category: "CORE",
    type: "review_count",
    threshold: 1,
    icon: "🌱",
    xpReward: 40,
    active: true,
    rarity: "common",
  },
  {
    id: "CRITICO_DE_BARRIO",
    name: "Critico de Barrio",
    description: "Llevas unas cuantas resenas y ya se nota criterio.",
    descriptionPublic: "Publica 10 resenas.",
    logicNotes: "review_count >= 10",
    category: "GENERAL",
    type: "review_count",
    threshold: 10,
    icon: "📝",
    xpReward: 60,
    active: true,
    rarity: "common",
  },
  {
    id: "FOTO_O_PRUEBA",
    name: "Foto o Prueba",
    description: "Si no hay foto, casi ni ha pasado.",
    descriptionPublic: "Sube 10 resenas con foto.",
    logicNotes: "photo_count >= 10",
    category: "GENERAL",
    type: "photo_count",
    threshold: 10,
    icon: "📸",
    xpReward: 80,
    active: true,
    rarity: "rare",
  },
  {
    id: "RUTA_COMPLETA",
    name: "Ruta Completa",
    description: "Has valorado suficientes lugares como para montar tu propio mapa.",
    descriptionPublic: "Valora 25 lugares distintos.",
    logicNotes: "place_count >= 25",
    category: "EXPERT",
    type: "place_count",
    threshold: 25,
    icon: "🗺️",
    xpReward: 90,
    active: true,
    rarity: "rare",
  },
  {
    id: "CURADOR_DE_LISTAS",
    name: "Curador de Listas",
    description: "No solo opinas: ordenas el caos.",
    descriptionPublic: "Crea 3 listas.",
    logicNotes: "lists_count >= 3",
    category: "GENERAL",
    type: "lists_count",
    threshold: 3,
    icon: "🗂️",
    xpReward: 70,
    active: true,
    rarity: "common",
  },
  {
    id: "CARA_CONOCIDA",
    name: "Cara Conocida",
    description: "Empieza a haber gente pendiente de lo que publicas.",
    descriptionPublic: "Consigue 25 seguidores.",
    logicNotes: "followers_count >= 25",
    category: "EXPERT",
    type: "followers_count",
    threshold: 25,
    icon: "🫶",
    xpReward: 110,
    active: true,
    rarity: "rare",
  },
  {
    id: "SUBES_DE_NIVEL",
    name: "Subes de Nivel",
    description: "El ritmo es serio. Ya se nota recorrido.",
    descriptionPublic: "Alcanza el nivel 5.",
    logicNotes: "level_reached >= 5",
    category: "EXPERT",
    type: "level_reached",
    threshold: 5,
    icon: "🔥",
    xpReward: 120,
    active: true,
    rarity: "epic",
  },
];

const funnyBadges: BadgePreset[] = [
  {
    id: "UNA_MAS_Y_ME_VOY",
    name: "Una Mas y Me Voy",
    description: "La frase mas falsa de toda persona con listas abiertas.",
    descriptionPublic: "Publica 50 resenas.",
    logicNotes: "review_count >= 50",
    category: "FUNNY",
    type: "review_count",
    threshold: 50,
    icon: "🍽️",
    xpReward: 90,
    active: true,
    rarity: "rare",
  },
  {
    id: "TENGO_UNA_LISTA_PARA_ESO",
    name: "Tengo una Lista para Eso",
    description: "Tu solucion para todo empieza con una lista nueva.",
    descriptionPublic: "Crea 8 listas.",
    logicNotes: "lists_count >= 8",
    category: "FUNNY",
    type: "lists_count",
    threshold: 8,
    icon: "📚",
    xpReward: 100,
    active: true,
    rarity: "rare",
  },
  {
    id: "TURISTA_DEL_TUPPER",
    name: "Turista del Tupper",
    description: "Has pasado por tantos sitios que ya te ubican por la mirada.",
    descriptionPublic: "Valora 40 lugares distintos.",
    logicNotes: "place_count >= 40",
    category: "FUNNY",
    type: "place_count",
    threshold: 40,
    icon: "🥡",
    xpReward: 110,
    active: true,
    rarity: "rare",
  },
  {
    id: "FOTO_O_FAKE",
    name: "Foto o Fake",
    description: "No te cree nadie sin carrete.",
    descriptionPublic: "Sube 25 resenas con foto.",
    logicNotes: "photo_count >= 25",
    category: "FUNNY",
    type: "photo_count",
    threshold: 25,
    icon: "🎞️",
    xpReward: 100,
    active: true,
    rarity: "rare",
  },
  {
    id: "ME_DEBO_A_MI_PUBLICO",
    name: "Me Debo a Mi Publico",
    description: "Los seguidores ya exigen nueva opinion cada dos por tres.",
    descriptionPublic: "Consigue 75 seguidores.",
    logicNotes: "followers_count >= 75",
    category: "FUNNY",
    type: "followers_count",
    threshold: 75,
    icon: "🎤",
    xpReward: 130,
    active: true,
    rarity: "epic",
  },
  {
    id: "STALKER_GASTRONOMICO",
    name: "Stalker Gastronomico",
    description: "Sigues a tanta gente que tu feed ya es investigacion.",
    descriptionPublic: "Sigue a 40 usuarios.",
    logicNotes: "following_count >= 40",
    category: "FUNNY",
    type: "following_count",
    threshold: 40,
    icon: "👀",
    xpReward: 90,
    active: true,
    rarity: "rare",
  },
];

export const BADGE_PRESET_PACKS: BadgePresetPack[] = [
  {
    id: "core",
    name: "Pack Base",
    description: "Medallas de progreso claras para que la gamificacion tenga una columna vertebral.",
    theme: "from-indigo-500/20 via-cyan-500/10 to-emerald-500/20",
    badges: coreBadges,
  },
  {
    id: "funny",
    name: "Pack Graciosas",
    description: "Medallas con tono mas jugueton para que el perfil tenga personalidad propia.",
    theme: "from-amber-500/20 via-rose-500/10 to-fuchsia-500/20",
    badges: funnyBadges,
  },
  {
    id: "full",
    name: "Pack Completo",
    description: "Base + graciosas. Buen punto de partida para tener variedad sin inventarlo todo a mano.",
    theme: "from-emerald-500/20 via-indigo-500/10 to-amber-500/20",
    badges: [...coreBadges, ...funnyBadges],
  },
];
