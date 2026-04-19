import { describe, it, expect, vi } from 'vitest';

// Mock ../firebase so that loading UserProfileService does not actually call
// initializeApp / getAuth / getFirestore during tests. The pure helpers tested
// here never touch `db`, so an empty stub is enough.
vi.mock('../firebase', () => ({
    db: {},
    auth: {},
    storage: {},
    functions: {},
    default: {},
}));

import {
    isUserProfileServiceError,
    getUsernameGateStatus,
    completeUserProfileSetup,
    updateUserProfilePreferences,
    propagateAuthorFieldsToReviews,
} from './UserProfileService';

describe('UserProfileService module', () => {
    it('exports the expected public surface', () => {
        expect(typeof isUserProfileServiceError).toBe('function');
        expect(typeof getUsernameGateStatus).toBe('function');
        expect(typeof completeUserProfileSetup).toBe('function');
        expect(typeof updateUserProfilePreferences).toBe('function');
        expect(typeof propagateAuthorFieldsToReviews).toBe('function');
    });
});

describe('isUserProfileServiceError', () => {
    it('returns false for non-object values', () => {
        expect(isUserProfileServiceError(null)).toBe(false);
        expect(isUserProfileServiceError(undefined)).toBe(false);
        expect(isUserProfileServiceError('boom')).toBe(false);
        expect(isUserProfileServiceError(42)).toBe(false);
    });

    it('returns false for plain errors without a string code', () => {
        expect(isUserProfileServiceError(new Error('plain'))).toBe(false);
        expect(isUserProfileServiceError({ code: 123 })).toBe(false);
    });

    it('returns true for errors carrying a string `code`', () => {
        const err = Object.assign(new Error('nope'), { code: 'username-taken' });
        expect(isUserProfileServiceError(err)).toBe(true);
        // Any string code satisfies the type guard by design.
        expect(isUserProfileServiceError({ code: 'something-else' })).toBe(true);
    });
});

// NOTE: getUsernameGateStatus, completeUserProfileSetup, updateUserProfilePreferences
// and propagateAuthorFieldsToReviews all drive Firestore (getDoc, runTransaction,
// setDoc, writeBatch, etc.) and have no pure-logic seams exposed. Testing them
// meaningfully requires a Firestore mock layer, which is out of scope for this
// first-pass bootstrapping of Vitest.
