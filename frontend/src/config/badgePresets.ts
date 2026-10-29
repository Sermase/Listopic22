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
    description: "Has valorado suficientes sitios como para montar tu propio mapa.",
    descriptionPublic: "Valora 25 sitios distintos.",
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
    descriptionPublic: "Valora 40 sitios distintos.",
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


// Escalera: cuatro escalones por cosa (medallita → normal → difícil → leyenda), del primer día a los muy activos.
// Reutiliza los ids de antes (con umbrales nuevos) y apaga las copias antiguas.
const ladderBadges: BadgePreset[] = [
  { id: "PIONERO", name: "Pionero", description: "Tu primera reseña publicada. Ya no hay vuelta atrás.", descriptionPublic: "Publica tu primera reseña.", logicNotes: "Escalón 1 (medallita). review_count >= 1", category: "CORE", type: "review_count", threshold: 1, icon: "🌱", xpReward: 10, active: true, rarity: "common" },
  { id: "CRITICO_DE_BARRIO", name: "Crítico de Barrio", description: "Diez reseñas: ya se nota criterio.", descriptionPublic: "Publica 10 reseñas.", logicNotes: "Escalón 2 (normal). review_count >= 10", category: "GENERAL", type: "review_count", threshold: 10, icon: "📝", xpReward: 25, active: true, rarity: "common" },
  { id: "UNA_MAS_Y_ME_VOY", name: "Una Más y Me Voy", description: "Cincuenta reseñas. «Una más y me voy», dijiste.", descriptionPublic: "Publica 50 reseñas.", logicNotes: "Escalón 3 (difícil). review_count >= 50", category: "EXPERT", type: "review_count", threshold: 50, icon: "🍽️", xpReward: 50, active: true, rarity: "rare" },
  { id: "LEYENDA_DEL_TENEDOR", name: "Leyenda del Tenedor", description: "Ciento cincuenta reseñas. Los camareros ya te tutean.", descriptionPublic: "Publica 150 reseñas.", logicNotes: "Escalón 4 (leyenda). review_count >= 150", category: "SPECIAL", type: "review_count", threshold: 150, icon: "👑", xpReward: 100, active: true, rarity: "epic" },
  { id: "PRIMER_CLIC", name: "Primer Clic", description: "Tu primera foto de comida. Que empiece la galería.", descriptionPublic: "Sube tu primera foto.", logicNotes: "Escalón 1 (medallita). photo_count >= 1", category: "CORE", type: "photo_count", threshold: 1, icon: "📷", xpReward: 10, active: true, rarity: "common" },
  { id: "FOTO_O_PRUEBA", name: "Foto o Prueba", description: "Diez fotos: si no hay foto, no pasó.", descriptionPublic: "Sube 10 fotos.", logicNotes: "Escalón 2 (normal). photo_count >= 10", category: "GENERAL", type: "photo_count", threshold: 10, icon: "📸", xpReward: 25, active: true, rarity: "common" },
  { id: "FOTO_O_FAKE", name: "Foto o Fake", description: "Cuarenta fotos. Tu galería da hambre.", descriptionPublic: "Sube 40 fotos.", logicNotes: "Escalón 3 (difícil). photo_count >= 40", category: "EXPERT", type: "photo_count", threshold: 40, icon: "🖼️", xpReward: 50, active: true, rarity: "rare" },
  { id: "ARCHIVO_VISUAL", name: "Archivo Visual", description: "Ciento veinte fotos. Esto ya es un archivo histórico.", descriptionPublic: "Sube 120 fotos.", logicNotes: "Escalón 4 (leyenda). photo_count >= 120", category: "SPECIAL", type: "photo_count", threshold: 120, icon: "🎞️", xpReward: 100, active: true, rarity: "epic" },
  { id: "EXPLORADOR", name: "Explorador", description: "Tres sitios distintos valorados. Sales de tu zona.", descriptionPublic: "Valora 3 sitios distintos.", logicNotes: "Escalón 1 (medallita). place_count >= 3", category: "CORE", type: "place_count", threshold: 3, icon: "🧭", xpReward: 10, active: true, rarity: "common" },
  { id: "RUTA_COMPLETA", name: "Ruta Completa", description: "Quince sitios distintos: tienes ruta propia.", descriptionPublic: "Valora 15 sitios distintos.", logicNotes: "Escalón 2 (normal). place_count >= 15", category: "GENERAL", type: "place_count", threshold: 15, icon: "🗺️", xpReward: 25, active: true, rarity: "common" },
  { id: "TURISTA_DEL_TUPPER", name: "Turista del Tupper", description: "Cincuenta sitios. Ya no comes en casa.", descriptionPublic: "Valora 50 sitios distintos.", logicNotes: "Escalón 3 (difícil). place_count >= 50", category: "EXPERT", type: "place_count", threshold: 50, icon: "🧳", xpReward: 50, active: true, rarity: "rare" },
  { id: "TROTAMUNDOS", name: "Trotamundos", description: "Ciento veinte sitios distintos. El mapa es tuyo.", descriptionPublic: "Valora 120 sitios distintos.", logicNotes: "Escalón 4 (leyenda). place_count >= 120", category: "SPECIAL", type: "place_count", threshold: 120, icon: "🌍", xpReward: 100, active: true, rarity: "epic" },
  { id: "PRIMERA_LISTA", name: "Primera Lista", description: "Tu primera lista creada.", descriptionPublic: "Crea tu primera lista.", logicNotes: "Escalón 1 (medallita). lists_count >= 1", category: "CORE", type: "lists_count", threshold: 1, icon: "📋", xpReward: 10, active: true, rarity: "common" },
  { id: "CURADOR_DE_LISTAS", name: "Curador de Listas", description: "Tres listas: ordenas el mundo a tu manera.", descriptionPublic: "Crea 3 listas.", logicNotes: "Escalón 2 (normal). lists_count >= 3", category: "GENERAL", type: "lists_count", threshold: 3, icon: "🗃️", xpReward: 25, active: true, rarity: "common" },
  { id: "TENGO_UNA_LISTA_PARA_ESO", name: "Tengo una Lista para Eso", description: "Ocho listas. Para todo tienes una.", descriptionPublic: "Crea 8 listas.", logicNotes: "Escalón 3 (difícil). lists_count >= 8", category: "EXPERT", type: "lists_count", threshold: 8, icon: "📚", xpReward: 50, active: true, rarity: "rare" },
  { id: "ARCHIVERO_MAYOR", name: "Archivero Mayor", description: "Veinte listas. Nadie organiza la comida como tú.", descriptionPublic: "Crea 20 listas.", logicNotes: "Escalón 4 (leyenda). lists_count >= 20", category: "SPECIAL", type: "lists_count", threshold: 20, icon: "🗂️", xpReward: 100, active: true, rarity: "epic" },
  { id: "CURIOSO", name: "Curioso", description: "Sigues a 3 personas. Te interesa lo que comen otros.", descriptionPublic: "Sigue a 3 personas.", logicNotes: "Escalón 1 (medallita). following_count >= 3", category: "CORE", type: "following_count", threshold: 3, icon: "👀", xpReward: 10, active: true, rarity: "common" },
  { id: "STALKER_GASTRONOMICO", name: "Stalker Gastronómico", description: "Sigues a 20 personas. Sabes dónde come todo el mundo.", descriptionPublic: "Sigue a 20 personas.", logicNotes: "Escalón 2 (normal). following_count >= 20", category: "GENERAL", type: "following_count", threshold: 20, icon: "🕵️", xpReward: 25, active: true, rarity: "common" },
  { id: "RADAR_GASTRONOMICO", name: "Radar Gastronómico", description: "Sigues a 60 personas. Nada se te escapa.", descriptionPublic: "Sigue a 60 personas.", logicNotes: "Escalón 3 (difícil). following_count >= 60", category: "EXPERT", type: "following_count", threshold: 60, icon: "📡", xpReward: 50, active: true, rarity: "rare" },
  { id: "PRIMER_FAN", name: "Primer Fan", description: "Alguien te sigue. Tienes público.", descriptionPublic: "Consigue tu primer seguidor.", logicNotes: "Escalón 1 (medallita). followers_count >= 1", category: "CORE", type: "followers_count", threshold: 1, icon: "🙋", xpReward: 10, active: true, rarity: "common" },
  { id: "CARA_CONOCIDA", name: "Cara Conocida", description: "Diez personas te siguen.", descriptionPublic: "Consigue 10 seguidores.", logicNotes: "Escalón 2 (normal). followers_count >= 10", category: "GENERAL", type: "followers_count", threshold: 10, icon: "😎", xpReward: 25, active: true, rarity: "common" },
  { id: "ME_DEBO_A_MI_PUBLICO", name: "Me Debo a Mi Público", description: "Cuarenta seguidores esperan tu próxima reseña.", descriptionPublic: "Consigue 40 seguidores.", logicNotes: "Escalón 3 (difícil). followers_count >= 40", category: "EXPERT", type: "followers_count", threshold: 40, icon: "🎤", xpReward: 50, active: true, rarity: "rare" },
  { id: "INFLUENCER_DE_BARRA", name: "Influencer de Barra", description: "Ciento cincuenta seguidores. Recomiendas y se llena.", descriptionPublic: "Consigue 150 seguidores.", logicNotes: "Escalón 4 (leyenda). followers_count >= 150", category: "SPECIAL", type: "followers_count", threshold: 150, icon: "🌟", xpReward: 100, active: true, rarity: "epic" },
  { id: "CALENTANDO", name: "Calentando", description: "Nivel 3: ya le vas cogiendo el gusto.", descriptionPublic: "Llega al nivel 3.", logicNotes: "Escalón 1 (medallita). level_reached >= 3", category: "CORE", type: "level_reached", threshold: 3, icon: "🔥", xpReward: 10, active: true, rarity: "common" },
  { id: "SUBES_DE_NIVEL", name: "Subes de Nivel", description: "Nivel 5.", descriptionPublic: "Llega al nivel 5.", logicNotes: "Escalón 2 (normal). level_reached >= 5", category: "GENERAL", type: "level_reached", threshold: 5, icon: "⬆️", xpReward: 25, active: true, rarity: "common" },
  { id: "VETERANO", name: "Veterano", description: "Nivel 10: veterano de la mesa.", descriptionPublic: "Llega al nivel 10.", logicNotes: "Escalón 3 (difícil). level_reached >= 10", category: "EXPERT", type: "level_reached", threshold: 10, icon: "🏅", xpReward: 50, active: true, rarity: "rare" },
  { id: "GRAN_MAESTRE", name: "Gran Maestre", description: "Nivel 20. Pocos llegan hasta aquí.", descriptionPublic: "Llega al nivel 20.", logicNotes: "Escalón 4 (leyenda). level_reached >= 20", category: "SPECIAL", type: "level_reached", threshold: 20, icon: "🏆", xpReward: 100, active: true, rarity: "epic" },
  { id: "CRITIC_BRONZE", name: "Crítico Novato", description: "Copia antigua, apagada.", descriptionPublic: "", logicNotes: "Repetida: se quita a todos (functions/modules/gamification.js RETIRED_BADGES).", category: "GENERAL", type: "custom", threshold: 0, icon: "🗑️", xpReward: 0, active: false, rarity: "common" },
  { id: "CRITIC_SILVER", name: "Crítico Experto", description: "Copia antigua, apagada.", descriptionPublic: "", logicNotes: "Repetida: se quita a todos (functions/modules/gamification.js RETIRED_BADGES).", category: "GENERAL", type: "custom", threshold: 0, icon: "🗑️", xpReward: 0, active: false, rarity: "common" },
  { id: "CRITIC_GOLD", name: "Crítico Maestro", description: "Copia antigua, apagada.", descriptionPublic: "", logicNotes: "Repetida: se quita a todos (functions/modules/gamification.js RETIRED_BADGES).", category: "GENERAL", type: "custom", threshold: 0, icon: "🗑️", xpReward: 0, active: false, rarity: "common" },
  { id: "PHOTOGRAPHER", name: "Ojo Fotográfico", description: "Copia antigua, apagada.", descriptionPublic: "", logicNotes: "Repetida: se quita a todos (functions/modules/gamification.js RETIRED_BADGES).", category: "GENERAL", type: "custom", threshold: 0, icon: "🗑️", xpReward: 0, active: false, rarity: "common" },
];

export const BADGE_PRESET_PACKS: BadgePresetPack[] = [
  {
    id: "ladder",
    name: "Pack Escalera",
    description: "Cuatro escalones por cosa: medallita, normal, difícil y leyenda. Sube los umbrales de las de siempre y apaga las repetidas.",
    theme: "from-emerald-500/20 via-amber-500/10 to-rose-500/20",
    badges: ladderBadges,
  },
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
