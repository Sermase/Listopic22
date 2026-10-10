import React, { useState } from 'react';
import { Switch, TextField } from '../kit';
import type { SectionFormProps } from './formTypes';
import { EmojiText, FormStack } from './formParts';
import { cleanInstagram, isLikelyUrl, isValidEmail, withProtocol } from './fichaModel';

type ContactFormProps = SectionFormProps<'contact'> & {
    onHiddenChange: (field: string, hidden: boolean) => void;
};

/** Si el campo está vacío: «No mostrar el de Google»; si no: «Se mostrará el tuyo». */
const GoogleFallback: React.FC<{
    filled: boolean;
    hidden: boolean;
    /** «No se verá ningún teléfono en tu ficha.» */
    hiddenText: string;
    onHiddenChange: (hidden: boolean) => void;
}> = ({ filled, hidden, hiddenText, onHiddenChange }) => {
    if (filled) return null;
    return (
        <Switch
            checked={hidden}
            onChange={onHiddenChange}
            label={<EmojiText emoji="🙈">No mostrar el de Google</EmojiText>}
            description={hidden ? hiddenText : 'Si lo dejas vacío, se verá el de Google.'}
        />
    );
};

/** 📞 Contacto: «Cómo te encuentran». */
export const ContactForm: React.FC<ContactFormProps> = ({ doc, onChange, onHiddenChange, ctx }) => {
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const touch = (field: string) => setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
    const phone = doc.data.phone || '';
    const website = doc.data.website || '';
    const email = doc.data.email || '';
    const instagram = doc.data.instagram || '';
    const hidden = new Set(doc.hiddenFields || []);

    const ownHint = (value: string, google?: string) => {
        if (value.trim()) return '✅ Se mostrará el tuyo.';
        return google ? `Google muestra: ${google}` : undefined;
    };

    const emailError = touched.email && email.trim() && !isValidEmail(email) ? '✋ Este email no parece válido' : undefined;
    const websiteError = touched.website && website.trim() && !isLikelyUrl(website) ? '✋ Esta web no parece válida (p. ej. mibar.es)' : undefined;

    return (
        <FormStack>
            <div className="space-y-3">
                <TextField
                    label={<EmojiText emoji="📞">Teléfono</EmojiText>}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(next) => onChange({ phone: next })}
                    max={40}
                    placeholder={ctx?.googlePhone || '963 12 34 56'}
                    hint={ownHint(phone, ctx?.googlePhone)}
                />
                <GoogleFallback
                    filled={Boolean(phone.trim())}
                    hidden={hidden.has('phone')}
                    hiddenText="No se verá ningún teléfono en tu ficha."
                    onHiddenChange={(value) => onHiddenChange('phone', value)}
                />
            </div>

            <div className="space-y-3">
                <TextField
                    label={<EmojiText emoji="🌐">Web</EmojiText>}
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    value={website}
                    onChange={(next) => onChange({ website: next })}
                    onBlur={() => {
                        touch('website');
                        const fixed = withProtocol(website);
                        if (fixed !== website) onChange({ website: fixed });
                    }}
                    max={400}
                    placeholder={ctx?.googleWebsite || 'https://mibar.es'}
                    hint={ownHint(website, ctx?.googleWebsite)}
                    error={websiteError}
                />
                <GoogleFallback
                    filled={Boolean(website.trim())}
                    hidden={hidden.has('website')}
                    hiddenText="No se verá ninguna web en tu ficha."
                    onHiddenChange={(value) => onHiddenChange('website', value)}
                />
            </div>

            <TextField
                label={<EmojiText emoji="✉️">Email</EmojiText>}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(next) => onChange({ email: next })}
                onBlur={() => touch('email')}
                max={180}
                placeholder="hola@mibar.es"
                error={emailError}
            />

            <TextField
                label={<EmojiText emoji="📸">Instagram</EmojiText>}
                prefix="@"
                value={instagram}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(next) => onChange({ instagram: next.replace(/^@+/, '') })}
                onBlur={() => {
                    const cleaned = cleanInstagram(instagram);
                    if (cleaned !== instagram) onChange({ instagram: cleaned });
                }}
                placeholder="tubar"
                hint="Solo tu usuario: letras, números, puntos y guiones bajos. Si pegas el enlace, lo recortamos."
            />
        </FormStack>
    );
};
