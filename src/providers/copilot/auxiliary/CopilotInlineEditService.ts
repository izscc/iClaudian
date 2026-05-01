import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type ClaudianPlugin from '../../../main';
import { CopilotAuxQueryRunner } from '../runtime/CopilotAuxQueryRunner';

export class CopilotInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: ClaudianPlugin) { super(new CopilotAuxQueryRunner(plugin)); }
}
