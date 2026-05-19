import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type ClaudianPlugin from '../../../main';
import { AntigravityAuxQueryRunner } from '../runtime/AntigravityAuxQueryRunner';

export class AntigravityInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: ClaudianPlugin) { super(new AntigravityAuxQueryRunner(plugin)); }
}
