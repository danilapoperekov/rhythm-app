import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.RHYTHM_AI_MODEL || 'gpt-5.6-terra';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 28000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('invalid_json')); } });
    req.on('error', reject);
  });
}

async function reflect(req, res) {
  if (!apiKey) return send(res, 503, { error: 'AI_NOT_CONFIGURED', message: 'Сервер ИИ пока не настроен.' });
  let input;
  try { input = await readJson(req); } catch { return send(res, 400, { error: 'INVALID_REQUEST' }); }
  if (input.consent !== true) return send(res, 403, { error: 'CONSENT_REQUIRED', message: 'Нужно явное согласие на отправку этой записи в ИИ.' });
  const text = String(input.text || '').trim();
  const context = String(input.context || '').trim().slice(0, 5000);
  if (!text) return send(res, 400, { error: 'EMPTY_TEXT' });
  if (text.length > 18000) return send(res, 413, { error: 'TEXT_TOO_LONG' });

  const instructions = `Ты бережный помощник приложения «Ритм». Анализируй только текст, который пользователь явно передал в этом запросе. Не ставь диагнозов, не называй себя терапевтом, не утверждай причинность там, где есть лишь предположение. Верни короткий ответ по-русски строго в JSON без Markdown: {"summary":"...","themes":["..."],"patterns":["..."],"gentle_next_step":"...","limits":"..."}. В limits укажи, что это интерпретация текста, а не медицинский вывод.`;
  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, reasoning: { effort: 'low' }, instructions, input: `Контекст пользователя:\n${context || 'не передан'}\n\nТекст для анализа:\n${text}`, max_output_tokens: 700 })
    });
    const data = await upstream.json();
    if (!upstream.ok) return send(res, upstream.status, { error: 'AI_UPSTREAM_ERROR', message: data?.error?.message || 'Не удалось получить ответ ИИ.' });
    return send(res, 200, { result: data.output_text || '', model });
  } catch {
    return send(res, 502, { error: 'AI_UNAVAILABLE', message: 'ИИ временно недоступен. Локальная запись осталась на устройстве.' });
  }
}

async function meditation(req, res) {
  if (!apiKey) return send(res, 503, { error: 'AI_NOT_CONFIGURED', message: 'Сервер ИИ пока не настроен.' });
  let input; try { input = await readJson(req); } catch { return send(res, 400, { error: 'INVALID_REQUEST' }); }
  if (input.consent !== true) return send(res, 403, { error: 'CONSENT_REQUIRED' });
  const request = String(input.request || '').trim().slice(0, 5000);
  const duration = Math.max(2, Math.min(30, Number(input.duration) || 8));
  if (!request) return send(res, 400, { error: 'EMPTY_REQUEST' });
  const schema = { type: 'object', additionalProperties: false, required: ['title', 'theme', 'duration', 'text'], properties: { title: { type: 'string' }, theme: { type: 'string' }, duration: { type: 'integer' }, text: { type: 'string' } } };
  const instructions = `Создай бережный сценарий медитации на русском примерно на ${duration} минут. Не ставь диагнозов, не обещай лечение, не используй давление. Нужен только спокойный текст для озвучки с короткими паузами в естественной речи. Контекст пользователя — настройка стиля, не медицинский факт: ${String(input.context || '').slice(0, 4000) || 'не передан'}.`;
  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, store: false, reasoning: { effort: 'low' }, instructions, input: request, text: { format: { type: 'json_schema', name: 'rhythm_meditation', strict: true, schema } } }) });
    const data = await upstream.json(); if (!upstream.ok) return send(res, upstream.status, { error: 'AI_UPSTREAM_ERROR', message: data?.error?.message || 'Не удалось создать сценарий.' });
    return send(res, 200, JSON.parse(data.output_text || '{}'));
  } catch { return send(res, 502, { error: 'AI_UNAVAILABLE', message: 'ИИ временно недоступен.' }); }
}

async function archive(req, res) {
  if (!apiKey) return send(res, 503, { error: 'AI_NOT_CONFIGURED', message: 'Сервер ИИ пока не настроен.' });
  let input; try { input = await readJson(req); } catch { return send(res, 400, { error: 'INVALID_REQUEST' }); }
  if (input.consent !== true) return send(res, 403, { error: 'CONSENT_REQUIRED' });
  const text = String(input.text || '').trim(); if (!text) return send(res, 400, { error: 'EMPTY_TEXT' });
  const nullableInt = { type: ['integer', 'null'] };
  const nullableNumber = { type: ['number', 'null'] };
  const schema = { type: 'object', additionalProperties: false, required: ['dreams', 'sleeps', 'checkins', 'journals'], properties: {
    dreams: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'text', 'emotion', 'tags', 'analysis'], properties: { date: { type: 'string' }, text: { type: 'string' }, emotion: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, analysis: { type: 'string' } } } },
    sleeps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'bedtime', 'wake', 'hours', 'quality', 'awakenings', 'note'], properties: { date: { type: 'string' }, bedtime: { type: 'string' }, wake: { type: 'string' }, hours: nullableNumber, quality: nullableInt, awakenings: nullableInt, note: { type: 'string' } } } },
    checkins: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'mood', 'energy', 'stress', 'calm', 'rating', 'emotions', 'note'], properties: { date: { type: 'string' }, mood: nullableInt, energy: nullableInt, stress: nullableInt, calm: nullableInt, rating: nullableInt, emotions: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } } } },
    journals: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'text'], properties: { date: { type: 'string' }, text: { type: 'string' } } } }
  } };
  const instructions = `Ты разбираешь личный архив для приложения «Ритм». Верни только записи, которые прямо есть в тексте; ничего не выдумывай. Даты строго YYYY-MM-DD, если дата неясна — не создавай соответствующую запись. Для снов сделай краткий бережный анализ образов как гипотезу, без диагнозов и утверждений о психическом состоянии. В числовые шкалы ставь числа только при явном упоминании, иначе null. Личный контекст задаёт только стиль: ${String(input.context || '').slice(0, 4000) || 'не передан'}.`;
  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, store: false, reasoning: { effort: 'low' }, instructions, input: text, text: { format: { type: 'json_schema', name: 'rhythm_archive', strict: true, schema } } }) });
    const data = await upstream.json(); if (!upstream.ok) return send(res, upstream.status, { error: 'AI_UPSTREAM_ERROR', message: data?.error?.message || 'Не удалось разобрать архив.' });
    return send(res, 200, JSON.parse(data.output_text || '{}'));
  } catch { return send(res, 502, { error: 'AI_UNAVAILABLE', message: 'ИИ временно недоступен.' }); }
}

async function meditationVoice(req, res) {
  if (!apiKey) return send(res, 503, { error: 'AI_NOT_CONFIGURED' });
  let input; try { input = await readJson(req); } catch { return send(res, 400, { error: 'INVALID_REQUEST' }); }
  if (input.consent !== true) return send(res, 403, { error: 'CONSENT_REQUIRED' });
  const text = String(input.text || '').trim().slice(0, 4096); if (!text) return send(res, 400, { error: 'EMPTY_TEXT' });
  try {
    const upstream = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'coral', input: text, response_format: 'mp3' }) });
    if (!upstream.ok) { const data = await upstream.json(); return send(res, upstream.status, { error: 'TTS_ERROR', message: data?.error?.message || 'Не удалось создать озвучку.' }); }
    const audio = Buffer.from(await upstream.arrayBuffer()); res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }); res.end(audio);
  } catch { return send(res, 502, { error: 'TTS_UNAVAILABLE' }); }
}

const captureSchema = {
  type: 'object', additionalProperties: false, required: ['proposals'],
  properties: {
    proposals: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['kind', 'title', 'text', 'source', 'date', 'time', 'category', 'mood', 'energy', 'stress', 'calm', 'rating', 'emotions', 'duration', 'habitName'],
        properties: {
          kind: { type: 'string', enum: ['dream', 'journal', 'checkin', 'task', 'habit', 'meditation', 'workout', 'inbox'] },
          title: { type: 'string' }, text: { type: 'string' }, source: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' },
          category: { type: 'string', enum: ['self', 'health', 'work'] }, mood: { type: ['integer', 'null'] }, energy: { type: ['integer', 'null'] }, stress: { type: ['integer', 'null'] }, calm: { type: ['integer', 'null'] }, rating: { type: ['integer', 'null'] },
          emotions: { type: 'array', items: { type: 'string' } }, duration: { type: ['integer', 'null'] }, habitName: { type: 'string' }
        }
      }
    }
  }
};

async function capture(req, res) {
  if (!apiKey) return send(res, 503, { error: 'AI_NOT_CONFIGURED', message: 'Сервер ИИ пока не настроен. Голос и черновик остались на устройстве.' });
  if (Number(req.headers['content-length'] || 0) > 25 * 1024 * 1024 + 1024 * 256) return send(res, 413, { error: 'AUDIO_TOO_LARGE', message: 'Аудио больше 25 МБ.' });
  let form;
  try {
    form = await new Request('http://localhost/api/capture', { method: 'POST', headers: req.headers, body: Readable.toWeb(req), duplex: 'half' }).formData();
  } catch { return send(res, 400, { error: 'INVALID_FORM' }); }
  const audio = form.get('audio');
  let transcript = String(form.get('text') || '').trim();
  const personalContext = String(form.get('personalContext') || '').trim().slice(0, 4000);
  if (audio && typeof audio === 'object' && 'size' in audio) {
    if (audio.size > 25 * 1024 * 1024) return send(res, 413, { error: 'AUDIO_TOO_LARGE', message: 'Аудио больше 25 МБ.' });
    try {
      const upload = new FormData(); upload.append('file', audio, audio.name || 'rhythm.webm'); upload.append('model', 'gpt-4o-transcribe');
      const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: upload });
      const data = await upstream.json();
      if (!upstream.ok) return send(res, upstream.status, { error: 'TRANSCRIPTION_ERROR', message: data?.error?.message || 'Не удалось расшифровать аудио.' });
      transcript = String(data.text || '').trim();
    } catch { return send(res, 502, { error: 'TRANSCRIPTION_UNAVAILABLE', message: 'Расшифровка временно недоступна.' }); }
  }
  if (!transcript) return send(res, 400, { error: 'EMPTY_CAPTURE', message: 'Нужен голос или текст.' });
  const today = new Date().toISOString().slice(0, 10);
  const instructions = `Ты бережный маршрутизатор приложения «Ритм». Раздели речь на независимые карточки. Не анализируй психику и не ставь диагнозов. Каждая карточка содержит только факты из текста. Сегодня ${today}; дату ставь сегодня, если другая дата не названа. Время задачи — только при явном упоминании, иначе пустая строка. Категория задачи self, если работа или здоровье не названы. Шкалы mood, energy, stress, calm, rating заполняй числами 1–10 только при явном значении, иначе null. Новую привычку не создавай: если привычки нет в тексте как существующей — kind inbox. Неясное и смешанное не теряй: kind inbox. source — точная часть исходной речи, text — её чистый текст. ${personalContext ? `Личный контекст — это только настройка стиля и границ, не факт о пользователе:\n${personalContext}` : ''} Верни JSON строго по схеме.`;
  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, store: false, reasoning: { effort: 'low' }, instructions, input: transcript, text: { format: { type: 'json_schema', name: 'rhythm_capture', strict: true, schema: captureSchema } } }) });
    const data = await upstream.json();
    if (!upstream.ok) return send(res, upstream.status, { error: 'AI_UPSTREAM_ERROR', message: data?.error?.message || 'Не удалось разобрать запись.' });
    const parsed = JSON.parse(data.output_text || '{}');
    const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
    return send(res, 200, { transcript, proposals, model });
  } catch { return send(res, 502, { error: 'CAPTURE_UNAVAILABLE', message: 'ИИ временно недоступен. Черновик сохранён локально.' }); }
}

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/reflect') return reflect(req, res);
  if (req.method === 'POST' && req.url === '/api/meditation') return meditation(req, res);
  if (req.method === 'POST' && req.url === '/api/archive') return archive(req, res);
  if (req.method === 'POST' && req.url === '/api/meditation/voice') return meditationVoice(req, res);
  if (req.method === 'POST' && req.url === '/api/capture') return capture(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const urlPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const path = normalize(join(root, urlPath));
  if (!path.startsWith(root) || !existsSync(path)) return send(res, 404, 'Не найдено', 'text/plain; charset=utf-8');
  const extension = extname(path);
  const cacheControl = extension === '.html' || path.endsWith('service-worker.js') ? 'no-cache' : 'public, max-age=3600';
  res.writeHead(200, { ...securityHeaders, 'Content-Type': mime[extension] || 'application/octet-stream', 'Cache-Control': cacheControl });
  if (req.method === 'HEAD') return res.end();
  createReadStream(path).pipe(res);
}).listen(port, () => console.log(`Ритм доступен на http://localhost:${port}`));
