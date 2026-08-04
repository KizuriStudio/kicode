import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { kicodeHomeDir } from './config.js';
import type { ChatMessage, Usage } from './types.js';

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  usage: Usage;
  cost: number;
}

function sessionsDir(): string {
  const dir = join(kicodeHomeDir(), 'sessions');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionPath(id: string): string {
  return join(sessionsDir(), `${id}.json`);
}

export function saveSession(s: Session): void {
  s.updatedAt = new Date().toISOString();
  writeFileSync(sessionPath(s.id), JSON.stringify(s, null, 2), 'utf-8');
}

export function loadSession(id: string): Session | null {
  const p = sessionPath(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function listSessions(): Session[] {
  const dir = sessionsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Session;
      } catch {
        return null;
      }
    })
    .filter((s): s is Session => s !== null)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function deleteSession(id: string): boolean {
  const p = sessionPath(id);
  if (!existsSync(p)) return false;
  unlinkSync(p);
  return true;
}

export function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function defaultTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content ?? '';
  const clean = first.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? clean.slice(0, 48) + '…' : (clean || 'nova conversa');
}
