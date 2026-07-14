import { normalizeCaptureProposal, normalizeLocalState, splitTextForAnalysis, validBackup } from './js/core.js';
import { blobToDataUrl as audioBlobToDataUrl, dataUrlToBlob as audioDataUrlToBlob, deleteAudioRecord, getAllAudioRecords, getAudioBlob, putAudioRecords, saveAudioBlob } from './js/audio-store.js';
import { createEncryptedBackup, decryptEncryptedBackup, isEncryptedBackup } from './js/backup-crypto.js';

(() => {
  'use strict';

  const STORAGE_KEY = 'rhythm-personal-data-v1';
  const MOODS = [
    { value: 1, emoji: '😞', label: 'Тяжело' },
    { value: 2, emoji: '😕', label: 'Не очень' },
    { value: 3, emoji: '😌', label: 'Ровно' },
    { value: 4, emoji: '🙂', label: 'Хорошо' },
    { value: 5, emoji: '✨', label: 'Отлично' }
  ];
  const COLORS = ['#dce8d2', '#f3dfc9', '#c8dce6', '#ddd5e7', '#f2e4a7'];
  const MEDITATION_LIBRARY = [
    { id: 'morning', title: 'Мягкое пробуждение', duration: 5, theme: 'утро', text: 'Сделайте спокойный вдох. Почувствуйте опору тела. Не нужно сразу становиться продуктивным. Заметьте свет, дыхание и одну простую вещь, которая важна сегодня.' },
    { id: 'anxiety', title: 'Вернуться в момент', duration: 7, theme: 'тревога', text: 'Посмотрите вокруг и назовите про себя три спокойных предмета. Вдохните чуть медленнее. Тревога может быть рядом, но вам не нужно решать всё прямо сейчас.' },
    { id: 'sleep', title: 'Перед сном', duration: 10, theme: 'сон', text: 'День уже завершён. Отпустите список дел до завтрашнего утра. На выдохе разрешите плечам опуститься. Пусть мысли проходят, не требуя ответа.' },
    { id: 'focus', title: 'Тихий фокус', duration: 8, theme: 'творчество', text: 'Выберите одно дело, к которому хотите вернуться. Не весь путь — только ближайший шаг. Дышите ровно и позвольте вниманию стать немного тише.' }
  ];
  const AMBIENT_LIBRARY = [
    { id: 'warm', title: 'Тёплый фон', note: 'мягкий низкий тон' },
    { id: 'rain', title: 'Тихий дождь', note: 'ровный шум без мелодии' },
    { id: 'night', title: 'Ночное пространство', note: 'глубокий спокойный фон' }
  ];
  const ICONS = ['🧘', '💧', '📖', '🚶', '✍️', '🏃', '🌿', '🎯'];
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WEEK_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const app = document.querySelector('#app');
  const modalRoot = document.querySelector('#modal-root');
  let currentView = location.hash.replace('#', '') || 'today';
  let deferredInstallPrompt = null;
  let pendingEncryptedBackup = null;
  let selectedDate = dateKey(new Date());
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedTaskId = null;
  let planMode = 'today';
  let planFilter = 'today';

  function dateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, count) {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function esc(value = '') {
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function createInitialState() {
    const today = new Date();
    const sleeps = {};
    const checkins = {};
    const sleepHours = [7.1, 7.8, 6.6, 8.2, 7.4, 7.7, 7.9];
    const qualities = [3, 4, 3, 5, 4, 4, 4];
    for (let i = 6; i >= 0; i--) {
      const key = dateKey(addDays(today, -i));
      sleeps[key] = {
        date: key,
        bedtime: i % 3 === 0 ? '23:35' : '23:10',
        wake: i % 2 === 0 ? '07:05' : '07:25',
        hours: sleepHours[6 - i],
        quality: qualities[6 - i],
        awakenings: i % 4 === 0 ? 2 : 1,
        note: ''
      };
      if (i > 0) checkins[key] = { mood: [3, 4, 3, 5, 4, 4][6 - i] || 4, energy: 6 + (i % 3), stress: 3 + (i % 2), emotions: ['спокойствие'], note: '', rating: 7 };
    }
    const todayKey = dateKey(today);
    return {
      version: 1,
      profile: { name: '', sleepGoal: 8, onboardingDone: false, aiContext: { tone: '', goals: '', boundaries: '', share: false } },
      sleeps,
      checkins,
      habits: [
        { id: 'meditation', name: 'Медитация', icon: '🧘', color: COLORS[0], goal: '10 минут', dates: [dateKey(addDays(today, -1)), dateKey(addDays(today, -2)), dateKey(addDays(today, -3)), dateKey(addDays(today, -5))] },
        { id: 'water', name: 'Вода', icon: '💧', color: COLORS[2], goal: '6 стаканов', dates: [todayKey, dateKey(addDays(today, -1)), dateKey(addDays(today, -2)), dateKey(addDays(today, -3)), dateKey(addDays(today, -4))] },
        { id: 'reading', name: 'Чтение', icon: '📖', color: COLORS[1], goal: '20 минут', dates: [dateKey(addDays(today, -1)), dateKey(addDays(today, -3)), dateKey(addDays(today, -4))] }
      ],
      tasks: [
        { id: uid('task'), title: 'Утренняя медитация', date: todayKey, time: '08:30', category: 'self', done: false },
        { id: uid('task'), title: 'Прогулка без телефона', date: todayKey, time: '18:30', category: 'health', done: false },
        { id: uid('task'), title: 'Подвести итоги дня', date: todayKey, time: '21:45', category: 'self', done: false },
        { id: uid('task'), title: 'Спланировать неделю', date: dateKey(addDays(today, 2)), time: '10:00', category: 'work', done: false }
      ],
      meditations: [
        { id: uid('med'), date: dateKey(addDays(today, -1)), duration: 12, technique: 'Дыхание', note: 'Стало спокойнее и легче сосредоточиться.' }
      ],
      dreams: [
        { id: uid('dream'), date: dateKey(addDays(today, -1)), text: 'Мне снился незнакомый город, в котором я искал дорогу домой. В конце стало спокойно.', vividness: 4, emotion: 'спокойствие', tags: ['дорога', 'дом'], analyzed: false }
      ],
      reflections: [],
      workouts: [],
      journals: [
        { id: uid('entry'), date: dateKey(addDays(today, -1)), text: 'Сегодня получилось замедлиться и внимательнее отнестись к своему состоянию. Вечерняя прогулка хорошо переключила мысли.', gratitude: 'За тихий вечер', win: 'Закончил важное дело', tags: ['спокойствие', 'прогулка'] }
      ],
      preferences: { weekStartsMonday: true, notifications: false, demo: true }
    };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeLocalState(JSON.parse(saved), createInitialState()) : createInitialState();
    } catch (error) {
      console.warn('Не удалось прочитать данные', error);
      return createInitialState();
    }
  }

  let state = loadState();
  state.dreams ||= [];
  state.reflections ||= [];
  state.journals ||= [];
  state.meditations ||= [];
  state.workouts ||= [];
  state.captures ||= [];
  state.inbox ||= [];
  state.meditationLibrary ||= [];
  state.profile.aiContext ||= { tone: '', goals: '', boundaries: '', share: false };
  state.profile.onboardingDone ||= Boolean(state.profile.name);
  let meditationSeconds = 600;
  let meditationSessionSeconds = 600;
  let meditationTimer = null;
  let meditationRunning = false;
  let voiceRecorder = null;
  let voiceStream = null;
  let voiceChunks = [];
  let assistantRecorder = null;
  let assistantStream = null;
  let assistantChunks = [];
  let assistantDiscarding = false;

  function saveState(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (message) toast(message);
  }

  function aiContextText() {
    const context = state.profile.aiContext;
    if (!context?.share) return '';
    return [`Как обращаться и поддерживать: ${context.tone || 'не указано'}`, `Цели и приоритеты: ${context.goals || 'не указано'}`, `Границы: ${context.boundaries || 'не указано'}`].join('\n');
  }

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.querySelector('#toast-root').append(el);
    setTimeout(() => el.remove(), 2800);
  }

  function formatDate(key, full = false) {
    const d = fromKey(key);
    if (full) return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEK_SHORT[d.getDay()].toLowerCase()}`;
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  }

  function currentQuestion() {
    const morning = [
      { theme: 'Энергия', question: 'Какое ощущение ты хочешь пронести через этот день?' },
      { theme: 'Внимание', question: 'Что для тебя сегодня действительно важно заметить?' },
      { theme: 'Опора', question: 'На что в себе ты можешь сегодня опереться?' }
    ];
    const daytime = [
      { theme: 'Состояние', question: 'Что сейчас незаметно забирает твою энергию?' },
      { theme: 'Границы', question: 'Чего тебе сейчас хочется меньше — и чего больше?' },
      { theme: 'Творчество', question: 'Где сегодня появилось хотя бы немного живого интереса?' }
    ];
    const evening = [
      { theme: 'Интеграция', question: 'В какой момент сегодня ты был наиболее собой?' },
      { theme: 'Поддержка', question: 'Что сегодня помогло тебе удержаться в своём ритме?' },
      { theme: 'Завершение', question: 'Что можно оставить в сегодняшнем дне, не таща дальше?' }
    ];
    const hour = new Date().getHours();
    const set = hour < 11 ? morning : hour < 18 ? daytime : evening;
    return set[new Date().getDay() % set.length];
  }

  function formatTimer(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function archiveDate(value) {
    const iso = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    const ru = value.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2}|\d{2})\b/);
    if (ru) return `${ru[3].length === 2 ? `20${ru[3]}` : ru[3]}-${String(ru[2]).padStart(2, '0')}-${String(ru[1]).padStart(2, '0')}`;
    return dateKey(new Date());
  }

  function extractArchiveEntries(source) {
    let chunks = [];
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        chunks = parsed.flatMap((conversation) => Object.values(conversation.mapping || {}).map((node) => {
          const message = node?.message;
          const parts = message?.content?.parts;
          if (!Array.isArray(parts)) return '';
          const text = parts.filter((part) => typeof part === 'string').join('\n').trim();
          return text ? `${conversation.create_time ? new Date(conversation.create_time * 1000).toISOString().slice(0, 10) : ''}\n${text}` : '';
        })).filter(Boolean);
      }
    } catch (_) {
      chunks = source.split(/\n(?=(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[./]\d{1,2}[./](?:20)?\d{2})\b)|\n\s*\n+/).map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 20);
    }
    if (!chunks.length && source.trim().length > 20) chunks = [source.trim()];
    return chunks.map((text) => ({
      date: archiveDate(text),
      text,
      isDream: /\b(сон|снилось|приснил|dream)\b/i.test(text.slice(0, 300))
    }));
  }

  function saveVoiceBlob(blob) {
    return saveAudioBlob(uid('audio'), blob);
  }

  async function analyzeArchiveWithAI(source) {
    const chunks = splitTextForAnalysis(source);
    if (!chunks.length) throw new Error('В файле нет текста для разбора');
    if (chunks.length > 16) throw new Error('Файл слишком большой для одного импорта; разделите его на части до 288 000 символов');
    const collected = { dreams: [], sleeps: [], checkins: [], journals: [] };
    for (let index = 0; index < chunks.length; index += 1) {
      toast(`ИИ разбирает часть ${index + 1} из ${chunks.length}…`);
      const response = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, text: chunks[index], context: aiContextText() }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message || 'Не удалось разобрать файл');
      ['dreams', 'sleeps', 'checkins', 'journals'].forEach((key) => collected[key].push(...(Array.isArray(payload[key]) ? payload[key] : [])));
    }
    collected.dreams.forEach((item) => { if (item.date && item.text) state.dreams.push({ id: uid('dream'), date: item.date, text: item.text, vividness: 3, emotion: item.emotion || '', tags: item.tags || [], analysis: item.analysis || '', analyzed: Boolean(item.analysis) }); });
    collected.sleeps.forEach((item) => { if (item.date && Number.isFinite(item.hours)) state.sleeps[item.date] = { date: item.date, hours: item.hours, bedtime: item.bedtime || '', wake: item.wake || '', quality: item.quality || 0, awakenings: item.awakenings || 0, note: item.note || '' }; });
    collected.checkins.forEach((item) => { if (item.date) state.checkins[item.date] = { mood: item.mood || 3, energy: item.energy || 6, stress: item.stress || 4, calm: item.calm || 5, rating: item.rating || 7, emotions: item.emotions || [], note: item.note || '' }; });
    collected.journals.forEach((item) => { if (item.date && item.text) state.journals.push({ id: uid('entry'), date: item.date, text: item.text, gratitude: '', win: '', tags: ['импорт ИИ'] }); });
    saveState(`Импортировано: ${collected.dreams.length} снов, ${collected.sleeps.length} отметок сна, ${collected.checkins.length} состояний`);
  }

  function getVoiceBlob(id) {
    return getAudioBlob(id);
  }

  function getAllVoiceRecordings() {
    return getAllAudioRecords();
  }

  function putVoiceRecordings(records) {
    return putAudioRecords(records);
  }

  function blobToDataUrl(blob) {
    return audioBlobToDataUrl(blob);
  }

  function dataUrlToBlob(dataUrl) {
    return audioDataUrlToBlob(dataUrl);
  }

  async function playVoiceRecording(id) {
    try {
      const blob = await getVoiceBlob(id);
      if (!blob) { toast('Эта голосовая запись не найдена на устройстве'); return; }
      const url = URL.createObjectURL(blob);
      const player = new Audio(url);
      player.onended = () => URL.revokeObjectURL(url);
      await player.play();
    } catch (_) {
      toast('Не удалось воспроизвести голосовую запись');
    }
  }

  function updateVoiceUI(recording, message) {
    const button = document.querySelector('[data-voice-record]');
    const status = document.querySelector('#voice-status');
    if (button) button.textContent = recording ? '■ Остановить запись' : '◉ Надиктовать сон';
    if (status) status.textContent = message;
  }

  async function toggleVoiceRecording() {
    if (voiceRecorder?.state === 'recording') {
      voiceRecorder.stop();
      updateVoiceUI(false, 'Сохраняю запись локально…');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      updateVoiceUI(false, 'Запись голоса доступна в нативной iPhone-версии или в браузере с разрешением на микрофон.');
      return;
    }
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunks = [];
      voiceRecorder = new MediaRecorder(voiceStream);
      voiceRecorder.ondataavailable = (event) => { if (event.data.size) voiceChunks.push(event.data); };
      voiceRecorder.onstop = async () => {
        try {
          const blob = new Blob(voiceChunks, { type: voiceRecorder.mimeType || 'audio/webm' });
          const id = await saveVoiceBlob(blob);
          const field = document.querySelector('#dream-audio-id');
          if (field) field.value = id;
          updateVoiceUI(false, 'Голосовая заметка сохранена на этом устройстве.');
        } catch (_) {
          updateVoiceUI(false, 'Не удалось сохранить запись. Текст сна всё равно можно добавить вручную.');
        } finally {
          voiceStream?.getTracks().forEach((track) => track.stop());
          voiceStream = null;
        }
      };
      voiceRecorder.start();
      updateVoiceUI(true, 'Идёт запись. Расскажите сон свободно.');
    } catch (_) {
      updateVoiceUI(false, 'Микрофон не разрешён. Можно продолжить текстом.');
    }
  }

  function assistantStatus(message) {
    const status = document.querySelector('#assistant-status');
    if (status) status.textContent = message;
  }

  function createCapture({ audioId = null, transcript = '', status = 'draft' } = {}) {
    const capture = { id: uid('capture'), audioId, transcript, createdAt: new Date().toISOString(), status, proposals: [], savedProposalIndexes: [] };
    state.captures.push(capture);
    saveState();
    return capture;
  }

  async function processCapture(capture) {
    capture.status = 'processing'; saveState();
    assistantStatus('Расшифровываю и разбираю запись…');
    try {
      const form = new FormData();
      if (capture.audioId) {
        const audio = await getVoiceBlob(capture.audioId);
        if (!audio) throw new Error('AUDIO_MISSING');
        form.append('audio', audio, `rhythm-${capture.id}.webm`);
      }
      if (capture.transcript) form.append('text', capture.transcript);
      const context = aiContextText();
      if (context) form.append('personalContext', context);
      const response = await fetch('/api/capture', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || 'AI_UNAVAILABLE');
      capture.transcript = payload.transcript || capture.transcript;
      capture.proposals = Array.isArray(payload.proposals) ? payload.proposals.map(normalizeCaptureProposal) : [];
      capture.status = 'review'; saveState(); renderAssistantResults(capture.id);
    } catch (error) {
      capture.status = 'failed'; capture.error = error.message; saveState();
      assistantStatus('Не удалось обработать запись. Аудио и черновик остались локально — попробуйте позже или сохраните текст как заметку.');
      renderAssistantResults(capture.id);
    }
  }

  function proposalLabel(kind) {
    return ({ dream: 'Сон', journal: 'Дневниковая мысль', checkin: 'Состояние', task: 'Задача', habit: 'Привычка', meditation: 'Медитация', workout: 'Тренировка', inbox: 'Входящие' })[kind] || 'Входящие';
  }

  function renderAssistantResults(captureId) {
    const host = document.querySelector('#assistant-results');
    const capture = state.captures.find((item) => item.id === captureId);
    if (!host || !capture) return;
    host.hidden = false;
    if (capture.status === 'failed') {
      host.innerHTML = `<div class="assistant-card assistant-inbox"><h3>Черновик сохранён локально</h3><label>Расшифровка или текст</label><textarea data-capture-transcript="${capture.id}" style="min-height:100px">${esc(capture.transcript)}</textarea><div class="form-actions"><button type="button" class="btn btn-secondary" data-assistant-retry="${capture.id}">Повторить обработку</button><button type="button" class="btn btn-primary" data-assistant-save-inbox="${capture.id}">Сохранить во «Входящие»</button></div></div>`;
      return;
    }
    const cards = capture.proposals.map((proposal, index) => `<article class="assistant-card" data-assistant-card="${capture.id}:${index}"><div class="assistant-card-head"><h3>${proposalLabel(proposal.kind)}</h3><label><input type="checkbox" name="assistant-selected" value="${index}" checked> сохранить</label></div><label>Вы сказали</label><p>${esc(proposal.source || capture.transcript)}</p><div class="assistant-proposal"><label>Предложение ИИ</label><input name="title" value="${esc(proposal.title || '')}" placeholder="Короткое название"><textarea name="text" style="min-height:72px">${esc(proposal.text || '')}</textarea><div class="form-grid"><div class="field"><label>Дата</label><input name="date" type="date" value="${esc(proposal.date || dateKey(new Date()))}"></div>${proposal.kind === 'task' ? `<div class="field"><label>Время</label><input name="time" type="time" value="${esc(proposal.time || '')}"></div><div class="field"><label>Раздел</label><select name="category"><option value="self" ${proposal.category !== 'work' && proposal.category !== 'health' ? 'selected' : ''}>Личное</option><option value="health" ${proposal.category === 'health' ? 'selected' : ''}>Здоровье</option><option value="work" ${proposal.category === 'work' ? 'selected' : ''}>Работа</option></select></div>` : ''}</div></div></article>`).join('');
    host.innerHTML = `<div class="assistant-card"><h3>Расшифровка</h3><label>Вы сказали</label><textarea data-capture-transcript="${capture.id}" style="min-height:90px">${esc(capture.transcript)}</textarea></div><div class="assistant-result-list">${cards || '<div class="assistant-card assistant-inbox"><h3>Не удалось уверенно определить раздел</h3><p>Эта запись останется во «Входящих» — вы сможете разобрать её позже.</p></div>'}</div><div class="form-actions"><button type="button" class="btn btn-secondary" data-assistant-save-inbox="${capture.id}">Во «Входящие»</button><button type="button" class="btn btn-primary" data-assistant-save="${capture.id}">Сохранить выбранное</button></div>`;
  }

  function saveProposal(kind, values, capture, proposal = {}) {
    const date = values.date || dateKey(new Date());
    const text = values.text.trim();
    if (kind === 'dream') state.dreams.push({ id: uid('dream'), date, text, audioId: capture.audioId || null, vividness: 3, emotion: '', tags: [], analyzed: false });
    else if (kind === 'journal') state.journals.push({ id: uid('entry'), date, text, gratitude: '', win: '', tags: [] });
    else if (kind === 'task') state.tasks.push({ id: uid('task'), title: values.title.trim() || text.slice(0, 80) || 'Новая задача', date, time: values.time || '', category: values.category || 'self', done: false });
    else if (kind === 'meditation') { state.meditations.push({ id: uid('med'), date, duration: Number(proposal.duration) || 10, technique: values.title.trim() || 'Практика', note: text }); }
    else if (kind === 'workout') { state.workouts.push({ id: uid('workout'), date, duration: Number(proposal.duration) || 30, title: values.title.trim() || 'Тренировка', note: text, exercises: [] }); }
    else if (kind === 'checkin') {
      const previous = state.checkins[date] || { mood: 3, energy: 6, stress: 4, calm: 5, rating: 7, emotions: [], note: '' };
      const explicit = (value, fallback) => Number.isInteger(value) && value >= 1 && value <= 10 ? value : fallback;
      state.checkins[date] = { ...previous, mood: explicit(proposal.mood, previous.mood), energy: explicit(proposal.energy, previous.energy), stress: explicit(proposal.stress, previous.stress), calm: explicit(proposal.calm, previous.calm), rating: explicit(proposal.rating, previous.rating), emotions: Array.isArray(proposal.emotions) && proposal.emotions.length ? proposal.emotions : previous.emotions, note: text || previous.note || '' };
    }
    else if (kind === 'habit') { const habitName = values.title.trim() || proposal.habitName || ''; const habit = state.habits.find((item) => item.name.toLowerCase() === habitName.toLowerCase()); if (habit) { if (!habit.dates.includes(date)) habit.dates.push(date); } else state.inbox.push({ id: uid('inbox'), date, text, title: habitName || 'Новая привычка — подтвердите', source: 'assistant' }); }
    else state.inbox.push({ id: uid('inbox'), date, text, title: values.title, source: 'assistant' });
  }

  async function toggleAssistantRecording() {
    if (assistantRecorder?.state === 'recording') { assistantRecorder.stop(); assistantStatus('Сохраняю голос на устройстве…'); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { assistantStatus('Микрофон недоступен. Можно вставить текст ниже.'); return; }
    try {
      assistantStream = await navigator.mediaDevices.getUserMedia({ audio: true }); assistantChunks = [];
      assistantRecorder = new MediaRecorder(assistantStream);
      assistantRecorder.ondataavailable = (event) => { if (event.data.size) assistantChunks.push(event.data); };
      assistantRecorder.onstop = async () => { if (assistantDiscarding) { assistantDiscarding = false; assistantStream?.getTracks().forEach((track) => track.stop()); assistantStream = null; return; } try { const blob = new Blob(assistantChunks, { type: assistantRecorder.mimeType || 'audio/webm' }); if (blob.size > 25 * 1024 * 1024) throw new Error('Аудио больше 25 МБ'); const capture = createCapture({ audioId: await saveVoiceBlob(blob) }); await processCapture(capture); } catch (error) { assistantStatus(`${error.message || 'Не удалось сохранить запись'}. Текст можно добавить вручную.`); } finally { assistantStream?.getTracks().forEach((track) => track.stop()); assistantStream = null; } };
      assistantRecorder.start(); assistantStatus('Идёт запись. Можно говорить о чём угодно.');
    } catch (_) { assistantStatus('Микрофон не разрешён. Можно продолжить текстом.'); }
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 6) return 'Доброй ночи';
    if (hour < 12) return 'Доброе утро';
    if (hour < 18) return 'Добрый день';
    return 'Добрый вечер';
  }

  function average(items) {
    if (!items.length) return 0;
    return items.reduce((sum, item) => sum + Number(item || 0), 0) / items.length;
  }

  function getRecentDays(count = 7, end = new Date()) {
    return Array.from({ length: count }, (_, i) => addDays(end, i - count + 1));
  }

  function getStreak(habit) {
    let streak = 0;
    let cursor = new Date();
    if (!habit.dates.includes(dateKey(cursor))) cursor = addDays(cursor, -1);
    while (habit.dates.includes(dateKey(cursor))) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function pageHeader(eyebrow, title, subtitle, action = '') {
    return `<header class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="head-actions">${action}</div></header>`;
  }

  function renderToday() {
    const today = dateKey(new Date());
    const sleep = state.sleeps[today] || Object.values(state.sleeps).sort((a, b) => b.date.localeCompare(a.date))[0];
    const checkin = state.checkins[today];
    const doneHabits = state.habits.filter((habit) => habit.dates.includes(today)).length;
    const todayTasks = state.tasks.filter((task) => task.date === today).sort((a, b) => a.time.localeCompare(b.time));
    const recentSleep = getRecentDays().map((d) => state.sleeps[dateKey(d)]?.hours).filter(Boolean);
    const sleepAvg = average(recentSleep).toFixed(1).replace('.', ',');
    const firstName = state.profile.name ? `, ${esc(state.profile.name)}` : '';
    const moodButtons = MOODS.map((m) => `<button class="mood-btn ${checkin?.mood === m.value ? 'selected' : ''}" data-mood="${m.value}"><span>${m.emoji}</span><small>${m.label}</small></button>`).join('');
    const habitRows = state.habits.slice(0, 4).map((habit) => {
      const done = habit.dates.includes(today);
      return `<div class="habit-row"><div class="habit-icon" style="background:${habit.color}">${habit.icon}</div><div><div class="habit-name">${esc(habit.name)}</div><div class="habit-meta">${esc(habit.goal)} · серия ${getStreak(habit)} дн.</div></div><button class="habit-check ${done ? 'done' : ''}" data-habit-toggle="${habit.id}" data-date="${today}" aria-label="Отметить ${esc(habit.name)}">${done ? '✓' : ''}</button></div>`;
    }).join('');
    const taskItems = todayTasks.length ? todayTasks.map((task) => `<div class="timeline-item ${task.done ? 'task-done' : ''}"><div class="timeline-time">${task.time || 'Весь день'}</div><div class="timeline-line"><span class="timeline-dot" style="background:${task.category === 'health' ? '#86a97a' : task.category === 'work' ? '#7ca0b4' : '#ef9a62'}"></span></div><div><div class="timeline-title">${esc(task.title)}</div><div class="timeline-desc">${task.done ? 'Выполнено' : 'Запланировано'}</div></div></div>`).join('') : '<div class="agenda-empty">Сегодня пока свободно</div>';
    const habitPercent = state.habits.length ? Math.round(doneHabits / state.habits.length * 100) : 0;
    const insight = buildInsight();
    const hasDream = state.dreams.some((dream) => dream.date === today);
    const hasJournal = state.journals.some((entry) => entry.date === today) || state.reflections.some((entry) => entry.date === today);
    const taskProgress = todayTasks.length ? Math.round(todayTasks.filter((task) => task.done).length / todayTasks.length * 100) : 0;
    const pulseLabel = checkin
      ? `${MOODS.find((m) => m.value === checkin.mood)?.emoji || '◌'} ${checkin.energy}/10 энергии`
      : 'состояние ещё не отмечено';
    const ritualCards = [
      {
        phase: 'Утро', icon: '☾', title: hasDream ? 'Сон уже сохранён' : 'Поймать образ сна',
        text: hasDream ? 'Ваша утренняя заметка в личной истории.' : 'Голосом, без необходимости собираться с мыслями.',
        action: hasDream ? 'Открыть дневник' : 'Записать голосом', target: hasDream ? 'data-nav="journal"' : 'data-modal="dream"', done: hasDream,
      },
      {
        phase: 'Сейчас', icon: '◌', title: checkin ? 'Состояние отмечено' : 'Назвать своё состояние',
        text: checkin ? `Энергия ${checkin.energy}/10 · тревога ${checkin.stress}/10.` : 'Одно ощущение — уже достаточно для начала.',
        action: checkin ? 'Уточнить' : 'Отметить', target: 'data-modal="checkin"', done: Boolean(checkin),
      },
      {
        phase: 'Вечер', icon: '✦', title: hasJournal ? 'День уже услышан' : 'Оставить след дня',
        text: hasJournal ? 'Мысль или ответ сохранены локально.' : 'Не отчёт — короткая честная точка в конце дня.',
        action: hasJournal ? 'Открыть запись' : 'Записать мысль', target: hasJournal ? 'data-nav="journal"' : 'data-modal="journal"', done: hasJournal,
      },
    ];
    const setupCard = state.profile.onboardingDone ? '' : `<section class="card start-card"><div><div class="eyebrow">Первый спокойный шаг</div><h2>Настроить «Ритм» под себя</h2><p>Имя, ориентир сна и одна важная цель. Это останется на устройстве; ИИ не получит их без отдельного разрешения.</p></div><button class="btn btn-primary" data-modal="setup">Начать настройку</button></section>`;

    app.innerHTML = `<div class="page">
      ${pageHeader(formatDate(today, true), `${greeting()}${firstName}`, 'Здесь день становится заметным — без давления и лишнего шума.', '<button class="btn btn-secondary" data-modal="dream">☾ Сон</button><button class="btn btn-primary" data-modal="checkin">Записать состояние</button>')}
      ${setupCard}
      <section class="day-hero">
        <div class="day-hero-copy"><div class="eyebrow">Личный ритм · сегодня</div><h2>Ваш день — не список дел.<br>Это пространство, в котором можно быть.</h2><p>Сохраните то, что важно сейчас. Остальное подождёт.</p><div class="hero-actions"><button class="btn btn-light" data-modal="journal">✦ Оставить мысль</button><button class="hero-link" data-nav="insights">Посмотреть связи →</button></div></div>
        <div class="day-constellation" aria-label="Карта сегодняшнего ритма">
          <div class="constellation-core"><span>${checkin ? checkin.energy : '—'}</span><small>${checkin ? 'энергия' : 'пауза'}</small></div>
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="orbit-node node-sleep ${sleep ? 'is-filled' : ''}"><span>☾</span><small>${sleep ? `${String(sleep.hours).replace('.', ',')} ч сна` : 'сон'}</small></div>
          <div class="orbit-node node-feeling ${checkin ? 'is-filled' : ''}"><span>${checkin ? MOODS.find((m) => m.value === checkin.mood)?.emoji || '◌' : '◌'}</span><small>${checkin ? 'состояние' : 'ощущение'}</small></div>
          <div class="orbit-node node-plan ${todayTasks.length ? 'is-filled' : ''}"><span>□</span><small>${todayTasks.length ? `${todayTasks.length} в плане` : 'планы'}</small></div>
          <div class="orbit-node node-ritual ${doneHabits ? 'is-filled' : ''}"><span>✦</span><small>${doneHabits ? `${doneHabits} ритуала` : 'ритуал'}</small></div>
        </div>
      </section>
      <section class="ritual-strip" aria-label="Ритуалы дня">${ritualCards.map((ritual) => `<article class="ritual-card ${ritual.done ? 'complete' : ''}"><div class="ritual-top"><span class="ritual-icon">${ritual.icon}</span><span>${ritual.phase}</span>${ritual.done ? '<i>готово</i>' : ''}</div><h3>${ritual.title}</h3><p>${ritual.text}</p><button class="ritual-action" ${ritual.target}>${ritual.action} <span>→</span></button></article>`).join('')}</section>
      <div class="grid summary-grid rhythm-summary">
        <article class="card summary-card"><div class="summary-label"><span class="dot-icon">☾</span>Сон</div><div><div class="summary-value">${sleep ? `${String(sleep.hours).replace('.', ',')} ч` : '—'}</div><div class="summary-meta">Среднее за неделю ${sleepAvg} ч</div></div></article>
        <article class="card summary-card"><div class="summary-label"><span class="dot-icon">◉</span>Состояние</div><div><div class="summary-value">${checkin ? `${MOODS.find((m) => m.value === checkin.mood)?.emoji || '😌'} ${checkin.energy}/10` : '—'}</div><div class="summary-meta">${pulseLabel}</div></div></article>
        <article class="card summary-card"><div class="summary-label"><span class="dot-icon">✓</span>Ритм дня</div><div><div class="summary-value">${todayTasks.length ? `${taskProgress}%` : `${doneHabits}/${state.habits.length}`}</div><div class="summary-meta">${todayTasks.length ? `${todayTasks.filter((task) => task.done).length} из ${todayTasks.length} задач завершено` : 'мягкий темп без задач'}</div></div></article>
      </div>
      <div class="grid dashboard-grid" style="margin-top:18px">
        <div class="stack">
          <section class="checkin-card"><div class="eyebrow">Быстрая отметка</div><h2>Как вы прямо сейчас?</h2><p>Выберите ощущение — детали можно добавить позже.</p><div class="mood-row">${moodButtons}</div></section>
          <section class="card"><div class="card-head"><h2>Сегодня</h2><button class="btn btn-ghost" data-modal="task">＋ Задача</button></div><div class="timeline">${taskItems}</div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="card-head"><h2>Мои ритмы</h2><div class="progress-ring" style="--value:${habitPercent}"><b>${habitPercent}%</b></div></div><div class="habit-list">${habitRows || '<p class="muted">Добавьте первую привычку</p>'}</div><button class="btn btn-ghost" data-nav="habits" style="margin-top:12px">Все привычки →</button></section>
          <section class="card insight"><div class="insight-top"><div class="insight-mark">✦</div><div><h3>Наблюдение</h3><p>${insight}</p></div></div></section>
        </div>
      </div>
    </div>`;
  }

  function buildInsight() {
    const entries = Object.values(state.sleeps).filter((sleep) => state.checkins[sleep.date]);
    if (entries.length < 3) return 'Через несколько записей здесь появятся мягкие подсказки о связи сна, энергии и привычек.';
    const long = entries.filter((s) => s.hours >= 7.5);
    const short = entries.filter((s) => s.hours < 7.5);
    const longEnergy = average(long.map((s) => state.checkins[s.date]?.energy));
    const shortEnergy = average(short.map((s) => state.checkins[s.date]?.energy));
    if (long.length && short.length && longEnergy > shortEnergy) return `После сна от 7,5 часов ваша энергия в среднем выше на ${Math.max(1, Math.round(longEnergy - shortEnergy))} пункт. Это наблюдение, не медицинская рекомендация.`;
    return 'Режим сна выглядит достаточно ровным. Продолжайте отмечать состояние — так личные закономерности станут точнее.';
  }

  function calendarCells() {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const first = new Date(year, month, 1);
    const startShift = (first.getDay() + 6) % 7;
    const start = addDays(first, -startShift);
    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(start, index);
      const key = dateKey(date);
      const tasks = state.tasks.filter((task) => task.date === key);
      const hasJournal = state.journals.some((entry) => entry.date === key);
      const isOutside = date.getMonth() !== month;
      const label = tasks[0]?.title || (hasJournal ? 'Есть запись' : '');
      return `<button class="day ${isOutside ? 'outside' : ''} ${key === selectedDate ? 'selected' : ''} ${key === dateKey(new Date()) ? 'today' : ''}" data-calendar-date="${key}"><span class="day-num">${date.getDate()}</span><span class="day-dots">${tasks.slice(0, 3).map((t) => `<i class="day-dot" style="background:${t.category === 'work' ? '#7ca0b4' : t.category === 'health' ? '#86a97a' : '#ef9a62'}"></i>`).join('')}${hasJournal ? '<i class="day-dot" style="background:#9c87b0"></i>' : ''}</span><span class="day-note">${esc(label)}</span></button>`;
    }).join('');
  }

  function renderCalendar() {
    const today = dateKey(new Date());
    const categoryName = (category) => category === 'work' ? 'Работа' : category === 'health' ? 'Здоровье' : 'Личное';
    const categoryColor = (category) => category === 'work' ? '#6688e9' : category === 'health' ? '#63ae84' : '#f0a36a';
    const todayTasks = state.tasks.filter((task) => task.date === today).sort((a, b) => a.time.localeCompare(b.time));
    const upcomingTasks = state.tasks.filter((task) => task.date > today && !task.done).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const allTasks = [...state.tasks].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const selectedDayTasks = state.tasks.filter((task) => task.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
    const source = planMode === 'calendar' ? selectedDayTasks : planFilter === 'upcoming' ? upcomingTasks : planFilter === 'all' ? allTasks : ['self', 'health', 'work'].includes(planFilter) ? allTasks.filter((task) => task.category === planFilter) : todayTasks;
    const selectedTask = state.tasks.find((task) => task.id === selectedTaskId) || source[0] || upcomingTasks[0] || allTasks[0] || null;
    if (selectedTask) selectedTaskId = selectedTask.id;
    const taskRows = source.length ? source.map((task) => `<article class="plan-task ${task.done ? 'done' : ''} ${task.id === selectedTaskId ? 'selected' : ''}" data-task-select="${task.id}"><button class="task-toggle ${task.done ? 'done' : ''}" data-task-toggle="${task.id}" aria-label="${task.done ? 'Вернуть задачу' : 'Завершить задачу'}">${task.done ? '✓' : ''}</button><div class="plan-task-main"><div class="plan-task-title">${esc(task.title)}</div><div class="plan-task-meta"><span class="plan-category" style="background:${categoryColor(task.category)}"></span>${task.date === today ? 'Сегодня' : formatDate(task.date)}${task.time ? ` · ${task.time}` : ''} · ${categoryName(task.category)}</div></div><button class="plan-row-more" data-task-select="${task.id}" aria-label="Открыть задачу">›</button></article>`).join('') : '<div class="plan-empty"><div>✓</div><b>Здесь свободно</b><span>Добавьте задачу или оставьте место для себя.</span></div>';
    const detail = selectedTask ? `<section class="plan-detail-card"><div class="plan-detail-top"><span class="plan-detail-category" style="background:${categoryColor(selectedTask.category)}">${categoryName(selectedTask.category)}</span><button class="icon-btn" data-task-toggle="${selectedTask.id}" aria-label="${selectedTask.done ? 'Вернуть задачу' : 'Завершить задачу'}">${selectedTask.done ? '✓' : '○'}</button></div><h2 class="plan-detail-title ${selectedTask.done ? 'done' : ''}">${esc(selectedTask.title)}</h2><div class="detail-line"><span>◷</span><div><b>${selectedTask.date === today ? 'Сегодня' : formatDate(selectedTask.date, true)}</b><small>${selectedTask.time || 'Время не выбрано'}</small></div></div><div class="detail-line"><span>◌</span><div><b>${categoryName(selectedTask.category)}</b><small>Контекст задачи</small></div></div><div class="plan-detail-note"><span>Заметка</span><p>Добавьте детали, когда они помогут начать. Сейчас достаточно следующего шага.</p></div>${selectedTask.date !== today && !selectedTask.done ? `<button class="btn btn-secondary plan-reschedule" data-task-today="${selectedTask.id}">Перенести на сегодня</button>` : ''}</section>` : `<section class="plan-detail-empty"><div>◌</div><h2>Выберите задачу</h2><p>Здесь появится её контекст, чтобы держать в фокусе только одно важное дело.</p></section>`;
    const activeTitle = planMode === 'calendar' ? formatDate(selectedDate, true) : planFilter === 'upcoming' ? 'Предстоит' : planFilter === 'all' ? 'Все задачи' : planFilter === 'health' ? 'Здоровье' : planFilter === 'work' ? 'Работа' : planFilter === 'self' ? 'Личное' : 'Сегодня';
    const activeSubtitle = planMode === 'calendar' ? 'Задачи и личные заметки на выбранную дату.' : planFilter === 'today' ? 'Сначала самое важное. Остальное не обязано поместиться.' : 'Смотрите вперёд, не теряя пространство для себя.';
    app.innerHTML = `<div class="page">
      ${pageHeader('Планы без перегруза', 'План', 'Задачи, личное время и состояние — в одном спокойном пространстве.', '<button class="btn btn-primary" data-modal="task">＋ Новая задача</button>')}
      <div class="plan-mode-switch"><button class="${planMode === 'today' ? 'active' : ''}" data-plan-mode="today">Список</button><button class="${planMode === 'calendar' ? 'active' : ''}" data-plan-mode="calendar">Календарь</button></div>
      <section class="planner-shell">
        <aside class="planner-lists"><div class="planner-lists-head">Мои списки</div><button class="planner-list ${planMode === 'today' && planFilter === 'today' ? 'active' : ''}" data-plan-filter="today"><span class="planner-list-icon blue">☼</span><span>Сегодня</span><b>${todayTasks.filter((task) => !task.done).length}</b></button><button class="planner-list ${planMode === 'today' && planFilter === 'upcoming' ? 'active' : ''}" data-plan-filter="upcoming"><span class="planner-list-icon purple">◷</span><span>Предстоит</span><b>${upcomingTasks.length}</b></button><button class="planner-list ${planMode === 'today' && planFilter === 'all' ? 'active' : ''}" data-plan-filter="all"><span class="planner-list-icon gray">≡</span><span>Все задачи</span><b>${allTasks.filter((task) => !task.done).length}</b></button><div class="planner-divider"></div><div class="planner-lists-head">Пространства</div><button class="planner-list ${planMode === 'today' && planFilter === 'self' ? 'active' : ''}" data-plan-filter="self"><span class="planner-list-icon orange">⌂</span><span>Личное</span><b>${state.tasks.filter((task) => task.category === 'self' && !task.done).length}</b></button><button class="planner-list ${planMode === 'today' && planFilter === 'health' ? 'active' : ''}" data-plan-filter="health"><span class="planner-list-icon green">✦</span><span>Здоровье</span><b>${state.tasks.filter((task) => task.category === 'health' && !task.done).length}</b></button><button class="planner-list ${planMode === 'today' && planFilter === 'work' ? 'active' : ''}" data-plan-filter="work"><span class="planner-list-icon navy">□</span><span>Работа</span><b>${state.tasks.filter((task) => task.category === 'work' && !task.done).length}</b></button></aside>
        <section class="planner-main"><div class="planner-main-head"><div><div class="eyebrow">${planMode === 'calendar' ? 'Календарь' : 'Фокус'}</div><h2>${activeTitle}</h2><p>${activeSubtitle}</p></div><button class="icon-btn" data-modal="task" aria-label="Добавить задачу">＋</button></div>${planMode === 'calendar' ? `<section class="planner-calendar"><div class="calendar-toolbar"><div class="month-title">${MONTHS[calendarCursor.getMonth()]} ${calendarCursor.getFullYear()}</div><div class="cal-nav"><button class="icon-btn" data-calendar-nav="-1" aria-label="Предыдущий месяц">←</button><button class="icon-btn" data-calendar-today aria-label="Сегодня">•</button><button class="icon-btn" data-calendar-nav="1" aria-label="Следующий месяц">→</button></div></div><div class="weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div><div class="calendar-grid">${calendarCells()}</div></section>` : ''}<form id="plan-quick-form" class="plan-quick-add"><span>＋</span><input name="title" placeholder="Добавить задачу…" maxlength="100" required><input type="hidden" name="date" value="${planMode === 'calendar' ? selectedDate : today}"><button type="submit">Добавить</button></form><div class="plan-task-list">${taskRows}</div></section>
        <aside class="planner-detail"><div class="planner-detail-head">Детали задачи</div>${detail}</aside>
      </section>
    </div>`;
  }

  function renderSleep() {
    const recent = getRecentDays();
    const entries = recent.map((date) => state.sleeps[dateKey(date)]).filter(Boolean);
    const latest = [...Object.values(state.sleeps)].sort((a, b) => b.date.localeCompare(a.date))[0];
    const avgHours = average(entries.map((s) => s.hours));
    const avgQuality = average(entries.map((s) => s.quality));
    const goal = Number(state.profile.sleepGoal) || 8;
    const score = latest ? Math.min(100, Math.round((latest.hours / goal) * 72 + (latest.quality / 5) * 28)) : 0;
    const barChart = recent.map((date) => {
      const key = dateKey(date); const sleep = state.sleeps[key]; const height = sleep ? Math.min(100, sleep.hours / 10 * 100) : 3;
      return `<div class="bar-col"><span class="bar-value">${sleep ? String(sleep.hours).replace('.', ',') : '—'}</span><div class="bar ${key === dateKey(new Date()) ? 'today' : ''}" style="height:${height}%"></div><span class="bar-label">${WEEK_SHORT[date.getDay()]}</span></div>`;
    }).join('');
    app.innerHTML = `<div class="page">
      ${pageHeader('Восстановление', 'Сон', 'Смотрите на тенденции, а не на одну случайную ночь.', '<button class="btn btn-primary" data-modal="sleep">＋ Записать сон</button>')}
      <section class="card sleep-hero grid"><div class="sleep-score"><div class="score-circle" style="--score:${score}"><div class="score-inner"><div><b>${score}</b><small>из 100</small></div></div></div><div><div class="eyebrow" style="color:#b9d0a7">Последняя ночь</div><h2>${score >= 80 ? 'Хорошее восстановление' : score >= 60 ? 'Нормальное восстановление' : 'Стоит дать себе паузу'}</h2><p>Оценка основана на длительности и вашей субъективной оценке сна.</p></div></div><div class="sleep-details"><div class="sleep-detail"><span>Длительность</span><b>${latest ? `${String(latest.hours).replace('.', ',')} ч` : '—'}</b></div><div class="sleep-detail"><span>Качество</span><b>${latest ? `${latest.quality}/5` : '—'}</b></div><div class="sleep-detail"><span>Отбой</span><b>${latest?.bedtime || '—'}</b></div><div class="sleep-detail"><span>Подъём</span><b>${latest?.wake || '—'}</b></div></div></section>
      <div class="grid dashboard-grid" style="margin-top:18px"><section class="card chart-card"><div class="card-head"><h2>Последние 7 дней</h2><span class="badge">цель ${goal} ч</span></div><div class="bar-chart">${barChart}</div></section><div class="stack"><section class="card"><h2>Средние значения</h2><div class="stats-row"><div class="stat-mini"><b>${avgHours.toFixed(1).replace('.', ',')}</b><span>часов</span></div><div class="stat-mini"><b>${avgQuality.toFixed(1).replace('.', ',')}</b><span>качество</span></div><div class="stat-mini"><b>${entries.length}</b><span>записей</span></div></div></section><section class="card insight"><div class="insight-top"><div class="insight-mark">i</div><div><h3>Важно</h3><p>«Ритм» показывает личные наблюдения, но не ставит диагнозов. При устойчивых проблемах со сном лучше поговорить со специалистом.</p></div></div></section></div></div>
    </div>`;
  }

  function renderHabits() {
    const days = getRecentDays();
    const allStreaks = state.habits.map(getStreak);
    const bestStreak = Math.max(0, ...allStreaks);
    const completed = state.habits.reduce((sum, h) => sum + days.filter((d) => h.dates.includes(dateKey(d))).length, 0);
    const possible = state.habits.length * days.length;
    const rows = state.habits.map((habit) => `<div class="habit-grid-row"><div class="habit-grid-info"><div class="habit-icon" style="background:${habit.color}">${habit.icon}</div><div><div class="habit-name">${esc(habit.name)}</div><div class="habit-meta">${esc(habit.goal)} · серия ${getStreak(habit)} дн.</div></div></div>${days.map((day) => { const key = dateKey(day); const done = habit.dates.includes(key); return `<button class="day-check ${done ? 'done' : ''}" data-habit-toggle="${habit.id}" data-date="${key}" aria-label="${formatDate(key)}">${done ? '✓' : ''}</button>`; }).join('')}</div>`).join('');
    app.innerHTML = `<div class="page">
      ${pageHeader('Маленькие шаги', 'Привычки', 'Гибкие ритуалы без чувства вины за пропуски.', '<button class="btn btn-primary" data-modal="habit">＋ Новая привычка</button>')}
      <div class="grid dashboard-grid"><section class="card habit-table"><div class="card-head"><h2>Эта неделя</h2><span class="muted">${possible ? Math.round(completed / possible * 100) : 0}% выполнено</span></div><div class="habit-grid-head"><span>Привычка</span>${days.map((day) => `<span>${WEEK_SHORT[day.getDay()]}<br>${day.getDate()}</span>`).join('')}</div>${rows || '<div class="empty-state"><div class="empty-icon">🌱</div>Создайте первый небольшой ритуал</div>'}</section><div class="stack"><section class="card streak-card"><div class="eyebrow">Лучшая серия сейчас</div><div class="streak-number">${bestStreak} <span>дней</span></div><p class="muted">Стабильность рождается из возвращения, а не из идеальности.</p></section><section class="card"><h2>Как это работает</h2><p class="muted" style="line-height:1.7;font-size:12px">Отмечайте только то, что действительно поддерживает вас. Цели можно менять в любое время, а пропуск ничего не обнуляет в вашем опыте.</p></section></div></div>
    </div>`;
  }

  function renderJournal() {
    const prompt = currentQuestion();
    const entries = [...state.journals].sort((a, b) => b.date.localeCompare(a.date));
    const dreams = [...state.dreams].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const inbox = [...state.inbox].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const entryHtml = entries.length ? entries.map((entry) => `<article class="card entry"><div class="entry-date">${formatDate(entry.date, true)}</div><p>${esc(entry.text)}</p>${entry.gratitude || entry.win ? `<div class="entry-tags">${entry.gratitude ? `<span class="tag">Спасибо: ${esc(entry.gratitude)}</span>` : ''}${entry.win ? `<span class="tag">Получилось: ${esc(entry.win)}</span>` : ''}</div>` : ''}</article>`).join('') : '<div class="empty-state"><div class="empty-icon">✍️</div>Ваши записи появятся здесь</div>';
    const dreamHtml = dreams.length ? dreams.map((dream) => `<div class="entry" style="padding:14px 0"><div class="entry-date">${formatDate(dream.date)} · ${'●'.repeat(dream.vividness || 3)} ${esc(dream.emotion || '')}</div>${dream.text ? `<p style="font-size:12px">${esc(dream.text)}</p>` : '<p class="muted" style="font-size:12px">Голосовая заметка без текста</p>'}${dream.audioId ? `<button class="btn btn-ghost" data-play-audio="${dream.audioId}">▷ Прослушать голос</button>` : ''}${dream.tags?.length ? `<div class="entry-tags">${dream.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : ''}</div>`).join('') : '<p class="muted">Первый сон можно записать утром — голосом или текстом.</p>';
    const meditations = [...state.meditations].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    const medHtml = meditations.length ? meditations.map((med) => `<div class="habit-row"><div class="habit-icon" style="background:${COLORS[0]}">🧘</div><div><div class="habit-name">${med.duration} минут · ${esc(med.technique)}</div><div class="habit-meta">${formatDate(med.date)}</div></div></div>`).join('') : '<p class="muted">Пока нет практик</p>';
    const answers = [...state.reflections].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2);
    const inboxHtml = inbox.length ? inbox.map((item) => `<div class="entry" style="padding:12px 0"><div class="entry-date">${formatDate(item.date)}</div><p style="font-size:12px">${esc(item.text)}</p></div>`).join('') : '<p class="muted">Неясные записи ассистента появятся здесь — ничего не потеряется.</p>';
    const answersHtml = answers.length ? answers.map((item) => `<div class="entry" style="padding:13px 0"><div class="entry-date">${esc(item.theme)}</div><p style="font-size:12px">${esc(item.answer)}</p></div>`).join('') : '<p class="muted">Ответы на вопросы дня появятся здесь.</p>';
    app.innerHTML = `<div class="page">
      ${pageHeader('Место для себя', 'Дневник', 'Сны, мысли, эмоции и практики в одной личной истории.', '<button class="btn btn-ghost" data-modal="archive">⇧ История</button><button class="btn btn-secondary" data-modal="dream">☾ Сон</button><button class="btn btn-primary" data-modal="journal">＋ Мысль</button>')}
      <div class="grid journal-layout"><div class="stack"><section class="card journal-prompt"><div class="eyebrow">Вопрос дня · ${esc(prompt.theme)}</div><blockquote>${esc(prompt.question)}</blockquote><button class="btn btn-primary" data-modal="reflection">Ответить</button></section><section class="card"><div class="card-head"><div><div class="eyebrow">Сны</div><h2>Последние образы</h2></div><button class="btn btn-ghost" data-modal="dream">＋</button></div>${dreamHtml}</section><div class="entry-list">${entryHtml}</div></div><aside class="stack"><section class="card"><div class="card-head"><h2>Практики</h2><button class="btn btn-ghost" data-nav="practice">Открыть</button></div>${medHtml}</section><section class="card"><div class="card-head"><div><div class="eyebrow">Последние ответы</div><h2>Мой голос</h2></div></div>${answersHtml}</section><section class="card"><div class="eyebrow">За всё время</div><div class="summary-value">${state.journals.length + state.dreams.length + state.reflections.length}</div><div class="summary-meta">личных записей</div></section></aside></div>
    </div>`;
  }

  function renderSettings() {
    const size = new Blob([JSON.stringify(state)]).size;
    const counts = {
      dreams: state.dreams.length,
      journals: state.journals.length,
      reflections: state.reflections.length,
      practices: state.meditations.length,
      workouts: state.workouts.length
    };
    app.innerHTML = `<div class="page">
      ${pageHeader('Под вашим контролем', 'Настройки', 'Приватность, перенос данных и будущие подключения.', '')}
      <div class="grid dashboard-grid"><div class="stack"><section class="card"><div class="card-head"><div><div class="eyebrow">Локальный сейф</div><h2>Ваши данные</h2></div><span class="badge">на устройстве</span></div><div class="settings-list"><div class="settings-row"><div class="settings-icon">⌂</div><div><h3>Локальное хранение</h3><p>Записи остаются в этом браузере даже без интернета. В ИИ ничего не отправляется автоматически.</p></div><span class="badge">активно</span></div><div class="settings-row"><div class="settings-icon">⇩</div><div><h3>Полная резервная копия</h3><p>${Math.max(1, Math.round(size / 1024))} КБ · для восстановления на другом устройстве.</p></div><button class="btn btn-secondary" data-export>JSON</button></div><div class="settings-row settings-row-secure"><div class="settings-icon">⌑</div><div><h3>Зашифрованная копия</h3><p>Перенос между iPhone и Windows с паролем. Файл нельзя прочитать без него.</p></div><button class="btn btn-primary" data-export-encrypted>Зашифровать</button></div><div class="settings-row"><div class="settings-icon">≡</div><div><h3>Читаемый архив</h3><p>Все сны, мысли, ответы и дневниковые записи — одним Markdown-файлом.</p></div><button class="btn btn-secondary" data-export-text>TXT</button></div><div class="settings-row"><div class="settings-icon">⇧</div><div><h3>Восстановить копию</h3><p>Поддерживает обычный и зашифрованный файл. Данные на этом устройстве будут заменены.</p></div><button class="btn btn-secondary" data-import>Выбрать</button></div></div></section><section class="card"><h2>Профиль и цели</h2><form id="profile-form" class="form-grid"><div class="field"><label for="profile-name">Как вас называть</label><input id="profile-name" name="name" value="${esc(state.profile.name)}" placeholder="Имя"></div><div class="field"><label for="sleep-goal">Цель сна, часов</label><input id="sleep-goal" name="sleepGoal" type="number" min="4" max="12" step="0.5" value="${state.profile.sleepGoal}"></div><div class="form-actions field full"><button class="btn btn-primary" type="submit">Сохранить</button></div></form></section></div><aside class="stack"><section class="card data-vault-card"><div class="eyebrow">Содержимое сейфа</div><h2>Всё ваше — переносимо</h2><div class="vault-stats"><div><b>${counts.dreams}</b><span>снов</span></div><div><b>${counts.journals}</b><span>дневников</span></div><div><b>${counts.reflections}</b><span>ответов</span></div><div><b>${counts.practices + counts.workouts}</b><span>практик</span></div></div><p class="muted">Текстовые записи и голосовые заметки входят в полную копию. Зашифрованный вариант лучше для переноса.</p></section><section class="card"><h2>Перенос без облака</h2><p class="muted" style="font-size:11px;line-height:1.6">Скачайте зашифрованный файл, перенесите его любым удобным способом и восстановите на втором устройстве. Пароль не сохраняется и не восстанавливается нами.</p></section><section class="card"><h2>Чистый лист</h2><p class="muted" style="font-size:11px;line-height:1.6">Удалит все записи на этом устройстве. Сначала скачайте резервную копию.</p><button class="btn btn-danger" data-reset>Удалить все данные</button></section></aside></div>
    </div>`;
  }

  function renderPractice() {
    const minutes = Math.max(1, Math.round(meditationSeconds / 60));
    const latest = [...state.meditations].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    const latestHtml = latest.length ? latest.map((med) => `<div class="habit-row"><div class="habit-icon" style="background:${COLORS[0]}">🧘</div><div><div class="habit-name">${med.duration} минут · ${esc(med.technique)}</div><div class="habit-meta">${formatDate(med.date)}</div></div></div>`).join('') : '<p class="muted">Здесь появятся ваши практики.</p>';
    const workoutHtml = state.workouts.length ? state.workouts.slice(-3).reverse().map((workout) => `<div class="habit-row"><div class="habit-icon" style="background:${COLORS[1]}">◒</div><div><div class="habit-name">${esc(workout.title)}</div><div class="habit-meta">${workout.duration} минут · ${formatDate(workout.date)}</div></div></div>`).join('') : '<p class="muted">Соберите первую тренировку, когда будете готовы.</p>';
    app.innerHTML = `<div class="page">
      ${pageHeader('Внимание и тело', 'Практики', 'Медитации и тренировки без давления на результат.', '<button class="btn btn-secondary" data-modal="workout">＋ Тренировка</button><button class="btn btn-primary" data-modal="meditation">＋ Практика</button>')}
      <div class="grid dashboard-grid"><div class="stack"><section class="card" style="text-align:center"><div id="meditation-status" class="eyebrow">Медитация · ${meditationRunning ? 'идёт сейчас' : 'готова к началу'}</div><div id="meditation-timer" class="summary-value" style="font-size:64px;margin:22px 0">${formatTimer(meditationSeconds)}</div><div class="viz-row" style="justify-content:center;gap:8px"><button class="btn btn-ghost" data-meditation-duration="300">5 мин</button><button class="btn btn-ghost" data-meditation-duration="600">10 мин</button><button class="btn btn-ghost" data-meditation-duration="1200">20 мин</button></div><div class="form-actions" style="justify-content:center"><button class="btn btn-primary" data-meditation-toggle>${meditationRunning ? 'Пауза' : `Начать ${minutes} мин`}</button><button class="btn btn-secondary" data-modal="meditation">Настроить</button></div></section><section class="card"><div class="card-head"><h2>Недавние медитации</h2></div>${latestHtml}</section></div><aside class="stack"><section class="card journal-prompt"><div class="eyebrow">Готовая практика</div><blockquote>Сделайте три спокойных вдоха. Не исправляйте этот момент — просто побудьте в нём.</blockquote><button class="btn btn-primary" data-meditation-quick>Запустить 3 минуты</button></section><section class="card"><div class="card-head"><h2>Тренировки</h2><button class="btn btn-ghost" data-modal="workout">＋</button></div>${workoutHtml}<button class="btn btn-ghost" data-modal="workout" style="margin-top:8px">Создать занятие →</button></section></aside></div>
    </div>`;
  }

  function renderInsights() {
    const days = getRecentDays(14);
    const pairs = days.map((day) => {
      const key = dateKey(day);
      return { sleep: state.sleeps[key], checkin: state.checkins[key], tasks: state.tasks.filter((task) => task.date === key && task.category === 'work') };
    }).filter((item) => item.sleep && item.checkin);
    const longer = pairs.filter((item) => item.sleep.hours >= 7.5);
    const shorter = pairs.filter((item) => item.sleep.hours < 7.5);
    const longerEnergy = average(longer.map((item) => item.checkin.energy));
    const shorterEnergy = average(shorter.map((item) => item.checkin.energy));
    const difference = Math.max(0, Math.round(longerEnergy - shorterEnergy));
    const dreamCount = state.dreams.length;
    const workHeavy = pairs.filter((item) => item.tasks.length >= 2);
    const highStress = workHeavy.filter((item) => item.checkin.stress >= 6).length;
    const evidence = pairs.length;
    const sleepInsight = evidence >= 6 && longer.length && shorter.length
      ? `В ${longer.length} записях после сна от 7,5 часов энергия в среднем выше на ${difference || 1} пункт. Это совпадение в ваших данных, а не доказанная причина.`
      : 'Нужно ещё несколько честных отметок, чтобы сравнить сон и энергию без случайных выводов.';
    const loadInsight = workHeavy.length
      ? `В ${highStress || 1} из ${workHeavy.length} дней с двумя и более рабочими задачами напряжение было высоким. Попробуйте заранее оставить один лёгкий вечер.`
      : 'Когда накопятся задачи и вечерние отметки, здесь появится связь нагрузки с вашим состоянием.';
    app.innerHTML = `<div class="page">
      ${pageHeader('Ваши данные, а не чужая норма', 'Инсайты', 'Здесь показываются только объяснимые наблюдения. Любое можно скрыть.', '<button class="btn btn-primary" data-modal="checkin">Записать состояние</button>')}
      <div class="grid summary-grid"><article class="card summary-card"><div class="summary-label"><span class="dot-icon">☾</span>Сопоставимых дней</div><div><div class="summary-value">${evidence}</div><div class="summary-meta">сон + состояние за 14 дней</div></div></article><article class="card summary-card"><div class="summary-label"><span class="dot-icon">☁</span>Сны</div><div><div class="summary-value">${dreamCount}</div><div class="summary-meta">сохранённых личных записей</div></div></article><article class="card summary-card"><div class="summary-label"><span class="dot-icon">✓</span>Следующий обзор</div><div><div class="summary-value">Вс</div><div class="summary-meta">5 минут на недельный ритм</div></div></article></div>
      <div class="grid dashboard-grid" style="margin-top:18px"><div class="stack"><section class="card"><div class="card-head"><div><div class="eyebrow">Сон и энергия</div><h2>Наблюдение</h2></div><span class="badge">${evidence >= 6 ? 'достаточно данных' : 'собираем данные'}</span></div><p style="line-height:1.75">${sleepInsight}</p><button class="btn btn-ghost" data-modal="sleep">Добавить сон →</button></section><section class="card"><div class="card-head"><div><div class="eyebrow">Нагрузка</div><h2>Контекст недели</h2></div></div><p style="line-height:1.75">${loadInsight}</p><button class="btn btn-ghost" data-nav="calendar">Открыть план →</button></section></div><aside class="stack"><section class="card insight"><div class="insight-top"><div class="insight-mark">✦</div><div><h3>Как читать выводы</h3><p>Сначала факт, затем совпадение, затем маленький эксперимент. «Ритм» не ставит диагнозы и не знает причин без вашего контекста.</p></div></div></section><section class="card"><div class="card-head"><h2>Следующий шаг</h2></div><p class="muted" style="line-height:1.7;font-size:12px">Завтра утром сохраните сон и состояние. После 10–14 таких дней появятся первые более устойчивые личные закономерности.</p><button class="btn btn-primary" data-modal="dream">Записать сон</button></section></aside></div>
    </div>`;
  }

  function renderStatistics() {
    const days = getRecentDays(14).reverse();
    const rows = days.map((day) => {
      const date = dateKey(day), sleep = state.sleeps[date], checkin = state.checkins[date];
      const habits = state.habits.filter((habit) => habit.dates.includes(date)).length;
      const activity = state.meditations.filter((item) => item.date === date).reduce((sum, item) => sum + Number(item.duration || 0), 0) + state.workouts.filter((item) => item.date === date).reduce((sum, item) => sum + Number(item.duration || 0), 0);
      return { date, sleep: sleep?.hours ?? null, energy: checkin?.energy ?? null, mood: checkin?.mood ?? null, stress: checkin?.stress ?? null, habits, activity };
    });
    const values = (key) => rows.filter((item) => item[key] !== null).map((item) => item[key]);
    const avgSleep = average(values('sleep')), avgEnergy = average(values('energy')), avgMood = average(values('mood'));
    const paired = rows.filter((item) => item.sleep !== null && item.energy !== null);
    const rested = paired.filter((item) => item.sleep >= 7.5), short = paired.filter((item) => item.sleep < 7.5);
    const delta = paired.length >= 5 && rested.length && short.length ? Math.round((average(rested.map((item) => item.energy)) - average(short.map((item) => item.energy))) * 10) / 10 : null;
    const points = (key) => rows.map((item, index) => item[key] === null ? null : `${Math.round(index * 100 / Math.max(1, rows.length - 1))},${Math.round(92 - item[key] / 10 * 78)}`).filter(Boolean).join(' ');
    const labels = rows.map((item) => `<span>${item.date.slice(8)}</span>`).join('');
    const table = rows.slice().reverse().slice(0, 7).map((item) => `<tr><td>${formatDate(item.date, true)}</td><td>${item.sleep ?? '—'} ч</td><td>${item.energy ?? '—'}</td><td>${item.mood ?? '—'}</td><td>${item.activity || '—'} мин</td><td>${item.habits || '—'}</td></tr>`).join('');
    const relation = delta === null || !Number.isFinite(delta) ? 'Нужно ещё несколько дней с отмеченным сном и энергией, чтобы сравнение стало честным.' : `В дни со сном от 7,5 часов энергия в среднем ${delta >= 0 ? 'выше' : 'ниже'} на ${Math.abs(delta)} пункта. Это наблюдение, а не причина.`;
    app.innerHTML = `<div class="page statistics-page">${pageHeader('Факты, ритм и бережные гипотезы', 'Статистика', 'Графики строятся на устройстве. ИИ-обзор запускается только по вашему действию.', '<button class="btn btn-primary" data-statistics-ai>✦ Создать ИИ-обзор</button>')}<div class="grid summary-grid"><article class="card summary-card"><div class="summary-label">Средний сон</div><div class="summary-value">${avgSleep ? avgSleep.toFixed(1) : '—'}<span> ч</span></div><div class="summary-meta">за 14 дней</div></article><article class="card summary-card"><div class="summary-label">Средняя энергия</div><div class="summary-value">${avgEnergy ? avgEnergy.toFixed(1) : '—'}<span>/10</span></div><div class="summary-meta">по вашим отметкам</div></article><article class="card summary-card"><div class="summary-label">Настроение</div><div class="summary-value">${avgMood ? avgMood.toFixed(1) : '—'}<span>/5</span></div><div class="summary-meta">без медицинских выводов</div></article></div><div class="grid dashboard-grid" style="margin-top:18px"><div class="stack"><section class="card"><div class="card-head"><div><div class="eyebrow">Последние 14 дней</div><h2>Сон и энергия</h2></div><div class="chart-legend"><span><i class="legend-sleep"></i>сон</span><span><i class="legend-energy"></i>энергия</span></div></div><svg class="stats-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="График сна и энергии"><polyline points="${points('sleep')}" fill="none" stroke="#8272ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points('energy')}" fill="none" stroke="#34a98b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="chart-labels">${labels}</div></section><section class="card"><div class="card-head"><div><div class="eyebrow">Связь в ваших данных</div><h2>Сон, нагрузка и состояние</h2></div><span class="badge">${paired.length} дней</span></div><p class="statistics-relation">${relation}</p><div class="stats-caveat">Факт: графики и таблица. Вывод: осторожная гипотеза. «Ритм» не определяет психическое состояние и не заменяет специалиста.</div></section><section class="card stats-table-card"><div class="card-head"><h2>Данные за неделю</h2><span class="muted">локально</span></div><div class="stats-table-wrap"><table class="stats-table"><thead><tr><th>Дата</th><th>Сон</th><th>Энергия</th><th>Настроение</th><th>Активность</th><th>Привычки</th></tr></thead><tbody>${table}</tbody></table></div></section></div><aside class="stack"><section class="card insight"><div class="insight-top"><div class="insight-mark">✦</div><div><h3>ИИ-обзор — по запросу</h3><p>Он получит только выбранную вами сводку и последние тексты дневника, чтобы найти темы, желания и цели. Никаких диагнозов.</p></div></div><label class="statistics-consent"><input type="checkbox" data-statistics-consent> Я понимаю, что текст и сводка будут отправлены в ИИ для этого обзора.</label><div id="statistics-ai-result" class="statistics-ai-result" aria-live="polite"></div></section><section class="card"><div class="eyebrow">Что улучшит точность</div><h2>Три короткие отметки</h2><p class="muted">Сон утром, состояние днём и одна честная мысль вечером. Даже неполные дни остаются вашими данными — без оценок и серий.</p><button class="btn btn-secondary" data-modal="checkin">Записать состояние</button></section></aside></div></div>`;
  }

  let ambientContext = null;
  let ambientOscillator = null;

  function renderMeditationLibrary() {
    const page = app.querySelector('.page');
    if (!page || page.querySelector('#meditation-library')) return;
    const library = [...MEDITATION_LIBRARY, ...state.meditationLibrary];
    page.insertAdjacentHTML('beforeend', `<section id="meditation-library" class="card meditation-library"><div class="card-head"><div><div class="eyebrow">Библиотека</div><h2>Выберите спокойный ритуал</h2></div><button class="btn btn-secondary" data-meditation-generate>✦ Создать свою</button></div><div class="meditation-library-grid">${library.map((item) => `<article class="meditation-tile"><div><span class="tag">${esc(item.theme || 'практика')} · ${item.duration} мин</span><h3>${esc(item.title)}</h3><p>${esc(item.text.slice(0, 118))}…</p>${item.sourceName ? `<small class="media-source">На устройстве: ${esc(item.sourceName)}</small>` : ''}</div><div class="form-actions"><button class="btn btn-primary" data-meditation-play="${item.id}">▶ Слушать</button><button class="btn btn-ghost" data-meditation-ambient>≈ Звук</button>${item.audioId ? `<button class="btn btn-ghost media-remove" data-meditation-remove="${item.id}">Удалить</button>` : ''}</div></article>`).join('')}</div><p class="muted" style="margin:16px 0 0;font-size:11px">Озвучка готовых сценариев запускается голосом устройства. Генерация нового текста и профессиональная ИИ-озвучка требуют сети и отдельного подтверждения.</p></section>`);
  }

  function findMeditation(id) { return [...MEDITATION_LIBRARY, ...state.meditationLibrary].find((item) => item.id === id); }

  async function playMeditationVoice(id) {
    const meditation = findMeditation(id);
    if (!meditation) return;
    if (meditation.audioId) { await playVoiceRecording(meditation.audioId); return; }
    try {
      const response = await fetch('/api/meditation/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: meditation.text, consent: true }) });
      if (response.ok) { const url = URL.createObjectURL(await response.blob()); const player = new Audio(url); player.onended = () => URL.revokeObjectURL(url); await player.play(); toast(`ИИ-озвучка: ${meditation.title}`); return; }
    } catch (_) { /* local voice is the intentional offline fallback */ }
    if (!('speechSynthesis' in window)) { toast('Озвучка недоступна на этом устройстве'); return; }
    speechSynthesis.cancel();
    const phrase = new SpeechSynthesisUtterance(meditation.text);
    phrase.lang = 'ru-RU'; phrase.rate = 0.82; phrase.pitch = 0.95;
    speechSynthesis.speak(phrase); toast(`Запущено: ${meditation.title}`);
  }

  async function removeMeditationMedia(id) {
    const meditation = state.meditationLibrary.find((item) => item.id === id);
    if (!meditation) return;
    if (!window.confirm(`Удалить «${meditation.title}» с этого устройства? Восстановить файл можно будет только из резервной копии.`)) return;
    try {
      if (meditation.audioId) await deleteAudioRecord(meditation.audioId);
      state.meditationLibrary = state.meditationLibrary.filter((item) => item.id !== id);
      saveState('Локальная медитация удалена');
      navigate('practice');
    } catch (_) {
      toast('Не удалось удалить файл. Запись в библиотеке не изменена.');
    }
  }

  function toggleAmbientSound(kind = 'warm') {
    if (ambientOscillator) { ambientOscillator.stop(); ambientOscillator = null; ambientContext?.close(); ambientContext = null; toast('Фоновый звук остановлен'); return; }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) { toast('Фоновый звук недоступен на этом устройстве'); return; }
    ambientContext = new AudioCtor(); const gain = ambientContext.createGain(); gain.gain.value = kind === 'rain' ? 0.035 : 0.018;
    if (kind === 'rain') {
      const buffer = ambientContext.createBuffer(1, ambientContext.sampleRate * 3, ambientContext.sampleRate);
      const data = buffer.getChannelData(0); for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * 0.36;
      ambientOscillator = ambientContext.createBufferSource(); ambientOscillator.buffer = buffer; ambientOscillator.loop = true;
    } else {
      ambientOscillator = ambientContext.createOscillator(); ambientOscillator.type = kind === 'night' ? 'triangle' : 'sine'; ambientOscillator.frequency.value = kind === 'night' ? 96 : 174;
    }
    ambientOscillator.connect(gain).connect(ambientContext.destination); ambientOscillator.start(); toast(`Фон включён: ${AMBIENT_LIBRARY.find((item) => item.id === kind)?.title || 'мягкий звук'}`);
  }

  function renderMeditationExtras() {
    const library = app.querySelector('#meditation-library');
    if (!library || app.querySelector('#ambient-library')) return;
    library.querySelector('.card-head')?.insertAdjacentHTML('beforeend', '<button class="btn btn-ghost" data-modal="meditationMedia">＋ Своя запись</button>');
    library.insertAdjacentHTML('afterend', `<section id="ambient-library" class="card ambient-library"><div class="card-head"><div><div class="eyebrow">Фоновая музыка</div><h2>Звуковые пространства</h2></div><span class="badge">работают офлайн</span></div><div class="ambient-grid">${AMBIENT_LIBRARY.map((item) => `<button class="ambient-card" data-ambient-kind="${item.id}"><span class="ambient-wave">≈</span><b>${item.title}</b><small>${item.note}</small></button>`).join('')}</div><p class="muted" style="font-size:11px;margin:14px 0 0">Звуки синтезируются на устройстве и не передаются в интернет. Повторное нажатие останавливает фон.</p></section>`);
  }

  function renderDreamAnalysisPanel() {
    const page = app.querySelector('.page');
    const dreams = state.dreams.filter((item) => item.analysis).slice(-6).reverse();
    if (!page || !dreams.length || page.querySelector('#dream-analysis-panel')) return;
    page.insertAdjacentHTML('beforeend', `<section id="dream-analysis-panel" class="card" style="margin-top:18px"><div class="card-head"><div><div class="eyebrow">Отдельно от исходного текста</div><h2>Бережный разбор снов</h2></div><span class="badge">ИИ-гипотезы</span></div><div class="stack">${dreams.map((dream) => `<article class="assistant-card"><div class="entry-date">${formatDate(dream.date)} · Вы сказали</div><p>${esc(dream.text)}</p><div class="assistant-proposal"><label>Предложение ИИ</label><p>${esc(dream.analysis)}</p></div></article>`).join('')}</div></section>`);
  }

  function renderInstallCard() {
    const page = app.querySelector('.page');
    if (!page || page.querySelector('#pwa-install-card')) return;
    const installed = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    page.insertAdjacentHTML('beforeend', `<section id="pwa-install-card" class="card install-card"><div><div class="eyebrow">iPhone и офлайн-доступ</div><h2>${installed ? '«Ритм» уже установлен' : 'Установить «Ритм»'}</h2><p class="muted">${installed ? 'Приложение открыто отдельно от браузера. Данные и добавленные медиа остаются на этом устройстве.' : 'В Safari нажмите «Поделиться» → «На экран Домой». После установки приложение откроется отдельно от браузера и сохранит данные на устройстве.'}</p></div>${installed ? '<span class="badge">готово</span>' : '<button class="btn btn-primary" data-pwa-install>Установить</button>'}</section>`);
  }

  async function installPwa() {
    if (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true) { toast('«Ритм» уже установлен на этом устройстве'); return; }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return;
    }
    toast('На iPhone: откройте сайт в Safari → Поделиться → На экран Домой → Добавить.');
  }

  const renderers = { today: renderToday, calendar: renderCalendar, sleep: renderSleep, habits: renderHabits, journal: renderJournal, practice: renderPractice, insights: renderInsights, statistics: renderStatistics, settings: renderSettings };

  function navigate(view) {
    currentView = renderers[view] ? view : 'today';
    history.replaceState(null, '', `#${currentView}`);
    document.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('active', el.dataset.nav === currentView));
    renderers[currentView]();
    if (currentView === 'practice') { renderMeditationLibrary(); renderMeditationExtras(); }
    if (currentView === 'journal') renderDreamAnalysisPanel();
    if (currentView === 'settings') renderInstallCard();
    app.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openModal(type) {
    const templates = {
      checkin: checkinForm,
      sleep: sleepForm,
      dream: dreamForm,
      reflection: reflectionForm,
      archive: archiveForm,
      encryptedExport: encryptedExportForm,
      encryptedImport: encryptedImportForm,
      habit: habitForm,
      task: taskForm,
      journal: journalForm,
      meditation: meditationForm,
      setup: setupForm,
      workout: workoutForm,
      workoutProfile: workoutProfileForm,
      assistant: assistantForm,
      aiContext: aiContextForm,
      meditationGenerator: meditationGeneratorForm,
      meditationMedia: meditationMediaForm
    };
    if (!templates[type]) return;
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true" aria-label="Форма"><div class="modal-head"><div>${templates[type].head}</div><button class="icon-btn" data-close-modal aria-label="Закрыть">×</button></div>${templates[type].body}</div></div>`;
    if (type === 'assistant') modalRoot.querySelector('#assistant-form')?.insertAdjacentHTML('afterbegin', '<div class="field full"><button type="button" class="btn btn-ghost" data-modal="aiContext">Настроить личный контекст ИИ</button></div>');
    if (type === 'archive') modalRoot.querySelector('#archive-form')?.insertAdjacentHTML('beforeend', '<div class="field full"><label class="statistics-consent"><input type="checkbox" data-archive-ai> Разрешаю ИИ разобрать этот файл на сны, сон, состояние и дневниковые записи. Исходный файл останется локально.</label></div>');
    modalRoot.querySelector('input, textarea, select, button')?.focus();
  }

  function modalHead(title, subtitle) { return `<h2>${title}</h2><p>${subtitle}</p>`; }
  function formActions(label = 'Сохранить') { return `<div class="form-actions field full"><button type="button" class="btn btn-secondary" data-close-modal>Отмена</button><button type="submit" class="btn btn-primary">${label}</button></div>`; }

  const checkinForm = {
    head: modalHead('Записать состояние', 'Честная отметка важнее идеальной.'),
    body: `<form id="checkin-form" class="form-grid"><div class="field full"><label>Настроение</label><div class="emoji-picker">${MOODS.map((m) => `<button type="button" class="emoji-option ${m.value === 3 ? 'selected' : ''}" data-pick-mood="${m.value}" title="${m.label}">${m.emoji}</button>`).join('')}</div><input type="hidden" name="mood" value="3"></div><div class="field"><label>Энергия <span data-range-label="energy">6</span>/10</label><div class="range-wrap"><input type="range" name="energy" min="1" max="10" value="6"></div></div><div class="field"><label>Тревога <span data-range-label="stress">4</span>/10</label><div class="range-wrap"><input type="range" name="stress" min="1" max="10" value="4"></div></div><div class="field"><label>Спокойствие <span data-range-label="calm">5</span>/10</label><div class="range-wrap"><input type="range" name="calm" min="1" max="10" value="5"></div></div><div class="field"><label for="rating">Оценка дня</label><input id="rating" name="rating" type="number" min="1" max="10" value="7"></div><div class="field"><label for="emotions">Эмоции</label><input id="emotions" name="emotions" placeholder="спокойствие, интерес"></div><div class="field full"><label for="checkin-note">Что происходит?</label><textarea id="checkin-note" name="note" placeholder="Пара предложений — по желанию"></textarea></div>${formActions('Сохранить состояние')}</form>`
  };

  const sleepForm = {
    head: modalHead('Записать сон', 'Время и ваше собственное ощущение.'),
    body: `<form id="sleep-form" class="form-grid"><div class="field"><label for="sleep-date">Дата пробуждения</label><input id="sleep-date" name="date" type="date" value="${dateKey(new Date())}" required></div><div class="field"><label for="sleep-hours">Сколько спали</label><input id="sleep-hours" name="hours" type="number" min="0.5" max="18" step="0.1" value="8" required></div><div class="field"><label for="bedtime">Легли</label><input id="bedtime" name="bedtime" type="time" value="23:00" required></div><div class="field"><label for="wake">Проснулись</label><input id="wake" name="wake" type="time" value="07:00" required></div><div class="field"><label for="quality">Качество, 1–5</label><input id="quality" name="quality" type="number" min="1" max="5" value="4" required></div><div class="field"><label for="awakenings">Пробуждения</label><input id="awakenings" name="awakenings" type="number" min="0" max="30" value="1"></div><div class="field full"><label for="sleep-note">Заметка</label><textarea id="sleep-note" name="note" placeholder="Что повлияло на сон?"></textarea></div>${formActions('Сохранить сон')}</form>`
  };

  const dreamForm = {
    head: modalHead('Сохранить сон', 'Сначала сохраните, потом решите — нужен ли анализ.'),
    body: `<form id="dream-form" class="form-grid"><div class="field"><label for="dream-date">Дата пробуждения</label><input id="dream-date" name="date" type="date" value="${dateKey(new Date())}" required></div><div class="field"><label for="dream-vividness">Насколько ярко помните, 1–5</label><input id="dream-vividness" name="vividness" type="number" min="1" max="5" value="3" required></div><div class="field full"><label>Голосовая заметка</label><div class="viz-row"><button type="button" class="btn btn-primary" data-voice-record>◉ Надиктовать сон</button><span id="voice-status" class="muted">Запись сохранится только на этом устройстве.</span></div><input id="dream-audio-id" name="audioId" type="hidden"></div><div class="field full"><label for="dream-emotion">Главная эмоция</label><input id="dream-emotion" name="emotion" placeholder="например, тревога или облегчение"></div><div class="field full"><label for="dream-text">Что запомнилось?</label><textarea id="dream-text" name="text" placeholder="Можно писать вручную или добавить текст после расшифровки…" style="min-height:160px"></textarea></div><div class="field full"><label for="dream-tags">Свои метки</label><input id="dream-tags" name="tags" placeholder="дорога, работа, дом"></div>${formActions('Сохранить сон')}</form>`
  };

  const assistantForm = {
    head: modalHead('ИИ-ассистент', 'Надиктуйте всё как есть. Я сохраню голос локально, расшифрую и предложу, куда разложить записи.'),
    body: `<form id="assistant-form" class="form-grid"><div class="field full"><div class="assistant-record"><button type="button" class="record-button" data-assistant-record aria-label="Начать голосовую запись">◉</button><b id="assistant-record-label">Нажмите и рассказывайте свободно</b><span id="assistant-status" class="assistant-status">После остановки запись будет расшифрована автоматически.</span></div></div><div class="field full"><label for="assistant-text">Или напишите текст</label><textarea id="assistant-text" name="text" placeholder="Например: «Мне снился поезд, а завтра в 11 нужно позвонить…»" style="min-height:110px"></textarea></div><div class="field full"><button class="btn btn-secondary" type="submit">Разобрать текст</button></div><div id="assistant-results" class="field full" hidden></div></form>`
  };

  const aiContextForm = {
    head: modalHead('Личный контекст ИИ', 'Здесь можно описать, что поможет общаться с вами бережнее. Контекст хранится локально и передаётся только при включённом согласии.'),
    body: `<form id="ai-context-form" class="form-grid"><div class="field full"><label for="ai-tone">Какой стиль вам подходит</label><textarea id="ai-tone" name="tone" placeholder="Например: спокойно, коротко, без давления и оценок" style="min-height:80px">${esc(state.profile.aiContext?.tone || '')}</textarea></div><div class="field full"><label for="ai-goals">Цели и важные ориентиры</label><textarea id="ai-goals" name="goals" placeholder="Например: восстановить режим сна, сохранить творчество, снизить перегрузку" style="min-height:80px">${esc(state.profile.aiContext?.goals || '')}</textarea></div><div class="field full"><label for="ai-boundaries">Границы для ИИ</label><textarea id="ai-boundaries" name="boundaries" placeholder="Например: не давать медицинских диагнозов, не предлагать жёсткие планы" style="min-height:80px">${esc(state.profile.aiContext?.boundaries || '')}</textarea></div><div class="field full"><label class="statistics-consent"><input name="share" type="checkbox" ${state.profile.aiContext?.share ? 'checked' : ''}> Разрешаю использовать этот контекст в ИИ-запросах.</label></div>${formActions('Сохранить контекст')}</form>`
  };

  const setupForm = {
    head: modalHead('Первые три ориентира', 'Это локальная настройка. Она помогает сделать стартовый экран вашим, но не отправляется в ИИ сама по себе.'),
    body: `<form id="setup-form" class="form-grid"><div class="field"><label for="setup-name">Как вас называть</label><input id="setup-name" name="name" value="${esc(state.profile.name)}" placeholder="Имя" autocomplete="given-name"></div><div class="field"><label for="setup-sleep">Ориентир сна, часов</label><input id="setup-sleep" name="sleepGoal" type="number" min="4" max="12" step="0.5" value="${state.profile.sleepGoal || 8}"></div><div class="field full"><label for="setup-goal">Что особенно важно сейчас</label><textarea id="setup-goal" name="goal" placeholder="Например: вернуть сон, освободить место для творчества, не перегружаться" maxlength="500"></textarea></div><p class="form-note field full">Позже это можно изменить в «Настройках» и отдельно решить, использовать ли контекст в ИИ-запросах.</p>${formActions('Сохранить и открыть день')}</form>`
  };

  const encryptedExportForm = {
    head: modalHead('Зашифровать резервную копию', 'Пароль не сохраняется в «Ритме» и не отправляется на сервер. Если забыть его, расшифровать файл будет невозможно.'),
    body: `<form id="encrypted-export-form" class="form-grid"><div class="field full"><label for="backup-password">Новый пароль</label><input id="backup-password" name="password" type="password" minlength="12" required autocomplete="new-password" placeholder="Не менее 12 символов"></div><div class="field full"><label for="backup-password-repeat">Повторите пароль</label><input id="backup-password-repeat" name="repeat" type="password" minlength="12" required autocomplete="new-password" placeholder="Повторите пароль"></div><label class="statistics-consent field full"><input name="understand" type="checkbox" required> Я понимаю: пароль не хранится и не может быть восстановлен.</label>${formActions('Скачать зашифрованный файл')}</form>`
  };

  const encryptedImportForm = {
    head: modalHead('Открыть зашифрованную копию', 'Введите пароль, который был задан при экспорте. Он используется только в памяти этого устройства для расшифровки файла.'),
    body: `<form id="encrypted-import-form" class="form-grid"><div class="field full"><label for="restore-password">Пароль от копии</label><input id="restore-password" name="password" type="password" required autocomplete="current-password" placeholder="Пароль"></div>${formActions('Расшифровать и восстановить')}</form>`
  };

  const meditationGeneratorForm = {
    head: modalHead('Создать медитацию', 'Опишите состояние и желаемый эффект. Текст будет создан только после вашего запроса; затем его можно слушать или сохранить в библиотеку.'),
    body: `<form id="meditation-generator-form" class="form-grid"><div class="field full"><label for="meditation-request">Для чего нужна практика?</label><textarea id="meditation-request" name="request" required placeholder="Например: я перегружен перед сном и хочу мягко отпустить рабочие мысли" style="min-height:120px"></textarea></div><div class="field"><label for="meditation-length">Длительность, минут</label><input id="meditation-length" name="duration" type="number" min="2" max="30" value="8"></div><div class="field"><label for="meditation-title">Название</label><input id="meditation-title" name="title" placeholder="Необязательно"></div><div class="field full"><label class="statistics-consent"><input name="consent" type="checkbox"> Я понимаю, что запрос будет отправлен в ИИ для генерации текста.</label></div>${formActions('Создать сценарий')}</form>`
  };

  const meditationMediaForm = {
    head: modalHead('Добавить свою медитацию', 'Аудио или видео сохранится локально на этом устройстве и войдёт в резервную копию. Видео будет воспроизводиться как аудиодорожка без показа изображения.'),
    body: `<form id="meditation-media-form" class="form-grid"><div class="field full"><label for="meditation-media-file">Аудио или видео</label><input id="meditation-media-file" name="file" type="file" accept="audio/*,video/*" required></div><div class="field"><label for="meditation-media-title">Название</label><input id="meditation-media-title" name="title" placeholder="Моя медитация" required maxlength="80"></div><div class="field"><label for="meditation-media-duration">Длительность, минут</label><input id="meditation-media-duration" name="duration" type="number" min="1" max="300" value="10"></div><div class="field full"><label for="meditation-media-note">Заметка</label><textarea id="meditation-media-note" name="note" placeholder="Источник, настроение или что важно помнить"></textarea></div>${formActions('Сохранить в библиотеку')}</form>`
  };

  const reflectionForm = {
    head: modalHead('Ответить себе', 'Это не тест. Можно написать одну честную фразу.'),
    body: (() => { const prompt = currentQuestion(); return `<form id="reflection-form" class="form-grid"><input type="hidden" name="theme" value="${esc(prompt.theme)}"><input type="hidden" name="question" value="${esc(prompt.question)}"><div class="field full"><label>${esc(prompt.question)}</label><textarea name="answer" placeholder="Пишите свободно или вставьте голосовую расшифровку…" required style="min-height:160px"></textarea></div>${formActions('Сохранить ответ')}</form>`; })()
  };

  const archiveForm = {
    head: modalHead('Импортировать историю', 'Файл разбирается в этом браузере. Перед сохранением вы увидите, сколько записей найдено.'),
    body: `<form id="archive-form" class="form-grid"><div class="field full"><label for="archive-file">Файл заметок или ChatGPT export</label><input id="archive-file" name="file" type="file" accept=".txt,.md,.csv,.json,application/json,text/plain,text/markdown,text/csv"></div><div class="field full"><label for="archive-text">Или вставьте текст</label><textarea id="archive-text" name="text" placeholder="Вставьте сюда несколько месяцев записей — даты будут найдены автоматически." style="min-height:150px"></textarea></div><div class="field full"><p class="muted" style="font-size:11px;line-height:1.6;margin:0">Сейчас импорт создаёт локальные черновики снов и дневниковых записей. ИИ-разметка появится отдельным подтверждаемым шагом.</p></div>${formActions('Разобрать и сохранить')}</form>`
  };

  const habitForm = {
    head: modalHead('Новая привычка', 'Начните с настолько малого шага, что его легко повторить.'),
    body: `<form id="habit-form" class="form-grid"><div class="field full"><label for="habit-name">Название</label><input id="habit-name" name="name" placeholder="Например, прогулка" required maxlength="50"></div><div class="field"><label for="habit-icon">Значок</label><select id="habit-icon" name="icon">${ICONS.map((icon) => `<option>${icon}</option>`).join('')}</select></div><div class="field"><label for="habit-goal">Мягкая цель</label><input id="habit-goal" name="goal" placeholder="10 минут" required></div>${formActions('Добавить привычку')}</form>`
  };

  const taskForm = {
    head: modalHead('Новая задача', 'Запланируйте важное и оставьте воздух.'),
    body: `<form id="task-form" class="form-grid"><div class="field full"><label for="task-title">Что нужно сделать</label><input id="task-title" name="title" placeholder="Название задачи" required maxlength="100"></div><div class="field"><label for="task-date">Дата</label><input id="task-date" name="date" type="date" value="${selectedDate}" required></div><div class="field"><label for="task-time">Время</label><input id="task-time" name="time" type="time" value="09:00"></div><div class="field full"><label for="task-category">Область</label><select id="task-category" name="category"><option value="self">Личное</option><option value="health">Здоровье</option><option value="work">Работа</option></select></div>${formActions('Добавить задачу')}</form>`
  };

  const journalForm = {
    head: modalHead('Новая запись', 'Это пространство не требует красивых формулировок.'),
    body: `<form id="journal-form" class="form-grid"><div class="field"><label for="journal-date">Дата</label><input id="journal-date" name="date" type="date" value="${dateKey(new Date())}" required></div><div class="field"><label for="journal-tags">Метки</label><input id="journal-tags" name="tags" placeholder="мысли, работа"></div><div class="field full"><label for="journal-text">Что сейчас хочется записать?</label><textarea id="journal-text" name="text" placeholder="Пишите свободно…" required style="min-height:160px"></textarea></div><div class="field"><label for="gratitude">За что благодарны?</label><input id="gratitude" name="gratitude" placeholder="По желанию"></div><div class="field"><label for="win">Что получилось?</label><input id="win" name="win" placeholder="Даже маленькая победа"></div>${formActions('Сохранить запись')}</form>`
  };

  const meditationForm = {
    head: modalHead('Медитация', 'Запишите практику и эффект без оценки.'),
    body: `<form id="meditation-form" class="form-grid"><div class="field"><label for="med-date">Дата</label><input id="med-date" name="date" type="date" value="${dateKey(new Date())}" required></div><div class="field"><label for="duration">Длительность, минут</label><input id="duration" name="duration" type="number" min="1" max="300" value="10" required></div><div class="field full"><label for="technique">Практика</label><select id="technique" name="technique"><option>Дыхание</option><option>Сканирование тела</option><option>Наблюдение</option><option>Визуализация</option><option>Другое</option></select></div><div class="field full"><label for="med-note">Что заметили?</label><textarea id="med-note" name="note" placeholder="Ощущения до и после"></textarea></div>${formActions('Сохранить практику')}</form>`
  };

  function exerciseRow(index, values = {}) {
    return `<div class="card exercise-row" data-exercise-row style="padding:14px"><div class="field"><label>Упражнение</label><input name="exercise-title" value="${esc(values.title || '')}" placeholder="Например, приседания" required></div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Подходы</label><input name="exercise-sets" type="number" min="1" max="20" value="${values.sets || 3}" required></div><div class="field"><label>Повторы</label><input name="exercise-reps" type="number" min="1" max="200" value="${values.reps || 10}" required></div><div class="field"><label>Перерыв, сек.</label><input name="exercise-rest" type="number" min="0" max="900" value="${values.rest || 60}" required></div><div class="field"><label>Вес / нагрузка</label><input name="exercise-load" value="${esc(values.load || 'свой вес')}" placeholder="свой вес"></div></div><button type="button" class="btn btn-ghost" data-remove-exercise style="margin-top:8px">Убрать упражнение</button></div>`;
  }

  const workoutForm = {
    head: modalHead('Создать тренировку', 'Соберите структуру занятия. ИИ-подбор будет добавлен после анкеты и защищённого подключения.'),
    body: `<form id="workout-form" class="form-grid"><div class="field full"><label for="workout-title">Название тренировки</label><input id="workout-title" name="title" placeholder="Например, мягкая тренировка дома" required maxlength="80"></div><div class="field"><label for="workout-date">Дата</label><input id="workout-date" name="date" type="date" value="${dateKey(new Date())}" required></div><div class="field"><label for="workout-duration">Длительность, минут</label><input id="workout-duration" name="duration" type="number" min="1" max="300" value="25" required></div><div class="field full"><label>Упражнения</label><div id="exercise-builder" class="stack">${exerciseRow(0, { title: 'Приседания' })}</div><button type="button" class="btn btn-secondary" data-add-exercise style="margin-top:10px">＋ Добавить упражнение</button></div><div class="field full"><label for="workout-note">Заметка</label><textarea id="workout-note" name="note" placeholder="Самочувствие, техника, что хочется изменить…"></textarea></div><div class="field full"><button type="button" class="btn btn-ghost" data-modal="workoutProfile">Заполнить анкету для ИИ-плана →</button></div>${formActions('Сохранить тренировку')}</form>`
  };

  const workoutProfileForm = {
    head: modalHead('Анкета для будущего плана', 'Эти данные нужны, чтобы рекомендации были бережными. Они сохраняются локально.'),
    body: `<form id="workout-profile-form" class="form-grid"><div class="field"><label for="fitness-age">Возраст</label><input id="fitness-age" name="age" type="number" min="14" max="120" value="${state.profile.fitness?.age || ''}"></div><div class="field"><label for="fitness-activity">Активность</label><select id="fitness-activity" name="activity"><option value="низкая">Низкая</option><option value="средняя">Средняя</option><option value="высокая">Высокая</option></select></div><div class="field"><label for="fitness-goal">Цель</label><input id="fitness-goal" name="goal" value="${esc(state.profile.fitness?.goal || '')}" placeholder="Сила, подвижность, энергия"></div><div class="field"><label for="fitness-equipment">Инвентарь</label><input id="fitness-equipment" name="equipment" value="${esc(state.profile.fitness?.equipment || '')}" placeholder="Коврик, гантели…"></div><div class="field full"><label for="fitness-constraints">Ограничения и предпочтения</label><textarea id="fitness-constraints" name="constraints" placeholder="Боль, травмы, что не нравится, что важно учитывать"></textarea></div>${formActions('Сохранить анкету')}</form>`
  };

  function closeModal() {
    if (voiceRecorder?.state === 'recording') voiceRecorder.stop();
    voiceStream?.getTracks().forEach((track) => track.stop());
    if (assistantRecorder?.state === 'recording') { assistantDiscarding = true; assistantRecorder.stop(); }
    assistantStream?.getTracks().forEach((track) => track.stop());
    modalRoot.innerHTML = '';
  }

  function toggleHabit(id, date) {
    const habit = state.habits.find((item) => item.id === id);
    if (!habit) return;
    const index = habit.dates.indexOf(date);
    if (index >= 0) habit.dates.splice(index, 1); else habit.dates.push(date);
    saveState(index >= 0 ? 'Отметка снята' : 'Отлично, ритм отмечен');
    renderers[currentView]();
  }

  function toggleMeditationTimer() {
    if (meditationRunning) {
      meditationRunning = false;
      clearInterval(meditationTimer);
      meditationTimer = null;
      updateMeditationUI();
      return;
    }
    meditationRunning = true;
    meditationSessionSeconds = meditationSeconds;
    meditationTimer = setInterval(() => {
      meditationSeconds -= 1;
      if (meditationSeconds <= 0) {
        clearInterval(meditationTimer);
        meditationTimer = null;
        meditationRunning = false;
        state.meditations.push({ id: uid('med'), date: dateKey(new Date()), duration: Math.max(1, Math.round(meditationSessionSeconds / 60)), technique: 'Таймер', note: 'Практика завершена в Ритме.' });
        saveState('Практика сохранена');
        meditationSeconds = 600;
        if (currentView === 'practice') { renderPractice(); return; }
      }
      if (currentView === 'practice') updateMeditationUI();
    }, 1000);
    updateMeditationUI();
  }

  function updateMeditationUI() {
    const timer = document.querySelector('#meditation-timer');
    const status = document.querySelector('#meditation-status');
    const toggle = document.querySelector('[data-meditation-toggle]');
    if (timer) timer.textContent = formatTimer(meditationSeconds);
    if (status) status.textContent = `Медитация · ${meditationRunning ? 'идёт сейчас' : 'готова к началу'}`;
    if (toggle) toggle.textContent = meditationRunning ? 'Пауза' : `Начать ${Math.max(1, Math.round(meditationSeconds / 60))} мин`;
  }

  function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

  document.addEventListener('click', async (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); navigate(nav.dataset.nav); return; }
    if (event.target.closest('[data-pwa-install]')) { installPwa(); return; }
    const modal = event.target.closest('[data-modal]');
    if (modal) { openModal(modal.dataset.modal); return; }
    if (event.target.closest('[data-voice-record]')) { toggleVoiceRecording(); return; }
    if (event.target.closest('[data-assistant-record]')) { toggleAssistantRecording(); return; }
    if (event.target.closest('[data-statistics-ai]')) {
      const consent = document.querySelector('[data-statistics-consent]');
      const result = document.querySelector('#statistics-ai-result');
      if (!consent?.checked) { toast('Сначала подтвердите, что сводка и тексты будут отправлены в ИИ'); return; }
      const recent = [...state.journals.map((item) => ({ date: item.date, text: item.text })), ...state.dreams.map((item) => ({ date: item.date, text: item.text })), ...state.captures.filter((item) => item.transcript).map((item) => ({ date: item.createdAt.slice(0, 10), text: item.transcript }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
      const snapshot = getRecentDays(14).map((day) => { const date = dateKey(day), sleep = state.sleeps[date], checkin = state.checkins[date]; return `${date}: сон ${sleep?.hours ?? '—'}ч, энергия ${checkin?.energy ?? '—'}, настроение ${checkin?.mood ?? '—'}, тревога ${checkin?.stress ?? '—'}, спокойствие ${checkin?.calm ?? '—'}`; }).join('\n');
      if (result) result.innerHTML = '<p class="muted">Готовлю бережный обзор…</p>';
      try {
        const response = await fetch('/api/reflect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, context: `Сводка за 14 дней:\n${snapshot}\n\n${aiContextText() ? `Личный контекст, разрешённый пользователем:\n${aiContextText()}\n\n` : ''}Пользовательские тексты отправлены добровольно для поиска тем и целей. Не ставь диагнозов.`, text: recent.map((item) => `${item.date}: ${item.text}`).join('\n\n') || 'Текстовых записей пока нет.' }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'ИИ временно недоступен');
        let report; try { report = JSON.parse(payload.result); } catch { report = { summary: payload.result }; }
        if (result) result.innerHTML = `<div class="ai-report"><b>Сводка ИИ</b><p>${esc(report.summary || '')}</p>${report.themes?.length ? `<p><b>Темы:</b> ${report.themes.map(esc).join(' · ')}</p>` : ''}${report.patterns?.length ? `<p><b>Паттерны:</b> ${report.patterns.map(esc).join(' · ')}</p>` : ''}<p><b>Бережный шаг:</b> ${esc(report.gentle_next_step || 'Понаблюдайте за этими данными ещё несколько дней.')}</p><p class="muted">${esc(report.limits || 'Это интерпретация записей, не медицинский вывод.')}</p></div>`;
      } catch (error) { if (result) result.innerHTML = `<p class="muted">${esc(error.message)}. Локальные графики и записи остались на устройстве.</p>`; }
      return;
    }
    const assistantRetry = event.target.closest('[data-assistant-retry]');
    if (assistantRetry) {
      const capture = state.captures.find((item) => item.id === assistantRetry.dataset.assistantRetry);
      const text = document.querySelector(`[data-capture-transcript="${assistantRetry.dataset.assistantRetry}"]`);
      if (capture && text) { capture.transcript = text.value.trim(); await processCapture(capture); }
      return;
    }
    const assistantInbox = event.target.closest('[data-assistant-save-inbox]');
    if (assistantInbox) {
      const capture = state.captures.find((item) => item.id === assistantInbox.dataset.assistantSaveInbox);
      const text = document.querySelector(`[data-capture-transcript="${assistantInbox.dataset.assistantSaveInbox}"]`);
      if (capture) { capture.transcript = text?.value.trim() || capture.transcript; state.inbox.push({ id: uid('inbox'), date: dateKey(new Date()), title: 'Черновик ассистента', text: capture.transcript, source: 'assistant' }); capture.status = 'inbox'; saveState('Черновик сохранён во «Входящие»'); closeModal(); renderers[currentView](); }
      return;
    }
    const assistantSave = event.target.closest('[data-assistant-save]');
    if (assistantSave) {
      const capture = state.captures.find((item) => item.id === assistantSave.dataset.assistantSave);
      if (!capture) return;
      const transcript = document.querySelector(`[data-capture-transcript="${capture.id}"]`);
      if (transcript) capture.transcript = transcript.value.trim();
      let saved = 0;
      document.querySelectorAll('[data-assistant-card]').forEach((card) => {
        const [captureId, indexText] = card.dataset.assistantCard.split(':');
        const index = Number(indexText);
        if (captureId !== capture.id || !card.querySelector('[name="assistant-selected"]')?.checked || capture.savedProposalIndexes.includes(index)) return;
        const proposal = capture.proposals[index] || {};
        saveProposal(proposal.kind, { title: card.querySelector('[name="title"]')?.value || '', text: card.querySelector('[name="text"]')?.value || '', date: card.querySelector('[name="date"]')?.value || '', time: card.querySelector('[name="time"]')?.value || '', category: card.querySelector('[name="category"]')?.value || '' }, capture, proposal);
        capture.savedProposalIndexes.push(index); saved += 1;
      });
      if (!saved) { toast('Выберите хотя бы одну новую карточку'); return; }
      capture.status = 'saved'; saveState(`Сохранено записей: ${saved}`); closeModal(); renderers[currentView]();
      return;
    }
    const audio = event.target.closest('[data-play-audio]');
    if (audio) { playVoiceRecording(audio.dataset.playAudio); return; }
    if (event.target.closest('[data-add-exercise]')) {
      const builder = document.querySelector('#exercise-builder');
      if (builder) builder.insertAdjacentHTML('beforeend', exerciseRow(builder.querySelectorAll('[data-exercise-row]').length));
      return;
    }
    const removeExercise = event.target.closest('[data-remove-exercise]');
    if (removeExercise) {
      const builder = document.querySelector('#exercise-builder');
      if (builder?.querySelectorAll('[data-exercise-row]').length > 1) removeExercise.closest('[data-exercise-row]').remove();
      else toast('В тренировке нужно оставить хотя бы одно упражнение');
      return;
    }
    const duration = event.target.closest('[data-meditation-duration]');
    if (duration && !meditationRunning) { meditationSeconds = Number(duration.dataset.meditationDuration); renderPractice(); return; }
    if (event.target.closest('[data-meditation-toggle]')) { toggleMeditationTimer(); return; }
    if (event.target.closest('[data-meditation-quick]')) { meditationSeconds = 180; if (!meditationRunning) toggleMeditationTimer(); return; }
    const meditationPlay = event.target.closest('[data-meditation-play]');
    if (meditationPlay) { playMeditationVoice(meditationPlay.dataset.meditationPlay); return; }
    const meditationRemove = event.target.closest('[data-meditation-remove]');
    if (meditationRemove) { removeMeditationMedia(meditationRemove.dataset.meditationRemove); return; }
    const ambientKind = event.target.closest('[data-ambient-kind]');
    if (ambientKind) { toggleAmbientSound(ambientKind.dataset.ambientKind); return; }
    if (event.target.closest('[data-meditation-ambient]')) { toggleAmbientSound(); return; }
    if (event.target.closest('[data-meditation-generate]')) { openModal('meditationGenerator'); return; }
    if (event.target.matches('.modal-backdrop') || event.target.closest('[data-close-modal]:not(.modal-backdrop)')) { closeModal(); return; }
    const habitToggle = event.target.closest('[data-habit-toggle]');
    if (habitToggle) { toggleHabit(habitToggle.dataset.habitToggle, habitToggle.dataset.date); return; }
    const mood = event.target.closest('[data-mood]');
    if (mood) {
      const key = dateKey(new Date());
      state.checkins[key] = { ...(state.checkins[key] || { energy: 6, stress: 4, rating: 7, emotions: [], note: '' }), mood: Number(mood.dataset.mood) };
      saveState('Настроение сохранено'); renderToday(); return;
    }
    const pickMood = event.target.closest('[data-pick-mood]');
    if (pickMood) {
      pickMood.parentElement.querySelectorAll('.emoji-option').forEach((el) => el.classList.remove('selected'));
      pickMood.classList.add('selected'); pickMood.parentElement.nextElementSibling.value = pickMood.dataset.pickMood; return;
    }
    const taskToggle = event.target.closest('[data-task-toggle]');
    if (taskToggle) {
      const task = state.tasks.find((item) => item.id === taskToggle.dataset.taskToggle);
      if (task) { task.done = !task.done; saveState(task.done ? 'Задача выполнена' : 'Задача возвращена'); renderers[currentView](); } return;
    }
    const taskToday = event.target.closest('[data-task-today]');
    if (taskToday) {
      const task = state.tasks.find((item) => item.id === taskToday.dataset.taskToday);
      if (task) { task.date = dateKey(new Date()); selectedDate = task.date; planMode = 'today'; planFilter = 'today'; saveState('Задача перенесена на сегодня'); renderCalendar(); } return;
    }
    const taskSelect = event.target.closest('[data-task-select]');
    if (taskSelect) { selectedTaskId = taskSelect.dataset.taskSelect; renderCalendar(); return; }
    const planModeButton = event.target.closest('[data-plan-mode]');
    if (planModeButton) { planMode = planModeButton.dataset.planMode; if (planMode === 'today') planFilter = 'today'; renderCalendar(); return; }
    const planFilterButton = event.target.closest('[data-plan-filter]');
    if (planFilterButton) { planMode = 'today'; planFilter = planFilterButton.dataset.planFilter; renderCalendar(); return; }
    const day = event.target.closest('[data-calendar-date]');
    if (day) { selectedDate = day.dataset.calendarDate; planMode = 'calendar'; renderCalendar(); return; }
    const calNav = event.target.closest('[data-calendar-nav]');
    if (calNav) { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + Number(calNav.dataset.calendarNav), 1); renderCalendar(); return; }
    if (event.target.closest('[data-calendar-today]')) { const now = new Date(); selectedDate = dateKey(now); calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); renderCalendar(); return; }
    if (event.target.closest('[data-export]')) { await exportData(); return; }
    if (event.target.closest('[data-export-encrypted]')) { openModal('encryptedExport'); return; }
    if (event.target.closest('[data-export-text]')) { exportTextArchive(); return; }
    if (event.target.closest('[data-import]')) { document.querySelector('#import-file').click(); return; }
    if (event.target.closest('[data-reset]')) {
      if (confirm('Точно удалить все локальные записи? Это действие нельзя отменить без резервной копии.')) { localStorage.removeItem(STORAGE_KEY); state = createInitialState(); state.preferences.demo = false; saveState('Данные очищены'); navigate('today'); } return;
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('input[type="range"]')) {
      const label = event.target.closest('.field')?.querySelector(`[data-range-label="${event.target.name}"]`);
      if (label) label.textContent = event.target.value;
    }
  });

  document.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formData(event.target);
    if (event.target.id === 'meditation-media-form') {
      const file = event.target.querySelector('[name="file"]')?.files?.[0];
      if (!file) { toast('Выберите аудио или видео'); return; }
      if (file.size > 80 * 1024 * 1024) { toast('Для локального хранения выберите файл до 80 МБ'); return; }
      const audioId = await saveVoiceBlob(file);
      state.meditationLibrary.push({ id: uid('media-med'), title: data.title.trim(), duration: Number(data.duration) || 10, theme: file.type.startsWith('video/') ? 'видеомедитация' : 'своя запись', text: data.note.trim() || 'Локальная аудиодорожка. Исходный файл сохранён на устройстве.', audioId, mimeType: file.type, sourceName: file.name });
      saveState('Запись сохранена локально в библиотеке'); closeModal(); navigate('practice');
    } else if (event.target.id === 'meditation-generator-form') {
      if (data.consent !== 'on') { toast('Нужно подтвердить отправку запроса в ИИ'); return; }
      try {
        const response = await fetch('/api/meditation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: data.request.trim(), duration: Number(data.duration), title: data.title.trim(), consent: true, context: aiContextText() }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.message || 'ИИ временно недоступен');
        state.meditationLibrary.push({ id: uid('custom-med'), title: payload.title || data.title.trim() || 'Моя практика', duration: Number(payload.duration) || Number(data.duration), theme: payload.theme || 'личная', text: payload.text });
        saveState('Новая медитация сохранена в библиотеке'); closeModal(); navigate('practice');
      } catch (error) { toast(`${error.message}. Запрос не сохранён и не отправляется повторно автоматически.`); }
    } else if (event.target.id === 'encrypted-export-form') {
      if (data.password !== data.repeat) { toast('Пароли не совпадают'); return; }
      try { await exportEncryptedData(data.password); closeModal(); }
      catch (error) { toast(error.message || 'Не удалось зашифровать копию'); }
    } else if (event.target.id === 'encrypted-import-form') {
      if (!pendingEncryptedBackup) { toast('Файл для восстановления не найден'); closeModal(); return; }
      try {
        const decrypted = await decryptEncryptedBackup(pendingEncryptedBackup, data.password);
        await restoreBackup(decrypted); pendingEncryptedBackup = null; closeModal();
      } catch (error) { toast(error.message || 'Не удалось открыть копию'); }
    } else if (event.target.id === 'ai-context-form') {
      state.profile.aiContext = { tone: data.tone.trim(), goals: data.goals.trim(), boundaries: data.boundaries.trim(), share: data.share === 'on' };
      saveState('Личный контекст сохранён локально'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'assistant-form') {
      const text = data.text.trim();
      if (!text) { toast('Надиктуйте или введите текст'); return; }
      const capture = createCapture({ transcript: text });
      await processCapture(capture);
    } else if (event.target.id === 'checkin-form') {
      state.checkins[dateKey(new Date())] = { mood: Number(data.mood), energy: Number(data.energy), stress: Number(data.stress), calm: Number(data.calm), rating: Number(data.rating), emotions: data.emotions.split(',').map((v) => v.trim()).filter(Boolean), note: data.note.trim() };
      saveState('Состояние записано'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'sleep-form') {
      state.sleeps[data.date] = { date: data.date, hours: Number(data.hours), bedtime: data.bedtime, wake: data.wake, quality: Number(data.quality), awakenings: Number(data.awakenings), note: data.note.trim() };
      saveState('Сон записан'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'dream-form') {
      if (!data.text.trim() && !data.audioId) { toast('Добавьте текст сна или голосовую заметку'); return; }
      state.dreams.push({ id: uid('dream'), date: data.date, text: data.text.trim(), audioId: data.audioId || null, vividness: Number(data.vividness), emotion: data.emotion.trim(), tags: data.tags.split(',').map((value) => value.trim()).filter(Boolean), analyzed: false });
      saveState('Сон сохранён локально'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'reflection-form') {
      state.reflections.push({ id: uid('reflection'), date: dateKey(new Date()), createdAt: new Date().toISOString(), theme: data.theme, question: data.question, answer: data.answer.trim() });
      saveState('Ответ сохранён'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'archive-form') {
      const file = event.target.querySelector('[name="file"]')?.files?.[0];
      const source = file ? await file.text() : data.text.trim();
      if (event.target.querySelector('[data-archive-ai]')?.checked) {
        try { await analyzeArchiveWithAI(source); closeModal(); navigate('statistics'); } catch (error) { toast(`${error.message}. Исходный файл не изменён.`); }
        return;
      }
      const imported = extractArchiveEntries(source);
      if (!imported.length) { toast('Не удалось найти записи в этом файле'); return; }
      imported.forEach((entry) => {
        if (entry.isDream) state.dreams.push({ id: uid('dream'), date: entry.date, text: entry.text, vividness: 0, emotion: '', tags: ['импорт'], analyzed: false });
        else state.journals.push({ id: uid('entry'), date: entry.date, text: entry.text, gratitude: '', win: '', tags: ['импорт'] });
      });
      saveState(`Импортировано записей: ${imported.length}`); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'habit-form') {
      state.habits.push({ id: uid('habit'), name: data.name.trim(), icon: data.icon, color: COLORS[state.habits.length % COLORS.length], goal: data.goal.trim(), dates: [] });
      saveState('Привычка добавлена'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'plan-quick-form') {
      const title = data.title.trim();
      if (!title) return;
      const task = { id: uid('task'), title, date: data.date || dateKey(new Date()), time: '', category: 'self', done: false };
      state.tasks.push(task); selectedTaskId = task.id; selectedDate = task.date; saveState('Задача добавлена'); renderCalendar();
    } else if (event.target.id === 'task-form') {
      state.tasks.push({ id: uid('task'), title: data.title.trim(), date: data.date, time: data.time, category: data.category, done: false });
      selectedDate = data.date; saveState('Задача добавлена'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'journal-form') {
      state.journals.push({ id: uid('entry'), date: data.date, text: data.text.trim(), gratitude: data.gratitude.trim(), win: data.win.trim(), tags: data.tags.split(',').map((v) => v.trim()).filter(Boolean) });
      saveState('Запись сохранена'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'meditation-form') {
      state.meditations.push({ id: uid('med'), date: data.date, duration: Number(data.duration), technique: data.technique, note: data.note.trim() });
      const habit = state.habits.find((item) => item.id === 'meditation');
      if (habit && !habit.dates.includes(data.date)) habit.dates.push(data.date);
      saveState('Практика сохранена'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'workout-form') {
      const exercises = [...event.target.querySelectorAll('[data-exercise-row]')].map((row) => ({
        title: row.querySelector('[name="exercise-title"]').value.trim(),
        sets: Number(row.querySelector('[name="exercise-sets"]').value),
        reps: Number(row.querySelector('[name="exercise-reps"]').value),
        rest: Number(row.querySelector('[name="exercise-rest"]').value),
        load: row.querySelector('[name="exercise-load"]').value.trim()
      })).filter((exercise) => exercise.title);
      state.workouts.push({ id: uid('workout'), title: data.title.trim(), date: data.date, duration: Number(data.duration), note: data.note.trim(), exercises });
      saveState('Тренировка сохранена'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'workout-profile-form') {
      state.profile.fitness = { age: Number(data.age) || null, activity: data.activity, goal: data.goal.trim(), equipment: data.equipment.trim(), constraints: data.constraints.trim() };
      saveState('Анкета сохранена локально'); closeModal(); renderers[currentView]();
    } else if (event.target.id === 'setup-form') {
      state.profile.name = data.name.trim(); state.profile.sleepGoal = Number(data.sleepGoal) || 8;
      state.profile.aiContext.goals = data.goal.trim(); state.profile.onboardingDone = true;
      saveState('Стартовая настройка сохранена локально'); closeModal(); renderToday();
    } else if (event.target.id === 'profile-form') {
      state.profile.name = data.name.trim(); state.profile.sleepGoal = Number(data.sleepGoal); saveState('Настройки сохранены'); renderSettings();
    }
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportData() {
    const backup = await createBackup();
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `rhythm-backup-${dateKey(new Date())}.json`);
    toast(backup.audio.length ? `Резервная копия скачана: ${backup.audio.length} голосовых записей` : 'Резервная копия скачана');
  }

  async function createBackup() {
    let audio = [];
    try {
      const recordings = await getAllVoiceRecordings();
      audio = await Promise.all(recordings.map(async (record) => ({ id: record.id, createdAt: record.createdAt, dataUrl: await blobToDataUrl(record.blob) })));
    } catch (_) { toast('Текст сохранён, но голосовые записи не удалось добавить в эту копию'); }
    return {
      format: 'rhythm.backup',
      schema: 3,
      exportedAt: new Date().toISOString(),
      note: 'Полная локальная копия Ритма: текстовые данные и голосовые записи.',
      data: state,
      audio
    };
  }

  async function exportEncryptedData(password) {
    const backup = await createBackup();
    const encrypted = await createEncryptedBackup(backup, password);
    downloadBlob(new Blob([JSON.stringify(encrypted)], { type: 'application/json' }), `rhythm-private-${dateKey(new Date())}.rhythm`);
    toast('Зашифрованная резервная копия скачана');
  }

  async function restoreBackup(parsed) {
    const imported = parsed?.format === 'rhythm.backup' ? parsed.data : parsed;
    if (!validBackup(parsed)) throw new Error('Неверный формат');
    state = normalizeLocalState(imported, createInitialState());
    state.captures ||= []; state.inbox ||= [];
    if (Array.isArray(parsed?.audio) && parsed.audio.length) await putVoiceRecordings(parsed.audio.filter((record) => record?.id && record?.dataUrl).map((record) => ({ id: record.id, createdAt: record.createdAt || new Date().toISOString(), blob: dataUrlToBlob(record.dataUrl) })));
    saveState('Данные восстановлены'); navigate('today');
  }

  function exportTextArchive() {
    const blocks = [
      '# Ритм — личный архив',
      '',
      `Экспорт: ${new Date().toLocaleString('ru-RU')}`,
      'Этот файл содержит только текстовые записи. Оценки, привычки и планы находятся в полной JSON-копии.',
      ''
    ];
    const addSection = (title, entries, makeText) => {
      blocks.push(`## ${title}`, '');
      if (!entries.length) { blocks.push('_Пока нет записей._', ''); return; }
      [...entries].sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((entry) => {
        blocks.push(`### ${entry.date || 'Без даты'}`, '', makeText(entry).trim() || '_Без текста_', '');
      });
    };
    addSection('Сны', state.dreams, (entry) => [entry.text, entry.emotion ? `Эмоция: ${entry.emotion}` : '', entry.tags?.length ? `Теги: ${entry.tags.join(', ')}` : ''].filter(Boolean).join('\n\n'));
    addSection('Дневник', state.journals, (entry) => [entry.text, entry.win ? `Получилось: ${entry.win}` : '', entry.gratitude ? `Благодарность: ${entry.gratitude}` : '', entry.tags?.length ? `Теги: ${entry.tags.join(', ')}` : ''].filter(Boolean).join('\n\n'));
    addSection('Вопросы и ответы', state.reflections, (entry) => [entry.question ? `Вопрос: ${entry.question}` : '', entry.answer].filter(Boolean).join('\n\n'));
    downloadBlob(new Blob([blocks.join('\n'), '\n'], { type: 'text/markdown;charset=utf-8' }), `rhythm-text-archive-${dateKey(new Date())}.md`);
    toast('Текстовый архив скачан');
  }

  document.querySelector('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (isEncryptedBackup(parsed)) { pendingEncryptedBackup = parsed; openModal('encryptedImport'); }
      else await restoreBackup(parsed);
    } catch (error) { toast('Не удалось импортировать этот файл'); }
    event.target.value = '';
  });

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  window.addEventListener('hashchange', () => navigate(location.hash.replace('#', '') || 'today'));

  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  navigate(currentView);
})();
