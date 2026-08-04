import type { ChatMessage, Provider, Tool, ToolContext, ToolResult, Usage } from '../types.js';
import { getTools } from '../tools/index.js';

export interface AgentHooks {
  onDelta?: (text: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, result: ToolResult) => void;
  onUsage?: (usage: Usage) => void;
  onThinking?: (thinking: boolean) => void;
}

export interface AgentOptions {
  provider: Provider;
  model: string;
  system: string;
  cwd: string;
  approve: (command: string) => Promise<boolean>;
  delegate: (task: string) => Promise<string>;
  maxSteps?: number;
  signal?: AbortSignal;
}

export class Agent {
  private tools: Tool[];
  private hooks: AgentHooks;

  constructor(
    private opts: AgentOptions,
    hooks: AgentHooks = {},
  ) {
    this.hooks = hooks;
    this.tools = getTools(opts.delegate);
  }

  async run(history: ChatMessage[]): Promise<{ messages: ChatMessage[]; usage: Usage }> {
    const { provider, model, system, cwd, approve, maxSteps = 20, signal } = this.opts;
    const messages: ChatMessage[] = [
      ...history.filter((m) => m.role !== 'system'),
    ];
    let totalUsage: Usage = { inputTokens: 0, outputTokens: 0 };

    const ctx: ToolContext = { cwd, approve, delegate: this.opts.delegate };

    for (let step = 0; step < maxSteps; step++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      this.hooks.onThinking?.(true);
      let assistantText = '';
      let toolCalls: NonNullable<ChatMessage['toolCalls']> = [];

      const usage = await provider.chat({
        model,
        system,
        messages,
        tools: this.tools.map((t) => t.def),
        signal,
        onDelta: (t) => {
          assistantText += t;
          this.hooks.onDelta?.(t);
        },
        onToolCalls: (calls) => {
          toolCalls = calls;
        },
      });
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      this.hooks.onUsage?.(usage);
      this.hooks.onThinking?.(false);

      const assistantMsg: ChatMessage = { role: 'assistant', content: assistantText };
      if (toolCalls.length) assistantMsg.toolCalls = toolCalls;
      messages.push(assistantMsg);

      if (!toolCalls.length) break;

      for (const call of toolCalls) {
        const tool = this.tools.find((t) => t.def.name === call.name);
        this.hooks.onToolStart?.(call.name, call.arguments);
        let result: ToolResult;
        if (!tool) {
          result = { ok: false, output: `Ferramenta desconhecida: ${call.name}` };
        } else {
          try {
            result = await tool.execute(call.arguments, ctx);
          } catch (e: any) {
            result = { ok: false, output: `Erro: ${e.message}` };
          }
        }
        this.hooks.onToolEnd?.(call.name, result);
        messages.push({
          role: 'tool',
          content: result.output,
          name: call.name,
          toolCallId: call.id,
        });
      }
    }

    return { messages, usage: totalUsage };
  }
}
