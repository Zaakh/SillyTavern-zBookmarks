// Scenario tests for the bookmark search query syntax (run with `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { matches, parseQuery } from './bookmark-search.js';

/** Returns the titles that match the query. */
const run = (query, titles) => titles.filter(t => matches(parseQuery(query), t.toLowerCase()));

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
