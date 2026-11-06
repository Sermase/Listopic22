/** Momento del día del dibujo de la cabecera de Inicio y lo que dice debajo del saludo. */
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

export function mealLine(hour: number): string {
    if (hour >= 6 && hour < 11) return 'Hora del desayuno';
    if (hour >= 11 && hour < 13) return 'Hora del aperitivo';
    if (hour >= 13 && hour < 16) return 'Hora de comer';
    if (hour >= 16 && hour < 19) return 'Hora de la merienda';
    if (hour >= 19 && hour < 21) return 'Hora de unas cañas';
    if (hour >= 21) return 'Hora de cenar';
    return 'Algo para picar a deshoras';
}
