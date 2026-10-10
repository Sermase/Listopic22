/**
 * Modales pequeños del tablero de la carta:
 *
 *   <MoveToModal item={moving} sections={names} onMove={(item, group) => …} onClose={…} />
 *   <DeleteSectionModal section="Postres" count={5} sections={names} onConfirm={(target) => …} onClose={…} />
 *   <SectionEditModal section="Postres" mode="rename" sections={names} onSubmit={(old, next) => …} onClose={…} />
 *
 * «📂 Mover a…» es la alternativa a arrastrar. Eliminar una sección con platos
 * pregunta qué hacer con ellos. Renombrar y cambiar el emoji guardan el nombre
 * nuevo de la sección (el emoji va delante del nombre).
 */
import React, { useState } from 'react';
import { Button, Modal } from '../../ui';
import type { CanonicalPlaceItem } from '../../../services/CanonicalItemService';
import { cn } from '../../../lib/utils';
import { ChoiceCards, kit, TextField, type ChoiceOption } from '../kit';
import { itemGroupOf, itemNameOf, UNSECTIONED } from './menuModel';
import {
    buildSectionName,
    cleanSectionName,
    MAX_SECTION_NAME,
    SECTION_EMOJI_CHOICES,
    sectionEmoji,
    sectionLabel,
    sectionNameTaken,
    splitSectionName,
} from './menuVisuals';

const sectionOption = (name: string): ChoiceOption<string> => ({ value: name, title: sectionLabel(name), emoji: sectionEmoji(name) });

// ── 📂 Mover a… ─────────────────────────────────────────────────────────────

export const MoveToModal: React.FC<{
    item: CanonicalPlaceItem | null;
    sections: string[];
    onMove: (item: CanonicalPlaceItem, group: string) => void;
    onClose: () => void;
}> = ({ item, sections, onMove, onClose }) => {
    if (!item) return null;
    return <MoveToBody key={item.id} item={item} sections={sections} onMove={onMove} onClose={onClose} />;
};

const MoveToBody: React.FC<{
    item: CanonicalPlaceItem;
    sections: string[];
    onMove: (item: CanonicalPlaceItem, group: string) => void;
    onClose: () => void;
}> = ({ item, sections, onMove, onClose }) => {
    const current = sections.includes(itemGroupOf(item)) ? itemGroupOf(item) : UNSECTIONED;
    const [target, setTarget] = useState(current);
    const options = [...sections.map(sectionOption), { value: UNSECTIONED, title: 'Sin sección', emoji: '📦' }];
    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="text-base font-black">📂 Mover «{itemNameOf(item)}» a…</span>}
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} className="min-h-11">Cancelar</Button>
                    <Button
                        disabled={target === current}
                        onClick={() => {
                            onMove(item, target === UNSECTIONED ? '' : target);
                            onClose();
                        }}
                        className="min-h-11"
                    >
                        Mover
                    </Button>
                </div>
            )}
        >
            <ChoiceCards legend="Sección" hideLegend variant="compact" options={options} value={target} onChange={setTarget} />
        </Modal>
    );
};

// ── 🗑️ Eliminar sección con platos ──────────────────────────────────────────

export type DeleteSectionTarget = { mode: 'unsection' } | { mode: 'move'; to: string };

export const DeleteSectionModal: React.FC<{
    section: string | null;
    count: number;
    sections: string[];
    onConfirm: (target: DeleteSectionTarget) => void;
    onClose: () => void;
}> = ({ section, ...rest }) => {
    if (!section) return null;
    return <DeleteSectionBody key={section} section={section} {...rest} />;
};

const DeleteSectionBody: React.FC<{
    section: string;
    count: number;
    sections: string[];
    onConfirm: (target: DeleteSectionTarget) => void;
    onClose: () => void;
}> = ({ section, count, sections, onConfirm, onClose }) => {
    const others = sections.filter((entry) => entry !== section);
    const [mode, setMode] = useState<'unsection' | 'move'>('unsection');
    const [to, setTo] = useState(others[0] ?? '');
    const label = sectionLabel(section);
    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="text-base font-black">🗑️ «{label}» tiene {count} {count === 1 ? 'plato' : 'platos'}. ¿Qué hacemos con {count === 1 ? 'él' : 'ellos'}?</span>}
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} className="min-h-11">Cancelar</Button>
                    <Button
                        variant="danger"
                        disabled={mode === 'move' && !to}
                        onClick={() => {
                            onConfirm(mode === 'move' ? { mode: 'move', to } : { mode: 'unsection' });
                            onClose();
                        }}
                        className="min-h-11"
                    >
                        🗑️ Eliminar sección
                    </Button>
                </div>
            )}
        >
            <div className="space-y-4">
                <ChoiceCards
                    legend="Sus platos"
                    hideLegend
                    columns={2}
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: 'unsection', emoji: '📦', title: 'Dejarlos sin sección', subtitle: 'Siguen en tu carta, en «Otros».' },
                        { value: 'move', emoji: '➡️', title: 'Moverlos a…', subtitle: others.length ? 'Elige a qué sección van.' : 'No tienes otra sección.', disabled: others.length === 0 },
                    ]}
                />
                {mode === 'move' && others.length > 0 && (
                    <ChoiceCards legend="¿A qué sección?" variant="compact" options={others.map(sectionOption)} value={to} onChange={setTo} />
                )}
            </div>
        </Modal>
    );
};

// ── ✏️ Renombrar / 😀 Cambiar emoji ─────────────────────────────────────────

export const SectionEditModal: React.FC<{
    section: string | null;
    mode: 'rename' | 'emoji';
    sections: string[];
    onSubmit: (oldName: string, nextName: string) => void;
    onClose: () => void;
}> = ({ section, ...rest }) => {
    if (!section) return null;
    return <SectionEditBody key={`${rest.mode}:${section}`} section={section} {...rest} />;
};

const SectionEditBody: React.FC<{
    section: string;
    mode: 'rename' | 'emoji';
    sections: string[];
    onSubmit: (oldName: string, nextName: string) => void;
    onClose: () => void;
}> = ({ section, mode, sections, onSubmit, onClose }) => {
    const { icon, label } = splitSectionName(section);
    const [text, setText] = useState(label);
    const [emoji, setEmoji] = useState(icon);
    const nextName = buildSectionName(emoji, cleanSectionName(text));
    const taken = nextName ? sectionNameTaken(sections, nextName, section) : null;
    const maxLabel = MAX_SECTION_NAME - (emoji ? emoji.length + 1 : 0);
    const problem = !cleanSectionName(text)
        ? 'Ponle un nombre.'
        : taken ? `Ya tienes la sección «${sectionLabel(taken)}».`
            : nextName.length > MAX_SECTION_NAME ? 'Es un poco largo; acórtalo.' : null;
    const unchanged = nextName === section;

    const submit = () => {
        if (problem || unchanged) return;
        onSubmit(section, nextName);
        onClose();
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="text-base font-black">{mode === 'rename' ? `✏️ Renombrar «${label}»` : `😀 Emoji de «${label}»`}</span>}
            footer={(
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} className="min-h-11">Cancelar</Button>
                    <Button onClick={submit} disabled={Boolean(problem) || unchanged} className="min-h-11">Guardar</Button>
                </div>
            )}
        >
            {mode === 'rename' ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <TextField
                        label="Nombre de la sección"
                        value={text}
                        onChange={setText}
                        max={Math.max(1, maxLabel)}
                        autoFocus
                        error={text.trim() ? problem ?? undefined : undefined}
                        hint="Los platos de esta sección se quedan en ella."
                    />
                </form>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-[var(--lt-text-muted)]">
                        Sale delante del nombre, también en tu carta pública. Ahora mismo:{' '}
                        <span className="font-semibold text-[var(--lt-text)]">{sectionEmoji(nextName || section)} {label}</span>
                    </p>
                    <div role="group" aria-label="Emoji de la sección" className="grid grid-cols-6 gap-2 min-[420px]:grid-cols-8">
                        {SECTION_EMOJI_CHOICES.map((choice) => {
                            const selected = emoji === choice;
                            return (
                                <button
                                    key={choice}
                                    type="button"
                                    aria-pressed={selected}
                                    aria-label={`Emoji ${choice}`}
                                    onClick={() => setEmoji(choice)}
                                    className={cn('grid min-h-11 place-items-center rounded-xl border text-2xl leading-none transition', kit.focus, selected ? kit.selected : kit.idle)}
                                >
                                    {choice}
                                </button>
                            );
                        })}
                    </div>
                    {emoji && (
                        <button
                            type="button"
                            onClick={() => setEmoji('')}
                            className={cn('min-h-11 rounded-lg px-1 text-sm font-semibold text-[var(--lt-text-muted)] underline underline-offset-4 hover:text-[var(--lt-text)]', kit.focus)}
                        >
                            Quitar emoji (usar el automático)
                        </button>
                    )}
                    {problem && <p role="alert" className="text-sm font-semibold text-[var(--lt-danger)]">{problem}</p>}
                </div>
            )}
        </Modal>
    );
};
