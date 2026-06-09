import * as fs from 'node:fs';
import * as path from 'node:path';

import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import { getHostnameKey, parseEnvironmentVariables } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { getFreebuffProviderSettings } from '../settings';

export class FreebuffCliResolver {
  private readonly cachedHostname = getHostnameKey();
  private lastCliPath = '';
  private lastHostnamePath = '';
  private lastEnvText = '';
  private resolvedPath: string | null = null;

  resolveFromSettings(settings: Record<string, unknown>): string | null {
    const freebuffSettings = getFreebuffProviderSettings(settings);
    const cliPath = freebuffSettings.cliPath.trim();
    const hostnamePath = (freebuffSettings.cliPathsByHost[this.cachedHostname] ?? '').trim();
    const envText = getRuntimeEnvironmentText(settings, 'freebuff');
    if (this.resolvedPath !== null && cliPath === this.lastCliPath && hostnamePath === this.lastHostnamePath && envText === this.lastEnvText) {
      return this.resolvedPath;
    }
    this.lastCliPath = cliPath;
    this.lastHostnamePath = hostnamePath;
    this.lastEnvText = envText;
    this.resolvedPath = resolveFreebuffCliPath(hostnamePath, cliPath, envText);
    return this.resolvedPath;
  }

  reset(): void {
    this.lastCliPath = '';
    this.lastHostnamePath = '';
    this.lastEnvText = '';
    this.resolvedPath = null;
  }
}

export function resolveFreebuffCliPath(
  hostnamePath: string | undefined,
  legacyPath: string | undefined,
  envText: string,
): string | null {
  return resolveConfiguredCliPath(hostnamePath ?? '')
    ?? resolveConfiguredCliPath(legacyPath ?? '')
    ?? findFreebuffExecutable(parseEnvironmentVariables(envText || '').PATH);
}

function resolveConfiguredCliPath(cliPath: string): string | null {
  if (!cliPath) return null;
  try {
    const expanded = expandHomePath(cliPath);
    if (fs.existsSync(expanded) && fs.statSync(expanded).isFile()) return expanded;
  } catch {
    return null;
  }
  return null;
}

function findFreebuffExecutable(additionalPath?: string): string | null {
  const executable = process.platform === 'win32' ? 'freebuff.cmd' : 'freebuff';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const envPathEntries = [
    ...(additionalPath ? additionalPath.split(path.delimiter) : []),
  ];
  const candidates = [
    ...envPathEntries.map(dir => path.join(dir, executable)),
    ...(home ? [
      path.join(home, '.hermes', 'node', 'bin', executable),
      path.join(home, '.volta', 'bin', executable),
      path.join(home, '.local', 'bin', executable),
      path.join(home, '.bun', 'bin', executable),
    ] : []),
    ...(process.env.PATH ? process.env.PATH.split(path.delimiter).map(dir => path.join(dir, executable)) : []),
    '/usr/local/bin/freebuff',
    '/opt/homebrew/bin/freebuff',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Ignore inaccessible paths.
    }
  }
  return null;
}
