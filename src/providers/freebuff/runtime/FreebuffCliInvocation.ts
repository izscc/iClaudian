import { decodeFreebuffModelId, type FreebuffMode,freebuffModeToCliArgs } from '../models';

export interface FreebuffCliInvocationInput {
  configuredCliPath?: string | null;
  cwd: string;
  prompt: string;
  selectedModel?: string | null;
}

export interface FreebuffCliInvocation {
  args: string[];
  command: string;
  stdinText: string | null;
}

export function resolveFreebuffMode(selectedModel?: string | null): FreebuffMode {
  if (!selectedModel) return 'freebuff';
  return decodeFreebuffModelId(selectedModel) ?? 'freebuff';
}

export function buildFreebuffCliInvocation(input: FreebuffCliInvocationInput): FreebuffCliInvocation {
  const mode = resolveFreebuffMode(input.selectedModel);
  const modeConfig = freebuffModeToCliArgs(mode);
  const command = input.configuredCliPath?.trim() || modeConfig.executable;
  const args = ['--cwd', input.cwd, ...modeConfig.modeArgs];
  if (modeConfig.promptAsArg) args.push(input.prompt);
  return {
    args,
    command,
    stdinText: modeConfig.promptAsArg ? null : `${input.prompt}\n`,
  };
}
