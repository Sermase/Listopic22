import {
    collection,
    doc,
    getDoc,
    getDocFromServer,
    getDocs,
    limit,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    where,
    writeBatch,
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
    mapLayerPreference?: string;
    notificationPreferences?: Record<string, boolean>;
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
    let userSnap;
    let userDataFromServer = true;
    try {
        userSnap = await getDocFromServer(userRef);
    } catch {
        userSnap = await getDoc(userRef);
        userDataFromServer = false;
    }

    const userData = userSnap.exists() ? asObject(userSnap.data()) : {};
    const currentLocation = asString(userData.location) || asString(userData.residence);

    let effectiveUsername = asString(userData.username);
    let formatError = getUsernameValidationError(effectiveUsername);

    // Defensive recovery: if username is missing but usernameLower still exists, restore from claim doc.
    if (formatError && !effectiveUsername) {
        const storedUsernameLower = asString(userData.usernameLower);
        if (storedUsernameLower) {
            try {
                const claimSnap = await getDoc(doc(db, USERNAME_CLAIMS_COLLECTION, storedUsernameLower));
                if (claimSnap.exists()) {
                    const claimData = asObject(claimSnap.data());
                    const claimOwner = asString(claimData.uid);
                    const claimUsername = asString(claimData.username);
                    const claimUsernameError = getUsernameValidationError(claimUsername);
                    if (claimOwner === seed.uid && !claimUsernameError) {
                        effectiveUsername = claimUsername;
                        formatError = null;
                        await setDoc(userRef, {
                            username: claimUsername,
                            usernameLower: normalizeUsername(claimUsername),
                            displayName: asString(userData.displayName) || claimUsername,
                            updatedAt: serverTimestamp(),
                            ...(!userData.usernameLockedAt ? { usernameLockedAt: serverTimestamp() } : {}),
                        }, { merge: true });
                    }
                }
            } catch {
                // Ignore recovery failures and continue with normal gate flow.
            }
        }
    }

    const suggestedUsername = effectiveUsername || buildUsernameSuggestion(readSeedBase(seed), seed.uid);
    const prefill: UserProfileFormData = {
        username: suggestedUsername,
        displayName: asString(userData.displayName) || effectiveUsername || suggestedUsername,
        name: asString(userData.name),
        surnames: asString(userData.surnames),
        location: currentLocation,
        bio: asString(userData.bio),
    };

    if (formatError) {
        // If we could not validate against server data, avoid opening the gate to prevent false positives.
        if (!userDataFromServer) {
            return {
                requiresCompletion: false,
                prefill,
            };
        }
        return {
            requiresCompletion: true,
            reason: 'missing_or_invalid',
            prefill,
        };
    }

    const normalizedUsername = normalizeUsername(effectiveUsername);
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

        const claimOk = await claimUsernameForUser(seed.uid, effectiveUsername);
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

        const taken = await isUsernameTakenInUsersCollection(seed.uid, effectiveUsername);
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
        ...(data.mapLayerPreference ? { mapLayerPreference: data.mapLayerPreference } : {}),
        ...(data.notificationPreferences !== undefined ? { notificationPreferences: data.notificationPreferences } : {}),
        updatedAt: serverTimestamp(),
        ...(!userData.usernameLockedAt ? { usernameLockedAt: serverTimestamp() } : {}),
    }, { merge: true });

    // Fire-and-forget: propagate name changes to existing reviews
    propagateAuthorFieldsToReviews(seed.uid, { authorName: username });

    return { username, displayName };
};

/**
 * Propagates author fields to all reviews written by a user.
 * Only updates the fields you pass (undefined fields are skipped).
 */
export const propagateAuthorFieldsToReviews = async (
    uid: string,
    fields: { authorName?: string; authorPhoto?: string; authorUserType?: string | string[] },
): Promise<void> => {
    const listsSnap = await getDocs(collection(db, 'lists'));
    const BATCH_LIMIT = 500;
    let batch = writeBatch(db);
    let count = 0;

    for (const listDoc of listsSnap.docs) {
        const reviewsSnap = await getDocs(
            query(collection(db, 'lists', listDoc.id, 'reviews'), where('userId', '==', uid))
        );
        for (const reviewDoc of reviewsSnap.docs) {
            batch.update(reviewDoc.ref, fields);
            count++;
            if (count === BATCH_LIMIT) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();
};
