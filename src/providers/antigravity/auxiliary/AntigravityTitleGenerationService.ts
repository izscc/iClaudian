import { QueryBackedTitleGenerationService } from '../../../core/auxiliary/QueryBackedTitleGenerationService';
import type ClaudianPlugin from '../../../main';
import { AntigravityAuxQueryRunner } from '../runtime/AntigravityAuxQueryRunner';
import { antigravityChatUIConfig } from '../ui/AntigravityChatUIConfig';

export class AntigravityTitleGenerationService extends QueryBackedTitleGenerationService {
  constructor(plugin: ClaudianPlugin) {
    super({
      createRunner: () => new AntigravityAuxQueryRunner(plugin),
      resolveModel: () => {
        const settings = plugin.settings as unknown as Record<string, unknown>;
        const titleModel = typeof settings.titleGenerationModel === 'string' ? settings.titleGenerationModel : '';
        return antigravityChatUIConfig.ownsModel(titleModel, settings) ? titleModel : undefined;
      },
    });
  }
}
