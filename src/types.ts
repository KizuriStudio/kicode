// Tipos compartilhados do kicode

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string; // nome da tool (para mensagens role: 'tool')
  toolCallId?: string; // id do tool_call respondido
  toolCalls?: ToolCall[]; // chamadas feitas pelo assistant
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ChatStreamOptions {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onToolCalls: (calls: ToolCall[]) => void;
}

export interface Provider {
  id: string;
  label: string;
  needsApiKey: boolean;
  hasKey: boolean;
  defaultModel: string;
  models: ProviderModel[];
  /** Busca a lista completa de modelos na API do provedor (opcional; fallback: models) */
  listModels?: () => Promise<ProviderModel[]>;
  chat(opts: ChatStreamOptions): Promise<Usage>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface ToolContext {
  cwd: string;
  approve: (command: string) => Promise<boolean>;
  delegate: (task: string) => Promise<string>;
}

export interface Tool {
  def: ToolDef;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
