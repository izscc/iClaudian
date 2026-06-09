import type { ChildProcess } from 'node:child_process';

export function terminateFreebuffProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through to killing the direct child when process-group kill is unavailable.
    }
  }
  child.kill(signal);
}
