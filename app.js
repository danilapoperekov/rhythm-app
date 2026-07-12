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
  const ICONS = ['🧘', '💧', '📖', '🚶', '✍️', '🏃', '🌿', '🎯'];
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WEEK_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const app = document.querySelector('#app');
  const modalRoot = document.querySelector('#modal-root');
  let currentView = location.hash.replace('#', '') || 'today';
  let selectedDate = dateKey(new Date());
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

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
      profile: { name: '', sleepGoal: 8 },
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
      return saved ? { ...createInitialState(), ...JSON.parse(saved) } : createInitialState();
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
  let meditationSeconds = 600;
  let meditationSessionSeconds = 600;
  let meditationTimer = null;
  let meditationRunning = false;
  let voiceRecorder = null;
  let voiceStream = null;
  let voiceChunks = [];

  function saveState(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (message) toast(message);
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
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('rhythm-audio-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('recordings', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction('recordings', 'readwrite');
        const id = uid('audio');
        transaction.objectStore('recordings').put({ id, blob, createdAt: new Date().toISOString() });
        transaction.oncomplete = () => resolve(id);
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }

  function getVoiceBlob(id) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('rhythm-audio-v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction('recordings', 'readonly');
        const read = transaction.objectStore('recordings').get(id);
        read.onsuccess = () => resolve(read.result?.blob || null);
        read.onerror = () => reject(read.error);
      };
    });
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

    app.innerHTML = `<div class="page">
      ${pageHeader(formatDate(today, true), `${greeting()}${firstName}`, 'Небольшая пауза, чтобы услышать себя.', '<button class="btn btn-secondary" data-modal="dream">☾ Сон</button><button class="btn btn-primary" data-modal="checkin">Записать состояние</button>')}
      <div class="grid summary-grid">
        <article class="card summary-card"><div class="summary-label"><span class="dot-icon">☾</span>Сон</div><div><div class="summary-value">${sleep ? `${String(sleep.hours).replace('.', ',')} ч` : '—'}</div><div class="summary-meta">Среднее за неделю ${sleepAvg} ч</div></div></article>
        <article class="card summary-card"><div class="summary-label"><span class="dot-icon">◉</span>Состояние</div><div><div class="summary-value">${checkin ? `${MOODS.find((m) => m.value === checkin.mood)?.emoji || '😌'} ${checkin.energy}/10` : 'Не отмечено'}</div><div class="summary-meta">${checkin ? `стресс ${checkin.stress}/10` : 'это займёт меньше минуты'}</div></div></article>
        <article class="card summary-card"><div class="summary-label"><span class="dot-icon">✓</span>Привычки</div><div><div class="summary-value">${doneHabits}/${state.habits.length}</div><div class="summary-meta">${habitPercent}% выполнено сегодня</div></div></article>
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
    const tasks = state.tasks.filter((task) => task.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
    const taskList = tasks.length ? tasks.map((task) => `<div class="task-card ${task.done ? 'done' : ''}"><button class="task-toggle ${task.done ? 'done' : ''}" data-task-toggle="${task.id}">${task.done ? '✓' : ''}</button><div><div class="task-title">${esc(task.title)}</div><div class="task-time">${task.time || 'Весь день'} · ${task.category === 'work' ? 'Работа' : task.category === 'health' ? 'Здоровье' : 'Личное'}</div></div><span class="task-type" style="background:${task.category === 'work' ? '#7ca0b4' : task.category === 'health' ? '#86a97a' : '#ef9a62'}"></span></div>`).join('') : '<div class="agenda-empty">На этот день ничего не запланировано.<br>Оставьте пространство или добавьте задачу.</div>';
    app.innerHTML = `<div class="page">
      ${pageHeader('Планы без перегруза', 'Календарь', 'Задачи, события и ваше состояние в одном контексте.', '<button class="btn btn-primary" data-modal="task">＋ Новая задача</button>')}
      <div class="grid calendar-layout">
        <section class="card calendar-card"><div class="calendar-toolbar"><div class="month-title">${MONTHS[calendarCursor.getMonth()]} ${calendarCursor.getFullYear()}</div><div class="cal-nav"><button class="icon-btn" data-calendar-nav="-1" aria-label="Предыдущий месяц">←</button><button class="icon-btn" data-calendar-today aria-label="Сегодня">•</button><button class="icon-btn" data-calendar-nav="1" aria-label="Следующий месяц">→</button></div></div><div class="weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div><div class="calendar-grid">${calendarCells()}</div></section>
        <aside class="card agenda-card"><div class="card-head"><div><div class="eyebrow">Выбранный день</div><div class="agenda-date">${formatDate(selectedDate, true)}</div></div><button class="icon-btn" data-modal="task" aria-label="Добавить задачу">＋</button></div><div class="task-list">${taskList}</div></aside>
      </div>
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
    const entryHtml = entries.length ? entries.map((entry) => `<article class="card entry"><div class="entry-date">${formatDate(entry.date, true)}</div><p>${esc(entry.text)}</p>${entry.gratitude || entry.win ? `<div class="entry-tags">${entry.gratitude ? `<span class="tag">Спасибо: ${esc(entry.gratitude)}</span>` : ''}${entry.win ? `<span class="tag">Получилось: ${esc(entry.win)}</span>` : ''}</div>` : ''}</article>`).join('') : '<div class="empty-state"><div class="empty-icon">✍️</div>Ваши записи появятся здесь</div>';
    const dreamHtml = dreams.length ? dreams.map((dream) => `<div class="entry" style="padding:14px 0"><div class="entry-date">${formatDate(dream.date)} · ${'●'.repeat(dream.vividness || 3)} ${esc(dream.emotion || '')}</div>${dream.text ? `<p style="font-size:12px">${esc(dream.text)}</p>` : '<p class="muted" style="font-size:12px">Голосовая заметка без текста</p>'}${dream.audioId ? `<button class="btn btn-ghost" data-play-audio="${dream.audioId}">▷ Прослушать голос</button>` : ''}${dream.tags?.length ? `<div class="entry-tags">${dream.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : ''}</div>`).join('') : '<p class="muted">Первый сон можно записать утром — голосом или текстом.</p>';
    const meditations = [...state.meditations].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    const medHtml = meditations.length ? meditations.map((med) => `<div class="habit-row"><div class="habit-icon" style="background:${COLORS[0]}">🧘</div><div><div class="habit-name">${med.duration} минут · ${esc(med.technique)}</div><div class="habit-meta">${formatDate(med.date)}</div></div></div>`).join('') : '<p class="muted">Пока нет практик</p>';
    const answers = [...state.reflections].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2);
    const answersHtml = answers.length ? answers.map((item) => `<div class="entry" style="padding:13px 0"><div class="entry-date">${esc(item.theme)}</div><p style="font-size:12px">${esc(item.answer)}</p></div>`).join('') : '<p class="muted">Ответы на вопросы дня появятся здесь.</p>';
    app.innerHTML = `<div class="page">
      ${pageHeader('Место для себя', 'Дневник', 'Сны, мысли, эмоции и практики в одной личной истории.', '<button class="btn btn-ghost" data-modal="archive">⇧ История</button><button class="btn btn-secondary" data-modal="dream">☾ Сон</button><button class="btn btn-primary" data-modal="journal">＋ Мысль</button>')}
      <div class="grid journal-layout"><div class="stack"><section class="card journal-prompt"><div class="eyebrow">Вопрос дня · ${esc(prompt.theme)}</div><blockquote>${esc(prompt.question)}</blockquote><button class="btn btn-primary" data-modal="reflection">Ответить</button></section><section class="card"><div class="card-head"><div><div class="eyebrow">Сны</div><h2>Последние образы</h2></div><button class="btn btn-ghost" data-modal="dream">＋</button></div>${dreamHtml}</section><div class="entry-list">${entryHtml}</div></div><aside class="stack"><section class="card"><div class="card-head"><h2>Практики</h2><button class="btn btn-ghost" data-nav="practice">Открыть</button></div>${medHtml}</section><section class="card"><div class="card-head"><div><div class="eyebrow">Последние ответы</div><h2>Мой голос</h2></div></div>${answersHtml}</section><section class="card"><div class="eyebrow">За всё время</div><div class="summary-value">${state.journals.length + state.dreams.length + state.reflections.length}</div><div class="summary-meta">личных записей</div></section></aside></div>
    </div>`;
  }

  function renderSettings() {
    const size = new Blob([JSON.stringify(state)]).size;
    app.innerHTML = `<div class="page">
      ${pageHeader('Под вашим контролем', 'Настройки', 'Приватность, перенос данных и будущие подключения.', '')}
      <div class="grid dashboard-grid"><div class="stack"><section class="card"><h2>Ваши данные</h2><div class="settings-list"><div class="settings-row"><div class="settings-icon">⌂</div><div><h3>Локальное хранение</h3><p>Все записи сейчас хранятся только в этом браузере.</p></div><span class="badge">активно</span></div><div class="settings-row"><div class="settings-icon">⇩</div><div><h3>Резервная копия</h3><p>${Math.max(1, Math.round(size / 1024))} КБ · можно перенести на другое устройство.</p></div><button class="btn btn-secondary" data-export>Скачать</button></div><div class="settings-row"><div class="settings-icon">⇧</div><div><h3>Восстановить копию</h3><p>Импортировать ранее сохранённый JSON-файл.</p></div><button class="btn btn-secondary" data-import>Выбрать</button></div></div></section><section class="card"><h2>Профиль и цели</h2><form id="profile-form" class="form-grid"><div class="field"><label for="profile-name">Как вас называть</label><input id="profile-name" name="name" value="${esc(state.profile.name)}" placeholder="Имя"></div><div class="field"><label for="sleep-goal">Цель сна, часов</label><input id="sleep-goal" name="sleepGoal" type="number" min="4" max="12" step="0.5" value="${state.profile.sleepGoal}"></div><div class="form-actions field full"><button class="btn btn-primary" type="submit">Сохранить</button></div></form></section></div><aside class="stack"><section class="card"><h2>Будущие интеграции</h2><div class="architecture"><div class="architecture-step"><span>1</span><div><h3>Календари</h3><div class="habit-meta">Google Calendar, Apple Calendar, Outlook</div></div></div><div class="architecture-step"><span>2</span><div><h3>Здоровье</h3><div class="habit-meta">Apple HealthKit и Android Health Connect</div></div></div><div class="architecture-step"><span>3</span><div><h3>Синхронизация</h3><div class="habit-meta">Шифрование и несколько устройств</div></div></div></div></section><section class="card"><h2>Чистый лист</h2><p class="muted" style="font-size:11px;line-height:1.6">Удалит все записи на этом устройстве. Сначала скачайте резервную копию.</p><button class="btn btn-danger" data-reset>Удалить все данные</button></section></aside></div>
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

  const renderers = { today: renderToday, calendar: renderCalendar, sleep: renderSleep, habits: renderHabits, journal: renderJournal, practice: renderPractice, insights: renderInsights, settings: renderSettings };

  function navigate(view) {
    currentView = renderers[view] ? view : 'today';
    history.replaceState(null, '', `#${currentView}`);
    document.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('active', el.dataset.nav === currentView));
    renderers[currentView]();
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
      habit: habitForm,
      task: taskForm,
      journal: journalForm,
      meditation: meditationForm,
      workout: workoutForm,
      workoutProfile: workoutProfileForm
    };
    if (!templates[type]) return;
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true" aria-label="Форма"><div class="modal-head"><div>${templates[type].head}</div><button class="icon-btn" data-close-modal aria-label="Закрыть">×</button></div>${templates[type].body}</div></div>`;
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

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); navigate(nav.dataset.nav); return; }
    const modal = event.target.closest('[data-modal]');
    if (modal) { openModal(modal.dataset.modal); return; }
    if (event.target.closest('[data-voice-record]')) { toggleVoiceRecording(); return; }
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
    const day = event.target.closest('[data-calendar-date]');
    if (day) { selectedDate = day.dataset.calendarDate; renderCalendar(); return; }
    const calNav = event.target.closest('[data-calendar-nav]');
    if (calNav) { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + Number(calNav.dataset.calendarNav), 1); renderCalendar(); return; }
    if (event.target.closest('[data-calendar-today]')) { const now = new Date(); selectedDate = dateKey(now); calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); renderCalendar(); return; }
    if (event.target.closest('[data-export]')) { exportData(); return; }
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
    if (event.target.id === 'checkin-form') {
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
    } else if (event.target.id === 'profile-form') {
      state.profile.name = data.name.trim(); state.profile.sleepGoal = Number(data.sleepGoal); saveState('Настройки сохранены'); renderSettings();
    }
  });

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `rhythm-backup-${dateKey(new Date())}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Резервная копия скачана');
  }

  document.querySelector('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || !Array.isArray(imported.habits) || !Array.isArray(imported.tasks)) throw new Error('Неверный формат');
      state = { ...createInitialState(), ...imported };
      saveState('Данные восстановлены'); navigate('today');
    } catch (error) { toast('Не удалось импортировать этот файл'); }
    event.target.value = '';
  });

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  window.addEventListener('hashchange', () => navigate(location.hash.replace('#', '') || 'today'));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  navigate(currentView);
})();
