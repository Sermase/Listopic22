import React from 'react';
import {
    ALLERGEN_INFO_OPTIONS,
    ALLERGEN_OPTIONS,
    CROSS_CONTAMINATION_OPTIONS,
    DIET_OPTIONS,
    GLUTEN_OPTIONS,
    INFO_LIMITS,
} from '../../../constants/businessInfoOptions';
import type { BusinessDietaryInfo, CrossContaminationRisk } from '../../../types/businessInfo';
import { ChipGroup, ChoiceCards, TextAreaField, TextField, TileGrid, type ChoiceOption } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FlagTiles, FormStack, GoLink } from './formParts';

const RISK_CHOICES: Array<ChoiceOption<CrossContaminationRisk>> = CROSS_CONTAMINATION_OPTIONS.map((option) => ({
    value: option.value,
    emoji: option.emoji,
    title: option.short || option.label,
    tone: option.tone,
}));

const ALLERGEN_CHIPS = ALLERGEN_OPTIONS.map(({ value, label, emoji }) => ({ value, label, emoji }));

/** Escalera sin gluten: «Muchos platos» implica «Algunas opciones», y al revés al quitar. */
const glutenPatch = (key: keyof BusinessDietaryInfo, next: boolean): Partial<BusinessDietaryInfo> => {
    if (key === 'manyGlutenFreeOptions' && next) return { manyGlutenFreeOptions: true, glutenFreeOptions: true };
    if (key === 'glutenFreeOptions' && !next) return { glutenFreeOptions: false, manyGlutenFreeOptions: false };
    return { [key]: next } as Partial<BusinessDietaryInfo>;
};

/** 🥗 Alérgenos y dietas. */
export const DietaryForm: React.FC<SectionFormProps<'dietary'>> = ({ doc, onChange, ctx }) => (
    <FormStack>
        <div className="space-y-5">
            <TileGrid legend={<EmojiText emoji="🌾">Sin gluten / celíacos</EmojiText>} cols={3}>
                <FlagTiles options={GLUTEN_OPTIONS} data={doc.data} onToggle={(key, next) => onChange(glutenPatch(key, next))} />
            </TileGrid>

            <ChoiceCards
                legend="¿Riesgo de contaminación cruzada?"
                options={RISK_CHOICES}
                value={doc.data.crossContaminationRisk || 'unknown'}
                columns={2}
                onChange={(crossContaminationRisk) => onChange({ crossContaminationRisk })}
            />

            <TextField
                label="Notas sobre contaminación cruzada"
                value={doc.data.crossContaminationNotes || ''}
                onChange={(crossContaminationNotes) => onChange({ crossContaminationNotes })}
                max={INFO_LIMITS.crossContaminationNotes}
                placeholder="Freidora separada, cocina no certificada…"
            />
        </div>

        <TileGrid legend={<EmojiText emoji="🥦">Dietas</EmojiText>} cols={3}>
            <FlagTiles options={DIET_OPTIONS} data={doc.data} onToggle={(key, next) => onChange({ [key]: next } as Partial<BusinessDietaryInfo>)} />
        </TileGrid>

        <TileGrid legend={<EmojiText emoji="📋">Información de alérgenos</EmojiText>} cols={2}>
            <FlagTiles options={ALLERGEN_INFO_OPTIONS} data={doc.data} onToggle={(key, next) => onChange({ [key]: next } as Partial<BusinessDietaryInfo>)} />
        </TileGrid>

        <div className="space-y-2">
            <ChipGroup
                legend={<EmojiText emoji="⚠️">¿Qué alérgenos se manejan en cocina?</EmojiText>}
                help="Aunque no estén en todos los platos. Se verá en tu ficha."
                options={ALLERGEN_CHIPS}
                value={doc.data.allergens || []}
                onChange={(allergens) => onChange({ allergens })}
                max={INFO_LIMITS.allergens}
                customTitle="Otros guardados"
            />
            <GoLink onClick={ctx?.goToCarta}>
                <EmojiText emoji="🍽️">Los alérgenos de cada plato se marcan en</EmojiText> <EmojiText emoji="📖">Carta →</EmojiText>
            </GoLink>
        </div>

        <TextAreaField
            label={<EmojiText emoji="📝">Notas</EmojiText>}
            value={doc.data.notes || ''}
            onChange={(notes) => onChange({ notes })}
            max={INFO_LIMITS.longNotes}
            rows={3}
            placeholder="Consultad siempre al personal, cocina compartida, opciones bajo reserva…"
        />
    </FormStack>
);
