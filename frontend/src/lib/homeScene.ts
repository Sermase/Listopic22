/** Momento del día del dibujo de la cabecera de Inicio y el saludo según la hora. */
export type SceneMoment = 'manana' | 'mediodia' | 'tarde' | 'noche';

export function sceneMoment(hour: number): SceneMoment {
    if (hour >= 6 && hour < 12) return 'manana';
    if (hour >= 12 && hour < 17) return 'mediodia';
    if (hour >= 17 && hour < 21) return 'tarde';
    return 'noche';
}

/** «Buenos días» hasta la hora de comer, como se dice aquí. */
export function timeGreeting(hour: number): string {
    if (hour >= 6 && hour < 14) return 'Buenos días';
    if (hour >= 14 && hour < 21) return 'Buenas tardes';
    return 'Buenas noches';
}
