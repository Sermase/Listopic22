/**
 * Apps del laboratorio (Istari Core). Con el laboratorio público (`showLab`),
 * cada una se ve salvo que Developer → Proyectos la oculte (`labApps[id] === false`).
 * Los jefes las ven siempre.
 */
export type LabAppId = 'apegos' | 'pachote';

export interface LabApp {
    id: LabAppId;
    name: string;
}

export const LAB_APPS: readonly LabApp[] = [
    { id: 'apegos', name: 'El baile de los apegos' },
    { id: 'pachote', name: 'Pachote' },
];

interface LabConfig {
    showLab: boolean;
    labApps?: Partial<Record<string, boolean>>;
}

export function isLabAppVisible(config: LabConfig, id: LabAppId, isJefe = false): boolean {
    if (isJefe) return true;
    return config.showLab && config.labApps?.[id] !== false;
}
