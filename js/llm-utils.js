export function openAICompatibleChatUrl(baseUrl = '') {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!clean) return '';
  return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
}

export function jsonOnlyInstructions(instructions = '', schemaName = 'rhythm_json') {
  return [
    String(instructions || '').trim(),
    `Верни только валидный JSON для схемы ${schemaName}.`,
    'Не добавляй Markdown, пояснения, комментарии или текст до/после JSON.'
  ].filter(Boolean).join('\n\n');
}

export function extractJsonText(text = '') {
  const source = String(text || '').trim();
  if (!source) return '';
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] || source).trim();
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {}

  const start = Math.min(...['{', '['].map((char) => {
    const index = candidate.indexOf(char);
    return index === -1 ? Infinity : index;
  }));
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (!Number.isFinite(start) || end <= start) return candidate;
  const sliced = candidate.slice(start, end + 1);
  try {
    JSON.parse(sliced);
    return sliced;
  } catch {
    return candidate;
  }
}
