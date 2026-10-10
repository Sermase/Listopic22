import React from 'react';
import type { BusinessInfoSection, BusinessSectionData } from '../../../types/businessInfo';
import type { FichaSections } from './fichaModel';
import type { FichaFormContext } from './formTypes';
import { IdentityForm } from './IdentityForm';
import { ContactForm } from './ContactForm';
import { CommercialForm } from './CommercialForm';
import { AccessibilityForm } from './AccessibilityForm';
import { FamilyForm } from './FamilyForm';
import { PetsForm } from './PetsForm';
import { DietaryForm } from './DietaryForm';
import { HoursForm } from './HoursForm';
import { ReservationsForm } from './ReservationsForm';
import { DeliveriesForm } from './DeliveriesForm';

export interface SectionFormSwitchProps {
    section: BusinessInfoSection;
    draft: FichaSections;
    onChange: <S extends BusinessInfoSection>(section: S, patch: Partial<BusinessSectionData[S]>) => void;
    onHiddenChange: (section: BusinessInfoSection, field: string, hidden: boolean) => void;
    ctx: FichaFormContext;
}

/** El formulario de una sección de la Ficha. */
export const SectionForm: React.FC<SectionFormSwitchProps> = ({ section, draft, onChange, onHiddenChange, ctx }) => {
    switch (section) {
        case 'identity':
            return <IdentityForm doc={draft.identity} onChange={(patch) => onChange('identity', patch)} ctx={ctx} />;
        case 'contact':
            return (
                <ContactForm
                    doc={draft.contact}
                    onChange={(patch) => onChange('contact', patch)}
                    onHiddenChange={(field, hidden) => onHiddenChange('contact', field, hidden)}
                    ctx={ctx}
                />
            );
        case 'commercial':
            return <CommercialForm doc={draft.commercial} onChange={(patch) => onChange('commercial', patch)} ctx={ctx} />;
        case 'accessibility':
            return <AccessibilityForm doc={draft.accessibility} onChange={(patch) => onChange('accessibility', patch)} ctx={ctx} />;
        case 'family':
            return <FamilyForm doc={draft.family} onChange={(patch) => onChange('family', patch)} ctx={ctx} />;
        case 'pets':
            return <PetsForm doc={draft.pets} onChange={(patch) => onChange('pets', patch)} ctx={ctx} />;
        case 'dietary':
            return <DietaryForm doc={draft.dietary} onChange={(patch) => onChange('dietary', patch)} ctx={ctx} />;
        case 'hours':
            return <HoursForm doc={draft.hours} onChange={(patch) => onChange('hours', patch)} ctx={ctx} />;
        case 'reservations':
            return <ReservationsForm doc={draft.reservations} onChange={(patch) => onChange('reservations', patch)} ctx={ctx} />;
        case 'deliveries':
            return <DeliveriesForm doc={draft.deliveries} onChange={(patch) => onChange('deliveries', patch)} ctx={ctx} />;
        default:
            return null;
    }
};
