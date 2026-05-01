import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type ClaudianPlugin from '../../../main';
import { CopilotAuxQueryRunner } from '../runtime/CopilotAuxQueryRunner';

export class CopilotInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: ClaudianPlugin) { super(new CopilotAuxQueryRunner(plugin)); }
}
