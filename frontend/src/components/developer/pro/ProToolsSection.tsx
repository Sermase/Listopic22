/**
 * ProToolsSection: sub-pestaña «🛠️ Herramientas» de «Patrocinios y Pro».
 *
 * Herramientas de administración autónomas: cada una es una tarjeta que carga
 * y guarda lo suyo. Para añadir otra, impórtala y añádela a PRO_TOOLS, p. ej.
 *   { id: 'otraHerramienta', Component: OtraHerramientaCard }
 * Si una herramienta cambia datos que se ven en las colas, llama a
 * onDataChanged y las sub-pestañas con colas se recargan al volver a ellas.
 *
 *   🧹 Reparar cartas   RepairPlaceItemsCard (callable adminRepairPlaceItems)
 */
import React from 'react';
import { RepairPlaceItemsCard } from './RepairPlaceItemsCard';

export interface ProToolProps {
    onDataChanged?: () => void;
}

interface ProTool {
    id: string;
    Component: React.ComponentType<ProToolProps>;
}

const PRO_TOOLS: readonly ProTool[] = [
    { id: 'repairPlaceItems', Component: RepairPlaceItemsCard },
];

export const ProToolsSection: React.FC<ProToolProps> = ({ onDataChanged }) => (
    <div className="space-y-4">
        {PRO_TOOLS.map(({ id, Component }) => <Component key={id} onDataChanged={onDataChanged} />)}
    </div>
);
