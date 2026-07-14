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

export function normalizeLocalState(raw, initial) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    ...initial,
    ...value,
    profile: { ...initial.profile, ...(value.profile || {}), aiContext: { ...(initial.profile?.aiContext || {}), ...(value.profile?.aiContext || {}) } },
    habits: Array.isArray(value.habits) ? value.habits : initial.habits,
    tasks: Array.isArray(value.tasks) ? value.tasks : initial.tasks,
    dreams: Array.isArray(value.dreams) ? value.dreams : [],
    journals: Array.isArray(value.journals) ? value.journals : [],
    meditations: Array.isArray(value.meditations) ? value.meditations : [],
    workouts: Array.isArray(value.workouts) ? value.workouts : [],
    captures: Array.isArray(value.captures) ? value.captures : [],
    inbox: Array.isArray(value.inbox) ? value.inbox : [],
    meditationLibrary: Array.isArray(value.meditationLibrary) ? value.meditationLibrary : []
  };
}

export function validBackup(backup) {
  const data = backup?.format === 'rhythm.backup' ? backup.data : backup;
  return Boolean(data && Array.isArray(data.habits) && Array.isArray(data.tasks));
}
