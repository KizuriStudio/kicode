import type { ChatMessage, Provider, Usage } from './types.js';
import { Agent } from './agent/Agent.js';
import { estimateCost, formatCost, formatTokens } from './cost.js';
import { loadSession, saveSession, makeId, defaultTitle } from './session.js';

export interface HeadlessOptions {
  provider: Provider;
  model: string;
  system: string;
  cwd: string;
  prompt: string;
  autoApprove: boolean;
  continueId?: string;
}

export async function runHeadless(opts: HeadlessOptions): Promise<void> {
  const history: ChatMessage[] = [];
  let sessionId = opts.continueId;
  if (opts.continueId) {
    const s = loadSession(opts.continueId);
    if (s) {
      history.push(...s.messages);
      sessionId = s.id;
    }
  }
  history.push({ role: 'user', content: opts.prompt });

  let total: Usage = { inputTokens: 0, outputTokens: 0 };

  const agent = new Agent(
    {
      provider: opts.provider,
      model: opts.model,
      system: opts.system,
      cwd: opts.cwd,
      approve: () => Promise.resolve(opts.autoApprove),
      delegate: () => Promise.resolve('(delegação desabilitada no modo headless)'),
    },
    {
      onDelta: (t) => process.stdout.write(t),
      onToolStart: (name) => {
        if (!process.stdout.isTTY) process.stderr.write(`\n[⚙ ${name}]\n`);
        else process.stdout.write(`\n[⚙ ${name}]\n`);
      },
      onToolEnd: (name, r) => {
        if (!r.ok && !process.stdout.isTTY) process.stderr.write(`[❌ ${name}: ${r.output.slice(0, 200)}]\n`);
      },
      onUsage: (u) => {
        total.inputTokens += u.inputTokens;
        total.outputTokens += u.outputTokens;
      },
    },
  );

  const result = await agent.run(history);

  if (sessionId) {
    saveSession({
      id: sessionId!,
      title: defaultTitle(result.messages),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: opts.provider.id,
      model: opts.model,
      messages: result.messages,
      usage: total,
      cost: estimateCost(opts.model, total),
    });
  }

  process.stderr.write(
    `\n[${opts.provider.id}/${opts.model} · ${formatTokens(total.inputTokens)} in / ${formatTokens(total.outputTokens)} out · ${formatCost(estimateCost(opts.model, total))}]\n`,
  );
}
