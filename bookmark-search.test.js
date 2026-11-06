// Scenario tests for the bookmark search query syntax (run with `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, cycleTag, formatQuery, matches, normalizeTags, parseQuery, readableText, splitTrailingTags, tagColor, tagStates } from './bookmark-search.js';

/** Returns the titles that match the query. */
const run = (query, titles) => titles.filter(t => matches(parseQuery(query), { text: t.toLowerCase() }));

const dragons = ['dragon fight', 'dragon treaty'];

test('terms are ANDed, && is an alias', () => {
    assert.deepEqual(run('dragon fight', dragons), ['dragon fight']);
    assert.deepEqual(run('dragon && fight', dragons), ['dragon fight']);
});

test('- and ! exclude', () => {
    assert.deepEqual(run('dragon -fight', dragons), ['dragon treaty']);
    assert.deepEqual(run('dragon !fight', dragons), ['dragon treaty']);
});

test('OR and || give alternatives', () => {
    const t = ['dragon fight', 'elf treaty', 'market day'];
    assert.deepEqual(run('dragon OR treaty', t), ['dragon fight', 'elf treaty']);
    assert.deepEqual(run('dragon || treaty', t), ['dragon fight', 'elf treaty']);
});

test('OR binds looser than AND', () => {
    assert.deepEqual(run('dragon fight OR treaty', [...dragons, 'elf treaty']), ['dragon fight', 'dragon treaty', 'elf treaty']);
});

test('quoted phrase and excluded phrase', () => {
    const t = ['final fight', 'fight at the final gate'];
    assert.deepEqual(run('"final fight"', t), ['final fight']);
    assert.deepEqual(run('-"final fight"', t), ['fight at the final gate']);
});

test('operator words inside quotes are text', () => {
    assert.deepEqual(run('"dragon OR elf"', ['dragon OR elf', 'dragon']), ['dragon OR elf']);
});

test('uppercase OR vs lowercase or in one query', () => {
    assert.equal(parseQuery('a OR b or c').length, 2);
    assert.deepEqual(parseQuery('a OR b or c')[1].map(t => t.text), ['b', 'or', 'c']);
});

test('lowercase or is a word', () => {
    assert.deepEqual(run('dragon or elf', ['dragon or elf', 'dragon elf', 'dragon']), ['dragon or elf']);
});

test('only exclusions match everything else', () => {
    assert.deepEqual(run('-boss', ['boss fight', 'tea']), ['tea']);
});

test('case-insensitive', () => {
    assert.deepEqual(run('DRAGON', ['dragon fight']), ['dragon fight']);
});

test('dangling operators and empty input never throw or hide everything', () => {
    assert.deepEqual(run('dragon OR', dragons), dragons);
    assert.deepEqual(run('|| dragon', dragons), dragons);
    assert.deepEqual(run('   ', dragons), dragons);
    assert.deepEqual(run('', dragons), dragons);
});

test('unterminated quote runs to the end', () => {
    assert.deepEqual(run('"final fi', ['final fight', 'fight final']), ['final fight']);
});

test('lone - is text; re-run is not negated', () => {
    assert.deepEqual(run('-', ['a - b', 'ab']), ['a - b']);
    assert.deepEqual(run('re-run', ['re-run it', 'run']), ['re-run it']);
});

test('negation combines with OR; extra whitespace is ignored', () => {
    const t = ['dragon boss', 'dragon fight', 'elf treaty'];
    assert.deepEqual(run('dragon -boss OR elf', t), ['dragon fight', 'elf treaty']);
    assert.deepEqual(run('  dragon   fight  ', t), ['dragon fight']);
});

test('operator-only text parses to no terms', () => {
    for (const q of ['OR', '||', '&&', ' OR || ']) assert.deepEqual(parseQuery(q), []);
});

test('raw keeps the user spelling and quoted flag', () => {
    assert.deepEqual(parseQuery('Dragon -"Final Fight"'), [[
        { text: 'dragon', raw: 'Dragon', negated: false, quoted: false },
        { text: 'final fight', raw: 'Final Fight', negated: true, quoted: true },
    ]]);
});

// --- tags ---

/** Titles of { title, tags } bookmarks that match the query. */
const runTags = (query, items) => items.filter(i => matches(parseQuery(query), { text: i.title.toLowerCase(), tags: i.tags })).map(i => i.title);
const tagged = [
    { title: 'a', tags: ['boss', 'quest'] },
    { title: 'b', tags: ['lore'] },
    { title: 'c', tags: ['bossfight'] },
    { title: 'Issue #12' },
];

test('normalizeTags: case, #, spaces and unsafe characters', () => {
    assert.deepEqual(normalizeTags('Boss, #Main Quest'), ['boss', 'main-quest']);
    assert.deepEqual(normalizeTags('a"b||c'), ['a-b--c']);
    assert.deepEqual(normalizeTags(['Boss', 'boss', ' ', '#', 5]), ['boss']);
});

test('normalizeTags: limits and empty input', () => {
    assert.equal(normalizeTags(Array.from({ length: 11 }, (_, i) => 't' + i)).length, 10);
    assert.equal(normalizeTags('x'.repeat(40))[0].length, 30);
    for (const v of [undefined, null, '', ' , ,']) assert.deepEqual(normalizeTags(v), []);
});

test('splitTrailingTags takes only trailing #words', () => {
    assert.deepEqual(splitTrailingTags('Dragon fight #boss #quest'), { title: 'Dragon fight', tags: ['boss', 'quest'] });
    assert.deepEqual(splitTrailingTags('Issue #12 fixed'), { title: 'Issue #12 fixed', tags: [] });
    assert.deepEqual(splitTrailingTags('Plain'), { title: 'Plain', tags: [] });
});

test('#tag is an exact tag match, -#tag excludes', () => {
    assert.deepEqual(runTags('#boss', tagged), ['a']);
    assert.deepEqual(runTags('-#boss', tagged), ['b', 'c', 'Issue #12']);
    assert.deepEqual(runTags('#boss OR #lore', tagged), ['a', 'b']);
    assert.deepEqual(runTags('#quest -#boss', tagged), []);
    assert.deepEqual(runTags('#BOSS', tagged), ['a']);
});

test('#12 is a tag lookup, "#12" is title text', () => {
    assert.deepEqual(runTags('#12', tagged), []);
    assert.deepEqual(runTags('"#12"', tagged), ['Issue #12']);
});

test('tag terms combine with text', () => {
    assert.deepEqual(runTags('#boss a', tagged), ['a']);
    assert.deepEqual(runTags('#boss b', tagged), []);
});

/** Applies cycleTag to query text and returns the new query text. */
const click = (query, tag, opts) => formatQuery(cycleTag(parseQuery(query), tag, opts));

test('click cycles none -> in -> out -> none', () => {
    assert.equal(click('dragon', 'boss'), 'dragon #boss');
    assert.equal(click('dragon #boss', 'boss'), 'dragon -#boss');
    assert.equal(click('dragon -#boss', 'boss'), 'dragon');
});

test('click on an empty query', () => {
    assert.equal(click('', 'boss'), '#boss');
    assert.equal(click('#boss', 'boss'), '-#boss');
    assert.equal(click('-#boss', 'boss'), '');
});

test('click applies the tag to every OR alternative', () => {
    assert.equal(click('dragon OR elf', 'boss'), 'dragon #boss OR elf #boss');
    assert.equal(click('dragon #boss OR elf #boss', 'boss'), 'dragon -#boss OR elf -#boss');
    assert.equal(click('dragon -#boss OR elf -#boss', 'boss'), 'dragon OR elf');
});

test('tag present in only some alternatives is normalised to in-everywhere', () => {
    assert.equal(click('#boss OR elf', 'boss'), '#boss OR elf #boss');
});

test('a tag inside a quoted phrase is ignored', () => {
    assert.equal(click('"see #boss"', 'boss'), '"see #boss" #boss');
});

test('click adds other tags next to existing ones; similar names are different tags', () => {
    assert.equal(click('#boss', 'lore'), '#boss #lore');
    assert.equal(click('#bossfight', 'boss'), '#bossfight #boss');
});

test('shift-click adds an OR alternative', () => {
    assert.equal(click('#boss', 'lore', { shift: true }), '#boss OR #lore');
    assert.equal(click('', 'lore', { shift: true }), '#lore');
});

test('user casing is kept; ! and || aliases are normalised', () => {
    assert.equal(click('Dragon !#boss', 'lore'), 'Dragon -#boss #lore');
    assert.equal(click('Dragon || Elf', 'boss'), 'Dragon #boss OR Elf #boss');
    assert.equal(click('#Boss', 'boss'), '-#boss');
});

test('click does not mutate its input', () => {
    const parsed = parseQuery('dragon OR elf');
    const copy = structuredClone(parsed);
    cycleTag(parsed, 'boss');
    assert.deepEqual(parsed, copy);
});

test('tagStates reports tags present in every group only', () => {
    assert.deepEqual([...tagStates(parseQuery('#a -#b OR #a'))], [['a', 'in']]);
    assert.deepEqual([...tagStates(parseQuery('-#a OR -#a #b'))], [['a', 'out']]);
    assert.equal(tagStates(parseQuery('')).size, 0);
});

test('tagColor is stable, honours valid overrides and ignores invalid ones', () => {
    assert.equal(tagColor('boss'), tagColor('boss'));
    assert.equal(tagColor('boss', { boss: '#112233' }), '#112233');
    for (const bad of ['red', '#12345', '#GGGGGG', '#ABCDEF', 5, null]) assert.equal(tagColor('boss', { boss: bad }), tagColor('boss'));
});

test('readableText picks contrasting text', () => {
    assert.equal(readableText('#ffffff'), '#000');
    assert.equal(readableText('#000000'), '#fff');
    assert.equal(readableText('#b7950b'), '#000'); // mustard: white would be only 2.9:1
});

test('every automatic colour is readable with its text colour (WCAG AA, 4.5:1)', () => {
    const lin = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    const lum = h => { const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    for (const bg of PALETTE) {
        const text = readableText(bg) === '#fff' ? '#ffffff' : '#000000';
        const [hi, lo] = [lum(bg), lum(text)].sort((a, b) => b - a);
        assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5, bg);
    }
});
