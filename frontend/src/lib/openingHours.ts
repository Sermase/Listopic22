// Horario del día a partir de las líneas «día: horas» (Google o ficha del negocio).
const DAY_NAMES = [
    ['domingo', 'sunday'],
    ['lunes', 'monday'],
    ['martes', 'tuesday'],
    ['miercoles', 'wednesday'],
    ['jueves', 'thursday'],
    ['viernes', 'friday'],
    ['sabado', 'saturday'],
];

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Horas de hoy («12:00–16:00, 20:00–23:30» o «Cerrado»), o null si no hay línea para hoy. */
export function todayHours(lines: string[] | undefined, now: Date = new Date()): string | null {
    if (!Array.isArray(lines)) return null;
    const names = DAY_NAMES[now.getDay()];
    for (const line of lines) {
        const separator = line.indexOf(':');
        if (separator < 0) continue;
        if (names.includes(normalize(line.slice(0, separator)))) return line.slice(separator + 1).trim() || null;
    }
    return null;
}
