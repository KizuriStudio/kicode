import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, cpSync } from 'node:fs';

export interface KZConfig {
  defaultProvider: string;
  defaultModel: string;
  systemPrompt: string;
}

const DEFAULT_SYSTEM_PROMPT = `Você é o kicode, um agente de IA profissional criado pela Kizuri Studio.
Você ajuda o usuário a programar, debugar e entender projetos no terminal.
Seja direto e objetivo. Quando precisar ler/editar arquivos ou rodar comandos, use as ferramentas disponíveis.
Responda em português (BR) a menos que o usuário peça outro idioma.`;

export function kicodeHomeDir(): string {
  const base = process.env.KICODE_HOME || join(homedir(), '.kicode');
  // migração única: ~/.kzcode → ~/.kicode (config, keys e sessões)
  const old = join(homedir(), '.kzcode');
  if (!existsSync(base) && existsSync(old)) {
    try {
      mkdirSync(base, { recursive: true });
      // .env primeiro: é o item mais importante (API keys)
      for (const f of ['.env', 'config.json']) {
        const p = join(old, f);
        if (existsSync(p)) copyFileSync(p, join(base, f));
      }
      const sessions = join(old, 'sessions');
      if (existsSync(sessions)) cpSync(sessions, join(base, 'sessions'), { recursive: true });
    } catch {
      /* migração best-effort: se falhar, o usuário reconfigura via /login */
    }
  }
  mkdirSync(base, { recursive: true });
  return base;
}

function configPath(): string {
  return join(kicodeHomeDir(), 'config.json');
}

export function loadConfig(): KZConfig {
  try {
    if (existsSync(configPath())) {
      const raw = JSON.parse(readFileSync(configPath(), 'utf-8'));
      return {
        defaultProvider: raw.defaultProvider || 'anthropic',
        defaultModel: raw.defaultModel || '',
        systemPrompt: raw.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      };
    }
  } catch {
    /* config corrompida -> usa default */
  }
  return {
    defaultProvider: 'anthropic',
    defaultModel: '',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };
}

export function saveConfig(cfg: KZConfig): void {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

/** Carrega .env do diretório e do home do kicode (sem sobrescrever vars já definidas) */
export function loadEnv(cwd: string): void {
  const candidates = [join(cwd, '.env'), join(kicodeHomeDir(), '.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
  void dirname; // manter import
}

export function getApiKey(provider: string): string {
  const map: Record<string, string[]> = {
    anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    groq: ['GROQ_API_KEY'],
    mistral: ['MISTRAL_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    xai: ['XAI_API_KEY', 'GROK_API_KEY'],
    ollama: [],
  };
  for (const name of map[provider] || []) {
    if (process.env[name]) return process.env[name]!;
  }
  return '';
}
