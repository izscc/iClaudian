import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type ClaudianPlugin from '../../../main';
import { FreebuffAuxQueryRunner } from '../runtime/FreebuffAuxQueryRunner';

export class FreebuffInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: ClaudianPlugin) { super(new FreebuffAuxQueryRunner(plugin)); }
}
