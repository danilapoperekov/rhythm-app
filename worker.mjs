import { extractJsonText, jsonOnlyInstructions, openAICompatibleChatUrl } from './js/llm-utils.js';

const DEFAULT_ORIGINS = 'https://danilapoperekov.github.io,http://localhost:4173,http://127.0.0.1:4173';
const MAX_JSON_BYTES = 28_000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const requestWindow = new Map();

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

const captureSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposals'],
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'text', 'source', 'date', 'time', 'category', 'mood', 'energy', 'stress', 'calm', 'rating', 'emotions', 'duration', 'habitName'],
        properties: {
          kind: { type: 'string', enum: ['dream', 'journal', 'checkin', 'task', 'habit', 'meditation', 'workout', 'inbox'] },
          title: { type: 'string' },
          text: { type: 'string' },
          source: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          category: { type: 'string', enum: ['self', 'health', 'work'] },
          mood: { type: ['integer', 'null'] },
          energy: { type: ['integer', 'null'] },
          stress: { type: ['integer', 'null'] },
          calm: { type: ['integer', 'null'] },
          rating: { type: ['integer', 'null'] },
          emotions: { type: 'array', items: { type: 'string' } },
          duration: { type: ['integer', 'null'] },
          habitName: { type: 'string' }
        }
      }
    }
  }
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = new Set(String(env.RHYTHM_ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((value) => value.trim()).filter(Boolean));
  if (!origin || !allowed.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin'
  };
}

function send(request, env, status, body, headers = {}) {
  const cors = corsHeaders(request, env) || {};
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...cors, ...headers }
  });
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

function withinRateLimit(request) {
  const key = clientIp(request);
  const now = Date.now();
  const recent = (requestWindow.get(key) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 60) return false;
  recent.push(now);
  requestWindow.set(key, recent);
  return true;
}

function authorized(request, env) {
  const token = String(env.RHYTHM_ACCESS_TOKEN || '');
  if (!token) return false;
  return request.headers.get('Authorization') === `Bearer ${token}`;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new Error('json_too_large');
  return JSON.parse(text || '{}');
}

function textProvider(env) {
  return String(env.RHYTHM_LLM_PROVIDER || 'openai').trim().toLowerCase();
}

function textModel(env) {
  return env.RHYTHM_LLM_MODEL || env.RHYTHM_AI_MODEL || 'gpt-5.6-terra';
}

function isOpenAITextProvider(env) {
  return textProvider(env) === 'openai';
}

function textAIConfigured(env) {
  return isOpenAITextProvider(env) ? Boolean(env.OPENAI_API_KEY) : Boolean(env.RHYTHM_LLM_BASE_URL && textModel(env));
}

function healthPayload(env) {
  const textConfigured = textAIConfigured(env);
  const speechConfigured = Boolean(env.OPENAI_API_KEY);
  return {
    ok: true,
    ai: {
      textProvider: textProvider(env),
      textModel: textModel(env),
      textConfigured,
      speechConfigured,
      capabilities: {
        reflection: textConfigured,
        archive: textConfigured,
        meditation: textConfigured,
        captureText: textConfigured,
        transcription: speechConfigured,
        meditationVoice: speechConfigured
      }
    }
  };
}

async function textCompletion(env, body) {
  const schema = body?.text?.format?.schema;
  const schemaName = body?.text?.format?.name || 'rhythm_json';
  const maxTokens = body.max_output_tokens || (schema ? 1800 : 900);
  if (isOpenAITextProvider(env)) {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ store: false, ...body, model: body.model || textModel(env) })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: data?.error?.message || 'OpenAI request failed.' };
    }
    return { ok: true, text: data.output_text || '', data, model: textModel(env), provider: 'openai' };
  }

  const headers = { 'Content-Type': 'application/json' };
  const apiKey = env.RHYTHM_LLM_API_KEY || env.HF_TOKEN || '';
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const upstream = await fetch(openAICompatibleChatUrl(env.RHYTHM_LLM_BASE_URL), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: textModel(env),
      stream: false,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: schema ? jsonOnlyInstructions(body.instructions, schemaName) : body.instructions },
        { role: 'user', content: schema ? `${body.input}\n\nJSON Schema:\n${JSON.stringify(schema)}` : body.input }
      ]
    })
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return { ok: false, status: upstream.status, error: data?.error?.message || data?.message || 'OpenAI-compatible request failed.' };
  const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
  return { ok: true, text: schema ? extractJsonText(text) : text, data, model: textModel(env), provider: textProvider(env) };
}

async function reflect(request, env) {
  if (!textAIConfigured(env)) return send(request, env, 503, { error: 'AI_NOT_CONFIGURED', message: 'ИИ-сервер пока не настроен.' });
  let input;
  try {
    input = await readJson(request);
  } catch {
    return send(request, env, 400, { error: 'INVALID_REQUEST' });
  }
  if (input.consent !== true) return send(request, env, 403, { error: 'CONSENT_REQUIRED', message: 'Нужно явное согласие на отправку этой записи в ИИ.' });
  const text = String(input.text || '').trim();
  const context = String(input.context || '').trim().slice(0, 5000);
  if (!text) return send(request, env, 400, { error: 'EMPTY_TEXT' });
  if (text.length > 18_000) return send(request, env, 413, { error: 'TEXT_TOO_LONG' });

  const instructions = 'Ты бережный помощник приложения «Ритм». Анализируй только текст, который пользователь явно передал в этом запросе. Не ставь диагнозов, не называй себя терапевтом, не утверждай причинность там, где есть лишь предположение. Верни короткий ответ по-русски строго в JSON без Markdown: {"summary":"...","themes":["..."],"patterns":["..."],"gentle_next_step":"...","limits":"..."}. В limits укажи, что это интерпретация текста, а не медицинский вывод.';
  const upstream = await textCompletion(env, {
    model: textModel(env),
    reasoning: { effort: 'low' },
    instructions,
    input: `Контекст пользователя:\n${context || 'не передан'}\n\nТекст для анализа:\n${text}`,
    max_output_tokens: 700
  });
  if (!upstream.ok) return send(request, env, upstream.status, { error: 'AI_UPSTREAM_ERROR', message: upstream.error });
  return send(request, env, 200, { result: upstream.text, model: upstream.model, provider: upstream.provider });
}

async function meditation(request, env) {
  if (!textAIConfigured(env)) return send(request, env, 503, { error: 'AI_NOT_CONFIGURED', message: 'ИИ-сервер пока не настроен.' });
  let input;
  try {
    input = await readJson(request);
  } catch {
    return send(request, env, 400, { error: 'INVALID_REQUEST' });
  }
  if (input.consent !== true) return send(request, env, 403, { error: 'CONSENT_REQUIRED' });
  const requestText = String(input.request || '').trim().slice(0, 5000);
  const duration = Math.max(2, Math.min(30, Number(input.duration) || 8));
  if (!requestText) return send(request, env, 400, { error: 'EMPTY_REQUEST' });
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'theme', 'duration', 'text'],
    properties: {
      title: { type: 'string' },
      theme: { type: 'string' },
      duration: { type: 'integer' },
      text: { type: 'string' }
    }
  };
  const instructions = `Создай бережный сценарий медитации на русском примерно на ${duration} минут. Не ставь диагнозов, не обещай лечение, не используй давление. Нужен спокойный текст для озвучки с короткими паузами в естественной речи. Контекст пользователя задает только стиль: ${String(input.context || '').slice(0, 4000) || 'не передан'}.`;
  const upstream = await textCompletion(env, {
    model: textModel(env),
    reasoning: { effort: 'low' },
    instructions,
    input: requestText,
    text: { format: { type: 'json_schema', name: 'rhythm_meditation', strict: true, schema } }
  });
  if (!upstream.ok) return send(request, env, upstream.status, { error: 'AI_UPSTREAM_ERROR', message: upstream.error });
  return send(request, env, 200, JSON.parse(extractJsonText(upstream.text) || '{}'));
}

async function archive(request, env) {
  if (!textAIConfigured(env)) return send(request, env, 503, { error: 'AI_NOT_CONFIGURED', message: 'ИИ-сервер пока не настроен.' });
  let input;
  try {
    input = await readJson(request);
  } catch {
    return send(request, env, 400, { error: 'INVALID_REQUEST' });
  }
  if (input.consent !== true) return send(request, env, 403, { error: 'CONSENT_REQUIRED' });
  const text = String(input.text || '').trim();
  if (!text) return send(request, env, 400, { error: 'EMPTY_TEXT' });
  const nullableInt = { type: ['integer', 'null'] };
  const nullableNumber = { type: ['number', 'null'] };
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['dreams', 'sleeps', 'checkins', 'journals'],
    properties: {
      dreams: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'text', 'emotion', 'tags', 'analysis'], properties: { date: { type: 'string' }, text: { type: 'string' }, emotion: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, analysis: { type: 'string' } } } },
      sleeps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'bedtime', 'wake', 'hours', 'quality', 'awakenings', 'note'], properties: { date: { type: 'string' }, bedtime: { type: 'string' }, wake: { type: 'string' }, hours: nullableNumber, quality: nullableInt, awakenings: nullableInt, note: { type: 'string' } } } },
      checkins: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'mood', 'energy', 'stress', 'calm', 'rating', 'emotions', 'note'], properties: { date: { type: 'string' }, mood: nullableInt, energy: nullableInt, stress: nullableInt, calm: nullableInt, rating: nullableInt, emotions: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } } } },
      journals: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'text'], properties: { date: { type: 'string' }, text: { type: 'string' } } } }
    }
  };
  const instructions = `Ты разбираешь личный архив для приложения «Ритм». Верни только записи, которые прямо есть в тексте; ничего не выдумывай. Даты строго YYYY-MM-DD, если дата неясна - не создавай соответствующую запись. Для снов сделай краткий бережный анализ образов как гипотезу, без диагнозов. В числовые шкалы ставь числа только при явном упоминании, иначе null. Контекст пользователя задает только стиль: ${String(input.context || '').slice(0, 4000) || 'не передан'}.`;
  const upstream = await textCompletion(env, {
    model: textModel(env),
    reasoning: { effort: 'low' },
    instructions,
    input: text,
    text: { format: { type: 'json_schema', name: 'rhythm_archive', strict: true, schema } }
  });
  if (!upstream.ok) return send(request, env, upstream.status, { error: 'AI_UPSTREAM_ERROR', message: upstream.error });
  return send(request, env, 200, JSON.parse(extractJsonText(upstream.text) || '{}'));
}

async function meditationVoice(request, env) {
  if (!env.OPENAI_API_KEY) return send(request, env, 503, { error: 'AI_NOT_CONFIGURED' });
  let input;
  try {
    input = await readJson(request);
  } catch {
    return send(request, env, 400, { error: 'INVALID_REQUEST' });
  }
  if (input.consent !== true) return send(request, env, 403, { error: 'CONSENT_REQUIRED' });
  const text = String(input.text || '').trim().slice(0, 4096);
  if (!text) return send(request, env, 400, { error: 'EMPTY_TEXT' });
  const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'coral', input: text, response_format: 'mp3' })
  });
  if (!upstream.ok) {
    const data = await upstream.json().catch(() => ({}));
    return send(request, env, upstream.status, { error: 'TTS_ERROR', message: data?.error?.message || 'Не удалось создать озвучку.' });
  }
  const cors = corsHeaders(request, env) || {};
  return new Response(await upstream.arrayBuffer(), {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', ...cors }
  });
}

async function transcribeAudio(audio, env) {
  const upload = new FormData();
  upload.append('file', audio, audio.name || 'rhythm.webm');
  upload.append('model', 'gpt-4o-transcribe');
  const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: upload
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, error: data?.error?.message || 'Не удалось расшифровать аудио.' };
  }
  return { ok: true, text: String(data.text || '').trim() };
}

async function capture(request, env) {
  if (!textAIConfigured(env)) return send(request, env, 503, { error: 'AI_NOT_CONFIGURED', message: 'ИИ-сервер пока не настроен. Голос и черновик остались на устройстве.' });
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_AUDIO_BYTES + 262_144) return send(request, env, 413, { error: 'AUDIO_TOO_LARGE', message: 'Аудио больше 25 МБ.' });

  let form;
  try {
    form = await request.formData();
  } catch {
    return send(request, env, 400, { error: 'INVALID_FORM' });
  }

  const audio = form.get('audio');
  let transcript = String(form.get('text') || '').trim();
  const personalContext = String(form.get('personalContext') || '').trim().slice(0, 4000);
  if (audio && typeof audio === 'object' && 'size' in audio) {
    if (!env.OPENAI_API_KEY) return send(request, env, 503, { error: 'TRANSCRIPTION_NOT_CONFIGURED', message: 'Для расшифровки голоса нужен OpenAI-ключ. Текстовый разбор может работать через локальную модель.' });
    if (audio.size > MAX_AUDIO_BYTES) return send(request, env, 413, { error: 'AUDIO_TOO_LARGE', message: 'Аудио больше 25 МБ.' });
    const transcription = await transcribeAudio(audio, env);
    if (!transcription.ok) return send(request, env, transcription.status, { error: 'TRANSCRIPTION_ERROR', message: transcription.error });
    transcript = transcription.text;
  }
  if (!transcript) return send(request, env, 400, { error: 'EMPTY_CAPTURE', message: 'Нужен голос или текст.' });

  const today = new Date().toISOString().slice(0, 10);
  const instructions = `Ты бережный маршрутизатор приложения «Ритм». Раздели речь на независимые карточки. Не анализируй психику и не ставь диагнозов. Каждая карточка содержит только факты из текста. Сегодня ${today}; дату ставь сегодня, если другая дата не названа. Время задачи - только при явном упоминании. Категория задачи self, если работа или здоровье не названы. Шкалы mood, energy, stress, calm, rating заполняй числами 1-10 только при явном значении, иначе null. Новую привычку не создавай: если привычки нет в тексте как существующей - kind inbox. Неясное и смешанное не теряй: kind inbox. source - точная часть исходной речи, text - ее чистый текст. ${personalContext ? `Личный контекст задает только стиль и границы, не факт о пользователе:\n${personalContext}` : ''} Верни JSON строго по схеме.`;
  const upstream = await textCompletion(env, {
    model: textModel(env),
    reasoning: { effort: 'low' },
    instructions,
    input: transcript,
    text: { format: { type: 'json_schema', name: 'rhythm_capture', strict: true, schema: captureSchema } }
  });
  if (!upstream.ok) return send(request, env, upstream.status, { error: 'AI_UPSTREAM_ERROR', message: upstream.error });
  const parsed = JSON.parse(extractJsonText(upstream.text) || '{}');
  return send(request, env, 200, { transcript, proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [], model: upstream.model, provider: upstream.provider });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const cors = corsHeaders(request, env);
  if (request.headers.get('Origin') && !cors) return send(request, env, 403, { error: 'ORIGIN_NOT_ALLOWED' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors || {} });
  if (!path.startsWith('/api/')) return send(request, env, 404, { error: 'NOT_FOUND' });
  if (!env.RHYTHM_ACCESS_TOKEN) return send(request, env, 503, { error: 'ACCESS_TOKEN_NOT_CONFIGURED', message: 'Серверу нужен личный токен доступа.' });
  if (!authorized(request, env)) return send(request, env, 401, { error: 'AUTH_REQUIRED', message: 'Нужен личный токен приложения.' });
  if (!withinRateLimit(request)) return send(request, env, 429, { error: 'RATE_LIMITED', message: 'Слишком много запросов, попробуйте через минуту.' });
  if (request.method === 'GET' && path === '/api/health') return send(request, env, 200, healthPayload(env));
  if (request.method !== 'POST') return send(request, env, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (path === '/api/reflect') return reflect(request, env);
  if (path === '/api/meditation') return meditation(request, env);
  if (path === '/api/archive') return archive(request, env);
  if (path === '/api/meditation/voice') return meditationVoice(request, env);
  if (path === '/api/capture') return capture(request, env);
  return send(request, env, 404, { error: 'NOT_FOUND' });
}

export default {
  fetch(request, env) {
    return route(request, env).catch(() => send(request, env, 500, { error: 'SERVER_ERROR', message: 'ИИ-сервер временно недоступен.' }));
  }
};
