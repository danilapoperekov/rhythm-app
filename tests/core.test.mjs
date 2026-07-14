import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
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

test('backup validation rejects unrelated JSON', () => {
  assert.equal(validBackup({ format: 'rhythm.backup', data: { habits: [], tasks: [] } }), true);
  assert.equal(validBackup({ hello: 'world' }), false); assert.equal(clampScale(0), null);
});
