import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { COLORS } from '../branding.js';
import { getProviders } from '../providers/index.js';
import { kicodeHomeDir } from '../config.js';
import { join } from 'node:path';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

interface Props {
  onDone: (msg: string | null) => void;
  onClose: () => void;
}

const ENV_NAMES: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  ollama: '',
};

export function LoginPrompt({ onDone, onClose }: Props) {
  const providers = useMemo(() => getProviders().filter((p) => p.id !== 'ollama'), []);
  const [selected, setSelected] = useState(0);
  const [entering, setEntering] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  useInput((text, key) => {
    if (!entering) {
      if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
      else if (key.downArrow) setSelected((s) => Math.min(providers.length - 1, s + 1));
      else if (key.return) setEntering(true);
      else if (key.escape) onClose();
      return;
    }
    if (key.return) {
      const provider = providers[selected];
      const envName = ENV_NAMES[provider.id];
      if (keyInput.trim()) {
        const envPath = join(kicodeHomeDir(), '.env');
        const line = `${envName}=${keyInput.trim()}\n`;
        if (existsSync(envPath) && readFileSync(envPath, 'utf-8').includes(envName + '=')) {
          const content = readFileSync(envPath, 'utf-8')
            .split(/\r?\n/)
            .filter((l) => !l.startsWith(envName + '='))
            .join('\n');
          writeFileSync(envPath, content + '\n' + line, 'utf-8');
        } else {
          appendFileSync(envPath, line, 'utf-8');
        }
        // disponibiliza a key na sessão atual sem precisar reiniciar
        process.env[envName] = keyInput.trim();
        onDone(`🔑 API key de ${provider.label} salva em ~/.kicode/.env`);
      } else {
        onDone(null);
      }
      return;
    }
    if (key.backspace || key.delete) {
      // Termux envia DEL (0x7f) como backspace, que o ink mapeia para key.delete
      setKeyInput((p) => p.slice(0, -1));
      return;
    }
    if (key.escape) {
      setEntering(false);
      setKeyInput('');
      return;
    }
    setKeyInput((p) => p + text);
  });

  if (!entering) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.primary} paddingX={1}>
        <Text bold color={COLORS.secondary}>🔑 Escolha o provedor para configurar a API key:</Text>
        {providers.map((p, i) => (
          <Box key={p.id}>
            <Text color={i === selected ? COLORS.primary : COLORS.muted}>{i === selected ? '▸ ' : '  '}</Text>
            <Text color={i === selected ? COLORS.primary : undefined}>
              {p.label} <Text color={p.hasKey ? COLORS.success : COLORS.error}>{p.hasKey ? '🔑' : '🔒'}</Text>
            </Text>
          </Box>
        ))}
        <Text color={COLORS.muted}>↑/↓ · Enter · Esc voltar</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.primary} paddingX={1}>
      <Text bold color={COLORS.secondary}>Cole sua API key de {providers[selected].label}:</Text>
      <Text color={COLORS.primary}>❯ </Text>
      <Text>{keyInput.replace(/./g, '•')}</Text>
      <Text color={COLORS.muted}>Enter salvar · Esc cancelar</Text>
    </Box>
  );
}
