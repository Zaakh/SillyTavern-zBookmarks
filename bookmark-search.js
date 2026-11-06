// Pure search-query parser and matcher for the bookmark popup (no SillyTavern imports, so `node --test` can run it).
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

/** True when the lowercase haystack satisfies the parsed query; a query without terms matches everything. */
export function matches(parsed, haystack) {
    return !parsed.length || parsed.some(g => g.every(t => haystack.includes(t.text) !== t.negated));
}
