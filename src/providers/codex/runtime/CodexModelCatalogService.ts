import { ProviderSettingsCoordinator } from '../../../core/providers/ProviderSettingsCoordinator';
import type { ProviderModelCatalogRefreshResult } from '../../../core/providers/types';
import { getCodexProviderSettings, updateCodexProviderSettings } from '../settings';
import type { CodexModelDiscoveryResult } from './CodexModelDiscoveryService';

const CATALOG_TTL_MS = 6 * 60 * 60 * 1_000;
const CATALOG_RETRY_MS = 5 * 60 * 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneSettingsValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneSettingsValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneSettingsValue(entry)]),
  );
}

function cloneSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return cloneSettingsValue(settings) as Record<string, unknown>;
}

function restoreSettings(
  settings: Record<string, unknown>,
  snapshot: Record<string, unknown>,
): void {
  for (const key of Object.keys(settings)) delete settings[key];
  Object.assign(settings, snapshot);
}

export interface CodexModelCatalogContext {
  getSettings(): Record<string, unknown>;
  saveSettings(): Promise<void>;
  refreshModelSelectors(): void;
}

export interface CodexModelDiscoverySource {
  discoverModels(signal?: AbortSignal): Promise<CodexModelDiscoveryResult>;
}

export class CodexModelCatalogService {
  private inFlight: Promise<ProviderModelCatalogRefreshResult> | null = null;
  private abortController: AbortController | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly context: CodexModelCatalogContext,
    private readonly discovery: CodexModelDiscoverySource,
  ) {}

  async refresh(force = false): Promise<ProviderModelCatalogRefreshResult> {
    if (this.disposed) return { changed: false };
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runRefresh(force);
    try {
      const result = await this.inFlight;
      this.scheduleNextRefresh(result);
      return result;
    } finally {
      this.inFlight = null;
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.abortController?.abort();
    this.abortController = null;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    if (this.inFlight) await this.inFlight;
  }

  private async runRefresh(force: boolean): Promise<ProviderModelCatalogRefreshResult> {
    const abortController = new AbortController();
    this.abortController = abortController;
    try {
      const settingsBag = this.context.getSettings();
      const current = getCodexProviderSettings(settingsBag);
      if (!current.enabled) return { changed: false };

      const isFresh = current.discoveredModels.length > 0
        && Date.now() - current.catalogTimestamp < CATALOG_TTL_MS;
      if (!force && isFresh) return { changed: false };

      const result = await this.discovery.discoverModels(abortController.signal);
      if (this.disposed || abortController.signal.aborted) return { changed: false };
      if (result.kind === 'skipped') return { changed: false };
      if (result.diagnostics || result.models.length === 0) {
        return {
          changed: false,
          diagnostics: result.diagnostics ?? 'Codex app-server returned no visible models',
        };
      }

      const latest = getCodexProviderSettings(settingsBag);
      if (!latest.enabled) return { changed: false };
      const changed = JSON.stringify(latest.discoveredModels) !== JSON.stringify(result.models);
      const snapshot = cloneSettings(settingsBag);
      try {
        updateCodexProviderSettings(settingsBag, {
          discoveredModels: result.models,
          catalogTimestamp: Date.now(),
        });
        ProviderSettingsCoordinator.normalizeAllModelVariants(settingsBag);
        await this.context.saveSettings();
      } catch (error) {
        restoreSettings(settingsBag, snapshot);
        throw error;
      }

      if (this.disposed || abortController.signal.aborted) return { changed: false };

      if (changed) {
        try {
          this.context.refreshModelSelectors();
        } catch (error) {
          return {
            changed: true,
            diagnostics: error instanceof Error ? error.message : 'Codex model selector refresh failed',
          };
        }
      }
      return { changed };
    } catch (error) {
      return {
        changed: false,
        diagnostics: error instanceof Error ? error.message : 'Codex model catalog refresh failed',
      };
    } finally {
      if (this.abortController === abortController) this.abortController = null;
    }
  }

  private scheduleNextRefresh(result: ProviderModelCatalogRefreshResult): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    if (this.disposed) return;

    const current = getCodexProviderSettings(this.context.getSettings());
    if (!current.enabled) return;
    const age = Math.max(0, Date.now() - current.catalogTimestamp);
    const delay = result.diagnostics
      ? CATALOG_RETRY_MS
      : Math.max(1_000, CATALOG_TTL_MS - age);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, delay);
    this.refreshTimer.unref?.();
  }
}
