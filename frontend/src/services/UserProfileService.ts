import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { buildUsernameSuggestion, getUsernameValidationError, normalizeUsername } from '../utils/username';

const USERS_COLLECTION = 'users';
const USERNAME_CLAIMS_COLLECTION = 'usernameClaims';

export type UserProfileServiceErrorCode =
    | 'username-invalid'
    | 'username-taken'
    | 'username-immutable'
    | 'username-missing';

export type UserProfileServiceError = Error & { code: UserProfileServiceErrorCode };

export interface UserIdentitySeed {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoUrl?: string | null;
}

export interface UserProfileFormData {
    username: string;
    displayName: string;
    name: string;
    surnames: string;
    location: string;
    bio: string;
}

export interface UsernameGateStatus {
    requiresCompletion: boolean;
    reason?: 'missing_or_invalid' | 'claim_conflict';
    prefill: UserProfileFormData;
}

export interface PreferencesUpdateData {
    username?: string;
    displayName: string;
    name: string;
    surnames: string;
    location: string;
    bio: string;
    defaultDistanceKm: number;
}

const asString = (value: unknown): string => {
    return typeof value === 'string' ? value.trim() : '';
};

const asObject = (value: unknown): Record<string, unknown> => {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
};

const makeError = (code: UserProfileServiceErrorCode, message: string): UserProfileServiceError => {
    const error = new Error(message) as UserProfileServiceError;
    error.code = code;
    return error;
};

const isPermissionDeniedError = (error: unknown): boolean => {
    const code = (error as { code?: string })?.code;
    return code === 'permission-denied' || code === 'PERMISSION_DENIED';
};

const readSeedBase = (seed: UserIdentitySeed): string => {
    const seedDisplay = asString(seed.displayName);
    const seedEmail = asString(seed.email);
    if (seedDisplay) return seedDisplay;
    if (seedEmail.includes('@')) return seedEmail.split('@')[0];
    return seedEmail;
};

const isUsernameTakenInUsersCollection = async (uid: string, username: string): Promise<boolean> => {
    const trimmedUsername = username.trim();
    const normalized = normalizeUsername(trimmedUsername);
    const usersRef = collection(db, USERS_COLLECTION);

    const byLower = await getDocs(query(usersRef, where('usernameLower', '==', normalized), limit(3)));
    if (byLower.docs.some((snap) => snap.id !== uid)) {
        return true;
    }

    const exact = await getDocs(query(usersRef, where('username', '==', trimmedUsername), limit(3)));
    return exact.docs.some((snap) => snap.id !== uid);
};

const claimUsernameForUser = async (uid: string, username: string): Promise<boolean> => {
    const trimmedUsername = username.trim();
    const normalized = normalizeUsername(trimmedUsername);
    const userRef = doc(db, USERS_COLLECTION, uid);
    const claimRef = doc(db, USERNAME_CLAIMS_COLLECTION, normalized);

    try {
        await runTransaction(db, async (transaction) => {
            const claimSnap = await transaction.get(claimRef);
            if (claimSnap.exists()) {
                const claimOwner = asString(claimSnap.data().uid);
                if (claimOwner && claimOwner !== uid) {
                    throw makeError('username-taken', 'El nombre de usuario ya está en uso.');
                }
            }

            transaction.set(claimRef, {
                uid,
                username: trimmedUsername,
                usernameLower: normalized,
                updatedAt: serverTimestamp(),
                ...(claimSnap.exists() ? {} : { createdAt: serverTimestamp() }),
            }, { merge: true });

            transaction.set(userRef, {
                usernameLower: normalized,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        });
        return true;
    } catch (error) {
        const maybeCode = (error as Partial<UserProfileServiceError>)?.code;
        if (maybeCode === 'username-taken') {
            return false;
        }
        if (isPermissionDeniedError(error)) {
            const taken = await isUsernameTakenInUsersCollection(uid, trimmedUsername);
            return !taken;
        }
        throw error;
    }
};

const isUsernameLocked = (userData: Record<string, unknown>): boolean => {
    return Boolean(userData.usernameLockedAt) && getUsernameValidationError(asString(userData.username)) === null;
};

const buildSetupPayload = (
    existingData: Record<string, unknown>,
    seed: UserIdentitySeed,
    profileData: {
        username: string;
        normalizedUsername: string;
        displayName: string;
        name: string;
        surnames: string;
        location: string;
        bio: string;
    },
): Record<string, unknown> => {
    const emailValue = asString(existingData.email) || asString(seed.email);
    const photoUrl = asString(existingData.photoUrl) || asString(seed.photoUrl);
    const defaultDistanceKm = typeof existingData.defaultDistanceKm === 'number'
        ? existingData.defaultDistanceKm
        : 2;

    return {
        username: profileData.username,
        usernameLower: profileData.normalizedUsername,
        displayName: profileData.displayName,
        name: profileData.name,
        surnames: profileData.surnames,
        location: profileData.location,
        residence: profileData.location,
        bio: profileData.bio,
        email: emailValue,
        emailLowerCase: emailValue ? emailValue.toLowerCase() : '',
        defaultDistanceKm,
        updatedAt: serverTimestamp(),
        ...(photoUrl ? { photoUrl } : {}),
        ...(existingData.createdAt ? {} : { createdAt: serverTimestamp() }),
        ...(existingData.usernameLockedAt ? {} : { usernameLockedAt: serverTimestamp() }),
    };
};

export const isUserProfileServiceError = (error: unknown): error is UserProfileServiceError => {
    if (!error || typeof error !== 'object') return false;
    const maybeCode = (error as Partial<UserProfileServiceError>).code;
    return typeof maybeCode === 'string';
};

export const getUsernameGateStatus = async (seed: UserIdentitySeed): Promise<UsernameGateStatus> => {
    const userRef = doc(db, USERS_COLLECTION, seed.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? asObject(userSnap.data()) : {};

    const currentUsername = asString(userData.username);
    const suggestedUsername = currentUsername || buildUsernameSuggestion(readSeedBase(seed), seed.uid);
    const currentLocation = asString(userData.location) || asString(userData.residence);

    const prefill: UserProfileFormData = {
        username: suggestedUsername,
        displayName: asString(userData.displayName) || currentUsername || suggestedUsername,
        name: asString(userData.name),
        surnames: asString(userData.surnames),
        location: currentLocation,
        bio: asString(userData.bio),
    };

    const formatError = getUsernameValidationError(currentUsername);
    if (formatError) {
        return {
            requiresCompletion: true,
            reason: 'missing_or_invalid',
            prefill,
        };
    }

    const normalizedUsername = normalizeUsername(currentUsername);
    const claimRef = doc(db, USERNAME_CLAIMS_COLLECTION, normalizedUsername);

    try {
        const claimSnap = await getDoc(claimRef);

        if (claimSnap.exists()) {
            const claimOwner = asString(claimSnap.data().uid);
            if (claimOwner && claimOwner !== seed.uid) {
                return {
                    requiresCompletion: true,
                    reason: 'claim_conflict',
                    prefill: {
                        ...prefill,
                        username: buildUsernameSuggestion(readSeedBase(seed), seed.uid),
                    },
                };
            }

            if (asString(userData.usernameLower) !== normalizedUsername) {
                await setDoc(userRef, {
                    usernameLower: normalizedUsername,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }

            return {
                requiresCompletion: false,
                prefill,
            };
        }

        const claimOk = await claimUsernameForUser(seed.uid, currentUsername);
        if (!claimOk) {
            return {
                requiresCompletion: true,
                reason: 'claim_conflict',
                prefill: {
                    ...prefill,
                    username: buildUsernameSuggestion(readSeedBase(seed), seed.uid),
                },
            };
        }

        return {
            requiresCompletion: false,
            prefill,
        };
    } catch (error) {
        if (!isPermissionDeniedError(error)) {
            throw error;
        }

        const taken = await isUsernameTakenInUsersCollection(seed.uid, currentUsername);
        if (taken) {
            return {
                requiresCompletion: true,
                reason: 'claim_conflict',
                prefill: {
                    ...prefill,
                    username: buildUsernameSuggestion(readSeedBase(seed), seed.uid),
                },
            };
        }

        if (asString(userData.usernameLower) !== normalizedUsername) {
            await setDoc(userRef, {
                usernameLower: normalizedUsername,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        }

        return {
            requiresCompletion: false,
            prefill,
        };
    }
};

export const completeUserProfileSetup = async (
    seed: UserIdentitySeed,
    formData: UserProfileFormData,
): Promise<{ username: string; displayName: string }> => {
    const username = formData.username.trim();
    const usernameError = getUsernameValidationError(username);
    if (usernameError) {
        throw makeError('username-invalid', usernameError);
    }

    const normalizedUsername = normalizeUsername(username);
    const displayName = formData.displayName.trim() || username;
    const name = formData.name.trim();
    const surnames = formData.surnames.trim();
    const location = formData.location.trim();
    const bio = formData.bio.trim();

    const profileData = {
        username,
        normalizedUsername,
        displayName,
        name,
        surnames,
        location,
        bio,
    };

    const userRef = doc(db, USERS_COLLECTION, seed.uid);
    const claimRef = doc(db, USERNAME_CLAIMS_COLLECTION, normalizedUsername);

    const validateImmutability = (existingData: Record<string, unknown>) => {
        const existingUsername = asString(existingData.username);
        if (
            isUsernameLocked(existingData) &&
            getUsernameValidationError(existingUsername) === null &&
            normalizeUsername(existingUsername) !== normalizedUsername
        ) {
            throw makeError('username-immutable', 'El nombre de usuario no se puede cambiar una vez bloqueado.');
        }
    };

    try {
        await runTransaction(db, async (transaction) => {
            const [userSnap, claimSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(claimRef),
            ]);

            const existingData = userSnap.exists() ? asObject(userSnap.data()) : {};
            validateImmutability(existingData);

            if (claimSnap.exists()) {
                const claimOwner = asString(claimSnap.data().uid);
                if (claimOwner && claimOwner !== seed.uid) {
                    throw makeError('username-taken', 'El nombre de usuario ya está en uso.');
                }
            }

            transaction.set(userRef, buildSetupPayload(existingData, seed, profileData), { merge: true });
            transaction.set(claimRef, {
                uid: seed.uid,
                username,
                usernameLower: normalizedUsername,
                updatedAt: serverTimestamp(),
                ...(claimSnap.exists() ? {} : { createdAt: serverTimestamp() }),
            }, { merge: true });
        });
    } catch (error) {
        if (!isPermissionDeniedError(error)) {
            throw error;
        }

        const userSnap = await getDoc(userRef);
        const existingData = userSnap.exists() ? asObject(userSnap.data()) : {};
        validateImmutability(existingData);

        const taken = await isUsernameTakenInUsersCollection(seed.uid, username);
        if (taken) {
            throw makeError('username-taken', 'El nombre de usuario ya está en uso.');
        }

        await setDoc(userRef, buildSetupPayload(existingData, seed, profileData), { merge: true });
    }

    return { username, displayName };
};

export const updateUserProfilePreferences = async (
    seed: UserIdentitySeed,
    data: PreferencesUpdateData,
): Promise<{ username: string; displayName: string }> => {
    const userRef = doc(db, USERS_COLLECTION, seed.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? asObject(userSnap.data()) : {};
    const currentUsername = asString(userData.username);
    const currentUsernameError = getUsernameValidationError(currentUsername);
    const requestedUsername = asString(data.username);
    let username = currentUsername;

    if (currentUsernameError) {
        const candidateUsername = requestedUsername || currentUsername;
        const candidateUsernameError = getUsernameValidationError(candidateUsername);
        if (candidateUsernameError) {
            if (!requestedUsername) {
                throw makeError('username-missing', 'Debes definir un username valido para guardar el perfil.');
            }
            throw makeError('username-invalid', candidateUsernameError);
        }
        username = candidateUsername;
    } else if (
        requestedUsername &&
        normalizeUsername(requestedUsername) !== normalizeUsername(currentUsername)
    ) {
        throw makeError('username-immutable', 'El nombre de usuario no se puede cambiar una vez bloqueado.');
    }

    const claimOk = await claimUsernameForUser(seed.uid, username);
    if (!claimOk) {
        throw makeError('username-taken', 'Tu username actual entra en conflicto con otro usuario.');
    }

    const normalizedUsername = normalizeUsername(username);
    const displayName = data.displayName.trim() || username;
    const name = data.name.trim();
    const surnames = data.surnames.trim();
    const location = data.location.trim();
    const bio = data.bio.trim();

    await setDoc(userRef, {
        username,
        usernameLower: normalizedUsername,
        displayName,
        name,
        surnames,
        location,
        residence: location,
        bio,
        defaultDistanceKm: data.defaultDistanceKm,
        updatedAt: serverTimestamp(),
        ...(!userData.usernameLockedAt ? { usernameLockedAt: serverTimestamp() } : {}),
    }, { merge: true });

    return { username, displayName };
};
