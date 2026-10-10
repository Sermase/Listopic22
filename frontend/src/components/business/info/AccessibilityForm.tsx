import React from 'react';
import { ACCESSIBILITY_GROUPS, INFO_LIMITS } from '../../../constants/businessInfoOptions';
import type { BusinessAccessibilityInfo } from '../../../types/businessInfo';
import { Disclosure, TextAreaField, TileGrid } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FlagTiles, FormStack } from './formParts';
import { countFlags } from './fichaModel';

/** ♿ Accesibilidad: 4 bloques plegables con baldosas. */
export const AccessibilityForm: React.FC<SectionFormProps<'accessibility'>> = ({ doc, onChange }) => (
    <FormStack>
        <div className="space-y-2">
            {ACCESSIBILITY_GROUPS.map((group) => (
                <Disclosure
                    key={group.id}
                    emoji={group.emoji}
                    title={group.title}
                    help={group.help}
                    progress={{ done: countFlags(group.options, doc.data), total: group.options.length }}
                    defaultOpen={group.id === 'mobility'}
                    storageKey={`listopic_ficha_a11y_${group.id}`}
                >
                    <TileGrid legend={group.title} hideLegend cols={4} className="pt-1">
                        <FlagTiles
                            options={group.options}
                            data={doc.data}
                            onToggle={(key, next) => onChange({ [key]: next } as Partial<BusinessAccessibilityInfo>)}
                        />
                    </TileGrid>
                </Disclosure>
            ))}
        </div>

        <TextAreaField
            label={<EmojiText emoji="📝">Notas</EmojiText>}
            value={doc.data.notes || ''}
            onChange={(notes) => onChange({ notes })}
            max={INFO_LIMITS.notes}
            rows={3}
            placeholder="Cualquier matiz que no encaje arriba: un escalón pequeño en la puerta, el baño en otra planta…"
        />
    </FormStack>
);
