import '@/providers';

import {
  classifyEnvironmentVariablesByOwnership,
  getEnvironmentReviewKeysForScope,
  getEnvironmentScopeUpdates,
  getProviderEnvironmentVariables,
  getProvidersAffectedByEnvironmentUpdates,
  getRuntimeEnvironmentText,
  getSharedEnvironmentVariables,
  inferEnvironmentSnippetScope,
  resolveEnvironmentSnippetScope,
  setProviderEnvironmentVariables,
  setSharedEnvironmentVariables,
} from '@/core/providers/providerEnvironment';

describe('providerEnvironment', () => {
  describe('classifyEnvironmentVariablesByOwnership', () => {
    it('splits shared, Claude, and Codex vars by ownership', () => {
      const result = classifyEnvironmentVariablesByOwnership([
        'PATH=/usr/local/bin',
        'ANTHROPIC_API_KEY=claude-key',
        'OPENAI_API_KEY=codex-key',
        'CODEX_SANDBOX=workspace-write',
        'CUSTOM_FLAG=1',
      ].join('\n'));

      expect(result.shared).toBe(['PATH=/usr/local/bin', 'CUSTOM_FLAG=1'].join('\n'));
      expect(result.providers.claude).toBe('ANTHROPIC_API_KEY=claude-key');
      expect(result.providers.codex).toBe([
        'OPENAI_API_KEY=codex-key',
        'CODEX_SANDBOX=workspace-write',
      ].join('\n'));
      expect(result.reviewKeys).toEqual(['CUSTOM_FLAG']);
    });

    it('keeps comments attached to the next owned variable when migrating', () => {
      const result = classifyEnvironmentVariablesByOwnership([
        '# shared comment',
        'PATH=/usr/local/bin',
        '',
        '# claude comment',
        'ANTHROPIC_MODEL=claude-custom',
      ].join('\n'));

      expect(result.shared).toBe(['# shared comment', 'PATH=/usr/local/bin'].join('\n'));
      expect(result.providers.claude).toBe(['', '# claude comment', 'ANTHROPIC_MODEL=claude-custom'].join('\n'));
    });

    it('routes keys claimed by multiple providers into every claiming scope', () => {
      const result = classifyEnvironmentVariablesByOwnership('GOOGLE_API_KEY=google-key');

      expect(result.providers.gemini).toBe('GOOGLE_API_KEY=google-key');
      expect(result.providers.antigravity).toBe('GOOGLE_API_KEY=google-key');
      expect(result.shared).toBe('');
      expect(result.reviewKeys).toEqual([]);
    });
  });

  describe('runtime env accessors', () => {
    it('reads split shared/provider env from settings', () => {
      const settings: Record<string, unknown> = {
        sharedEnvironmentVariables: 'PATH=/usr/local/bin',
        providerConfigs: {
          claude: { environmentVariables: 'ANTHROPIC_MODEL=custom-model' },
        },
      };

      expect(getSharedEnvironmentVariables(settings)).toBe('PATH=/usr/local/bin');
      expect(getProviderEnvironmentVariables(settings, 'claude')).toBe('ANTHROPIC_MODEL=custom-model');
      expect(getRuntimeEnvironmentText(settings, 'claude')).toBe([
        'PATH=/usr/local/bin',
        'ANTHROPIC_MODEL=custom-model',
      ].join('\n'));
    });

    it('falls back to classifying legacy single-bag env settings', () => {
      const settings: Record<string, unknown> = {
        environmentVariables: [
          'PATH=/usr/local/bin',
          'ANTHROPIC_MODEL=claude-custom',
          'OPENAI_MODEL=gpt-custom',
        ].join('\n'),
      };

      expect(getSharedEnvironmentVariables(settings)).toBe('PATH=/usr/local/bin');
      expect(getProviderEnvironmentVariables(settings, 'claude')).toBe('ANTHROPIC_MODEL=claude-custom');
      expect(getProviderEnvironmentVariables(settings, 'codex')).toBe('OPENAI_MODEL=gpt-custom');
    });

    it('updates split env settings through scoped setters', () => {
      const settings: Record<string, unknown> = {};

      setSharedEnvironmentVariables(settings, 'PATH=/usr/local/bin');
      setProviderEnvironmentVariables(settings, 'codex', 'OPENAI_API_KEY=test-key');

      expect(settings.sharedEnvironmentVariables).toBe('PATH=/usr/local/bin');
      expect(settings.providerConfigs).toEqual({
        codex: { environmentVariables: 'OPENAI_API_KEY=test-key' },
      });
    });
  });

  describe('getEnvironmentReviewKeysForScope', () => {
    it('flags unknown keys left in shared env for manual review', () => {
      const reviewKeys = getEnvironmentReviewKeysForScope([
        'PATH=/usr/local/bin',
        'CUSTOM_FLAG=1',
      ].join('\n'), 'shared');

      expect(reviewKeys).toEqual(['CUSTOM_FLAG']);
    });

    it('flags shared and foreign-provider keys in provider env sections', () => {
      const reviewKeys = getEnvironmentReviewKeysForScope([
        'PATH=/usr/local/bin',
        'OPENAI_API_KEY=test-key',
        'CUSTOM_FLAG=1',
      ].join('\n'), 'provider:claude');

      expect(reviewKeys).toEqual(['PATH', 'OPENAI_API_KEY', 'CUSTOM_FLAG']);
    });
  });

  describe('inferEnvironmentSnippetScope', () => {
    it('returns shared for neutral-only snippets', () => {
      expect(inferEnvironmentSnippetScope('PATH=/usr/local/bin')).toBe('shared');
    });

    it('returns provider scope for single-provider snippets', () => {
      expect(inferEnvironmentSnippetScope('OPENAI_MODEL=gpt-custom')).toBe('provider:codex');
    });

    it('keeps mixed-ownership legacy snippets unscoped', () => {
      expect(inferEnvironmentSnippetScope([
        'PATH=/usr/local/bin',
        'ANTHROPIC_MODEL=claude-custom',
      ].join('\n'))).toBeUndefined();
    });
  });

  describe('resolveEnvironmentSnippetScope', () => {
    it('normalizes mixed snippets back to unscoped even if a stale scope was saved', () => {
      expect(resolveEnvironmentSnippetScope([
        'PATH=/usr/local/bin',
        'ANTHROPIC_MODEL=claude-custom',
      ].join('\n'), 'shared')).toBeUndefined();
    });

    it('keeps the fallback scope only for empty snippets', () => {
      expect(resolveEnvironmentSnippetScope('', 'provider:codex')).toBe('provider:codex');
    });
  });

  describe('getEnvironmentScopeUpdates', () => {
    it('reclassifies mixed snippets into separate scope updates', () => {
      expect(getEnvironmentScopeUpdates([
        'PATH=/usr/local/bin',
        'ANTHROPIC_MODEL=claude-custom',
      ].join('\n'), 'shared')).toEqual([
        { scope: 'shared', envText: 'PATH=/usr/local/bin' },
        { scope: 'provider:claude', envText: 'ANTHROPIC_MODEL=claude-custom' },
      ]);
    });

    it('uses the fallback scope only when there is no inferable content', () => {
      expect(getEnvironmentScopeUpdates('', 'provider:claude')).toEqual([
        { scope: 'provider:claude', envText: '' },
      ]);
    });
  });

  describe('getProvidersAffectedByEnvironmentUpdates', () => {
    it('limits the blast radius to providers whose parsed runtime env changes', () => {
      const settings: Record<string, unknown> = {
        sharedEnvironmentVariables: 'HTTP_PROXY=http://proxy:8080',
        providerConfigs: {
          codex: { environmentVariables: 'OPENAI_API_KEY=codex-key' },
          gemini: { environmentVariables: 'GEMINI_API_KEY=old-key' },
        },
      };

      const affected = getProvidersAffectedByEnvironmentUpdates(settings, [
        { scope: 'provider:gemini', envText: 'GEMINI_API_KEY=new-key' },
      ]);

      expect(affected).toEqual(['gemini']);
    });

    it('treats comment-only and whitespace-only edits as affecting no provider', () => {
      const settings: Record<string, unknown> = {
        sharedEnvironmentVariables: 'HTTP_PROXY=http://proxy:8080',
      };

      const affected = getProvidersAffectedByEnvironmentUpdates(settings, [
        { scope: 'shared', envText: '# routed through corp proxy\nHTTP_PROXY=http://proxy:8080' },
      ]);

      expect(affected).toEqual([]);
    });

    it('keeps providers that override a changed shared key unaffected', () => {
      const settings: Record<string, unknown> = {
        sharedEnvironmentVariables: 'CUSTOM_FLAG=0',
        providerConfigs: {
          gemini: { environmentVariables: 'CUSTOM_FLAG=1' },
        },
      };

      const affected = getProvidersAffectedByEnvironmentUpdates(settings, [
        { scope: 'shared', envText: 'CUSTOM_FLAG=2' },
      ]);

      expect(affected).not.toContain('gemini');
      expect(affected).toContain('claude');
      expect(affected).toContain('codex');
    });
  });
});
