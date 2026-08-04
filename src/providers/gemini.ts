import type { ChatMessage, ChatStreamOptions, Provider, ToolCall, Usage } from '../types.js';
import { sse } from '../util/sse.js';

export function createGeminiProvider(apiKey: string): Provider {
  return {
    id: 'gemini',
    label: 'Google Gemini',
    needsApiKey: true,
    hasKey: !!apiKey,
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
    ],
    async chat(opts: ChatStreamOptions): Promise<Usage> {
      const { model, messages, tools, signal, onDelta, onToolCalls } = opts;
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');

      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m): any => {
          if (m.role === 'user' || m.role === 'tool') {
            return { role: 'user', parts: [{ text: m.content }] };
          }
          if (m.role === 'assistant' && m.toolCalls?.length) {
            return {
              role: 'model',
              parts: [
                ...(m.content ? [{ text: m.content }] : []),
                ...m.toolCalls.map((tc) => ({
                  functionCall: { name: tc.name, args: tc.arguments },
                })),
              ],
            };
          }
          return { role: 'model', parts: [{ text: m.content }] };
        });

      const body: Record<string, unknown> = { contents };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (tools?.length) {
        body.tools = [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            })),
          },
        ];
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      let usage: Usage = { inputTokens: 0, outputTokens: 0 };
      const calls: ToolCall[] = [];

      for await (const data of sse(res.body)) {
        let ev: any;
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.usageMetadata) {
          usage.inputTokens = ev.usageMetadata.promptTokenCount ?? usage.inputTokens;
          usage.outputTokens = ev.usageMetadata.candidatesTokenCount ?? usage.outputTokens;
        }
        const parts = ev.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.text) onDelta(part.text);
          if (part.functionCall) {
            calls.push({
              id: `gemini_${calls.length}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args || {},
            });
          }
        }
      }

      if (calls.length) onToolCalls(calls);
      return usage;
    },
  };
}
