import type { BusinessInfoDocument, BusinessInfoSection, BusinessSectionData } from '../../../types/businessInfo';

/** Lo que los formularios saben del lugar y de la Ficha, además de su sección. */
export interface FichaFormContext {
    placeId?: string;
    /** Nombre de Google (placeholder de «Nombre visible»). */
    placeName?: string;
    /** Teléfono y web que muestra Google («Google muestra: …»). */
    googlePhone?: string;
    googleWebsite?: string;
    /** Ir a otra sección de la Ficha («Detállalo en 👨‍👩‍👧 Familias →»). */
    goToSection?: (section: BusinessInfoSection) => void;
    /** Ir a la pestaña Carta («Los alérgenos de cada plato se marcan en 📖 Carta →»). */
    goToCarta?: () => void;
}

export interface SectionFormProps<S extends BusinessInfoSection> {
    doc: BusinessInfoDocument<S>;
    onChange: (data: Partial<BusinessSectionData[S]>) => void;
    ctx?: FichaFormContext;
}
