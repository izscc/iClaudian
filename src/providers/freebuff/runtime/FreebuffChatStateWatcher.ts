import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

interface FreebuffChatMessage {
  blocks?: unknown;
  content?: unknown;
  variant?: unknown;
}

interface FreebuffTextBlock {
  blocks?: unknown;
  content?: unknown;
  textType?: unknown;
  type?: unknown;
}

export class FreebuffChatStateWatcher {
  private readonly chatsDir: string;
  private readonly knownChatDirs: Set<string>;

  constructor(cwd: string, env: NodeJS.ProcessEnv, private readonly startMs: number = Date.now()) {
    this.chatsDir = getFreebuffChatsDir(cwd, env);
    this.knownChatDirs = listChatDirs(this.chatsDir);
  }

  readAssistantResponse(): string | null {
    const candidates = this.listCandidateMessageFiles();
    for (const candidate of candidates) {
      const response = readAssistantResponseFromFile(candidate.path);
      if (response) return response;
    }
    return null;
  }

  private listCandidateMessageFiles(): Array<{ mtimeMs: number; path: string }> {
    let names: string[];
    try {
      names = fs.readdirSync(this.chatsDir);
    } catch {
      return [];
    }

    const candidates: Array<{ mtimeMs: number; path: string }> = [];
    for (const name of names) {
      const messagesPath = path.join(this.chatsDir, name, 'chat-messages.json');
      try {
        const stat = fs.statSync(messagesPath);
        const isNewDir = !this.knownChatDirs.has(name);
        const isUpdatedAfterStart = stat.mtimeMs >= this.startMs - 2_000;
        if (stat.isFile() && (isNewDir || isUpdatedAfterStart)) {
          candidates.push({ mtimeMs: stat.mtimeMs, path: messagesPath });
        }
      } catch {
        // Ignore incomplete chat directories while Freebuff is still writing them.
      }
    }
    return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }
}

export function readAssistantResponseFromFile(messagesPath: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(messagesPath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return null;
    return extractLatestAssistantResponse(parsed as FreebuffChatMessage[]);
  } catch {
    return null;
  }
}

function getFreebuffChatsDir(cwd: string, env: NodeJS.ProcessEnv): string {
  const environment = env.NEXT_PUBLIC_CB_ENVIRONMENT;
  const suffix = environment && environment !== 'prod' ? `-${environment}` : '';
  return path.join(os.homedir(), '.config', `manicode${suffix}`, 'projects', path.basename(cwd), 'chats');
}

function listChatDirs(chatsDir: string): Set<string> {
  try {
    return new Set(fs.readdirSync(chatsDir).filter(name => {
      try {
        return fs.statSync(path.join(chatsDir, name)).isDirectory();
      } catch {
        return false;
      }
    }));
  } catch {
    return new Set();
  }
}

function extractLatestAssistantResponse(messages: FreebuffChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.variant !== 'ai') continue;
    const text = extractMessageText(message).trim();
    if (text) return text;
  }
  return null;
}

function extractMessageText(message: FreebuffChatMessage): string {
  const blockText = Array.isArray(message.blocks)
    ? extractBlockText(message.blocks as FreebuffTextBlock[])
    : '';
  if (blockText.trim()) return blockText;
  return typeof message.content === 'string' ? message.content : '';
}

function extractBlockText(blocks: FreebuffTextBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (Array.isArray(block.blocks)) {
      const nested = extractBlockText(block.blocks as FreebuffTextBlock[]);
      if (nested.trim()) parts.push(nested);
    }
    if (block.type === 'text' && block.textType !== 'reasoning' && typeof block.content === 'string') {
      parts.push(block.content);
    }
  }
  return parts.join('\n\n');
}
