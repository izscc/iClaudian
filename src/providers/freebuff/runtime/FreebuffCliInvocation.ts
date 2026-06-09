import {
  decodeFreebuffModelId,
  type FreebuffModelId,
  freebuffModelToCliArgs,
} from '../models';

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

export function resolveFreebuffModelId(selectedModel?: string | null): FreebuffModelId {
  if (!selectedModel) return 'minimax-m2.7';
  return decodeFreebuffModelId(selectedModel) ?? 'minimax-m2.7';
}

export function buildFreebuffCliInvocation(input: FreebuffCliInvocationInput): FreebuffCliInvocation {
  const modelId = resolveFreebuffModelId(input.selectedModel);
  const modelConfig = freebuffModelToCliArgs(modelId);
  const command = input.configuredCliPath?.trim() || modelConfig.executable;
  const args = ['--cwd', input.cwd, ...modelConfig.modelArgs];
  if (modelConfig.promptAsArg) args.push(input.prompt);
  return {
    args,
    command,
    stdinText: modelConfig.promptAsArg ? null : `${input.prompt}\n`,
  };
}
