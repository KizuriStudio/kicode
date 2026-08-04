import type { ChatMessage, ChatStreamOptions, Provider, ToolCall, Usage } from '../types.js';
import { sse } from '../util/sse.js';

export interface OpenAICompatConfig {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  models: { id: string; label: string }[];
}

/** Factory para qualquer API compatível com /chat/completions (OpenAI, Groq, Mistral, DeepSeek, OpenRouter, xAI, Ollama) */
export function createOpenAICompatProvider(cfg: OpenAICompatConfig): Provider {
  return {
    id: cfg.id,
    label: cfg.label,
    needsApiKey: true,
    hasKey: !!cfg.apiKey,
    defaultModel: cfg.defaultModel,
    models: cfg.models,
    ...(cfg.apiKey
      ? {
          async listModels(): Promise<{ id: string; label: string }[]> {
            const res = await fetch(`${cfg.baseUrl}/models`, {
              headers: { authorization: `Bearer ${cfg.apiKey}` },
            });
            if (!res.ok) throw new Error(`${cfg.label} HTTP ${res.status}`);
            const data: any = await res.json();
            return (data.data || []).map((m: { id: string }) => ({
              id: m.id,
              label: m.id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            }));
          },
        }
      : {}),
    async chat(opts: ChatStreamOptions): Promise<Usage> {
      const { model, messages, tools, signal, onDelta, onToolCalls } = opts;
      const body: Record<string, unknown> = {
        model,
        stream: true,
        messages: messages.map((m) => {
          if (m.role === 'system') return { role: 'system', content: m.content };
          if (m.role === 'tool') {
            return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
          }
          if (m.role === 'assistant' && m.toolCalls?.length) {
            return {
              role: 'assistant',
              content: m.content || null,
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            };
          }
          return { role: m.role, content: m.content };
        }),
      };
      if (tools?.length) {
        body.tools = tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        }));
      }
      if (cfg.id === 'openrouter') {
        (body as any).models = undefined; // garante compat
      }

      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.apiKey}`,
          ...(cfg.id === 'openrouter' ? { 'HTTP-Referer': 'https://kizuri.studio', 'X-Title': 'kicode' } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${cfg.label} HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      let usage: Usage = { inputTokens: 0, outputTokens: 0 };
      const pendingToolCalls = new Map<number, { id?: string; name: string; json: string }>();

      for await (const data of sse(res.body)) {
        let ev: any;
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.usage) {
          usage.inputTokens = ev.usage.prompt_tokens ?? usage.inputTokens;
          usage.outputTokens = ev.usage.completion_tokens ?? usage.outputTokens;
        }
        const choice = ev.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) onDelta(delta.content);
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const existing = pendingToolCalls.get(idx) ?? { name: '', json: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.json += tc.function.arguments;
            pendingToolCalls.set(idx, existing);
          }
        }
      }

      if (pendingToolCalls.size) {
        const calls: ToolCall[] = [...pendingToolCalls.values()].map((v, i) => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(v.json || '{}');
          } catch {
            parsed = {};
          }
          return { id: v.id || `call_${i}`, name: v.name, arguments: parsed };
        });
        onToolCalls(calls);
      }
      return usage;
    },
  };
}
