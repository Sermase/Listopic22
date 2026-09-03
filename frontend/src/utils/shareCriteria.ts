import type { ShareCriteriaStat } from '../types/share';

type CriteriaDefinitionItem = {
    id?: string;
    label?: string;
    ponderable?: boolean;
    isPonderable?: boolean;
};
type CriteriaDefinitionRecord = Record<string, CriteriaDefinitionItem>;
type CriteriaDefinitionArray = CriteriaDefinitionItem[];
type CriteriaDefinition = CriteriaDefinitionRecord | CriteriaDefinitionArray | null | undefined;

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

const getLabel = (definition: CriteriaDefinition, key: string) => {
    if (Array.isArray(definition)) {
        const match = definition.find((item) => item?.id === key);
        return match?.label || key;
    }

    if (definition && typeof definition === 'object') {
        return definition[key]?.label || key;
    }

    return key;
};

const getDefinitionItem = (definition: CriteriaDefinition, key: string): CriteriaDefinitionItem | undefined => {
    if (Array.isArray(definition)) {
        return definition.find((item) => item?.id === key);
    }
    return definition && typeof definition === 'object' ? definition[key] : undefined;
};

const isPonderableCriterion = (definition: CriteriaDefinition, key: string) => {
    const item = getDefinitionItem(definition, key);
    return item ? item.ponderable !== false && item.isPonderable !== false : true;
};

export const buildCriteriaStats = (
    scores?: Record<string, number>,
    definition?: CriteriaDefinition,
    limit = 6,
): ShareCriteriaStat[] => {
    if (!scores) return [];

    const entries = Object.entries(scores)
        .map(([key, score]) => ({
            key,
            label: getLabel(definition, key),
            score: Number(score),
        }))
        .filter((entry) => Number.isFinite(entry.score));

    if (entries.length === 0) return [];

    const keySet = new Set(entries.map((entry) => entry.key));
    const orderedKeys: string[] = [];

    if (Array.isArray(definition)) {
        definition.forEach((item) => {
            if (item?.id && keySet.has(item.id)) {
                orderedKeys.push(item.id);
            }
        });
    } else if (definition && typeof definition === 'object') {
        orderedKeys.push(
            ...Object.keys(definition)
                .filter((key) => keySet.has(key))
                .sort((left, right) => collator.compare(getLabel(definition, left), getLabel(definition, right))),
        );
    }

    const used = new Set(orderedKeys);
    const remaining = entries
        .map((entry) => entry.key)
        .filter((key) => !used.has(key))
        .sort((left, right) => collator.compare(getLabel(definition, left), getLabel(definition, right)));

    return [...orderedKeys, ...remaining]
        .map((key) => {
            const match = entries.find((entry) => entry.key === key);
            return match ? { ...match, score: Math.max(0, Math.min(10, match.score)) } : null;
        })
        .filter((entry): entry is ShareCriteriaStat => Boolean(entry))
        .slice(0, limit);
};

export const buildShareCriteriaGroups = (
    scores?: Record<string, number>,
    definition?: CriteriaDefinition,
    limitPerGroup = 6,
): { ponderable: ShareCriteriaStat[]; nonPonderable: ShareCriteriaStat[] } => {
    const all = buildCriteriaStats(scores, definition, Number.MAX_SAFE_INTEGER);
    return {
        ponderable: all
            .filter((entry) => isPonderableCriterion(definition, entry.key))
            .slice(0, limitPerGroup),
        nonPonderable: all
            .filter((entry) => !isPonderableCriterion(definition, entry.key))
            .slice(0, limitPerGroup),
    };
};
