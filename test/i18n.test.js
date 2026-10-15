// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code, and the four documentation files, with the same sections. German says
// "du", never the polite "Sie". (Adapted from guim31/gladys-wled and
// guim31/gladys-pihole.)
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { NAMES } from '../src/devices.js';
import { SOUND_OPTIONS } from '../src/sounds.js';
import {
  APP_NAMES,
  CONNECTION_TEXT,
  DONE_TEXT,
  ERROR_TEXT,
  INIT_FAILED,
  PROBLEM_TEXT,
  REPORT_TEXT,
} from '../src/texts.js';
import { FORM_TEXT, TEXT } from '../src/widgets.js';
import { ERROR_KINDS } from '../src/lametric/client.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  report: 300,
  short: 24,
  status: 40,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();
const placeholders = (text) => sorted(text.match(/\{\w+\}/g) ?? []);

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
    if (typeof text === 'string' && typeof value.en === 'string') {
      if (JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(value.en))) {
        found.push(`${path}.${lang} does not have the placeholders of ${path}.en`);
      }
    }
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

const tableProblems = (table, name, max) =>
  Object.entries(table).flatMap(([key, value]) => problems(value, `${name}.${key}`, max));

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(NAMES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 110, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the brand, the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.deepEqual(manifest.widgets[0].label, {
    en: 'LaMetric',
    fr: 'LaMetric',
    de: 'LaMetric',
    es: 'LaMetric',
  });
});

test('every message table of the code has the four languages', () => {
  const found = [
    ...problems(INIT_FAILED, 'INIT_FAILED', MAX.message),
    ...tableProblems(CONNECTION_TEXT, 'CONNECTION_TEXT', MAX.message),
    ...tableProblems(PROBLEM_TEXT, 'PROBLEM_TEXT', MAX.status + 20),
    ...tableProblems(ERROR_TEXT, 'ERROR_TEXT', MAX.message),
    ...tableProblems(APP_NAMES, 'APP_NAMES', MAX.short),
    ...tableProblems(REPORT_TEXT, 'REPORT_TEXT', MAX.report),
    ...tableProblems(DONE_TEXT, 'DONE_TEXT', MAX.message),
    ...tableProblems(FORM_TEXT, 'FORM_TEXT', MAX.label),
    ...Object.entries(TEXT).flatMap(([key, value]) =>
      problems(
        value,
        `TEXT.${key}`,
        ['pick', 'unknown', 'updateGladys'].includes(key) ? MAX.message : MAX.short,
      ),
    ),
    ...SOUND_OPTIONS.flatMap((option) =>
      problems(option.label, `SOUND_OPTIONS.${option.value}`, MAX.label),
    ),
  ];
  assert.deepEqual(found, []);
});

test('every problem of a clock has its text', () => {
  for (const kind of [
    ...Object.values(ERROR_KINDS),
    'invalidAddress',
    'missingKey',
    'notFound',
    'waiting',
  ]) {
    assert.ok(PROBLEM_TEXT[kind], kind);
  }
});

test('the feature names exist in every language, distinct on a device', () => {
  for (const lang of LANGS) {
    assert.deepEqual(sorted(Object.keys(NAMES[lang])), sorted(Object.keys(NAMES.en)), lang);
    const names = Object.values(NAMES[lang]);
    assert.equal(new Set(names).size, names.length, `${lang}: two features with the same name`);
    for (const [key, name] of Object.entries(NAMES[lang])) {
      assert.deepEqual(textProblems(name, `NAMES.${lang}.${key}`, lang, MAX.featureName), []);
    }
  }
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Clock', fr: 'Horloge', de: 'Uhr' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: '{a}', fr: '{a}', de: '{b}', es: '{a}' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre Uhr', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_actions[0].fields[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_actions[0].fields[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

// --- Documentation -------------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

const headings = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => /^#{1,3} /.test(line))
    .map((line) => line.match(/^#+/)[0].length);

test('the four documentation files exist, with the same sections', () => {
  for (const lang of LANGS) {
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
    assert.deepEqual(headings(docs[lang]), headings(docs.en), `docs/${lang}.md sections`);
  }
  assert.ok(headings(docs.en).length >= 10);
});

test('the documentation names every action, widget button and feature', () => {
  for (const lang of LANGS) {
    const doc = docs[lang];
    for (const item of [...manifest.scene_actions, ...manifest.actions]) {
      assert.ok(doc.includes(item.label[lang]), `docs/${lang}.md: "${item.label[lang]}"`);
    }
    for (const key of ['previous', 'next', 'message', 'dismiss']) {
      assert.ok(doc.includes(TEXT[key][lang]), `docs/${lang}.md: "${TEXT[key][lang]}"`);
    }
    for (const name of Object.values(NAMES[lang])) {
      assert.ok(doc.includes(name), `docs/${lang}.md: feature "${name}"`);
    }
  }
});

test('the German documentation says "du"', () => {
  const polite = docs.de
    .split('\n')
    .filter((line) => !line.startsWith('`') && POLITE_GERMAN.test(line));
  assert.deepEqual(polite, []);
});

test('the documentation says it was developed without the hardware, and who is not behind it', () => {
  assert.match(docs.en, /Developed without the hardware: feedback welcome/);
  for (const lang of LANGS) {
    assert.match(docs[lang], /github\.com\/guim31\/gladys-lametric\/issues/, lang);
    assert.match(docs[lang], /LaMetric/, lang);
  }
  assert.match(docs.en, /not affiliated with LaMetric/);
});
