import { type ChildProcess, spawn } from 'child_process';
import type { Readable, Writable } from 'stream';

import type { CodexLaunchSpec } from './codexLaunchTypes';

const SIGKILL_TIMEOUT_MS = 3_000;
const STDERR_BUFFER_LIMIT = 8_192;
const SENSITIVE_ENV_KEY = /(?:api[_-]?key|token|secret|password|credential|authorization)/i;
const SENSITIVE_ASSIGNMENT = /\b(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s,;]+/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const OPENAI_TOKEN = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const WINDOWS_CMD_ARGUMENT_CHARS = /[\s"&<>|{}^=;!'+,`~()%@]/u;

function requiresWindowsShellQuoting(value: string): boolean {
  return WINDOWS_CMD_ARGUMENT_CHARS.test(value)
    || value.includes('[')
    || value.includes(']');
}

function quoteWindowsShellArgument(value: string): string {
  if (!value.length) {
    return '""';
  }

  if (!requiresWindowsShellQuoting(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function resolveWindowsSpawnSpec(launchSpec: Pick<CodexLaunchSpec, 'command' | 'args' | 'spawnCwd' | 'env'>) {
  const command = launchSpec.command.trim();
  const lowerCommand = command.toLowerCase();

  if (!command || process.platform !== 'win32') {
    return {
      command: launchSpec.command,
      args: launchSpec.args,
      env: launchSpec.env,
    };
  }

  if (lowerCommand.endsWith('.cmd')) {
    const shellCommand = [command, ...launchSpec.args]
      .map(value => quoteWindowsShellArgument(value))
      .join(' ');

    return {
      command: process.env.ComSpec || process.env.comspec || 'cmd.exe',
      args: ['/d', '/s', '/c', `"${shellCommand}"`],
      env: launchSpec.env,
      windowsVerbatimArguments: true,
    };
  }

  return {
    command: launchSpec.command,
    args: launchSpec.args,
    env: launchSpec.env,
  };
}

type ExitCallback = (code: number | null, signal: string | null) => void;

function stripControlCharacters(value: string): string {
  return Array.from(value).filter((character) => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
  }).join('');
}

export class CodexAppServerProcess {
  private proc: ChildProcess | null = null;
  private alive = false;
  private exitCallbacks: ExitCallback[] = [];
  private stderrBuffer = '';
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    private readonly launchSpec: Pick<CodexLaunchSpec, 'command' | 'args' | 'spawnCwd' | 'env'>,
  ) {}

  start(): void {
    const resolvedSpawnSpec = resolveWindowsSpawnSpec(this.launchSpec);

    this.proc = spawn(resolvedSpawnSpec.command, resolvedSpawnSpec.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.launchSpec.spawnCwd,
      env: resolvedSpawnSpec.env,
      windowsHide: true,
      ...(resolvedSpawnSpec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });

    this.alive = true;

    this.proc.on('exit', () => {
      this.alive = false;
    });

    this.proc.on('close', (code, signal) => {
      this.alive = false;
      for (const cb of this.exitCallbacks) {
        cb(code, signal);
      }
    });

    this.proc.on('error', (error) => {
      this.alive = false;
      this.appendStderr(error instanceof Error ? error.message : String(error), true);
    });

    this.proc.stderr?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      this.appendStderr(text);
    });
  }

  get stdin(): Writable {
    if (!this.proc?.stdin) throw new Error('Process not started');
    return this.proc.stdin;
  }

  get stdout(): Readable {
    if (!this.proc?.stdout) throw new Error('Process not started');
    return this.proc.stdout;
  }

  get stderr(): Readable {
    if (!this.proc?.stderr) throw new Error('Process not started');
    return this.proc.stderr;
  }

  isAlive(): boolean {
    return this.alive;
  }

  getStderrSnapshot(): string {
    let diagnostic = stripControlCharacters(this.stderrBuffer);
    for (const [key, value] of Object.entries(this.launchSpec.env)) {
      if (SENSITIVE_ENV_KEY.test(key) && value.length >= 6) {
        diagnostic = diagnostic.replaceAll(value, '[REDACTED]');
      }
    }
    const home = this.launchSpec.env.HOME || this.launchSpec.env.USERPROFILE;
    if (home && home.length > 1) diagnostic = diagnostic.replaceAll(home, '~');
    return diagnostic
      .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
      .replace(OPENAI_TOKEN, '[REDACTED]')
      .replace(SENSITIVE_ASSIGNMENT, '$1=[REDACTED]')
      .replace(EMAIL_ADDRESS, '[REDACTED_EMAIL]')
      .trim();
  }

  onExit(callback: ExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  offExit(callback: ExitCallback): void {
    const idx = this.exitCallbacks.indexOf(callback);
    if (idx !== -1) this.exitCallbacks.splice(idx, 1);
  }

  private appendStderr(text: string, separate = false): void {
    const separator = separate && this.stderrBuffer && !this.stderrBuffer.endsWith('\n') ? '\n' : '';
    this.stderrBuffer = `${this.stderrBuffer}${separator}${text}`.slice(-STDERR_BUFFER_LIMIT);
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    const proc = this.proc;
    if (!proc || !this.alive) return;

    this.shutdownPromise = new Promise<void>((resolve) => {
      let killTimer: ReturnType<typeof setTimeout> | null = null;
      const onClose = () => {
        if (killTimer !== null) clearTimeout(killTimer);
        resolve();
      };

      proc.once('close', onClose);
      proc.kill('SIGTERM');

      killTimer = setTimeout(() => {
        if (this.alive) {
          proc.kill('SIGKILL');
        }
      }, SIGKILL_TIMEOUT_MS);
    });
    return this.shutdownPromise;
  }
}
