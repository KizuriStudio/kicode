import type { Usage } from './types.js';

// Preços aproximados em USD por 1M tokens (entrada/saída) — por padrão de nome de modelo
const PRICES: Array<{ re: RegExp; input: number; output: number }> = [
  { re: /claude-opus/, input: 15, output: 75 },
  { re: /claude-sonnet/, input: 3, output: 15 },
  { re: /claude-3-5-haiku|claude-haiku/, input: 0.8, output: 4 },
  { re: /gpt-4o/, input: 2.5, output: 10 },
  { re: /gpt-4\.1/, input: 2, output: 8 },
  { re: /gpt-4/, input: 30, output: 60 },
  { re: /o3|o4/, input: 2, output: 8 },
  { re: /gemini-2\.5-pro/, input: 1.25, output: 10 },
  { re: /gemini/, input: 0.1, output: 0.4 },
  { re: /deepseek/, input: 0.27, output: 1.1 },
  { re: /llama/, input: 0.2, output: 0.2 },
  { re: /grok/, input: 3, output: 15 },
  { re: /mistral-large/, input: 2, output: 6 },
  { re: /mistral/, input: 0.2, output: 0.6 },
];

export function estimateCost(model: string, usage: Usage): number {
  const price = PRICES.find((p) => p.re.test(model)) || { input: 1, output: 3 };
  return (usage.inputTokens / 1_000_000) * price.input + (usage.outputTokens / 1_000_000) * price.output;
}

export function formatCost(cost: number): string {
  if (cost === 0) return '$0.0000';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
