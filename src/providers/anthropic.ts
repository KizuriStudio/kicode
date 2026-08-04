import type { ChatMessage, ChatStreamOptions, Provider, ToolCall, Usage } from '../types.js';
import { sse } from '../util/sse.js';

const API = 'https://api.anthropic.com/v1/messages';

export function createAnthropicProvider(apiKey: string): Provider {
  return {
    id: 'anthropic',
    label: 'Anthropic',
    needsApiKey: true,
    hasKey: !!apiKey,
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
      { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-latest', label: 'Claude 3 Opus' },
    ],
    async chat(opts: ChatStreamOptions): Promise<Usage> {
      const { model, messages, tools, signal, onDelta, onToolCalls } = opts;
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const body: Record<string, unknown> = {
        model,
        max_tokens: 8192,
        stream: true,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => {
            if (m.role === 'tool') {
              return {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: m.toolCallId,
                    content: m.content,
                  },
                ],
              };
            }
            if (m.role === 'assistant' && m.toolCalls?.length) {
              return {
                role: 'assistant',
                content: [
                  { type: 'text', text: m.content },
                  ...m.toolCalls.map((tc) => ({
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.name,
                    input: tc.arguments,
                  })),
                ],
              };
            }
            return { role: m.role, content: m.content };
          }),
      };
      if (system) body.system = system;
      if (tools?.length) {
        body.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }));
      }

      const res = await fetch(API, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      let usage: Usage = { inputTokens: 0, outputTokens: 0 };
      const pendingToolCalls = new Map<string, { name: string; json: string }>();
      const textParts: string[] = [];

      for await (const data of sse(res.body)) {
        let ev: any;
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.type === 'message_start') {
          usage.inputTokens = ev.message?.usage?.input_tokens ?? 0;
        } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          pendingToolCalls.set(ev.index, {
            name: ev.content_block.name,
            json: '',
          });
        } else if (ev.type === 'content_block_delta') {
          const d = ev.delta;
          if (d?.type === 'text_delta') {
            textParts.push(d.text);
            onDelta(d.text);
          } else if (d?.type === 'input_json_delta') {
            const existing = pendingToolCalls.get(ev.index);
            if (existing) existing.json += d.partial_json;
          }
        } else if (ev.type === 'message_delta') {
          usage.outputTokens = ev.usage?.output_tokens ?? usage.outputTokens;
        }
      }

      if (pendingToolCalls.size) {
        const calls: ToolCall[] = [...pendingToolCalls.entries()].map(([id, v]) => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(v.json || '{}');
          } catch {
            parsed = {};
          }
          return { id, name: v.name, arguments: parsed };
        });
        onToolCalls(calls);
      }
      void textParts;
      return usage;
    },
  };
}
