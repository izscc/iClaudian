import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import { getEnhancedPath, parseEnvironmentVariables } from '../../../utils/env';

export function buildAntigravityRuntimeEnv(settings: Record<string, unknown>, cliPath: string): NodeJS.ProcessEnv {
  const envText = getRuntimeEnvironmentText(settings, 'antigravity');
  const envVars = parseEnvironmentVariables(envText);
  return {
    ...process.env,
    ...envVars,
    PATH: getEnhancedPath(envVars.PATH, cliPath || undefined),
    TERM: process.env.TERM && process.env.TERM !== 'dumb' ? process.env.TERM : 'xterm-256color',
  };
}
