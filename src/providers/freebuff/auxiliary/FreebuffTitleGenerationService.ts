import { QueryBackedTitleGenerationService } from '../../../core/auxiliary/QueryBackedTitleGenerationService';
import type ClaudianPlugin from '../../../main';
import { FreebuffAuxQueryRunner } from '../runtime/FreebuffAuxQueryRunner';
import { freebuffChatUIConfig } from '../ui/FreebuffChatUIConfig';

export class FreebuffTitleGenerationService extends QueryBackedTitleGenerationService {
  constructor(plugin: ClaudianPlugin) {
    super({
      createRunner: () => new FreebuffAuxQueryRunner(plugin),
      resolveModel: () => {
        const settings = plugin.settings as unknown as Record<string, unknown>;
        const titleModel = typeof settings.titleGenerationModel === 'string' ? settings.titleGenerationModel : '';
        return freebuffChatUIConfig.ownsModel(titleModel, settings) ? titleModel : undefined;
      },
    });
  }
}
