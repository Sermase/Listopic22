/**
 * Textos de ayuda. Cada mini ⓘ de la app abre su tema y la página Ayuda los
 * enseña todos: un solo texto para los dos sitios, así nunca se contradicen.
 */
export type HelpTopicId =
    | 'listas'
    | 'nota'
    | 'criterios'
    | 'cerca'
    | 'filtros'
    | 'resenas'
    | 'minilistas'
    | 'guardados'
    | 'preferencias'
    | 'impulsos'
    | 'businessPro';

export interface HelpTopic {
    id: HelpTopicId;
    emoji: string;
    title: string;
    body: string[];
}

export const HELP_TOPICS: HelpTopic[] = [
    {
        id: 'listas',
        emoji: '🏆',
        title: 'Qué es una lista',
        body: [
            'Una lista es un ranking de una cosa concreta: tortillas, bravas, cocidos, playas…',
            'Cada sitio entra con lo que se ha probado allí, y su puesto sale de las reseñas de la gente.',
        ],
    },
    {
        id: 'nota',
        emoji: '🔢',
        title: 'De dónde sale la nota',
        body: [
            'Cada reseña puntúa de 0 a 10 los criterios de su lista (sabor, jugosidad…). La nota de la reseña es la media de esos criterios, con su peso.',
            'Un criterio puede pesar más que otro (×2, ×1,5…). Los «otros detalles» (picante, tamaño…) se ven pero no cuentan para la nota.',
            'La nota de un plato o de un sitio es la media de sus reseñas públicas. Con pocas reseñas, el ranking es prudente y no sube a nadie por una sola nota alta.',
        ],
    },
    {
        id: 'criterios',
        emoji: '🧩',
        title: 'Criterios',
        body: [
            'Son las cosas que se puntúan en una lista. Los que «cuentan» hacen la nota; los opcionales solo informan.',
            'Toca «Ver las notas» en una reseña para ver cada criterio, y «Comparar» en un plato para verlo frente a la media de la lista.',
        ],
    },
    {
        id: 'cerca',
        emoji: '📍',
        title: 'Cerca y bueno',
        body: [
            'El Inicio enseña lo mejor valorado a tu alrededor. Por defecto busca a 1 km y recuerda la distancia que elijas.',
            'Si cerca hay muy poco, amplía el radio (hasta 10 km) y te lo dice. Si eliges tú la distancia, se respeta.',
        ],
    },
    {
        id: 'filtros',
        emoji: '🎛️',
        title: 'Filtros',
        body: [
            'En cada lista, «Filtros» reúne todo: ordenar, nota mínima, etiquetas, qué ver, dieta, criterios y accesibilidad.',
            'Lo que elijas se recuerda en esa lista para la próxima vez. «Limpiar» lo deja todo como al principio.',
        ],
    },
    {
        id: 'resenas',
        emoji: '💬',
        title: 'Reseñas',
        body: [
            'Una reseña son tus notas y, si quieres, unas líneas contando qué tal. El texto es lo que más ayuda a otros a decidir.',
            'Dale a 👍 a las reseñas que te gusten: la más votada sale destacada en el sitio y en el plato.',
        ],
    },
    {
        id: 'minilistas',
        emoji: '📝',
        title: 'Minilistas',
        body: [
            'Una minilista es tu propia selección dentro de una lista: «Las bravas de mi barrio», «Tortillas para llevar»…',
            'Hereda el tema de la lista principal y puede tener sus propias reseñas.',
        ],
    },
    {
        id: 'guardados',
        emoji: '🔖',
        title: 'Guardados',
        body: [
            'Aquí va todo lo que guardas: sitios, platos, listas y reseñas.',
            'Puedes ordenarlo en colecciones («Pendientes», «Para ir con niños»…) y verlo en el mapa.',
            'Tienes dos colecciones especiales: «Quiero ir» y «Ya fui». Guarda en «Quiero ir» los sitios que te apetecen; cuando publiques una reseña de uno, pasa solo a «Ya fui».',
        ],
    },
    {
        id: 'preferencias',
        emoji: '🌾',
        title: 'Mis filtros',
        body: [
            'En Menú → Preferencias → Mis filtros. Si eliges «Sin gluten» o «Vegetariano», las listas filtran solas y verás un aviso arriba para quitarlo cuando quieras.',
            'Depende de que la gente marque esas etiquetas al reseñar: es información de usuarios, no una garantía para alérgicos.',
        ],
    },
    {
        id: 'impulsos',
        emoji: '⚡',
        title: 'Impulsos',
        body: [
            'Los impulsos son el saldo con el que un negocio destaca sus platos o su ficha durante un tiempo.',
            'Lo destacado siempre va marcado como tal, y no cambia la nota ni el puesto en ningún ranking.',
        ],
    },
    {
        id: 'businessPro',
        emoji: '✨',
        title: 'Business Pro',
        body: [
            'Es el plan para negocios: carta oficial, fotos, ofertas, estadísticas y destacados.',
            'Las reseñas y las notas son siempre de la comunidad: el negocio no puede tocarlas.',
        ],
    },
];

export const helpTopic = (id: HelpTopicId): HelpTopic => HELP_TOPICS.find((t) => t.id === id) ?? HELP_TOPICS[0];
