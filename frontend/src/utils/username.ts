export const USERNAME_MAX_LENGTH = 18;

export const normalizeUsername = (username: string): string => {
    return username.trim().toLowerCase();
};

export const getUsernameValidationError = (username: string): string | null => {
    const trimmed = username.trim();
    if (!trimmed) {
        return 'El nombre de usuario es obligatorio.';
    }
    if (trimmed.length > USERNAME_MAX_LENGTH) {
        return `El nombre de usuario no puede superar ${USERNAME_MAX_LENGTH} caracteres.`;
    }
    if (/\s/.test(trimmed)) {
        return 'El nombre de usuario no puede contener espacios.';
    }
    return null;
};

export const isUsernameValid = (username: string): boolean => {
    return getUsernameValidationError(username) === null;
};

const removeAccents = (value: string): string => {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

export const buildUsernameSuggestion = (base: string, uid: string): string => {
    const fromBase = removeAccents(base || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, USERNAME_MAX_LENGTH);

    if (fromBase) {
        return fromBase;
    }

    return `user${uid.slice(0, 6).toLowerCase()}`.slice(0, USERNAME_MAX_LENGTH);
};
