const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 250000;

function toBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function keyFromPassword(password, salt) {
  const cryptoApi = globalThis.crypto;
  const material = await cryptoApi.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return cryptoApi.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function isEncryptedBackup(value) {
  return value?.format === 'rhythm.encrypted-backup' && typeof value?.ciphertext === 'string' && typeof value?.salt === 'string' && typeof value?.iv === 'string';
}

export async function createEncryptedBackup(backup, password) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('Шифрование не поддерживается этим браузером');
  if (String(password).length < 12) throw new Error('Пароль должен содержать не менее 12 символов');
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(password, salt);
  const ciphertext = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(backup)));
  return { format: 'rhythm.encrypted-backup', schema: 1, exportedAt: new Date().toISOString(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS }, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptEncryptedBackup(encrypted, password) {
  if (!isEncryptedBackup(encrypted)) throw new Error('Неверный формат зашифрованной копии');
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('Шифрование не поддерживается этим браузером');
  try {
    const salt = fromBase64(encrypted.salt); const iv = fromBase64(encrypted.iv); const ciphertext = fromBase64(encrypted.ciphertext);
    const key = await keyFromPassword(password, salt);
    return JSON.parse(decoder.decode(await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)));
  } catch (_) {
    throw new Error('Пароль не подошёл или файл повреждён');
  }
}
