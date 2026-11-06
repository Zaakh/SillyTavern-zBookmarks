// Pure search-query parser and matcher for the bookmark popup (no SillyTavern imports, so `node --test` can run it).
// Tags: an unquoted `#tag` term matches that exact tag; quoted terms are always text.
// Syntax: space = AND (also `&&`), leading `-`/`!` = NOT, uppercase `OR` / `||` = alternatives, "quotes" = one phrase.

// optional -/! prefix, then a quoted phrase (an unterminated quote runs to the end) or a run of non-space characters
const TOKEN = /([-!]?)(?:"([^"]*)(?:"|$)|(\S+))/g;

/**
 * Parses query text into OR groups of AND terms: `[[{ text, raw, negated, quoted }]]`.
 * `text` is lowercased for matching, `raw` keeps the user's spelling. Never throws; empty groups are dropped.
 */
export function parseQuery(text) {
    const groups = [];
    let group = [];
    const closeGroup = () => { if (group.length) groups.push(group); group = []; };
    for (const [, prefix, phrase, word] of String(text ?? '').matchAll(TOKEN)) {
        const quoted = phrase !== undefined;
        if (!quoted && !prefix && (word === 'OR' || word === '||')) { closeGroup(); continue; }
        if (!quoted && !prefix && word === '&&') continue;
        const raw = quoted ? phrase : word;
        if (!raw) continue;
        group.push({ text: raw.toLowerCase(), raw, negated: !!prefix, quoted });
    }
    closeGroup();
    return groups;
}

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

/**
 * Cleans tag input (comma-separated string or array): lowercase, no leading #, anything but letters, digits, _ and -
 * becomes -, so a tag is always exactly one query term. Drops empties and duplicates, caps count and length.
 */
export function normalizeTags(input) {
    const list = Array.isArray(input) ? input : String(input ?? '').split(',');
    const tags = list
        .filter(t => typeof t === 'string')
        .map(t => t.trim().toLowerCase().replace(/^#\s*/, '').replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, MAX_TAG_LENGTH))
        .filter(Boolean);
    return [...new Set(tags)].slice(0, MAX_TAGS);
}

/** Splits trailing `#tag` words off slash-command text: "Dragon fight #boss" -> { title: "Dragon fight", tags: ["boss"] }. */
export function splitTrailingTags(text) {
    const words = String(text ?? '').trim().split(/\s+/);
    const tags = [];
    while (words.length && /^#.+/.test(words.at(-1))) tags.unshift(words.pop());
    return { title: words.join(' '), tags: normalizeTags(tags) };
}

/** An unquoted term that starts with # (and has more) is a tag lookup; "#12" in quotes stays text. */
const isTagTerm = t => !t.quoted && t.text.length > 1 && t.text.startsWith('#');

/** True when the bookmark ({ text: lowercase haystack, tags }) satisfies the parsed query; a query without terms matches everything. */
export function matches(parsed, { text, tags = [] }) {
    const hit = t => (isTagTerm(t) ? tags.includes(t.text.slice(1)) : text.includes(t.text)) !== t.negated;
    return !parsed.length || parsed.some(g => g.every(hit));
}

/** Tags used as #tag / -#tag in EVERY OR group of the query: Map tag -> 'in' | 'out'. Tags in only some groups are left out. */
export function tagStates(parsed) {
    const perGroup = parsed.map(g => new Map(g.filter(isTagTerm).map(t => [t.text.slice(1), t.negated])));
    const states = new Map();
    for (const [tag, negated] of perGroup[0] ?? []) {
        if (perGroup.every(m => m.get(tag) === negated)) states.set(tag, negated ? 'out' : 'in');
    }
    return states;
}

/**
 * Click on a tag chip: moves the tag none -> in (#tag) -> out (-#tag) -> none across every OR group, so it filters all
 * alternatives. With shift it is added as a new OR alternative instead. Returns a new parsed query; the input is untouched.
 */
export function cycleTag(parsed, tag, { shift = false } = {}) {
    const term = negated => ({ text: `#${tag}`, raw: `#${tag}`, negated, quoted: false });
    if (shift) return [...parsed, [term(false)]];
    const next = { none: 'in', in: 'out', out: 'none' }[tagStates(parsed).get(tag) ?? 'none'];
    const rest = (parsed.length ? parsed : [[]]).map(g => g.filter(t => !(isTagTerm(t) && t.text === `#${tag}`)));
    return rest
        .map(g => (next === 'none' ? g : [...g, term(next === 'out')]))
        .filter(g => g.length);
}

/** Writes a parsed query back as text (terms by space, groups by " OR ", quoted terms re-quoted); keeps the user's spelling. */
export function formatQuery(parsed) {
    const term = t => (t.negated ? '-' : '') + (t.quoted ? `"${t.raw}"` : t.raw);
    return parsed.map(g => g.map(term).join(' ')).join(' OR ');
}

export const PALETTE = ['#c0392b', '#d35400', '#b7950b', '#1e8449', '#148f77', '#2471a3', '#6c3483', '#a93279', '#5d6d7e', '#ba4a00', '#117a65', '#7d3c98'];

/** The chosen colour when it is a #rrggbb value, otherwise a stable palette colour picked by a hash of the name. */
export function tagColor(tag, overrides = {}) {
    const own = overrides?.[tag];
    if (typeof own === 'string' && /^#[0-9a-f]{6}$/.test(own)) return own;
    let hash = 0;
    for (const c of tag) hash = (hash * 31 + c.codePointAt(0)) >>> 0;
    return PALETTE[hash % PALETTE.length];
}

/** WCAG contrast ratio of a #rrggbb colour against black (#000) or white (#fff). */
function contrast(hex, onWhite) {
    const [r, g, b] = [1, 3, 5].map(i => {
        const v = parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return onWhite ? 1.05 / (lum + 0.05) : (lum + 0.05) / 0.05;
}

/** Black or white, whichever has the higher contrast on the given #rrggbb background. */
export function readableText(hex) {
    return contrast(hex, true) >= contrast(hex, false) ? '#fff' : '#000';
}
