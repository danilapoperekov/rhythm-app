export const CAPTURE_KINDS = new Set(['dream', 'journal', 'checkin', 'task', 'habit', 'meditation', 'workout', 'inbox']);

export function splitTextForAnalysis(text, size = 18000) {
  const source = String(text || '').trim();
  if (!source) return [];
  const chunks = [];
  for (let start = 0; start < source.length; start += size) chunks.push(source.slice(start, start + size));
  return chunks;
}

export function clampScale(value, min = 1, max = 10) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

export function normalizeCaptureProposal(proposal = {}) {
  const kind = CAPTURE_KINDS.has(proposal.kind) ? proposal.kind : 'inbox';
  return {
    kind,
    title: String(proposal.title || ''), text: String(proposal.text || ''), source: String(proposal.source || ''),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(proposal.date || '')) ? proposal.date : '',
    time: /^\d{2}:\d{2}$/.test(String(proposal.time || '')) ? proposal.time : '',
    category: ['self', 'health', 'work'].includes(proposal.category) ? proposal.category : 'self',
    mood: clampScale(proposal.mood, 1, 5), energy: clampScale(proposal.energy), stress: clampScale(proposal.stress), calm: clampScale(proposal.calm), rating: clampScale(proposal.rating),
    emotions: Array.isArray(proposal.emotions) ? proposal.emotions.map(String).slice(0, 12) : [],
    duration: clampScale(proposal.duration, 1, 300), habitName: String(proposal.habitName || '')
  };
}

function objectMap(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizeHabits(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((habit) => habit && typeof habit === 'object').map((habit, index) => ({
    ...habit,
    id: String(habit.id || `habit-${index}`),
    name: String(habit.name || 'Привычка'),
    icon: String(habit.icon || '✦'),
    color: String(habit.color || '#dce8d2'),
    goal: String(habit.goal || ''),
    dates: Array.isArray(habit.dates) ? habit.dates.map(String) : []
  }));
}

function normalizeTasks(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((task) => task && typeof task === 'object').map((task, index) => ({
    ...task,
    id: String(task.id || `task-${index}`),
    title: String(task.title || 'Задача'),
    date: String(task.date || ''),
    time: String(task.time || ''),
    category: ['self', 'health', 'work'].includes(task.category) ? task.category : 'self',
    note: String(task.note || ''),
    done: Boolean(task.done),
    cancelled: Boolean(task.cancelled)
  }));
}

function normalizeRecordArray(value, fallback, normalize) {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).map(normalize);
}

function normalizeDatedMap(value, fallback, normalize) {
  const source = objectMap(value, fallback);
  return Object.fromEntries(Object.entries(source).filter(([, item]) => item && typeof item === 'object' && !Array.isArray(item)).map(([key, item]) => [key, normalize(item, key)]));
}

function text(value) {
  return String(value || '');
}

export function normalizeLocalState(raw, initial) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const profile = objectMap(value.profile);
  return {
    ...initial,
    ...value,
    profile: { ...initial.profile, ...profile, aiContext: { ...(initial.profile?.aiContext || {}), ...objectMap(profile.aiContext) } },
    sleeps: normalizeDatedMap(value.sleeps, initial.sleeps || {}, (sleep, key) => ({
      ...sleep, date: text(sleep.date || key), bedtime: text(sleep.bedtime), wake: text(sleep.wake),
      hours: Number.isFinite(Number(sleep.hours)) ? Number(sleep.hours) : 0,
      quality: clampScale(sleep.quality, 1, 5) || 0,
      awakenings: Math.max(0, Number(sleep.awakenings) || 0), note: text(sleep.note)
    })),
    checkins: normalizeDatedMap(value.checkins, initial.checkins || {}, (checkin) => ({
      ...checkin, mood: clampScale(checkin.mood, 1, 5) || 3, energy: clampScale(checkin.energy) || 6,
      stress: clampScale(checkin.stress) || 4, calm: clampScale(checkin.calm) || 5, rating: clampScale(checkin.rating) || 7,
      emotions: Array.isArray(checkin.emotions) ? checkin.emotions.map(String).slice(0, 12) : [], note: text(checkin.note)
    })),
    habits: normalizeHabits(value.habits, initial.habits),
    tasks: normalizeTasks(value.tasks, initial.tasks),
    dreams: normalizeRecordArray(value.dreams, [], (dream, index) => ({ ...dream, id: text(dream.id || `dream-${index}`), date: text(dream.date), text: text(dream.text), vividness: clampScale(dream.vividness, 1, 5) || 0, emotion: text(dream.emotion), tags: Array.isArray(dream.tags) ? dream.tags.map(String).slice(0, 20) : [], analysis: text(dream.analysis), audioId: dream.audioId ? text(dream.audioId) : null })),
    journals: normalizeRecordArray(value.journals, [], (entry, index) => ({ ...entry, id: text(entry.id || `journal-${index}`), date: text(entry.date), text: text(entry.text), gratitude: text(entry.gratitude), win: text(entry.win), tags: Array.isArray(entry.tags) ? entry.tags.map(String).slice(0, 20) : [] })),
    reflections: normalizeRecordArray(value.reflections, [], (entry, index) => ({ ...entry, id: text(entry.id || `reflection-${index}`), date: text(entry.date), createdAt: text(entry.createdAt), theme: text(entry.theme), question: text(entry.question), answer: text(entry.answer) })),
    meditations: normalizeRecordArray(value.meditations, [], (entry, index) => ({ ...entry, id: text(entry.id || `meditation-${index}`), date: text(entry.date), duration: Math.max(0, Number(entry.duration) || 0), technique: text(entry.technique), note: text(entry.note) })),
    workouts: normalizeRecordArray(value.workouts, [], (entry, index) => ({ ...entry, id: text(entry.id || `workout-${index}`), date: text(entry.date), title: text(entry.title), duration: Math.max(0, Number(entry.duration) || 0), note: text(entry.note), exercises: Array.isArray(entry.exercises) ? entry.exercises.filter((exercise) => exercise && typeof exercise === 'object') : [] })),
    captures: normalizeRecordArray(value.captures, [], (entry, index) => ({ ...entry, id: text(entry.id || `capture-${index}`), createdAt: text(entry.createdAt), transcript: text(entry.transcript), audioId: entry.audioId ? text(entry.audioId) : null, status: text(entry.status), proposals: Array.isArray(entry.proposals) ? entry.proposals.map(normalizeCaptureProposal) : [] })),
    inbox: normalizeRecordArray(value.inbox, [], (entry, index) => ({ ...entry, id: text(entry.id || `inbox-${index}`), date: text(entry.date), title: text(entry.title), text: text(entry.text), source: text(entry.source) })),
    meditationLibrary: normalizeRecordArray(value.meditationLibrary, [], (entry, index) => ({ ...entry, id: text(entry.id || `library-${index}`), title: text(entry.title), theme: text(entry.theme), text: text(entry.text), duration: Math.max(1, Number(entry.duration) || 1), audioId: entry.audioId ? text(entry.audioId) : null, sourceName: text(entry.sourceName), mimeType: text(entry.mimeType) }))
  };
}

export function validBackup(backup) {
  const data = backup?.format === 'rhythm.backup' ? backup.data : backup;
  return Boolean(data && Array.isArray(data.habits) && Array.isArray(data.tasks));
}
