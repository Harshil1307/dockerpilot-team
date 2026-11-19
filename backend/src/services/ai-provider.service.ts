export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class AiProviderHttpError extends Error {
  constructor(readonly status: number, readonly detail?: string) {
    super(`AI_PROVIDER_ERROR:${status}`);
    this.name = 'AiProviderHttpError';
  }
}

async function providerHttpError(response: Response, apiKey: string): Promise<AiProviderHttpError> {
  let detail: string | undefined;
  try {
    const payload = await response.json() as { error?: { message?: unknown } };
    if (typeof payload.error?.message === 'string') {
      detail = payload.error.message
        .replaceAll(apiKey, '[redacted]')
        .replace(/\s+/g, ' ')
        .slice(0, 300);
    }
  } catch { /* Provider may return a non-JSON error body. */ }
  return new AiProviderHttpError(response.status, detail);
}

export function aiProviderConfiguration() {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) return { provider: 'gemini' as const, apiKey: geminiKey, model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite' };
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) return { provider: 'openai' as const, apiKey: openAiKey, model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini' };
  return null;
}

export async function requestAiText(messages: AiMessage[], options: { temperature: number; json?: boolean; timeoutMs?: number }) {
  const config = aiProviderConfiguration();
  if (!config) throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  let response: Response;
  if (config.provider === 'gemini') {
    const system = messages.find((message) => message.role === 'system')?.content;
    const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
    const generationConfig: Record<string, unknown> = { temperature: options.temperature };
    if (options.json) generationConfig.responseMimeType = 'application/json';
    const body: Record<string, unknown> = { contents, generationConfig };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!response.ok) throw await providerHttpError(response, config.apiKey);
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => typeof part.text === 'string' ? part.text : '').join('');
    if (!text?.trim()) throw new Error('AI_EMPTY_RESPONSE');
    return { text, model: config.model, provider: config.provider };
  }
  const body: Record<string, unknown> = { model: config.model, messages, temperature: options.temperature };
  if (options.json) body.response_format = { type: 'json_object' };
  response = await fetch(`${(process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!response.ok) throw await providerHttpError(response, config.apiKey);
  const data = await response.json() as { choices?: { message?: { content?: unknown } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('AI_EMPTY_RESPONSE');
  return { text, model: config.model, provider: config.provider };
}
