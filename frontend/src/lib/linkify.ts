// http(s)://… o www.… ; el punto o paréntesis final no forma parte del enlace.
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;

/** Texto → trozos con los enlaces separados. Solo http y https (nada de javascript:). */
export function splitLinks(text: string): ({ text: string } | { text: string; href: string })[] {
    const parts: ({ text: string } | { text: string; href: string })[] = [];
    let last = 0;
    for (const match of text.matchAll(URL_RE)) {
        const start = match.index ?? 0;
        if (start > last) parts.push({ text: text.slice(last, start) });
        const raw = match[0];
        parts.push({ text: raw, href: raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw });
        last = start + raw.length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
}
