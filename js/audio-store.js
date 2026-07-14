const DB_NAME = 'rhythm-audio-v1';
const STORE = 'recordings';

function openAudioDb(mode = 'readonly') {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.transaction(STORE, mode));
  });
}

export async function saveAudioBlob(id, blob, createdAt = new Date().toISOString()) {
  const transaction = await openAudioDb('readwrite');
  return new Promise((resolve, reject) => { transaction.objectStore(STORE).put({ id, blob, createdAt }); transaction.oncomplete = () => resolve(id); transaction.onerror = () => reject(transaction.error); });
}

export async function getAudioBlob(id) {
  const transaction = await openAudioDb();
  return new Promise((resolve, reject) => { const request = transaction.objectStore(STORE).get(id); request.onsuccess = () => resolve(request.result?.blob || null); request.onerror = () => reject(request.error); });
}

export async function getAllAudioRecords() {
  const transaction = await openAudioDb();
  return new Promise((resolve, reject) => { const request = transaction.objectStore(STORE).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
}

export async function putAudioRecords(records) {
  const transaction = await openAudioDb('readwrite');
  return new Promise((resolve, reject) => { records.forEach((record) => transaction.objectStore(STORE).put(record)); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
}

export async function deleteAudioRecord(id) {
  const transaction = await openAudioDb('readwrite');
  return new Promise((resolve, reject) => {
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

export function dataUrlToBlob(dataUrl) {
  const [header, body] = String(dataUrl).split(','); const binary = atob(body); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: /data:([^;]+)/.exec(header)?.[1] || 'audio/webm' });
}
