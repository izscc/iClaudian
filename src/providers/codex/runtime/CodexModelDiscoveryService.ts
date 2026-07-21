import { z } from 'zod';

import { type CodexDiscoveredModel, normalizeCodexDiscoveredModels } from '../models';
import { CodexAppServerProcess } from './CodexAppServerProcess';
import { initializeCodexAppServerTransport } from './codexAppServerSupport';
import type { CodexLaunchSpec } from './codexLaunchTypes';
import { CodexRpcTransport } from './CodexRpcTransport';

export type CodexModelDiscoveryResult =
  | {
    readonly kind: 'completed';
    readonly diagnostics?: string;
    readonly models: readonly CodexDiscoveredModel[];
  }
  | {
    readonly kind: 'skipped';
    readonly reason: 'provider-disabled';
  };

export interface CodexModelDiscoveryContext {
  isEnabled(): boolean;
  resolveLaunchSpec(): CodexLaunchSpec;
}

const MODEL_LIST_PAGE_SIZE = 100;
const MODEL_LIST_MAX_PAGES = 20;
const MODEL_LIST_MAX_MODELS = 1_000;
const MODEL_ID_MAX_LENGTH = 200;
const MODEL_TEXT_MAX_LENGTH = 10_000;
const MODEL_CURSOR_MAX_LENGTH = 1_024;

const boundedId = z.string().max(MODEL_ID_MAX_LENGTH);
const boundedText = z.string().max(MODEL_TEXT_MAX_LENGTH);
const ModelListPageSchema = z.object({
  data: z.array(z.object({
    id: boundedId.optional(),
    model: boundedId.optional(),
    displayName: boundedText.optional(),
    description: boundedText.optional(),
    hidden: z.boolean().optional(),
    supportedReasoningEfforts: z.array(z.object({
      reasoningEffort: boundedId,
      description: boundedText.optional(),
    })).max(16).optional(),
    defaultReasoningEffort: boundedId.optional(),
    serviceTiers: z.array(z.object({
      id: boundedId,
      name: boundedText.optional(),
      description: boundedText.optional(),
    })).max(16).optional(),
    defaultServiceTier: boundedId.nullable().optional(),
    inputModalities: z.array(z.enum(['text', 'image'])).max(2).optional(),
    isDefault: z.boolean().optional(),
  })).max(MODEL_LIST_PAGE_SIZE),
  nextCursor: z.string().max(MODEL_CURSOR_MAX_LENGTH).nullable().optional(),
});

export class CodexModelDiscoveryService {
  constructor(private readonly context: CodexModelDiscoveryContext) {}

  async discoverModels(signal?: AbortSignal): Promise<CodexModelDiscoveryResult> {
    if (!this.context.isEnabled()) {
      return { kind: 'skipped', reason: 'provider-disabled' };
    }
    if (signal?.aborted) {
      return { diagnostics: 'Codex model discovery was cancelled', kind: 'completed', models: [] };
    }

    let process: CodexAppServerProcess | null = null;
    let transport: CodexRpcTransport | null = null;
    let abortListener: (() => void) | null = null;
    try {
      process = new CodexAppServerProcess(this.context.resolveLaunchSpec());
      process.start();
      transport = new CodexRpcTransport(process);
      transport.start();
      abortListener = () => {
        transport?.dispose();
        if (process) void process.shutdown().catch(() => undefined);
      };
      signal?.addEventListener('abort', abortListener, { once: true });
      await initializeCodexAppServerTransport(transport);

      const entries: unknown[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      let pageCount = 0;
      do {
        if (signal?.aborted) {
          return { diagnostics: 'Codex model discovery was cancelled', kind: 'completed', models: [] };
        }
        pageCount++;
        if (pageCount > MODEL_LIST_MAX_PAGES) {
          throw new Error(`Codex model/list exceeded ${MODEL_LIST_MAX_PAGES} pages`);
        }
        const result = ModelListPageSchema.parse(
          await transport.request<unknown>('model/list', {
            ...(cursor ? { cursor } : {}),
            includeHidden: false,
            limit: MODEL_LIST_PAGE_SIZE,
          }),
        );
        if (entries.length + result.data.length > MODEL_LIST_MAX_MODELS) {
          throw new Error(`Codex model/list exceeded ${MODEL_LIST_MAX_MODELS} models`);
        }
        entries.push(...result.data);

        const nextCursor: string | null = typeof result.nextCursor === 'string' && result.nextCursor.trim()
          ? result.nextCursor
          : null;
        if (nextCursor && seenCursors.has(nextCursor)) {
          throw new Error('Codex model/list returned a repeated cursor');
        }
        if (nextCursor) seenCursors.add(nextCursor);
        cursor = nextCursor;
      } while (cursor);

      return {
        kind: 'completed',
        models: normalizeCodexDiscoveredModels(entries),
      };
    } catch (error) {
      if (signal?.aborted) {
        return { diagnostics: 'Codex model discovery was cancelled', kind: 'completed', models: [] };
      }
      const message = error instanceof Error ? error.message : 'Codex model discovery failed';
      const stderr = process?.getStderrSnapshot() ?? '';
      return {
        diagnostics: stderr && !message.includes(stderr) ? `${message}\n\n${stderr}` : message,
        kind: 'completed',
        models: [],
      };
    } finally {
      if (abortListener && signal) signal.removeEventListener('abort', abortListener);
      transport?.dispose();
      if (process) {
        await process.shutdown().catch(() => undefined);
      }
    }
  }
}
