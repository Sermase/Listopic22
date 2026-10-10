import React from 'react';
import {
    INFO_LIMITS,
    PET_AMENITY_OPTIONS,
    PET_CONDITION_OPTIONS,
    PET_POLICIES_WITH_AMENITIES,
    PET_POLICY_OPTIONS,
} from '../../../constants/businessInfoOptions';
import type { BusinessPetsInfo, PetPolicy } from '../../../types/businessInfo';
import { ChipGroup, ChoiceCards, TextAreaField, TileGrid, type ChipOption, type ChoiceOption } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FlagTiles, FormStack } from './formParts';
import { petPolicyPatch, showsPetAmenities } from './fichaModel';

const POLICY_CHOICES: Array<ChoiceOption<PetPolicy>> = PET_POLICY_OPTIONS.map((option) => ({
    value: option.value,
    emoji: option.emoji,
    title: option.short || option.label,
}));

// «Solo con correa» ya lo cubre la baldosa de correa: si está guardado, sale en «Otras».
const CONDITION_CHIPS: ChipOption[] = PET_CONDITION_OPTIONS
    .filter((option) => !option.legacy)
    .map(({ value, label, emoji }) => ({ value, label, emoji }));

/** 🐾 Mascotas, paso a paso: política → qué les ofrecéis → condiciones → notas. */
export const PetsForm: React.FC<SectionFormProps<'pets'>> = ({ doc, onChange }) => {
    const policy: PetPolicy = doc.data.petPolicy || 'unknown';
    const welcomes = PET_POLICIES_WITH_AMENITIES.includes(policy);
    const showAmenities = showsPetAmenities(doc.data);

    return (
        <FormStack>
            <ChoiceCards
                legend={<><span aria-hidden="true">① </span>¿Se puede venir con mascota?</>}
                options={POLICY_CHOICES}
                value={policy}
                columns={3}
                onChange={(next) => onChange(petPolicyPatch(next, doc.data))}
            />

            {showAmenities && (
                <TileGrid
                    legend={<><span aria-hidden="true">② </span>¿Qué les ofrecéis?</>}
                    help={welcomes ? undefined : 'Lo tenías marcado. Elige arriba si se admiten mascotas.'}
                    cols={3}
                >
                    <FlagTiles
                        options={PET_AMENITY_OPTIONS}
                        data={doc.data}
                        hidden={policy === 'terrace_only' ? ['indoorAllowed'] : undefined}
                        onToggle={(key, next) => onChange({ [key]: next } as Partial<BusinessPetsInfo>)}
                    />
                </TileGrid>
            )}

            <ChipGroup
                legend={<><span aria-hidden="true">{showAmenities ? '③ ' : '② '}</span>Condiciones</>}
                help="Lo que conviene saber antes de venir."
                options={CONDITION_CHIPS}
                value={doc.data.restrictions || []}
                onChange={(restrictions) => onChange({ restrictions })}
                max={INFO_LIMITS.petRestrictions}
                allowOther
                otherPlaceholder="Otra condición"
                otherMaxLength={80}
                customTitle="Otras condiciones guardadas"
            />

            <TextAreaField
                label={<EmojiText emoji="📝">Notas visibles</EmojiText>}
                value={doc.data.notes || ''}
                onChange={(notes) => onChange({ notes })}
                max={INFO_LIMITS.longNotes}
                rows={3}
                placeholder="Mejor reservar terraza, avisa si vienes con perro…"
            />
        </FormStack>
    );
};
