import {
  findCodexModel,
  getCodexFastServiceTier,
  getCodexModelsInPickerOrder,
  getDefaultCodexModel,
  normalizeCodexDiscoveredModels,
} from '@/providers/codex/models';

const RAW_MODELS = [
  {
    id: 'gpt-5.6-sol',
    model: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    description: 'Frontier model',
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'Fast' },
      { reasoningEffort: 'max', description: 'Deep' },
      { reasoningEffort: 'ultra', description: 'Delegated' },
    ],
    defaultReasoningEffort: 'max',
    serviceTiers: [{ id: 'priority', name: 'Fast', description: 'Faster' }],
    defaultServiceTier: null,
    inputModalities: ['text', 'image'],
    isDefault: true,
  },
  {
    id: 'gpt-5.6-luna',
    model: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    description: 'Balanced model',
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'medium', description: 'Balanced' },
    ],
    defaultReasoningEffort: 'medium',
    inputModalities: ['text'],
    isDefault: false,
  },
];

describe('Codex discovered models', () => {
  it('normalizes every reasoning effort advertised by app-server', () => {
    const models = normalizeCodexDiscoveredModels(RAW_MODELS);

    expect(models).toHaveLength(2);
    expect(models[0]).toEqual(expect.objectContaining({
      model: 'gpt-5.6-sol',
      defaultReasoningEffort: 'max',
      supportedReasoningEfforts: [
        { value: 'low', description: 'Fast' },
        { value: 'max', description: 'Deep' },
        { value: 'ultra', description: 'Delegated' },
      ],
      serviceTiers: [{ id: 'priority', name: 'Fast', description: 'Faster' }],
      defaultServiceTier: null,
    }));
  });

  it('drops malformed, hidden, duplicate, and invalid-default entries', () => {
    const models = normalizeCodexDiscoveredModels([
      ...RAW_MODELS,
      { ...RAW_MODELS[0], model: 'hidden', hidden: true },
      { ...RAW_MODELS[0], displayName: 'Duplicate' },
      { model: '' },
      {
        ...RAW_MODELS[0],
        model: 'gpt-invalid',
        defaultReasoningEffort: 'unsupported',
      },
    ]);

    expect(models.map(model => model.model)).toEqual(['gpt-5.6-sol', 'gpt-5.6-luna']);
  });

  it('finds the app-server default and a model by id', () => {
    const models = normalizeCodexDiscoveredModels(RAW_MODELS);

    expect(getDefaultCodexModel(models)?.model).toBe('gpt-5.6-sol');
    expect(findCodexModel(models, 'gpt-5.6-luna')?.displayName).toBe('GPT-5.6 Luna');
    expect(getCodexFastServiceTier(models[0])?.id).toBe('priority');
    expect(getCodexModelsInPickerOrder(models).map(model => model.model))
      .toEqual(['gpt-5.6-luna', 'gpt-5.6-sol']);
  });
});
