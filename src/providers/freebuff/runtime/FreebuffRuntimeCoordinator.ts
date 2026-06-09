import type { ChildProcess } from 'node:child_process';

import { terminateFreebuffProcess } from './FreebuffProcessControl';

type FreebuffProcessKind = 'aux' | 'chat';

interface ActiveFreebuffProcess {
  kind: FreebuffProcessKind;
  process: ChildProcess;
}

let activeProcess: ActiveFreebuffProcess | null = null;

export function reserveFreebuffProcessSlot(kind: FreebuffProcessKind): boolean {
  const active = activeProcess;
  if (!active) return true;
  if (kind === 'aux') return false;
  terminateFreebuffProcess(active.process, 'SIGTERM');
  activeProcess = null;
  return true;
}

export function trackFreebuffProcess(process: ChildProcess, kind: FreebuffProcessKind): void {
  activeProcess = { kind, process };
  const clear = (): void => {
    if (activeProcess?.process === process) activeProcess = null;
  };
  process.once('close', clear);
  process.once('exit', clear);
  process.once('error', clear);
}

export function untrackFreebuffProcess(process: ChildProcess): void {
  if (activeProcess?.process === process) activeProcess = null;
}
