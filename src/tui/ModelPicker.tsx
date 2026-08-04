import React, { useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Provider, ProviderModel } from '../types.js';
import { COLORS } from '../branding.js';
import { getProviders } from '../providers/index.js';

interface Props {
  currentProvider: Provider;
  currentModel: string;
  onSelect: (provider: Provider, model: string) => void;
  onClose: () => void;
}

export function ModelPicker({ currentProvider, currentModel, onSelect, onClose }: Props) {
  const providers = useMemo(() => getProviders(), []);
  const [selected, setSelected] = useState(() => {
    const idx = providers.findIndex((p) => p.id === currentProvider.id);
    return idx === -1 ? 0 : idx;
  });
  const [showModels, setShowModels] = useState(false);
  const [modelSel, setModelSel] = useState(() => {
    const p = providers.find((x) => x.id === currentProvider.id);
    const idx = p?.models.findIndex((m) => m.id === currentModel) ?? -1;
    return idx === -1 ? 0 : idx;
  });
  // modelos carregados da API do provedor (null = usa a lista estática)
  const [modelList, setModelList] = useState<ProviderModel[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  // invalida buscas em andamento quando o usuário volta/sai (evita race condition)
  const fetchSeq = useRef(0);

  // posiciona a seleção no modelo atual da lista estática (se existir)
  const repositionStatic = (p: Provider) => {
    const idx = p.models.findIndex((m) => m.id === currentModel);
    setModelSel(idx === -1 ? 0 : idx);
  };

  useInput((_text, key) => {
    if (!showModels) {
      if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
      else if (key.downArrow) setSelected((s) => Math.min(providers.length - 1, s + 1));
      else if (key.return) {
        const p = providers[selected];
        setShowModels(true);
        if (p.listModels) {
          // busca a lista completa na API; se falhar, mantém a lista estática
          const seq = ++fetchSeq.current;
          setLoadingModels(true);
          setModelList(null);
          p.listModels()
            .then((models) => {
              if (fetchSeq.current !== seq) return; // busca obsoleta
              if (models.length) {
                setModelList(models);
                setModelSel(0);
              } else {
                repositionStatic(p);
              }
            })
            .catch(() => {
              if (fetchSeq.current !== seq) return;
              repositionStatic(p); // fallback para a lista estática
            })
            .finally(() => {
              if (fetchSeq.current === seq) setLoadingModels(false);
            });
        } else {
          // lista estática: posiciona no modelo atual (se pertencer a este provedor)
          repositionStatic(p);
        }
      } else if (key.escape) onClose();
    } else {
      const p = providers[selected];
      const models = modelList ?? p.models;
      if (key.escape) {
        fetchSeq.current++; // descarta buscas em andamento
        setShowModels(false);
        setModelList(null);
        setLoadingModels(false);
      } else if (!loadingModels) {
        if (key.upArrow) setModelSel((s) => Math.max(0, s - 1));
        else if (key.downArrow) setModelSel((s) => Math.min(models.length - 1, s + 1));
        else if (key.return && models[modelSel]) onSelect(p, models[modelSel].id);
      }
    }
  });

  if (!showModels) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.primary} paddingX={1}>
        <Text bold color={COLORS.secondary}>Provedores:</Text>
        {providers.map((p, i) => (
          <Box key={p.id}>
            <Text color={i === selected ? COLORS.primary : COLORS.muted}>{i === selected ? '▸ ' : '  '}</Text>
            <Text color={i === selected ? COLORS.primary : undefined}>
              {p.label} <Text color={p.hasKey ? COLORS.success : COLORS.error}>{p.hasKey ? '🔑' : '🔒'}</Text>
            </Text>
          </Box>
        ))}
        <Text color={COLORS.muted}>↑/↓ · Enter escolher · Esc voltar</Text>
      </Box>
    );
  }

  const p = providers[selected];
  const models = modelList ?? p.models;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.primary} paddingX={1}>
      <Text bold color={COLORS.secondary}>Modelos de {p.label}:</Text>
      {loadingModels ? (
        <Text color={COLORS.warn}>⏳ carregando modelos…</Text>
      ) : models.length === 0 ? (
        <Text color={COLORS.muted}>Nenhum modelo disponível.</Text>
      ) : (
        models.map((m, i) => (
          <Box key={m.id}>
            <Text color={i === modelSel ? COLORS.primary : COLORS.muted}>{i === modelSel ? '▸ ' : '  '}</Text>
            <Text color={i === modelSel ? COLORS.primary : undefined}>{m.label}</Text>
          </Box>
        ))
      )}
      <Text color={COLORS.muted}>↑/↓ · Enter escolher · Esc voltar</Text>
    </Box>
  );
}
