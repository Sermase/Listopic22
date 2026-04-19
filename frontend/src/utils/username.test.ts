import { describe, it, expect } from 'vitest';
import {
    USERNAME_MAX_LENGTH,
    buildUsernameSuggestion,
    getUsernameValidationError,
    isUsernameValid,
    normalizeUsername,
} from './username';

describe('normalizeUsername', () => {
    it('trims whitespace and lowercases the value', () => {
        expect(normalizeUsername('   SergioM   ')).toBe('sergiom');
    });

    it('returns an empty string when given only whitespace', () => {
        expect(normalizeUsername('   ')).toBe('');
    });
});

describe('getUsernameValidationError', () => {
    it('flags empty usernames as required', () => {
        expect(getUsernameValidationError('   ')).toBe('El nombre de usuario es obligatorio.');
    });

    it('flags usernames longer than the max length', () => {
        const tooLong = 'a'.repeat(USERNAME_MAX_LENGTH + 1);
        expect(getUsernameValidationError(tooLong)).toBe(
            `El nombre de usuario no puede superar ${USERNAME_MAX_LENGTH} caracteres.`,
        );
    });

    it('flags usernames containing internal whitespace', () => {
        expect(getUsernameValidationError('sergio marser')).toBe(
            'El nombre de usuario no puede contener espacios.',
        );
    });

    it('returns null for a valid username', () => {
        expect(getUsernameValidationError('sergio.m_1')).toBeNull();
    });
});

describe('isUsernameValid', () => {
    it('returns true for a valid username and false for invalid ones', () => {
        expect(isUsernameValid('sergio')).toBe(true);
        expect(isUsernameValid('')).toBe(false);
        expect(isUsernameValid('with space')).toBe(false);
    });
});

describe('buildUsernameSuggestion', () => {
    it('removes accents, spaces, uppercase letters and forbidden symbols', () => {
        expect(buildUsernameSuggestion('Sérgio Mártir!', 'uid123456')).toBe('sergiomartir');
    });

    it('truncates the suggestion to USERNAME_MAX_LENGTH characters', () => {
        const base = 'a'.repeat(USERNAME_MAX_LENGTH + 10);
        const suggestion = buildUsernameSuggestion(base, 'uid123456');
        expect(suggestion.length).toBe(USERNAME_MAX_LENGTH);
    });

    it('falls back to a user<uid> suggestion when the base collapses to empty', () => {
        expect(buildUsernameSuggestion('!!!***', 'ABCDEF1234')).toBe('userabcdef');
    });
});
