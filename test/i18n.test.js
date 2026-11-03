import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { LANGUAGES, MESSAGES_FOR_TESTS as TEXTS, t, text as one } from '../src/i18n.js';
import { FEATURE_KEYS } from '../src/devices.js';
import { ATTENTION_REASONS, FAN_SPEEDS, WATER_GRADES } from '../src/scenes.js';
import { STATUSES } from '../src/valetudo/attributes.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../gladys-assistant-integration.json'));

/**
 * @description Every multi-language object of the manifest, with its path.
 * @param {unknown} node - A manifest node.
 * @param {string} path - Its path.
 * @returns {Array<[string, object]>} The texts.
 */
function texts(node, path = '') {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => texts(child, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      return [[path, node]];
    }
    return Object.entries(node).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

test('every manifest text (widgets, triggers, actions, fields, variables, outputs) has 4 languages', () => {
  const found = texts(manifest);
  assert.ok(found.length > 60);
  for (const [path, text] of found) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), path);
    for (const language of LANGUAGES) {
      assert.ok(text[language]?.trim(), `${path}.${language} is missing`);
    }
  }
});

test('catalog description: 10 to 100 characters per language', () => {
  for (const language of LANGUAGES) {
    const { length } = manifest.description[language];
    assert.ok(length >= 10 && length <= 100, `description.${language}: ${length}`);
  }
});

test('widget labels: 3 to 30 characters, descriptions: 100 at most, per language', () => {
  for (const widget of manifest.widgets) {
    for (const language of LANGUAGES) {
      const { length } = widget.label[language];
      assert.ok(length >= 3 && length <= 30, `${widget.key}.label.${language}: ${length}`);
      const size = widget.description[language].length;
      assert.ok(size <= 100, `${widget.key}.description.${language}: ${size}`);
    }
  }
});

test('every runtime text exists in the four languages, with the same placeholders', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, entry] of Object.entries(TEXTS)) {
    assert.deepEqual(Object.keys(entry).sort(), [...LANGUAGES].sort(), key);
    for (const language of LANGUAGES) {
      assert.ok(entry[language], `${key}.${language} is missing`);
      assert.deepEqual(placeholders(entry[language]), placeholders(entry.en), `${key}.${language}`);
    }
  }
  assert.equal(one('battery', 'it'), 'Battery', 'English fallback');
  assert.equal(one('preset_ultra', 'fr', {}, 'ultra'), 'ultra', 'a value Valetudo added later');
});

test('every feature, status, preset and reason has its name; texts stay within their bounds', () => {
  for (const key of Object.values(FEATURE_KEYS)) {
    assert.ok(TEXTS[key], key);
  }
  for (const status of STATUSES) {
    assert.ok(TEXTS[`status_${status}`], status);
  }
  for (const preset of [...FAN_SPEEDS, ...WATER_GRADES, 'vacuum', 'mop', 'vacuum_and_mop']) {
    assert.ok(TEXTS[`preset_${preset}`], preset);
  }
  for (const reason of Object.values(ATTENTION_REASONS)) {
    assert.ok(TEXTS[`attention_${reason}`], reason);
  }
  const bound = (keys, max, vars = {}) => {
    for (const key of keys) {
      for (const [language, value] of Object.entries(t(key, vars))) {
        assert.ok(value.length <= max, `${key}.${language}: ${value.length}`);
      }
    }
  };
  const keys = (prefix) => Object.keys(TEXTS).filter((name) => name.startsWith(prefix));
  bound(keys('status'), 200, { count: 3, total: 3, error: 'x'.repeat(60) });
  // Widget button labels: 24 characters; tile labels: 24; status labels: 40.
  bound(
    [
      'widgetStart',
      'widgetResume',
      'widgetPause',
      'widgetHome',
      'widgetLocate',
      'widgetCleanRoom',
      'widgetReset',
      'widgetBattery',
      'widgetCharging',
      'widgetArea',
      'widgetTime',
      'widgetTotalArea',
      'widgetTotalTime',
      'widgetTotalRuns',
      'badgeReplace',
      'badgeSoon',
    ],
    24,
  );
  bound([...keys('status_'), ...keys('preset_'), ...keys('flag_')], 40);
  bound(keys('toast'), 200, {
    name: 'x'.repeat(60),
    room: 'x'.repeat(40),
    consumable: 'x'.repeat(40),
  });
  bound(keys('widget'), 200, { room: 'x'.repeat(30), rooms: 12, area: 120 });
});

test('docs: the four languages, same structure, more than 300 characters', () => {
  const headings = (text) => text.split('\n').filter((line) => /^#{1,3} /.test(line)).length;
  const tables = (text) => text.split('\n').filter((line) => /^\|\s*-/.test(line)).length;
  const docs = Object.fromEntries(
    LANGUAGES.map((language) => {
      const path = new URL(`../docs/${language}.md`, import.meta.url);
      assert.ok(existsSync(path), `docs/${language}.md is missing`);
      return [language, readFileSync(path, 'utf8')];
    }),
  );
  for (const language of LANGUAGES) {
    assert.ok(docs[language].length > 300, `docs/${language}.md is too short`);
    assert.equal(headings(docs[language]), headings(docs.en), `docs/${language}.md headings`);
    assert.equal(tables(docs[language]), tables(docs.en), `docs/${language}.md tables`);
    // The store re-hosts the docs: images by absolute URL only.
    for (const [, url] of docs[language].matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      assert.match(url, /^https:\/\/raw\.githubusercontent\.com\//, `docs/${language}.md: ${url}`);
    }
  }
});

const RAW = 'https://raw.githubusercontent.com/William-De71/gladys-valetudo/main/';

test('docs: the generated widget image of their language, never the cover', () => {
  for (const language of LANGUAGES) {
    const text = readFileSync(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
    assert.ok(text.includes(`(${RAW}docs/assets/widgets.${language}.png)`), language);
    assert.match(
      text,
      /generated illustration|illustration générée|generierte Illustration|ilustración generada/,
    );
    assert.doesNotMatch(text, /cover\.jpg/, 'the store already shows the cover');
  }
});

test('README: badges, the cover under them, the widget image of their language', () => {
  const files = { en: 'README.md', fr: 'README.fr.md', de: 'README.de.md', es: 'README.es.md' };
  for (const [language, file] of Object.entries(files)) {
    const text = read(`../${file}`);
    const lines = text.split('\n');
    const badges = lines.findIndex((line) => line.includes('img.shields.io/badge/'));
    assert.match(lines[badges], /badge\/(license|licence|Lizenz|licencia)-Apache--2\.0/, file);
    assert.match(text, /github\/v\/release\/William-De71\/gladys-valetudo\?sort=semver/, file);
    assert.match(text, /workflow\/status\/William-De71\/gladys-valetudo\/release\.yml/, file);
    assert.match(text, /Gladys-%E2%89%A5%205\.3\.0/, file);
    // The cover right under the four badges, before the pitch.
    assert.match(
      lines[badges + 5],
      /^!\[Valetudo (for|pour|für|para) Gladys Assistant\]\(cover\.jpg\)$/,
      file,
    );
    assert.ok(text.includes(`(docs/assets/widgets.${language}.png)`), `${file} widget image`);
    assert.ok(text.includes('(docs/assets/architecture.svg)'), file);
    assert.ok(text.includes('(docs/assets/release-pipeline.svg)'), file);
    assert.equal((text.match(/```mermaid/g) ?? []).length, 2, `${file}: architecture, sequence`);
  }
});

test('images: every generated widget image and the cover exist', () => {
  for (const language of LANGUAGES) {
    const png = readFileSync(new URL(`../docs/assets/widgets.${language}.png`, import.meta.url));
    assert.equal(png.toString('latin1', 1, 4), 'PNG', language);
  }
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  // JPEG SOF0/SOF2 frame: height then width.
  const frame = cover.findIndex(
    (byte, index) => byte === 0xff && [0xc0, 0xc2].includes(cover[index + 1]),
  );
  assert.deepEqual([cover.readUInt16BE(frame + 7), cover.readUInt16BE(frame + 5)], [800, 534]);
});

test('README: one per language, same structure, each linking to the three others', () => {
  const files = { en: 'README.md', fr: 'README.fr.md', de: 'README.de.md', es: 'README.es.md' };
  const headings = (text) => text.split('\n').filter((line) => /^#{1,3} /.test(line)).length;
  const english = read(`../${files.en}`);
  for (const file of Object.values(files)) {
    const path = new URL(`../${file}`, import.meta.url);
    assert.ok(existsSync(path), `${file} is missing`);
    const text = readFileSync(path, 'utf8');
    for (const other of Object.values(files).filter((name) => name !== file)) {
      assert.ok(text.includes(`](${other})`), `${file} does not link to ${other}`);
    }
    assert.equal(headings(text), headings(english), `${file} headings`);
    for (const [, target] of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      assert.ok(
        existsSync(new URL(`../${target.split('#')[0]}`, import.meta.url)),
        `${file}: ${target}`,
      );
    }
  }
});
