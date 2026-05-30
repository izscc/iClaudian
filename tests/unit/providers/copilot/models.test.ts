import {
  COPILOT_FALLBACK_MODELS,
  decodeCopilotModelId,
  encodeCopilotModelId,
} from '@/providers/copilot/models';

describe('Copilot model IDs', () => {
  it('preloads the current Copilot CLI model catalog', () => {
    expect(COPILOT_FALLBACK_MODELS.map(model => model.rawId)).toEqual([
      'claude-sonnet-4.6',
      'claude-sonnet-4.5',
      'claude-haiku-4.5',
      'claude-opus-4.8',
      'claude-opus-4.7',
      'claude-opus-4.6',
      'claude-opus-4.6-fast',
      'claude-opus-4.5',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.3-codex',
      'gpt-5.2-codex',
      'gpt-5.2',
      'gpt-5.4-mini',
      'gpt-5-mini',
      'gpt-4.1',
    ]);
  });

  it('normalizes stale Copilot IDs that make the CLI exit early', () => {
    expect(encodeCopilotModelId('gpt-5.1')).toBe('copilot:gpt-5.4');
    expect(decodeCopilotModelId('copilot:claude-sonnet-4')).toBe('claude-sonnet-4.6');
  });
});
