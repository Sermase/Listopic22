/**
 * ProInboxSection: sub-pestaña «📥 Bandeja» de «Patrocinios y Pro». Solo lo que
 * falta por decidir (propuestas `pending`, campañas y platos `requested`), del
 * más antiguo al más reciente, con una nota por fila. Ver ProOpenSection.
 */
import React from 'react';
import { ProOpenSection } from './ProOpenSection';
import type { ProSectionProps } from './proUtils';

export const ProInboxSection: React.FC<ProSectionProps> = (props) => <ProOpenSection {...props} mode="inbox" />;
