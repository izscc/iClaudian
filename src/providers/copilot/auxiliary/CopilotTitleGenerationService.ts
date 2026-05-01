import { QueryBackedTitleGenerationService } from '../../../core/auxiliary/QueryBackedTitleGenerationService';
import type ClaudianPlugin from '../../../main';
import { CopilotAuxQueryRunner } from '../runtime/CopilotAuxQueryRunner';
import { copilotChatUIConfig } from '../ui/CopilotChatUIConfig';

export class CopilotTitleGenerationService extends QueryBackedTitleGenerationService {
  constructor(plugin: ClaudianPlugin) {
    super({
      createRunner: () => new CopilotAuxQueryRunner(plugin),
      resolveModel: () => {
        const settings = plugin.settings as unknown as Record<string, unknown>;
        const titleModel = typeof settings.titleGenerationModel === 'string' ? settings.titleGenerationModel : '';
        return copilotChatUIConfig.ownsModel(titleModel, settings) ? titleModel : undefined;
      },
    });
  }
}
