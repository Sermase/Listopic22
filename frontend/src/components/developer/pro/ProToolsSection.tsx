/**
 * ProToolsSection: sub-pestaña «🛠️ Herramientas» de «Patrocinios y Pro».
 *
 * Herramientas de administración autónomas: cada una es una tarjeta que carga
 * y guarda lo suyo. Para añadir otra, impórtala y añádela a PRO_TOOLS, p. ej.
 *   { id: 'otraHerramienta', Component: OtraHerramientaCard }
 *
 *   🧹 Reparar cartas   RepairPlaceItemsCard (callable adminRepairPlaceItems)
 */
import React from 'react';
import { RepairPlaceItemsCard } from './RepairPlaceItemsCard';

interface ProTool {
    id: string;
    Component: React.ComponentType;
}

const PRO_TOOLS: readonly ProTool[] = [
    { id: 'repairPlaceItems', Component: RepairPlaceItemsCard },
];

export const ProToolsSection: React.FC = () => (
    <div className="space-y-4">
        {PRO_TOOLS.map(({ id, Component }) => <Component key={id} />)}
    </div>
);
