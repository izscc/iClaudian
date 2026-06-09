import * as fs from 'node:fs';

import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import { getHostnameKey } from '../../../utils/env';
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
    this.resolvedPath = resolveConfiguredCliPath(hostnamePath) ?? resolveConfiguredCliPath(cliPath);
    return this.resolvedPath;
  }

  reset(): void {
    this.lastCliPath = '';
    this.lastHostnamePath = '';
    this.lastEnvText = '';
    this.resolvedPath = null;
  }
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
