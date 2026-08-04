import type { ChatMessage, ChatStreamOptions, Provider, ToolCall, Usage } from '../types.js';

/** Provedor de demonstração — simula respostas sem API key, para testar a TUI */
export function createMockProvider(): Provider {
  return {
    id: 'demo',
    label: 'Demo (sem API)',
    needsApiKey: false,
    hasKey: true,
    defaultModel: 'kz-demo-1',
    models: [{ id: 'kz-demo-1', label: 'KZ Demo 1' }],
    async chat(opts: ChatStreamOptions): Promise<Usage> {
      const { messages, onDelta, onToolCalls, signal } = opts;
      const last = [...messages].reverse().find((m) => m.role === 'user');
      const text = last?.content ?? '';

      // simula um tool call se o usuário pedir
      if (/ler arquivo|read_file|listar|list_directory/i.test(text)) {
        const calls: ToolCall[] = [
          {
            id: 'demo_1',
            name: 'list_directory',
            arguments: { path: '.' },
          },
        ];
        await sleep(300, signal);
        onToolCalls(calls);
        return { inputTokens: 10, outputTokens: 5 };
      }

      const reply = [
        '🤖 [MODO DEMO] Sem API key configurada, este é o modo de demonstração do kicode.',
        '',
        `Você escreveu: "${text.slice(0, 60)}"`,
        '',
        'Para usar IAs reais, configure uma API key com /login ou defina variáveis de ambiente:',
        '  ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY…',
        '',
        '✨ Este agente foi feito pela Kizuri Studio. Suporte a muitos provedores e modelos!',
      ].join('\n');

      for (const ch of reply) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        onDelta(ch);
        await sleep(5, signal);
      }
      return { inputTokens: 24, outputTokens: reply.length / 4 };
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const t = setTimeout(resolvePromise, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    }
  });
}
