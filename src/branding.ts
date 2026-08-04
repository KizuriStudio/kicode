// Branding Kizuri Studio

export const BRAND = {
  name: 'kicode',
  studio: 'Kizuri Studio',
  tagline: 'Seu agente de IA no terminal',
  version: '0.1.0',
};

export const COLORS = {
  primary: '#a78bfa', // violeta Kizuri
  secondary: '#22d3ee', // ciano
  accent: '#f472b6', // rosa
  success: '#4ade80',
  warn: '#fbbf24',
  error: '#f87171',
  muted: '#94a3b8',
};

// Logo em ASCII puro (figlet standard) — compatível com qualquer terminal,
// inclusive Termux, que não renderiza os caracteres de bloco (█╗╔╝╚║═).
const FIGLET: Record<string, string[]> = {
  K: [' _  __', '| |/ /', "| ' / ", '| . \\ ', '|_|\\_\\'],
  Z: [' _____ ', '|_   _|', '  | |  ', ' _| |_ ', '|_____|'],
  C: ['  ____ ', ' / ___|', '| |    ', '| |___ ', ' \\____|'],
  O: ['  ___  ', ' / _ \\ ', '| | | |', '| |_| |', ' \\___/ '],
  D: [' ____  ', '|  _ \\ ', '| | | |', '| |_| |', '|____/ '],
  E: [' _____ ', '| ____|', '|  _|  ', '| |___ ', '|_____|'],
};

function buildLogo(text: string): string {
  const letters = [...text.toUpperCase()].map((ch) => FIGLET[ch]).filter(Boolean);
  const rows: string[] = [];
  for (let i = 0; i < 5; i++) {
    rows.push(letters.map((l) => l[i]).join(' '));
  }
  return `\n${rows.join('\n')}\n`;
}

export const LOGO = buildLogo('kzcode');

export const WELCOME = [
  `${BRAND.name} — ${BRAND.tagline}`,
  `✦ Feito com ♥ pela ${BRAND.studio}`,
  '',
  'Comandos: /help  /model  /provider  /clear  /cost  /sessions  /login  /exit',
  'Dica: digite uma mensagem ou pressione / para ver os comandos.',
].join('\n');
