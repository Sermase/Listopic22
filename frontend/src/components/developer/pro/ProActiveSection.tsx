/**
 * ProActiveSection: sub-pestaña «🟢 En curso» de «Patrocinios y Pro». Campañas y
 * platos `active` ordenados por fecha de fin, con métricas, CTR, avisos
 * «🧹 vencida sin cerrar» / «∞ sin fecha de fin» y «Finalizar». Ver ProOpenSection.
 */
import React from 'react';
import { ProOpenSection } from './ProOpenSection';
import type { ProSectionProps } from './proUtils';

export const ProActiveSection: React.FC<ProSectionProps> = (props) => <ProOpenSection {...props} mode="active" />;
