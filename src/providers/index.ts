import type { Provider } from '../types.js';
import { getApiKey } from '../config.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAICompatProvider } from './openai-compat.js';
import { createGeminiProvider } from './gemini.js';
import { createMockProvider } from './mock.js';

/** Registro de todos os provedores suportados */
export function getProviders(): Provider[] {
  return [
    createMockProvider(),
    createAnthropicProvider(getApiKey('anthropic')),
    createOpenAICompatProvider({
      id: 'openai',
      label: 'OpenAI',
      apiKey: getApiKey('openai'),
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
      models: [
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { id: 'gpt-4.1', label: 'GPT-4.1' },
        { id: 'o3-mini', label: 'o3-mini' },
        { id: 'o4-mini', label: 'o4-mini' },
      ],
    }),
    createGeminiProvider(getApiKey('gemini')),
    createOpenAICompatProvider({
      id: 'openrouter',
      label: 'OpenRouter',
      apiKey: getApiKey('openrouter'),
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'anthropic/claude-3.5-sonnet',
      models: [
        { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
        { id: 'openai/gpt-4o', label: 'GPT-4o' },
        { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3' },
        { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
      ],
    }),
    createOpenAICompatProvider({
      id: 'groq',
      label: 'Groq',
      apiKey: getApiKey('groq'),
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.3-70b-versatile',
      models: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
        { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
        { id: 'qwen-qwq-32b', label: 'QwQ 32B' },
      ],
    }),
    createOpenAICompatProvider({
      id: 'mistral',
      label: 'Mistral',
      apiKey: getApiKey('mistral'),
      baseUrl: 'https://api.mistral.ai/v1',
      defaultModel: 'mistral-large-latest',
      models: [
        { id: 'mistral-large-latest', label: 'Mistral Large' },
        { id: 'mistral-medium-latest', label: 'Mistral Medium' },
        { id: 'codestral-latest', label: 'Codestral' },
      ],
    }),
    createOpenAICompatProvider({
      id: 'deepseek',
      label: 'DeepSeek',
      apiKey: getApiKey('deepseek'),
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      models: [
        { id: 'deepseek-chat', label: 'DeepSeek V3' },
        { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
      ],
    }),
    createOpenAICompatProvider({
      id: 'xai',
      label: 'xAI (Grok)',
      apiKey: getApiKey('xai'),
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: 'grok-3-mini',
      models: [
        { id: 'grok-3', label: 'Grok 3' },
        { id: 'grok-3-mini', label: 'Grok 3 mini' },
        { id: 'grok-code', label: 'Grok Code' },
      ],
    }),
    createOpenAICompatProvider({
      id: 'ollama',
      label: 'Ollama (local)',
      apiKey: 'ollama-local',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
      defaultModel: 'llama3.2',
      models: [
        { id: 'llama3.2', label: 'Llama 3.2' },
        { id: 'llama3.1', label: 'Llama 3.1' },
        { id: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B' },
        { id: 'deepseek-coder-v2', label: 'DeepSeek Coder V2' },
        { id: 'mistral', label: 'Mistral' },
      ],
    }),
  ];
}

export function findProvider(id: string): Provider | undefined {
  return getProviders().find((p) => p.id === id);
}

export function findModel(providerId: string, modelId: string): boolean {
  const p = findProvider(providerId);
  if (!p) return false;
  return p.models.some((m) => m.id === modelId) || modelId === p.defaultModel;
}
