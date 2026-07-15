import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { clampScale, normalizeCaptureProposal, normalizeLocalState, splitTextForAnalysis, validBackup } from '../js/core.js';
import { createEncryptedBackup, decryptEncryptedBackup, isEncryptedBackup } from '../js/backup-crypto.js';
import { aiServerReady, apiFetch } from '../js/api-client.js';
import { extractJsonText, jsonOnlyInstructions, openAICompatibleChatUrl } from '../js/llm-utils.js';
import { clearStoredState, loadStoredState, saveStoredState } from '../js/state-store.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function setupApiClient({ host = 'localhost', url = '', token = '' } = {}) {
  const values = new Map();
  if (url) values.set('rhythm-api-url', url);
  if (token) values.set('rhythm-api-token', token);
  globalThis.location = { hostname: host };
  globalThis.RHYTHM_API_URL = '';
  globalThis.localStorage = {
    getItem(key) { return values.get(key) || ''; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('archive text is split without losing content', () => {
  const text = 'a'.repeat(51); const chunks = splitTextForAnalysis(text, 20);
  assert.equal(chunks.join(''), text); assert.equal(chunks.length, 3);
});

test('assistant proposal never creates an unknown route or invented scale', () => {
  const item = normalizeCaptureProposal({ kind: 'unknown', energy: 12, mood: 4, category: 'work' });
  assert.equal(item.kind, 'inbox'); assert.equal(item.energy, null); assert.equal(item.mood, 4); assert.equal(item.category, 'work');
});

test('local state migration keeps user arrays safe', () => {
  const initial = { profile: { aiContext: { share: false } }, habits: ['seed'], tasks: ['seed'] };
  const state = normalizeLocalState({ profile: { name: 'Danila' }, habits: [], tasks: [], dreams: 'bad' }, initial);
  assert.equal(state.profile.name, 'Danila'); assert.deepEqual(state.dreams, []); assert.deepEqual(state.habits, []);
});

test('local media library survives state migration without touching file blobs', () => {
  const initial = { profile: { aiContext: { share: false } }, habits: [], tasks: [], meditationLibrary: [] };
  const media = { id: 'media-1', title: 'Моя практика', audioId: 'audio-1', sourceName: 'practice.m4a' };
  const state = normalizeLocalState({ meditationLibrary: [media] }, initial);
  assert.equal(state.meditationLibrary[0].audioId, 'audio-1');
  assert.equal(state.meditationLibrary[0].sourceName, 'practice.m4a');
  assert.equal(state.meditationLibrary[0].text, '');
});

test('setup preferences remain local during state migration', () => {
  const initial = { profile: { aiContext: { share: false } }, habits: [], tasks: [] };
  const state = normalizeLocalState({ profile: { name: 'Danila', onboardingDone: true, aiContext: { goals: 'Больше сна' } } }, initial);
  assert.equal(state.profile.onboardingDone, true);
  assert.equal(state.profile.aiContext.share, false);
  assert.equal(state.profile.aiContext.goals, 'Больше сна');
});

test('state migration repairs incomplete nested records before rendering', () => {
  const initial = { profile: { aiContext: { share: false } }, sleeps: { seed: { date: 'seed', hours: 8 } }, checkins: {}, habits: [], tasks: [] };
  const state = normalizeLocalState({ profile: 'bad', sleeps: null, checkins: [], habits: [{ id: 'h1', name: 'Water' }], tasks: [{ id: 't1', title: 'Plan' }] }, initial);
  assert.equal(state.sleeps.seed.hours, 8);
  assert.equal(state.sleeps.seed.note, '');
  assert.deepEqual(state.checkins, {});
  assert.deepEqual(state.habits[0].dates, []);
  assert.equal(state.tasks[0].time, '');
  assert.equal(state.tasks[0].category, 'self');
});

test('state migration removes malformed records from every rendered collection', () => {
  const initial = { profile: { aiContext: { share: false } }, sleeps: {}, checkins: {}, habits: [], tasks: [] };
  const state = normalizeLocalState({
    sleeps: { broken: null, valid: { hours: '7.5' } },
    checkins: { broken: 'nope', valid: { energy: 8, emotions: 'bad' } },
    dreams: [null, 'bad', { date: '2026-07-15', tags: 'bad' }],
    journals: [null, { text: 42 }], reflections: ['bad', { answer: 42 }], meditations: [null, { duration: '12' }],
    workouts: ['bad', { exercises: [null, { title: 'Walk' }] }], captures: [null, { proposals: [{ kind: 'task' }] }],
    inbox: ['bad', { title: 42 }], meditationLibrary: [null, { text: 42, duration: 0 }]
  }, initial);
  assert.deepEqual(Object.keys(state.sleeps), ['valid']);
  assert.equal(state.sleeps.valid.hours, 7.5);
  assert.deepEqual(Object.keys(state.checkins), ['valid']);
  assert.equal(state.checkins.valid.energy, 8);
  assert.equal(state.dreams.length, 1);
  assert.deepEqual(state.dreams[0].tags, []);
  assert.equal(state.journals[0].text, '42');
  assert.equal(state.reflections[0].answer, '42');
  assert.equal(state.workouts[0].exercises.length, 1);
  assert.equal(state.captures[0].proposals[0].kind, 'task');
  assert.equal(state.meditationLibrary[0].duration, 1);
});

test('state store uses localStorage fallback when IndexedDB is unavailable', async () => {
  const previousIndexedDb = globalThis.indexedDB;
  const previousLocalStorage = globalThis.localStorage;
  const values = new Map();
  delete globalThis.indexedDB;
  globalThis.localStorage = {
    getItem(key) { return values.get(key) || ''; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };

  try {
    const saved = await saveStoredState('rhythm-test-state', { habits: [], tasks: [{ id: 'one' }] });
    const loaded = await loadStoredState('rhythm-test-state');
    assert.equal(saved.driver, 'localStorage');
    assert.equal(loaded.driver, 'localStorage');
    assert.deepEqual(loaded.state.tasks, [{ id: 'one' }]);

    await clearStoredState('rhythm-test-state');
    assert.equal(values.has('rhythm-test-state'), false);
  } finally {
    if (previousIndexedDb === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDb;
    globalThis.localStorage = previousLocalStorage;
  }
});

test('encrypted backup needs the right passphrase to restore data', async () => {
  const backup = { format: 'rhythm.backup', data: { habits: [], tasks: [], dreams: [{ text: 'личная запись' }] } };
  const encrypted = await createEncryptedBackup(backup, 'очень-длинный-пароль');
  assert.equal(isEncryptedBackup(encrypted), true);
  assert.deepEqual(await decryptEncryptedBackup(encrypted, 'очень-длинный-пароль'), backup);
  await assert.rejects(() => decryptEncryptedBackup(encrypted, 'не тот пароль'));
});

test('local AI server calls same-origin API without requiring a token', async () => {
  setupApiClient({ host: 'localhost' });
  let requestedUrl = '';
  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    assert.equal(options.headers.has('Authorization'), false);
    return new Response('{}', { status: 200 });
  };
  assert.equal(aiServerReady(), true);
  await apiFetch('/api/health');
  assert.equal(requestedUrl, '/api/health');
});

test('remote AI server requires explicit URL and bearer token', async () => {
  setupApiClient({ host: 'rhythm.example' });
  assert.equal(aiServerReady(), false);
  await assert.rejects(() => apiFetch('/api/health'), /AI_SERVER_NOT_CONNECTED/);

  setupApiClient({ host: 'rhythm.example', url: 'https://worker.example/', token: 'personal-secret-token' });
  let requestedUrl = '';
  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    assert.equal(options.headers.get('Authorization'), 'Bearer personal-secret-token');
    return new Response('{}', { status: 200 });
  };
  assert.equal(aiServerReady(), true);
  await apiFetch('/api/health');
  assert.equal(requestedUrl, 'https://worker.example/api/health');
});

test('hosted AI worker exposes a protected health check for the PWA', async () => {
  const worker = (await import('../worker.mjs')).default;
  const url = 'https://rhythm-ai.example.workers.dev/api/health';
  const env = { RHYTHM_ACCESS_TOKEN: 'personal-secret-token', OPENAI_API_KEY: 'sk-test', RHYTHM_ALLOWED_ORIGINS: 'https://danilapoperekov.github.io' };
  const response = await worker.fetch(new Request(url, { headers: { Origin: 'https://danilapoperekov.github.io', Authorization: 'Bearer personal-secret-token' } }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://danilapoperekov.github.io');
  assert.equal(body.ai.textConfigured, true);
  assert.equal(body.ai.speechConfigured, true);
  assert.equal(body.ai.capabilities.captureText, true);
  assert.equal(body.ai.capabilities.transcription, true);
});

test('OpenAI-compatible LLM helpers normalize chat URLs and JSON text', () => {
  assert.equal(openAICompatibleChatUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080/v1/chat/completions');
  assert.equal(openAICompatibleChatUrl('https://router.huggingface.co/v1/'), 'https://router.huggingface.co/v1/chat/completions');
  assert.equal(extractJsonText('```json\n{"ok":true}\n```'), '{"ok":true}');
  assert.equal(extractJsonText('Ответ:\n{"ok":true}\nготово'), '{"ok":true}');
  assert.ok(jsonOnlyInstructions('Сделай коротко', 'rhythm_test').includes('только валидный JSON'));
});

test('every interactive control has a declared action contract', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const controls = {
    'data-nav': "closest('[data-nav]')", 'data-modal': "closest('[data-modal]')", 'data-voice-record': "closest('[data-voice-record]')", 'data-assistant-record': "closest('[data-assistant-record]')", 'data-api-test': "closest('[data-api-test]')",
    'data-assistant-retry': "closest('[data-assistant-retry]')", 'data-assistant-save-inbox': "closest('[data-assistant-save-inbox]')", 'data-assistant-save': "closest('[data-assistant-save]')",
    'data-play-audio': "closest('[data-play-audio]')", 'data-add-exercise': "closest('[data-add-exercise]')", 'data-remove-exercise': "closest('[data-remove-exercise]')",
    'data-meditation-duration': "closest('[data-meditation-duration]')", 'data-meditation-toggle': "closest('[data-meditation-toggle]')", 'data-meditation-quick': "closest('[data-meditation-quick]')",
    'data-meditation-play': "closest('[data-meditation-play]')", 'data-meditation-remove': "closest('[data-meditation-remove]')", 'data-ambient-kind': "closest('[data-ambient-kind]')",
    'data-meditation-ambient': "closest('[data-meditation-ambient]')", 'data-meditation-generate': "closest('[data-meditation-generate]')", 'data-close-modal': "closest('[data-close-modal]:not(.modal-backdrop)')",
    'data-habit-toggle': "closest('[data-habit-toggle]')", 'data-mood': "closest('[data-mood]')", 'data-pick-mood': "closest('[data-pick-mood]')", 'data-task-toggle': "closest('[data-task-toggle]')",
    'data-task-today': "closest('[data-task-today]')", 'data-task-select': "closest('[data-task-select]')", 'data-task-edit': "closest('[data-task-edit]')", 'data-task-cancel': "closest('[data-task-cancel]')", 'data-task-move': "closest('[data-task-move]')", 'data-plan-mode': "closest('[data-plan-mode]')", 'data-plan-filter': "closest('[data-plan-filter]')",
    'data-calendar-date': "closest('[data-calendar-date]')", 'data-calendar-nav': "closest('[data-calendar-nav]')", 'data-calendar-today': "closest('[data-calendar-today]')",
    'data-export': "closest('[data-export]')", 'data-export-encrypted': "closest('[data-export-encrypted]')", 'data-export-text': "closest('[data-export-text]')", 'data-import': "closest('[data-import]')",
    'data-reset': "closest('[data-reset]')", 'data-pwa-install': "closest('[data-pwa-install]')"
  };
  for (const [control, handler] of Object.entries(controls)) {
    assert.ok(source.includes(control), `${control} should be rendered`);
    assert.ok(source.includes(handler), `${control} should have a click action`);
  }
});

test('every rendered form is handled on submit', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const ids = [...source.matchAll(/<form id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length >= 15);
  ids.forEach((id) => assert.ok(source.includes(`event.target.id === '${id}'`), `${id} must be saved or processed`));
});

test('backup validation rejects unrelated JSON', () => {
  assert.equal(validBackup({ format: 'rhythm.backup', data: { habits: [], tasks: [] } }), true);
  assert.equal(validBackup({ hello: 'world' }), false); assert.equal(clampScale(0), null);
});
