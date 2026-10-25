import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SmilePlus } from 'lucide-react';
import { DOUBLE_TAP_REACTION, QUICK_REACTIONS, summarizeReactions, type ReactionMap } from '../../lib/chatExtras';
import { useBackToClose } from '../../hooks/useSheetDismiss';

const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 300;
const SWIPE_REPLY_PX = 60;

/**
 * Envoltorio de cada mensaje: mantener pulsado (o el botón ☺ en escritorio)
 * abre las reacciones y «Responder»; deslizar a la derecha responde y el
 * doble toque es un 😋.
 */
export const MessageBubble: React.FC<{
    messageId: string;
    isOwn: boolean;
    uid: string;
    reactions?: ReactionMap;
    onReact: (emoji: string | null) => void;
    onReply: () => void;
    /** Tarjetas (quedada, encuesta): casi todo el ancho. */
    wide?: boolean;
    children: React.ReactNode;
}> = ({ messageId, isOwn, uid, reactions, onReact, onReply, wide = false, children }) => {
    const [menuPos, setMenuPos] = useState<React.CSSProperties | null>(null);
    const menuOpen = menuPos !== null;
    useBackToClose(menuOpen, () => setMenuPos(null));
    const bubbleRef = useRef<HTMLDivElement>(null);
    // El menú flota sobre todo (portal); cerca del borde de arriba va debajo del mensaje.
    const setMenuOpen = (open: boolean) => {
        const rect = bubbleRef.current?.getBoundingClientRect();
        if (!open || !rect) { setMenuPos(null); return; }
        const top = rect.top < 160 ? rect.bottom + 8 : rect.top - 56;
        setMenuPos(isOwn
            ? { top, right: Math.max(8, window.innerWidth - rect.right) }
            : { top, left: Math.max(8, rect.left) });
    };
    const [dx, setDx] = useState(0);
    const touch = useRef<{ x: number; y: number; horizontal: boolean | null; timer: number | null; moved: boolean; fired: boolean } | null>(null);
    const lastTap = useRef(0);
    const [burst, setBurst] = useState(false);
    const summary = summarizeReactions(reactions, uid);
    const mine = reactions?.[uid] || null;

    const clearTimer = () => {
        if (touch.current?.timer) window.clearTimeout(touch.current.timer);
        if (touch.current) touch.current.timer = null;
    };

    const onTouchStart = (e: React.TouchEvent) => {
        const t = e.touches[0];
        touch.current = {
            x: t.clientX,
            y: t.clientY,
            horizontal: null,
            moved: false,
            fired: false,
            timer: window.setTimeout(() => {
                if (touch.current) touch.current.fired = true;
                setMenuOpen(true);
                if (navigator.vibrate) navigator.vibrate(10);
            }, LONG_PRESS_MS),
        };
    };
    const onTouchMove = (e: React.TouchEvent) => {
        const state = touch.current;
        if (!state) return;
        const t = e.touches[0];
        const mx = t.clientX - state.x;
        const my = t.clientY - state.y;
        if (Math.abs(mx) > 8 || Math.abs(my) > 8) {
            clearTimer();
            state.moved = true;
        }
        if (state.horizontal === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
            state.horizontal = Math.abs(mx) > Math.abs(my);
        }
        if (state.horizontal) setDx(Math.max(0, Math.min(80, mx)));
    };
    const doubleTap = () => {
        if (mine !== DOUBLE_TAP_REACTION) onReact(DOUBLE_TAP_REACTION);
        setBurst(true);
        window.setTimeout(() => setBurst(false), 650);
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        const tapped = touch.current && !touch.current.moved && !touch.current.fired;
        clearTimer();
        if (dx >= SWIPE_REPLY_PX) onReply();
        setDx(0);
        touch.current = null;
        if (!tapped || (e.target as HTMLElement).closest('button, a')) return;
        const now = Date.now();
        if (now - lastTap.current < DOUBLE_TAP_MS) {
            lastTap.current = 0;
            doubleTap();
        } else {
            lastTap.current = now;
        }
    };

    const react = (emoji: string) => {
        onReact(mine === emoji ? null : emoji);
        setMenuOpen(false);
    };

    return (
        <div id={`msg-${messageId}`} className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${summary.length ? 'mb-3' : ''}`}>
            {dx > 0 && <span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg" style={{ opacity: Math.min(1, dx / SWIPE_REPLY_PX) }}>↩️</span>}
            <div className={`relative ${wide ? 'max-w-full' : 'max-w-[80%]'} flex items-center gap-1`} style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform .2s' }}>
                {isOwn && (
                    <button type="button" onClick={() => setMenuOpen(true)} className="hidden md:group-hover:flex p-1 text-gray-500 hover:text-white" aria-label="Reaccionar">
                        <SmilePlus className="w-4 h-4" />
                    </button>
                )}
                <div
                    ref={bubbleRef}
                    className="relative min-w-0 select-none md:select-text"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchEnd}
                    onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
                    onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button, a')) doubleTap(); }}
                >
                    {children}
                    {burst && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl animate-ping">{DOUBLE_TAP_REACTION}</span>}
                    {summary.length > 0 && (
                        <div className={`absolute -bottom-3 ${isOwn ? 'right-2' : 'left-2'} flex gap-0.5`}>
                            {summary.map((r) => (
                                <button
                                    key={r.emoji}
                                    type="button"
                                    onClick={() => react(r.emoji)}
                                    className={`text-[11px] leading-none px-1.5 py-0.5 rounded-full border shadow ${r.mine ? 'bg-[var(--lt-accent-soft)] border-[var(--lt-accent-border)]' : 'bg-[var(--lt-card-strong)] border-[var(--lt-bg)]'}`}
                                >
                                    {r.emoji}{r.count > 1 ? <span className="ml-0.5 text-gray-300">{r.count}</span> : null}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {!isOwn && (
                    <button type="button" onClick={() => setMenuOpen(true)} className="hidden md:group-hover:flex p-1 text-gray-500 hover:text-white" aria-label="Reaccionar">
                        <SmilePlus className="w-4 h-4" />
                    </button>
                )}
            </div>

            {menuOpen && createPortal(
                <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setMenuOpen(false)} />
                    <div style={menuPos ?? undefined} className="fixed z-[9999] flex items-center gap-1 rounded-full bg-[var(--lt-card-strong)] border border-white/10 shadow-2xl px-2 py-1.5">
                        {QUICK_REACTIONS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => react(emoji)}
                                className={`text-2xl leading-none px-0.5 transition-transform hover:scale-125 active:scale-110 ${mine === emoji ? 'scale-125' : ''}`}
                            >
                                {emoji}
                            </button>
                        ))}
                        <span className="w-px h-6 bg-white/10 mx-1" />
                        <button type="button" onClick={() => { setMenuOpen(false); onReply(); }} className="text-xs font-semibold text-gray-200 px-1.5 whitespace-nowrap">↩️ Responder</button>
                    </div>
                </>,
                document.body,
            )}
        </div>
    );
};
