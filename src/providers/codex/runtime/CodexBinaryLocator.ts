import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getEnhancedPath, parseEnvironmentVariables } from '../../../utils/env';
import { expandHomePath, parsePathEntries } from '../../../utils/path';
import type { CodexInstallationMethod } from '../settings';

function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveConfiguredPath(configuredPath: string | undefined): string | null {
  const trimmed = (configuredPath ?? '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const expandedPath = expandHomePath(trimmed);
    return isExistingFile(expandedPath) ? expandedPath : null;
  } catch {
    return null;
  }
}

export function isWindowsStyleCliReference(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return false;
  }

  return /^[A-Za-z]:[\\/]/.test(trimmed)
    || trimmed.startsWith('\\\\')
    || /\.(?:exe|cmd|bat|ps1)$/i.test(trimmed);
}

export function findCodexBinaryPath(
  additionalPath?: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const binaryNames = platform === 'win32'
    ? ['codex.exe', 'codex.cmd', 'codex']
    : ['codex'];

  const findInDirectories = (directories: string[]): string | null => {
    for (const dir of directories) {
      if (!dir) continue;

      for (const binaryName of binaryNames) {
        const candidate = path.join(dir, binaryName);
        if (isExistingFile(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  };

  const explicitBinary = findInDirectories(parsePathEntries(additionalPath ?? ''));
  if (explicitBinary) return explicitBinary;

  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const preferredDirectories = platform === 'darwin'
    ? [
      path.join(home, 'Applications', 'Codex.app', 'Contents', 'Resources'),
      '/Applications/Codex.app/Contents/Resources',
      path.join(home, 'Applications', 'Codex.app', 'Contents', 'MacOS'),
      '/Applications/Codex.app/Contents/MacOS',
      path.join(home, '.local', 'bin'),
    ]
    : platform === 'win32'
      ? []
      : [path.join(home, '.local', 'bin')];
  const preferredBinary = findInDirectories(preferredDirectories);
  if (preferredBinary) return preferredBinary;

  return findInDirectories(parsePathEntries(getEnhancedPath(additionalPath)));
}

export function resolveCodexCliPath(
  hostnamePath: string | undefined,
  legacyPath: string | undefined,
  envText: string,
  options: { installationMethod?: CodexInstallationMethod; hostPlatform?: NodeJS.Platform } = {},
): string | null {
  const hostPlatform = options.hostPlatform ?? process.platform;
  if (hostPlatform === 'win32' && options.installationMethod === 'wsl') {
    const configuredCommand = [hostnamePath, legacyPath]
      .map(value => (value ?? '').trim())
      .find(value => value.length > 0 && !isWindowsStyleCliReference(value));
    return configuredCommand || 'codex';
  }

  const configuredHostnamePath = resolveConfiguredPath(hostnamePath);
  if (configuredHostnamePath) {
    return configuredHostnamePath;
  }

  const configuredLegacyPath = resolveConfiguredPath(legacyPath);
  if (configuredLegacyPath) {
    return configuredLegacyPath;
  }

  const customEnv = parseEnvironmentVariables(envText || '');
  return findCodexBinaryPath(customEnv.PATH, hostPlatform);
}
