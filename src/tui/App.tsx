import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdin } from 'ink';
import type { ChatMessage, Provider, Usage } from '../types.js';
import { BRAND, COLORS, WELCOME } from '../branding.js';
import { Agent } from '../agent/Agent.js';
import { estimateCost, formatCost, formatTokens } from '../cost.js';
import {
  listSessions,
  saveSession,
  loadSession,
  makeId,
  defaultTitle,
  deleteSession,
  type Session,
} from '../session.js';
import { findProvider } from '../providers/index.js';
import { loadConfig, saveConfig } from '../config.js';
import { ModelPicker } from './ModelPicker.js';
import { LoginPrompt } from './LoginPrompt.js';

interface DisplayMsg {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  ok?: boolean;
}

interface CliState {
  provider: Provider;
  model: string;
  system: string;
  cwd: string;
  autoApprove: boolean;
  sessionId?: string;
}

interface Props {
  state: CliState;
}

export function App({ state }: Props) {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const [messages, setMessages] = useState<DisplayMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingCmd, setPendingCmd] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage>({ inputTokens: 0, outputTokens: 0 });
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [thinking, setThinking] = useState(false);
  const [sessionsView, setSessionsView] = useState(false);
  const [sessionList, setSessionList] = useState<Session[]>([]);
  const [sessionSel, setSessionSel] = useState(0);
  const historyRef = useRef<ChatMessage[]>([]);
  const sessionIdRef = useRef<string>(state.sessionId || makeId());
  const [provider, setProvider] = useState(state.provider);
  const [model, setModel] = useState(state.model);
  const abortRef = useRef<AbortController | null>(null);

  const totalCost = useMemo(() => estimateCost(model, usage), [model, usage]);

  // mensagem de boas-vindas
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: WELCOME,
      },
    ]);
  }, []);

  const push = (m: DisplayMsg) => setMessages((prev) => [...prev, m]);

  const runAgent = async (userText: string) => {
    push({ role: 'user', content: userText });
    setBusy(true);
    setInput('');
    const history = historyRef.current;
    history.push({ role: 'user', content: userText });
    const abort = new AbortController();
    abortRef.current = abort;

    let streamed = '';
    push({ role: 'assistant', content: '' });

    const agent = new Agent(
      {
        provider,
        model,
        system: state.system,
        cwd: state.cwd,
        approve: async (command) => {
          if (state.autoApprove) return true;
          // pede aprovação de forma síncrona via UI
          const approved = await new Promise<boolean>((resolve) => {
            setPendingCmd(command);
            const timer = setInterval(() => {
              if (pendingRef.current !== null) {
                clearInterval(timer);
                resolve(pendingRef.current);
                pendingRef.current = null;
                setPendingCmd(null);
              }
            }, 100);
          });
          return approved;
        },
        delegate: async (task) => {
          setStatusMsg('🤖 delegando para modelo auxiliar…');
          try {
            const aux = findProvider('openrouter');
            const r = await new Agent({
              provider: aux!,
              model: aux!.defaultModel,
              system: 'Você é um assistente auxiliar conciso. Responda apenas o que foi pedido.',
              cwd: state.cwd,
              approve: () => Promise.resolve(false),
              delegate: () => Promise.resolve(''),
            }).run([{ role: 'user', content: task }]);
            return r.messages.filter((m) => m.role === 'assistant').at(-1)?.content || '(sem resposta)';
          } catch {
            return '(delegação indisponível)';
          } finally {
            setStatusMsg('');
          }
        },
        signal: abort.signal,
      },
      {
        onDelta: (t) => {
          streamed += t;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: streamed };
            return next;
          });
        },
        onToolStart: (name, args) => {
          push({ role: 'tool', name, content: `⚙ executando ${name}…`, ok: undefined });
        },
        onToolEnd: (name, result) => {
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'tool' && next[i].name === name && next[i].content.includes('executando')) {
                const short = result.output.split('\n').slice(0, 3).join(' · ');
                next[i] = {
                  role: 'tool',
                  name,
                  content: `${result.ok ? '✅' : '❌'} ${name}: ${short.slice(0, 120)}`,
                  ok: result.ok,
                };
                break;
              }
            }
            return next;
          });
        },
        onUsage: (u) => setUsage((prev) => ({ inputTokens: prev.inputTokens + u.inputTokens, outputTokens: prev.outputTokens + u.outputTokens })),
        onThinking: (t) => setThinking(t),
      },
    );

    try {
      const result = await agent.run(history);
      historyRef.current = result.messages;
      // salva sessão
      const title = defaultTitle(historyRef.current);
      saveSession({
        id: sessionIdRef.current,
        title,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provider: provider.id,
        model,
        messages: historyRef.current,
        usage,
        cost: totalCost,
      });
      setStatusMsg('');
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        push({ role: 'tool', name: 'erro', content: `❌ ${e.message}`, ok: false });
      }
    } finally {
      setBusy(false);
      setThinking(false);
      abortRef.current = null;
    }
  };

  // ref para aprovação de comandos
  const pendingRef = useRef<boolean | null>(null);

  // helpers de sessão
  const refreshSessions = () => setSessionList(listSessions());

  const handleSlash = (cmd: string) => {
    const parts = cmd.trim().slice(1).split(/\s+/);
    const name = parts[0];
    switch (name) {
      case 'help':
        push({
          role: 'assistant',
          content: [
            '📖 Comandos:',
            '  /model        trocar provedor/modelo',
            '  /login        configurar API key',
            '  /clear        limpar conversa',
            '  /sessions     listar sessões salvas',
            '  /cost         custo acumulado',
            '  /exit         sair',
          ].join('\n'),
        });
        break;
      case 'model':
        setPickerOpen(true);
        break;
      case 'login':
        setLoginOpen(true);
        break;
      case 'clear':
        historyRef.current = [];
        sessionIdRef.current = makeId();
        setUsage({ inputTokens: 0, outputTokens: 0 });
        setMessages([{ role: 'assistant', content: '🧹 Conversa limpa.' }]);
        break;
      case 'sessions':
        refreshSessions();
        setSessionsView(true);
        setSessionSel(0);
        break;
      case 'resume': {
        const id = parts[1];
        if (!id) {
          push({ role: 'assistant', content: 'Uso: /resume <id> — veja /sessions' });
          break;
        }
        const s = loadSession(id);
        if (!s) {
          push({ role: 'tool', name: 'erro', content: `❌ Sessão ${id} não encontrada`, ok: false });
          break;
        }
        historyRef.current = s.messages;
        sessionIdRef.current = s.id;
        const restored: DisplayMsg[] = [];
        for (const m of s.messages) {
          if (m.role === 'user') restored.push({ role: 'user', content: m.content });
          else if (m.role === 'assistant') restored.push({ role: 'assistant', content: m.content });
        }
        setMessages(restored);
        setUsage(s.usage);
        push({ role: 'assistant', content: `↩ Sessão "${s.title}" restaurada.` });
        break;
      }
      case 'cost':
        push({
          role: 'assistant',
          content: `💰 Custo da sessão: ${formatCost(totalCost)} (${formatTokens(usage.inputTokens)} in / ${formatTokens(usage.outputTokens)} out)`,
        });
        break;
      case 'exit':
      case 'quit':
        exit();
        break;
      default:
        push({ role: 'tool', name: 'erro', content: `Comando desconhecido: /${name} (veja /help)`, ok: false });
    }
  };

  useInput((text, key) => {
    // aprovação de comando pendente
    if (pendingCmd) {
      if (key.return || text.toLowerCase() === 'y') {
        pendingRef.current = true;
      } else if (key.escape || text.toLowerCase() === 'n') {
        pendingRef.current = false;
      }
      return;
    }
    if (pickerOpen || loginOpen || sessionsView) return;
    if (key.ctrl && text === 'c') {
      if (busy) {
        abortRef.current?.abort();
        push({ role: 'tool', name: 'erro', content: '⏹ interrompido pelo usuário', ok: false });
      } else {
        exit();
      }
      return;
    }
    if (key.return) {
      const trimmed = input.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('/')) {
        handleSlash(trimmed);
        setInput('');
        return;
      }
      void runAgent(trimmed);
      return;
    }
    if (key.backspace || key.delete) {
      // Termux envia DEL (0x7f) como backspace, que o ink mapeia para key.delete
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    if (key.escape) {
      setInput('');
      return;
    }
    setInput((prev) => prev + text);
  });

  // header
  const header = (
    <Box borderStyle="round" borderColor={COLORS.primary} paddingX={1}>
      <Text color={COLORS.primary} bold>
        ◆ {BRAND.name}
      </Text>
      <Text color={COLORS.muted}>  ·  </Text>
      <Text color={COLORS.secondary}>
        {provider.label} / {model}
      </Text>
      <Text color={COLORS.muted}>  ·  </Text>
      <Text color={COLORS.accent}>✦ {BRAND.studio}</Text>
    </Box>
  );

  // status bar
  const statusBar = (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      {thinking ? (
        <Text color={COLORS.warn}>🤔 pensando…</Text>
      ) : busy ? (
        <Text color={COLORS.warn}>⏳ processando…</Text>
      ) : statusMsg ? (
        <Text color={COLORS.secondary}>{statusMsg}</Text>
      ) : (
        <Text color={COLORS.muted}>
          {formatTokens(usage.inputTokens)} in · {formatTokens(usage.outputTokens)} out · {formatCost(totalCost)} · [Enter] enviar · [Ctrl+C] sair · [/] comandos
        </Text>
      )}
    </Box>
  );

  if (sessionsView) {
    return (
      <Box flexDirection="column">
        {header}
        <Box flexDirection="column" marginTop={1}>
          <Text bold color={COLORS.secondary}>💾 Sessões salvas:</Text>
          {sessionList.length === 0 && <Text color={COLORS.muted}>Nenhuma sessão ainda.</Text>}
          {sessionList.map((s, i) => (
            <Box key={s.id}>
              <Text color={i === sessionSel ? COLORS.primary : COLORS.muted}>{i === sessionSel ? '▸ ' : '  '}</Text>
              <Text color={i === sessionSel ? COLORS.primary : undefined}>
                {s.title} <Text color={COLORS.muted}>({s.provider}/{s.model} · {new Date(s.updatedAt).toLocaleString()})</Text>
              </Text>
            </Box>
          ))}
        </Box>
        <Text color={COLORS.muted}>↑/↓ navegar · Enter abrir · d excluir · Esc voltar</Text>
        <SessionNav
          count={sessionList.length}
          sel={sessionSel}
          onSel={setSessionSel}
          onOpen={() => {
            const s = sessionList[sessionSel];
            if (!s) return;
            historyRef.current = s.messages;
            sessionIdRef.current = s.id;
            const restored: DisplayMsg[] = [];
            for (const m of s.messages) {
              if (m.role === 'user') restored.push({ role: 'user', content: m.content });
              else if (m.role === 'assistant') restored.push({ role: 'assistant', content: m.content });
            }
            setMessages(restored);
            setUsage(s.usage);
            setSessionsView(false);
          }}
          onDelete={() => {
            const s = sessionList[sessionSel];
            if (s) deleteSession(s.id);
            refreshSessions();
          }}
          onBack={() => setSessionsView(false)}
        />
      </Box>
    );
  }

  if (pickerOpen) {
    return (
      <ModelPicker
        currentProvider={provider}
        currentModel={model}
        onSelect={(p, m) => {
          setProvider(p);
          setModel(m);
          // persiste a escolha para as próximas execuções (best-effort)
          try {
            const cfg = loadConfig();
            saveConfig({ ...cfg, defaultProvider: p.id, defaultModel: m });
          } catch {
            /* falha ao salvar config não deve impedir a troca */
          }
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    );
  }

  if (loginOpen) {
    return (
      <LoginPrompt
        onDone={(msg) => {
          setLoginOpen(false);
          if (msg) push({ role: 'assistant', content: msg });
        }}
        onClose={() => setLoginOpen(false)}
      />
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {header}
      <Box flexGrow={1} flexDirection="column">
        <MessageList messages={messages} busy={busy} />
        {pendingCmd && (
          <Box borderStyle="bold" borderColor={COLORS.warn} paddingX={1} marginY={1}>
            <Text color={COLORS.warn} bold>⚠ Aprovar comando? </Text>
            <Text>{pendingCmd}</Text>
            <Text color={COLORS.muted}>  [Enter/y] aprovar · [Esc/n] negar</Text>
          </Box>
        )}
      </Box>
      {statusBar}
      <Box borderStyle="round" borderColor={COLORS.secondary} paddingX={1} marginTop={1}>
        <Text color={COLORS.primary}>❯ </Text>
        <Text dimColor={!input && !busy}>
          {busy ? '…' : input || 'digite sua mensagem…'}
        </Text>
        {!busy && <Text color={COLORS.secondary}>▍</Text>}
      </Box>
      {!isRawModeSupported && <Text color={COLORS.error}>⚠ stdin não é TTY — modo interativo limitado</Text>}
    </Box>
  );
}

function MessageList({ messages, busy }: { messages: DisplayMsg[]; busy: boolean }) {
  return (
    <Box flexDirection="column">
      {messages.map((m, i) => (
        <Box key={i} flexDirection="column" marginBottom={0}>
          {m.role === 'user' && (
            <Box>
              <Text color={COLORS.secondary} bold>❯ você: </Text>
              <Text>{m.content}</Text>
            </Box>
          )}
          {m.role === 'assistant' && (
            <Box flexDirection="column">
              <Text color={COLORS.primary} bold>◆ kicode: </Text>
              <Text wrap="wrap">{m.content}</Text>
            </Box>
          )}
          {m.role === 'tool' && (
            <Box marginLeft={2}>
              <Text color={m.ok === false ? COLORS.error : COLORS.muted}>{m.content}</Text>
            </Box>
          )}
        </Box>
      ))}
      {busy && <Text color={COLORS.warn}>▍</Text>}
    </Box>
  );
}

function SessionNav(props: {
  count: number;
  sel: number;
  onSel: (n: number) => void;
  onOpen: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  useInput((_text, key) => {
    if (key.upArrow) props.onSel(Math.max(0, props.sel - 1));
    else if (key.downArrow) props.onSel(Math.min(props.count - 1, props.sel + 1));
    else if (key.return) props.onOpen();
    else if (key.delete || key.backspace) props.onDelete();
    else if (key.escape) props.onBack();
  });
  return null;
}
