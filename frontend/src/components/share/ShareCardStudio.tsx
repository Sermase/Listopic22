import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, Loader2, Share2, X } from 'lucide-react';
import '@fontsource-variable/caveat';
import {
    cardDimensions,
    downloadCardImage,
    drawCard,
    renderCard,
    shareCardImage,
    type CardDecor,
    type CardEntity,
    type CardSignature,
    type ModernCardVariant,
} from '../ShareCardModern';
import { CARD_PALETTE_IDS, CARD_PALETTES, type CardPaletteId } from '../../lib/shareCardPalettes';
import { useBackToClose } from '../../hooks/useSheetDismiss';
import { haptic } from '../../utils/haptics';

type Frame = NonNullable<CardDecor['frame']> | 'none';
type Tab = 'format' | 'theme' | 'photo' | 'frame' | 'signature';

const FORMATS: Array<{ id: ModernCardVariant; label: string; hint: string }> = [
    { id: 'story', label: 'Story', hint: 'Historias' },
    { id: 'portrait', label: 'Retrato', hint: 'Instagram' },
    { id: 'square', label: 'Post', hint: 'WhatsApp' },
    { id: 'landscape', label: 'Banner', hint: 'X y enlaces' },
];

const FRAMES: Array<{ id: Frame; label: string }> = [
    { id: 'none', label: 'Sin marco' },
    { id: 'polaroid', label: 'Polaroid' },
    { id: 'mantel', label: 'Mantel' },
];

interface ShareCardStudioProps {
    entity: CardEntity;
    /** Fotos para elegir (la primera, la de la tarjeta). */
    images: string[];
    palette: CardPaletteId;
    onPaletteChange: (palette: CardPaletteId) => void;
    /** Premio «Archivo Visual»: marcos. */
    canFrame: boolean;
    /** Premio «Crítico de Barrio»: la firma (si la tiene elegida). */
    signature?: CardSignature;
    onClose: () => void;
    /** Para la analítica: se compartió o se guardó. */
    onDone?: () => void;
}

/** Proporción en pequeño, para el botón de cada formato. */
const RatioIcon: React.FC<{ variant: ModernCardVariant; active: boolean }> = ({ variant, active }) => {
    const { width, height } = cardDimensions(variant);
    const scale = 26 / Math.max(width, height);
    return (
        <span className="grid h-8 w-8 place-items-center">
            <span
                className={`block rounded-[4px] border-2 ${active ? 'border-white bg-white/20' : 'border-[var(--lt-text-muted)]'}`}
                style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
            />
        </span>
    );
};

/** Una tarjeta en miniatura con los colores del tema. */
const ThemeSwatch: React.FC<{ id: CardPaletteId; active: boolean; onPick: () => void }> = ({ id, active, onPick }) => {
    const p = CARD_PALETTES[id];
    return (
        <button type="button" role="radio" aria-checked={active} aria-label={p.label} onClick={onPick} className="flex shrink-0 flex-col items-center gap-1.5">
            <span
                className={`relative block h-[84px] w-[56px] overflow-hidden rounded-xl transition-transform ${active ? 'scale-105 ring-2 ring-white ring-offset-2 ring-offset-[var(--lt-bg)]' : 'opacity-85'}`}
                style={{ background: `radial-gradient(circle at 80% 10%, ${p.glow}, transparent 60%), ${p.bg}` }}
            >
                <span className="absolute left-1.5 top-2 h-1.5 w-6 rounded-full bg-white/80" />
                <span className="absolute left-1.5 top-[42px] h-3 w-7 rounded" style={{ background: p.accent }} />
                <span className="absolute left-1.5 top-[60px] h-1 w-9 rounded-full bg-white/30" />
                <span className="absolute left-1.5 top-[66px] h-1 w-6 rounded-full bg-white/20" />
                <span className="absolute bottom-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${p.pin}, ${p.accent}, ${p.accent2})` }} />
                {active && (
                    <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-white text-black">
                        <Check className="h-3 w-3" />
                    </span>
                )}
            </span>
            <span className={`text-[11px] font-bold ${active ? 'text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)]'}`}>{p.label}</span>
        </button>
    );
};

/** Dibujito de cada marco. */
const FrameIcon: React.FC<{ frame: Frame; photo?: string }> = ({ frame, photo }) => {
    const img = photo
        ? <img src={photo} alt="" className="h-full w-full object-cover" />
        : <span className="block h-full w-full bg-gradient-to-br from-amber-300 to-orange-500" />;
    if (frame === 'polaroid') {
        return (
            <span className="grid h-full w-full place-items-center bg-[var(--lt-bg-deep)]">
                <span className="block -rotate-3 rounded-[3px] bg-[#fbf8f1] p-[4px] pb-[12px] shadow-lg">
                    <span className="block h-9 w-9 overflow-hidden">{img}</span>
                </span>
            </span>
        );
    }
    if (frame === 'mantel') {
        return (
            <span
                className="grid h-full w-full place-items-center"
                style={{ background: 'repeating-linear-gradient(0deg, rgba(196,36,48,.45) 0 8px, transparent 8px 16px), repeating-linear-gradient(90deg, rgba(196,36,48,.45) 0 8px, #f7f0e3 8px 16px)' }}
            >
                <span className="block h-11 w-11 rounded-full bg-[#f6f3ee] p-[5px] shadow-lg">
                    <span className="block h-full w-full overflow-hidden rounded-full">{img}</span>
                </span>
            </span>
        );
    }
    return <span className="block h-full w-full overflow-hidden">{img}</span>;
};

/** Crear la tarjeta: se ve en grande y se cambia el formato, el tema, la foto, el marco y la firma. */
export const ShareCardStudio: React.FC<ShareCardStudioProps> = ({
    entity,
    images,
    palette,
    onPaletteChange,
    canFrame,
    signature,
    onClose,
    onDone,
}) => {
    useBackToClose(true, onClose);
    const [variant, setVariant] = useState<ModernCardVariant>('story');
    const [image, setImage] = useState<string | undefined>(images[0]);
    const [frame, setFrame] = useState<Frame>('none');
    const [useSignature, setUseSignature] = useState(true);
    const [tab, setTab] = useState<Tab>('theme');
    const [rendering, setRendering] = useState(true);
    const [busy, setBusy] = useState<'share' | 'save' | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Los marcos van sobre la foto grande: no en el Banner ni sin foto.
    const frameAllowed = canFrame && variant !== 'landscape' && Boolean(image);
    const decor: CardDecor = {};
    if (frameAllowed && frame !== 'none') decor.frame = frame;
    if (signature && useSignature && variant !== 'landscape') decor.signature = signature;
    const card: CardEntity = { ...entity, imageUrl: image || entity.imageUrl, decor: Object.keys(decor).length ? decor : undefined };
    const key = JSON.stringify([variant, palette, image, decor]);

    useEffect(() => {
        let cancelled = false;
        setRendering(true);
        drawCard(card, variant, palette)
            .then((full) => {
                const target = canvasRef.current;
                if (cancelled || !target) return;
                // A la resolución de la pantalla, no la del PNG final: va más ligero.
                const scale = Math.min(1, (target.clientWidth * (window.devicePixelRatio || 1)) / full.width) || 0.5;
                target.width = Math.round(full.width * scale);
                target.height = Math.round(full.height * scale);
                const ctx = target.getContext('2d');
                if (!ctx) return;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(full, 0, 0, target.width, target.height);
            })
            .catch(() => setFeedback('No se pudo dibujar la tarjeta.'))
            .finally(() => { if (!cancelled) setRendering(false); });
        return () => { cancelled = true; };
        // La clave resume lo que cambia el dibujo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const act = async (kind: 'share' | 'save') => {
        if (busy) return;
        setBusy(kind);
        setFeedback(null);
        try {
            const png = await renderCard(card, variant, palette);
            if (kind === 'save') {
                downloadCardImage(card, png);
                setFeedback('Tarjeta guardada');
            } else {
                const message = await shareCardImage(card, png);
                if (message) setFeedback(message);
            }
            haptic('success');
            onDone?.();
        } catch {
            setFeedback('No se pudo generar la tarjeta.');
        } finally {
            setBusy(null);
        }
    };

    const tabs: Array<{ id: Tab; label: string }> = [
        { id: 'theme', label: 'Tema' },
        { id: 'format', label: 'Formato' },
        ...(images.length > 1 ? [{ id: 'photo' as const, label: 'Foto' }] : []),
        ...(canFrame && images.length ? [{ id: 'frame' as const, label: 'Marco' }] : []),
        ...(signature ? [{ id: 'signature' as const, label: 'Firma' }] : []),
    ];
    // En el móvil se ve una sección (la de la pestaña); en grande, todas.
    const section = (id: Tab) => `${tab === id ? 'block' : 'hidden'} md:block`;
    const heading = 'mb-2 hidden text-[11px] font-bold uppercase tracking-widest text-[var(--lt-text-muted)] md:block';
    const { width, height } = cardDimensions(variant);

    return createPortal(
        <div className="fixed inset-0 z-[10020] flex flex-col bg-[var(--lt-bg)] md:items-center md:justify-center md:bg-black/80 md:p-6 md:backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Crear tarjeta">
            <div className="flex h-full w-full flex-col md:h-[min(92vh,880px)] md:max-w-5xl md:overflow-hidden md:rounded-3xl md:border md:border-[var(--lt-border)] md:bg-[var(--lt-bg)] md:shadow-2xl">
                <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-[var(--lt-text)]">
                        <X className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-black text-[var(--lt-text)]">Crea tu tarjeta</h2>
                        <p className="truncate text-xs text-[var(--lt-text-muted)]">{entity.title}</p>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                    {/* La tarjeta en grande */}
                    <div className="relative flex min-h-0 flex-1 items-center justify-center px-6 py-3 md:p-8">
                        <div className="relative flex h-full min-h-[240px] w-full items-center justify-center md:min-h-0" style={{ containerType: 'size' }}>
                            <canvas
                                ref={canvasRef}
                                aria-label="Vista previa de la tarjeta"
                                className="rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10"
                                style={{ aspectRatio: `${width} / ${height}`, width: `min(100cqw, calc(100cqh * ${(width / height).toFixed(4)}))` }}
                            />
                            {rendering && (
                                <span className="absolute inset-0 grid place-items-center">
                                    <Loader2 className="h-7 w-7 animate-spin text-white/70" />
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Ajustes */}
                    <div className="shrink-0 border-t border-[var(--lt-border)] bg-[var(--lt-bg-deep)] md:flex md:min-h-0 md:w-[380px] md:flex-col md:border-l md:border-t-0">
                        <div className="min-h-[148px] space-y-5 px-4 pb-1 pt-3 md:min-h-0 md:flex-1 md:overflow-y-auto md:pb-4">
                            <section className={section('theme')}>
                                <p className={heading}>Tema</p>
                                <div className="-mx-4 flex gap-3 overflow-x-auto px-5 pb-2 pt-2 md:mx-0 md:flex-wrap md:px-1" role="radiogroup" aria-label="Tema de la tarjeta">
                                    {CARD_PALETTE_IDS.map((id) => (
                                        <ThemeSwatch key={id} id={id} active={palette === id} onPick={() => { haptic('light'); onPaletteChange(id); }} />
                                    ))}
                                </div>
                            </section>

                            <section className={section('format')}>
                                <p className={heading}>Formato</p>
                                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Formato de la tarjeta">
                                    {FORMATS.map((f) => {
                                        const active = variant === f.id;
                                        return (
                                            <button
                                                key={f.id}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                aria-label={f.label}
                                                onClick={() => setVariant(f.id)}
                                                className={`flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-2 transition-colors ${active ? 'border-[var(--lt-accent)] bg-[var(--lt-accent-soft)]' : 'border-[var(--lt-border)] bg-white/[0.03]'}`}
                                            >
                                                <RatioIcon variant={f.id} active={active} />
                                                <span className="text-xs font-bold text-[var(--lt-text)]">{f.label}</span>
                                                <span className="text-[10px] leading-tight text-[var(--lt-text-muted)]">{f.hint}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            {images.length > 1 && (
                                <section className={section('photo')}>
                                    <p className={heading}>Foto</p>
                                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="radiogroup" aria-label="Foto de la tarjeta">
                                        {images.map((url, index) => {
                                            const active = image === url;
                                            return (
                                                <button
                                                    key={`${url}-${index}`}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={active}
                                                    aria-label={`Usar foto ${index + 1}`}
                                                    onClick={() => setImage(url)}
                                                    className={`relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl transition-all ${active ? 'ring-2 ring-[var(--lt-accent)] ring-offset-2 ring-offset-[var(--lt-bg-deep)]' : 'opacity-70'}`}
                                                >
                                                    <img src={url} alt="" className="h-full w-full object-cover" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {canFrame && images.length > 0 && (
                                <section className={section('frame')}>
                                    <p className={heading}>Marco</p>
                                    {variant === 'landscape' ? (
                                        <p className="text-xs text-[var(--lt-text-muted)]">Los marcos van en Story, Retrato y Post.</p>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Marco de la foto">
                                            {FRAMES.map((f) => {
                                                const active = frame === f.id;
                                                return (
                                                    <button
                                                        key={f.id}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={active}
                                                        onClick={() => setFrame(f.id)}
                                                        className="flex flex-col items-center gap-1.5"
                                                    >
                                                        <span className={`block h-[68px] w-full overflow-hidden rounded-2xl transition-all ${active ? 'ring-2 ring-[var(--lt-accent)] ring-offset-2 ring-offset-[var(--lt-bg-deep)]' : 'opacity-80'}`}>
                                                            <FrameIcon frame={f.id} photo={image} />
                                                        </span>
                                                        <span className={`text-[11px] font-bold ${active ? 'text-[var(--lt-text)]' : 'text-[var(--lt-text-muted)]'}`}>{f.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            )}

                            {signature && (
                                <section className={section('signature')}>
                                    <p className={heading}>Firma</p>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={useSignature}
                                        onClick={() => setUseSignature((on) => !on)}
                                        className="flex w-full items-center gap-3 rounded-2xl border border-[var(--lt-border)] bg-white/[0.03] px-3 py-2.5 text-left"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xl leading-tight text-[var(--lt-accent)]" style={{ fontFamily: "'Caveat Variable', cursive" }}>“{signature.text}”</span>
                                            {signature.badge && <span className="block truncate text-[11px] font-semibold text-[var(--lt-text-muted)]">{signature.badge}</span>}
                                        </span>
                                        <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${useSignature ? 'bg-[var(--lt-accent)]' : 'bg-white/15'}`}>
                                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${useSignature ? 'left-[22px]' : 'left-0.5'}`} />
                                        </span>
                                    </button>
                                    <p className="mt-1.5 text-[11px] text-[var(--lt-text-muted)]">
                                        {variant === 'landscape' ? 'El Banner no lleva firma. ' : ''}Cámbiala en Preferencias → Mis premios.
                                    </p>
                                </section>
                            )}
                        </div>

                        {tabs.length > 1 && (
                            <nav className="flex justify-around border-t border-[var(--lt-border)] md:hidden" aria-label="Ajustes de la tarjeta">
                                {tabs.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        aria-pressed={tab === t.id}
                                        onClick={() => setTab(t.id)}
                                        className={`flex-1 border-t-2 py-2.5 text-xs font-bold transition-colors ${tab === t.id ? 'border-[var(--lt-text)] text-[var(--lt-text)]' : 'border-transparent text-[var(--lt-text-muted)]'}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </nav>
                        )}

                        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
                            {feedback && (
                                <p role="status" className="mb-2 rounded-xl border border-[var(--lt-border)] bg-white/5 px-3 py-2 text-center text-xs font-semibold text-[var(--lt-text)]">
                                    {feedback}
                                </p>
                            )}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => void act('share')}
                                    disabled={Boolean(busy)}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black lt-on-accent shadow-lg shadow-[var(--lt-accent-shadow)] disabled:opacity-60"
                                    style={{ backgroundImage: 'var(--lt-accent-grad)' }}
                                >
                                    {busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                                    Compartir
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void act('save')}
                                    disabled={Boolean(busy)}
                                    className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--lt-border)] bg-white/5 px-5 py-3.5 text-sm font-bold text-[var(--lt-text)] disabled:opacity-60"
                                >
                                    {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    Guardar
                                </button>
                            </div>
                            {!feedback && (
                                <p className="mt-2 text-center text-[11px] leading-snug text-[var(--lt-text-muted)]">
                                    🔗 Al compartir se copia el enlace: pégalo en tu publicación o con el sticker «Enlace» de Instagram.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};
