#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadConfig, loadEnv } from './config.js';
import { BRAND, LOGO, COLORS } from './branding.js';
import { findProvider } from './providers/index.js';
import { render } from 'ink';
import React from 'react';
import { App } from './tui/App.js';
import { runHeadless } from './headless.js';

interface Args {
  prompt?: string;
  provider?: string;
  model?: string;
  cwd: string;
  autoApprove: boolean;
  continueId?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { cwd: resolve(process.cwd()), autoApprove: false, help: false, version: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-p':
      case '--prompt':
        args.prompt = argv[++i];
        break;
      case '--provider':
        args.provider = argv[++i];
        break;
      case '-m':
      case '--model':
        args.model = argv[++i];
        break;
      case '-c':
      case '--continue':
        args.continueId = argv[++i];
        break;
      case '-y':
      case '--yes':
        args.autoApprove = true;
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-v':
      case '--version':
        args.version = true;
        break;
      default:
        if (a.startsWith('-')) break;
        positional.push(a);
    }
  }
  if (positional.length && !args.prompt) args.prompt = positional.join(' ');
  return args;
}

const HELP = `${BRAND.name} v${BRAND.version} — ${BRAND.tagline} · ${BRAND.studio}
Uso:
  kicode                       abre o modo interativo (TUI)
  kicode "mensagem"            resposta única (modo headless)
  kicode -p "mensagem"         idem
  kicode --provider groq -m llama-3.3-70b-versatile   escolhe provedor/modelo
  kicode --continue <id>       retoma uma sessão salva
  kicode -y                    aprova comandos automaticamente

Opções:
  -p, --prompt <texto>   resposta única sem TUI
      --provider <id>    anthropic | openai | gemini | openrouter | groq | mistral | deepseek | xai | ollama
  -m, --model <modelo>   modelo do provedor
  -c, --continue <id>    retoma sessão
  -y, --yes              auto-aprovar comandos bash/git
  -h, --help             ajuda
  -v, --version          versão

Config: variáveis de ambiente (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
OPENROUTER_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, DEEPSEEK_API_KEY, XAI_API_KEY)
ou use /login no modo interativo. Keys também podem ir em .env do projeto ou ~/.kicode/.env.`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadEnv(args.cwd);
  const cfg = loadConfig();

  if (args.version) {
    console.log(`${BRAND.name} v${BRAND.version}`);
    return;
  }
  if (args.help) {
    console.log(HELP);
    return;
  }

  // escolhe provedor/modelo
  const providerId = args.provider || cfg.defaultProvider;
  let provider = findProvider(providerId);
  if (!provider) {
    console.error(`Provedor desconhecido: ${providerId}. Use --help para listar.`);
    process.exit(1);
  }
  const model = args.model || cfg.defaultModel || provider.defaultModel;

  if (args.prompt !== undefined) {
    await runHeadless({
      provider,
      model,
      system: cfg.systemPrompt,
      cwd: args.cwd,
      prompt: args.prompt,
      autoApprove: args.autoApprove,
      continueId: args.continueId,
    });
    return;
  }

  // modo TUI
  render(
    React.createElement(App, {
      state: {
        provider,
        model,
        system: cfg.systemPrompt,
        cwd: args.cwd,
        autoApprove: args.autoApprove,
        sessionId: args.continueId,
      },
    }),
  );

  if (process.stdout.isTTY && !args.help && !args.version) {
    // imprime logo discretamente no primeiro frame
    console.error(`\n${LOGO}`);
  }
  void COLORS;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
