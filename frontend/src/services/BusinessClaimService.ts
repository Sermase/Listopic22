import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';

export type BusinessClaimStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessClaimProof {
    name: string;
    size: number;
    type: string;
    storagePath: string;
    downloadUrl: string;
}

export interface BusinessClaim {
    id: string;
    userId: string;
    userEmail?: string | null;
    userName?: string | null;
    placeId: string;
    placeName: string;
    placeAddress?: string | null;
    role: string;
    contactEmail: string;
    contactPhone?: string;
    website?: string;
    message: string;
    status: BusinessClaimStatus;
    proofs: BusinessClaimProof[];
    truthDeclarationAccepted?: boolean;
    truthDeclarationText?: string;
    truthDeclarationAcceptedAt?: unknown;
    adminNotes?: string | null;
    createdAt?: unknown;
    updatedAt?: unknown;
    reviewedAt?: unknown;
    reviewedBy?: string | null;
}

export interface CreateBusinessClaimInput {
    userId: string;
    userEmail?: string | null;
    userName?: string | null;
    placeId: string;
    placeName: string;
    placeAddress?: string | null;
    role: string;
    contactEmail: string;
    contactPhone?: string;
    website?: string;
    message: string;
    truthDeclarationAccepted: boolean;
    files: File[];
}

const MAX_FILES = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
]);

const cleanText = (value: string, maxLength: number) => value.trim().slice(0, maxLength);

const getFirebaseCode = (error: unknown): string => {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        return typeof code === 'string' ? code : '';
    }
    return '';
};

const safeFileName = (name: string) => {
    const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
    return cleaned || 'proof-file';
};

const claimDocId = (userId: string, placeId: string) => `${userId}_${placeId}`;

export const validateBusinessClaimFiles = (files: File[]) => {
    if (files.length > MAX_FILES) {
        throw new Error(`Puedes adjuntar hasta ${MAX_FILES} archivos.`);
    }

    for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
            throw new Error(`"${file.name}" supera el límite de 25 MB.`);
        }
        if (!ALLOWED_FILE_TYPES.has(file.type)) {
            throw new Error(`"${file.name}" no es un PDF o imagen compatible.`);
        }
    }
};

export const createBusinessClaim = async (input: CreateBusinessClaimInput): Promise<{ id: string; proofs: BusinessClaimProof[] }> => {
    const files = input.files.slice(0, MAX_FILES);
    validateBusinessClaimFiles(files);
    if (!input.truthDeclarationAccepted) {
        throw new Error('Debes confirmar que la información enviada es veraz y que estás autorizado a reclamar este negocio.');
    }

    const docRef = doc(db, 'businessClaims', claimDocId(input.userId, input.placeId));

    const uploadedProofs: BusinessClaimProof[] = [];
    for (const file of files) {
        const path = `business-claims/${input.userId}/${docRef.id}/docs/${Date.now()}-${safeFileName(file.name)}`;
        const fileRef = ref(storage, path);
        let downloadUrl = '';
        try {
            await uploadBytes(fileRef, file, { contentType: file.type });
            downloadUrl = await getDownloadURL(fileRef);
        } catch (error) {
            const code = getFirebaseCode(error);
            console.error('Business claim proof upload failed', { path, code, error });
            throw new Error(code === 'storage/unauthorized' || code === 'permission-denied'
                ? 'No tienes permisos para subir las pruebas. Despliega las Storage Rules nuevas o prueba sin adjuntar archivo.'
                : `No se pudo subir "${file.name}". ${code ? `(${code})` : ''}`.trim());
        }
        uploadedProofs.push({
            name: file.name,
            size: file.size,
            type: file.type,
            storagePath: path,
            downloadUrl,
        });
    }

    try {
        await setDoc(docRef, {
            userId: input.userId,
            userEmail: input.userEmail || null,
            userName: input.userName || null,
            placeId: input.placeId,
            placeName: cleanText(input.placeName, 180),
            placeAddress: input.placeAddress ? cleanText(input.placeAddress, 260) : null,
            role: cleanText(input.role, 120),
            contactEmail: cleanText(input.contactEmail, 180),
            contactPhone: input.contactPhone ? cleanText(input.contactPhone, 80) : '',
            website: input.website ? cleanText(input.website, 240) : '',
            message: cleanText(input.message, 1600),
            truthDeclarationAccepted: true,
            truthDeclarationText: 'Declaro que la información enviada es veraz, que estoy autorizado a reclamar este negocio y que las pruebas adjuntas son legítimas.',
            truthDeclarationAcceptedAt: serverTimestamp(),
            status: 'pending',
            proofs: uploadedProofs,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        const code = getFirebaseCode(error);
        console.error('Business claim document create failed', { code, placeId: input.placeId, error });
        if (code === 'permission-denied') {
            const existing = await getDoc(docRef).catch(() => null);
            if (existing?.exists()) {
                throw new Error('Ya existe una solicitud para este negocio. Si la ves como borrada, revisa en Firestore que no quede el documento businessClaims con este usuario y lugar.');
            }
            throw new Error('No se pudo crear la solicitud por permisos. Despliega las Firestore Rules nuevas y vuelve a intentarlo.');
        }
        throw new Error(`No se pudo crear la solicitud. ${code ? `(${code})` : ''}`.trim());
    }

    return { id: docRef.id, proofs: uploadedProofs };
};

export const getBusinessClaimsForPlace = async (userId: string, placeId: string): Promise<BusinessClaim[]> => {
    const snap = await getDocs(query(
        collection(db, 'businessClaims'),
        where('userId', '==', userId),
        where('placeId', '==', placeId),
    ));

    return snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<BusinessClaim, 'id'>) }))
        .sort((a, b) => {
            const aSeconds = typeof (a.createdAt as { seconds?: unknown })?.seconds === 'number'
                ? (a.createdAt as { seconds: number }).seconds
                : 0;
            const bSeconds = typeof (b.createdAt as { seconds?: unknown })?.seconds === 'number'
                ? (b.createdAt as { seconds: number }).seconds
                : 0;
            return bSeconds - aSeconds;
        });
};
