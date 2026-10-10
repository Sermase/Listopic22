// 📝 Ficha (pestaña `general` de la gestión del negocio).
export { BusinessInfoTab, type BusinessInfoTabProps } from './BusinessInfoTab';
export { fichaPlaceInfoFromDoc, type FichaPlaceInfo } from './placeInfo';

// Formularios sueltos (mismas props base que antes: doc + onChange).
export { IdentityForm } from './IdentityForm';
export { ContactForm } from './ContactForm';
export { CommercialForm } from './CommercialForm';
export { AccessibilityForm } from './AccessibilityForm';
export { FamilyForm } from './FamilyForm';
export { PetsForm } from './PetsForm';
export { DietaryForm } from './DietaryForm';
export { HoursForm } from './HoursForm';
export { ReservationsForm } from './ReservationsForm';
export { DeliveriesForm } from './DeliveriesForm';
export type { FichaFormContext, SectionFormProps } from './formTypes';
