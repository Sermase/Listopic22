import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type {
    BusinessInfoDocument,
    BusinessInfoSection,
    BusinessSectionPayload,
    ResolvedBusinessInfo,
} from '../types/businessInfo';

export type BusinessInfoSectionsResponse = {
    sections: Record<BusinessInfoSection, BusinessInfoDocument>;
    resolvedPublic?: ResolvedBusinessInfo;
};

export const getBusinessInfoForManager = async (placeId: string): Promise<BusinessInfoSectionsResponse> => {
    const callable = httpsCallable<{ placeId: string }, BusinessInfoSectionsResponse>(functions, 'getBusinessInfoForManager');
    const result = await callable({ placeId });
    return result.data;
};

export const updateBusinessInfoSection = async <S extends BusinessInfoSection>(input: {
    placeId: string;
    section: S;
    data: BusinessSectionPayload;
    hiddenFields?: string[];
    version?: number;
}) => {
    const callable = httpsCallable(functions, 'updateBusinessInfoSection');
    const result = await callable({
        placeId: input.placeId,
        section: input.section,
        data: input.data,
        hiddenFields: input.hiddenFields || [],
        version: input.version || 0,
        source: 'business_user',
    });
    return result.data as { ok: boolean; section: S; version: number };
};
