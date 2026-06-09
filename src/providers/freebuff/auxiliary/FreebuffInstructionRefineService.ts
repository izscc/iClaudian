import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type ClaudianPlugin from '../../../main';
import { FreebuffAuxQueryRunner } from '../runtime/FreebuffAuxQueryRunner';

export class FreebuffInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: ClaudianPlugin) { super(new FreebuffAuxQueryRunner(plugin)); }
}
