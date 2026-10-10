import React from 'react';
import { FAMILY_OPTIONS, INFO_LIMITS } from '../../../constants/businessInfoOptions';
import type { BusinessFamilyInfo } from '../../../types/businessInfo';
import { TextAreaField, TileGrid } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FlagTiles, FormStack } from './formParts';
import { countFlags } from './fichaModel';

/** 👨‍👩‍👧 Familias: baldosas para ir con bebés o peques. */
export const FamilyForm: React.FC<SectionFormProps<'family'>> = ({ doc, onChange }) => (
    <FormStack>
        <TileGrid
            legend={<EmojiText emoji="🧸">¿Qué tenéis para las familias?</EmojiText>}
            right={`${countFlags(FAMILY_OPTIONS, doc.data)} de ${FAMILY_OPTIONS.length}`}
            cols={4}
        >
            <FlagTiles
                options={FAMILY_OPTIONS}
                data={doc.data}
                onToggle={(key, next) => onChange({ [key]: next } as Partial<BusinessFamilyInfo>)}
            />
        </TileGrid>

        <TextAreaField
            label={<EmojiText emoji="📝">Notas</EmojiText>}
            value={doc.data.notes || ''}
            onChange={(notes) => onChange({ notes })}
            max={INFO_LIMITS.notes}
            rows={3}
            placeholder="Menú infantil los fines de semana, horario más tranquilo para ir con carrito…"
        />
    </FormStack>
);
