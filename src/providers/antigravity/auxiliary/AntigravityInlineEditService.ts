import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type ClaudianPlugin from '../../../main';
import { AntigravityAuxQueryRunner } from '../runtime/AntigravityAuxQueryRunner';

export class AntigravityInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: ClaudianPlugin) { super(new AntigravityAuxQueryRunner(plugin)); }
}
