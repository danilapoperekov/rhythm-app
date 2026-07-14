import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { clampScale, normalizeCaptureProposal, normalizeLocalState, splitTextForAnalysis, validBackup } from '../js/core.js';
import { createEncryptedBackup, decryptEncryptedBackup, isEncryptedBackup } from '../js/backup-crypto.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

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
  assert.deepEqual(state.meditationLibrary, [media]);
  assert.equal(state.meditationLibrary[0].audioId, 'audio-1');
});

test('setup preferences remain local during state migration', () => {
  const initial = { profile: { aiContext: { share: false } }, habits: [], tasks: [] };
  const state = normalizeLocalState({ profile: { name: 'Danila', onboardingDone: true, aiContext: { goals: 'Больше сна' } } }, initial);
  assert.equal(state.profile.onboardingDone, true);
  assert.equal(state.profile.aiContext.share, false);
  assert.equal(state.profile.aiContext.goals, 'Больше сна');
});

test('encrypted backup needs the right passphrase to restore data', async () => {
  const backup = { format: 'rhythm.backup', data: { habits: [], tasks: [], dreams: [{ text: 'личная запись' }] } };
  const encrypted = await createEncryptedBackup(backup, 'очень-длинный-пароль');
  assert.equal(isEncryptedBackup(encrypted), true);
  assert.deepEqual(await decryptEncryptedBackup(encrypted, 'очень-длинный-пароль'), backup);
  await assert.rejects(() => decryptEncryptedBackup(encrypted, 'не тот пароль'));
});

test('every interactive control has a declared action contract', async () => {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const controls = {
    'data-nav': "closest('[data-nav]')", 'data-modal': "closest('[data-modal]')", 'data-voice-record': "closest('[data-voice-record]')", 'data-assistant-record': "closest('[data-assistant-record]')",
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
