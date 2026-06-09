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

export type FreebuffLogCompletion =
  | { type: 'error'; message: string }
  | { type: 'text'; content: string };

export class FreebuffChatStateWatcher {
  private readonly chatsDir: string;
  private readonly knownChatDirs: Set<string>;

  constructor(
    cwd: string,
    env: NodeJS.ProcessEnv,
    private readonly expectedPrompt = '',
    private readonly startMs: number = Date.now(),
  ) {
    this.chatsDir = getFreebuffChatsDir(cwd, env);
    this.knownChatDirs = listChatDirs(this.chatsDir);
  }

  readAssistantResponse(): string | null {
    const candidates = this.listCandidateMessageFiles();
    for (const candidate of candidates) {
      const response = readAssistantResponseFromFile(candidate.path, this.expectedPrompt);
      if (response) return response;
    }
    return null;
  }

  hasPromptStarted(): boolean {
    for (const candidate of this.listCandidateLogFiles()) {
      if (readPromptStartedFromLogFile(candidate.path, this.expectedPrompt)) return true;
    }
    return false;
  }

  readLogCompletion(): FreebuffLogCompletion | null {
    for (const candidate of this.listCandidateLogFiles()) {
      const completion = readCompletionFromLogFile(candidate.path, this.expectedPrompt);
      if (completion) return completion;
    }
    return null;
  }

  private listCandidateMessageFiles(): Array<{ mtimeMs: number; path: string }> {
    return this.listCandidateFiles('chat-messages.json');
  }

  private listCandidateLogFiles(): Array<{ mtimeMs: number; path: string }> {
    return this.listCandidateFiles('log.jsonl');
  }

  private listCandidateFiles(fileName: string): Array<{ mtimeMs: number; path: string }> {
    let names: string[];
    try {
      names = fs.readdirSync(this.chatsDir);
    } catch {
      return [];
    }

    const candidates: Array<{ mtimeMs: number; path: string }> = [];
    for (const name of names) {
      const candidatePath = path.join(this.chatsDir, name, fileName);
      try {
        const stat = fs.statSync(candidatePath);
        const isNewDir = !this.knownChatDirs.has(name);
        const isUpdatedAfterStart = stat.mtimeMs >= this.startMs - 2_000;
        if (stat.isFile() && (isNewDir || isUpdatedAfterStart)) {
          candidates.push({ mtimeMs: stat.mtimeMs, path: candidatePath });
        }
      } catch {
        // Ignore incomplete chat directories while Freebuff is still writing them.
      }
    }
    return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }
}

export function readPromptStartedFromLogFile(logPath: string, expectedPrompt = ''): boolean {
  try {
    return parseLogLines(logPath).some(entry => {
      if (!String(entry.msg ?? '').includes('Start agent')) return false;
      return matchesExpectedPrompt(JSON.stringify(entry), expectedPrompt);
    });
  } catch {
    return false;
  }
}

export function readCompletionFromLogFile(logPath: string, expectedPrompt = ''): FreebuffLogCompletion | null {
  let belongsToPrompt = !expectedPrompt.trim();
  for (const entry of parseLogLines(logPath)) {
    const serialized = JSON.stringify(entry);
    if (String(entry.msg ?? '').includes('Start agent') && matchesExpectedPrompt(serialized, expectedPrompt)) {
      belongsToPrompt = true;
    }
    if (!belongsToPrompt || entry.msg !== 'Main prompt finished') continue;
    const output = getRecord(getRecord(entry.data).output);
    if (output.type === 'error') {
      return { type: 'error', message: typeof output.message === 'string' ? output.message : 'Freebuff failed.' };
    }
    const text = extractTextFromLogOutput(output).trim();
    if (text) return { type: 'text', content: text };
  }
  return null;
}

export function readAssistantResponseFromFile(messagesPath: string, expectedPrompt = ''): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(messagesPath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (!messagesMatchExpectedPrompt(parsed as FreebuffChatMessage[], expectedPrompt)) return null;
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


function parseLogLines(logPath: string): Array<Record<string, unknown>> {
  try {
    return fs.readFileSync(logPath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function extractTextFromLogOutput(output: Record<string, unknown>): string {
  if (output.type === 'lastMessage' && Array.isArray(output.value)) {
    const parts: string[] = [];
    for (const message of output.value) {
      const record = getRecord(message);
      if (!Array.isArray(record.content)) continue;
      for (const block of record.content) {
        const blockRecord = getRecord(block);
        if (blockRecord.type === 'text' && typeof blockRecord.text === 'string') parts.push(blockRecord.text);
      }
    }
    return parts.join('\n\n');
  }
  if (typeof output.value === 'string') return output.value;
  return '';
}

function messagesMatchExpectedPrompt(messages: FreebuffChatMessage[], expectedPrompt: string): boolean {
  if (!expectedPrompt.trim()) return true;
  return messages.some(message => message.variant === 'user' && matchesExpectedPrompt(extractMessageText(message), expectedPrompt));
}

function matchesExpectedPrompt(haystack: string, expectedPrompt: string): boolean {
  const expected = normalizePromptFingerprint(expectedPrompt);
  if (!expected) return true;
  const actual = normalizePromptFingerprint(haystack);
  return actual.includes(expected.slice(0, Math.min(80, expected.length)));
}

function normalizePromptFingerprint(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
