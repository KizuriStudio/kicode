import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, relative, basename } from 'node:path';
import { exec } from 'node:child_process';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const MAX_FILE = 200_000; // 200KB por leitura

// ---------- read_file ----------
const readFileTool: Tool = {
  def: {
    name: 'read_file',
    description:
      'Lê o conteúdo de um arquivo do projeto. Use para entender código antes de editar.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Caminho do arquivo' } },
      required: ['path'],
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const p = resolve(ctx.cwd, String(args.path ?? ''));
      const st = await stat(p);
      if (st.isDirectory()) {
        const entries = await readdir(p, { withFileTypes: true });
        const lines = entries.map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
        return { ok: true, output: `[diretório ${relative(ctx.cwd, p) || '.'}]\n${lines}` };
      }
      const content = await readFile(p, 'utf-8');
      const truncated = content.length > MAX_FILE ? content.slice(0, MAX_FILE) + '\n…(truncado)' : content;
      return { ok: true, output: `[${relative(ctx.cwd, p)}]\n${truncated}` };
    } catch (e: any) {
      return { ok: false, output: `Erro ao ler: ${e.message}` };
    }
  },
};

// ---------- write_file ----------
const writeFileTool: Tool = {
  def: {
    name: 'write_file',
    description: 'Cria ou sobrescreve um arquivo com o conteúdo fornecido.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const p = resolve(ctx.cwd, String(args.path ?? ''));
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, String(args.content ?? ''), 'utf-8');
      return { ok: true, output: `Arquivo salvo: ${relative(ctx.cwd, p) || p} (${String(args.content ?? '').length} bytes)` };
    } catch (e: any) {
      return { ok: false, output: `Erro ao escrever: ${e.message}` };
    }
  },
};

// ---------- edit_file ----------
const editFileTool: Tool = {
  def: {
    name: 'edit_file',
    description:
      'Edita um arquivo substituindo um trecho exato (old_string) por new_string. Use para pequenas alterações.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const p = resolve(ctx.cwd, String(args.path ?? ''));
      const oldStr = String(args.old_string ?? '');
      const newStr = String(args.new_string ?? '');
      const content = await readFile(p, 'utf-8');
      const idx = content.indexOf(oldStr);
      if (idx === -1) {
        return { ok: false, output: 'old_string não encontrado no arquivo. Confira exatamente o conteúdo atual.' };
      }
      const updated = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
      await writeFile(p, updated, 'utf-8');
      return { ok: true, output: `Editado ${relative(ctx.cwd, p)} (${oldStr.length} → ${newStr.length} chars)` };
    } catch (e: any) {
      return { ok: false, output: `Erro ao editar: ${e.message}` };
    }
  },
};

// ---------- list_directory ----------
const listDirTool: Tool = {
  def: {
    name: 'list_directory',
    description: 'Lista o conteúdo de um diretório do projeto.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    try {
      const p = resolve(ctx.cwd, String(args.path ?? '.'));
      const entries = await readdir(p, { withFileTypes: true });
      const lines = entries.map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
      return { ok: true, output: `[${relative(ctx.cwd, p) || '.'}]\n${lines}` };
    } catch (e: any) {
      return { ok: false, output: `Erro: ${e.message}` };
    }
  },
};

// ---------- bash ----------
function runCommand(command: string, cwd: string, timeoutMs = 60_000): Promise<{ code: number; out: string }> {
  return new Promise((resolvePromise) => {
    exec(command, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, shell: '/bin/bash' }, (err, stdout, stderr) => {
      const out = `${stdout || ''}${stderr ? `\n[stderr] ${stderr}` : ''}`.trim();
      const code = err ? (err as any).code ?? 1 : 0;
      resolvePromise({ code, out: out.slice(0, 20_000) });
    });
  });
}

const bashTool: Tool = {
  def: {
    name: 'bash',
    description:
      'Executa um comando no terminal do projeto (bash). Requer aprovação do usuário. Use com moderação.',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const command = String(args.command ?? '');
    if (!command) return { ok: false, output: 'Comando vazio' };
    const approved = await ctx.approve(command);
    if (!approved) return { ok: false, output: 'Comando negado pelo usuário.' };
    const { code, out } = await runCommand(command, ctx.cwd);
    return { ok: code === 0, output: out || `(sem saída, exit ${code})` };
  },
};

// ---------- git ----------
const gitTool: Tool = {
  def: {
    name: 'git',
    description: 'Executa um comando git no projeto (status, diff, log, add, commit etc). Requer aprovação para comandos que alteram estado.',
    inputSchema: {
      type: 'object',
      properties: { args: { type: 'string', description: 'Argumentos do git, ex: "status" ou "log --oneline -5"' } },
      required: ['args'],
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const raw = String(args.args ?? '');
    const first = raw.trim().split(/\s+/)[0] || '';
    const safe = ['status', 'diff', 'log', 'show', 'branch', 'remote', 'ls-files', 'rev-parse'].includes(first);
    if (!safe) {
      const approved = await ctx.approve(`git ${raw}`);
      if (!approved) return { ok: false, output: 'Comando git negado pelo usuário.' };
    }
    const { code, out } = await runCommand(`git ${raw}`, ctx.cwd);
    return { ok: code === 0, output: out || `(sem saída, exit ${code})` };
  },
};

export function getTools(delegate: ToolContext['delegate']): Tool[] {
  return [readFileTool, writeFileTool, editFileTool, listDirTool, bashTool, gitTool, delegateTool(delegate)];
}

function delegateTool(delegate: ToolContext['delegate']): Tool {
  return {
    def: {
      name: 'delegate_task',
      description:
        'Delega uma tarefa para um modelo auxiliar (mais barato/rápido) e retorna a resposta. Use para subtarefas isoladas como resumir, revisar ou pesquisar trechos.',
      inputSchema: {
        type: 'object',
        properties: { task: { type: 'string', description: 'Instrução completa para o modelo auxiliar' } },
        required: ['task'],
      },
    },
    async execute(args): Promise<ToolResult> {
      try {
        const answer = await delegate(String(args.task ?? ''));
        return { ok: true, output: answer };
      } catch (e: any) {
        return { ok: false, output: `Erro na delegação: ${e.message}` };
      }
    },
  };
}

export { basename };
