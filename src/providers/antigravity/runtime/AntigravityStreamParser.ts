import type { StreamChunk } from '../../../core/types';

type JsonObject = Record<string, unknown>;

interface ToolState {
  input: Record<string, unknown>;
  output: string;
  resultEmitted: boolean;
}

interface TaskState {
  activeForm: string;
  id: string;
  status: 'pending' | 'in_progress' | 'completed';
  subject: string;
}

const TOOL_NAME_ALIASES: Record<string, string> = {
  execute_command: 'Bash',
  file_search: 'Grep',
  grep_search: 'Grep',
  list_directory: 'LS',
  list_dir: 'LS',
  read_file: 'Read',
  run_command: 'Bash',
  shell_exec: 'Bash',
  task_create: 'TaskCreate',
  task_update: 'TaskUpdate',
  view_file: 'Read',
  write_to_file: 'Write',
};

export class AntigravityStreamParser {
  private readonly tasks = new Map<string, TaskState>();
  private readonly tools = new Map<string, ToolState>();
  private nextTaskId = 0;
  private nextTaskUpdateId = 0;
  private resultErrorEmitted = false;
  private responseText = '';
  private successfulResult = false;
  private failedResult = false;
  private taskListMode = false;
  private taskListTextBuffer = '';

  get hasFailedResult(): boolean {
    return this.failedResult;
  }

  get hasSuccessfulResult(): boolean {
    return this.successfulResult;
  }

  parseLine(line: string): StreamChunk[] {
    const parsed = parseJson(line);
    if (!isPlainObject(parsed)) return [];

    const chunks: StreamChunk[] = [];
    const stepUpdate = asObject(parsed.step_update);
    if (stepUpdate) chunks.push(...this.parseStepUpdate(stepUpdate));

    const result = asObject(parsed.result);
    if (result) chunks.push(...this.parseResult(result));

    return chunks;
  }

  private parseStepUpdate(step: JsonObject): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    const textDelta = readString(step.text_delta);
    if (textDelta) {
      this.responseText += textDelta;
      chunks.push({ content: textDelta, type: 'text' });
      chunks.push(...this.parseTaskListText(textDelta));
    }

    const toolInfo = asObject(step.tool_info) ?? this.readDirectToolInfo(step);
    if (toolInfo) chunks.push(...this.parseToolInfo(toolInfo, step));

    const taskBoundary = asObject(step.task_boundary)
      ?? asObject(step.taskBoundary)
      ?? (hasTaskBoundaryFields(step) ? step : null);
    if (taskBoundary) chunks.push(...this.parseTaskBoundary(taskBoundary));

    return chunks;
  }

  private parseToolInfo(toolInfo: JsonObject, step: JsonObject): StreamChunk[] {
    const rawName = readFirstString(toolInfo, ['tool_name', 'name', 'title'])
      ?? readFirstString(step, ['tool_name', 'name', 'title']);
    const name = normalizeToolName(rawName);
    const input = normalizeToolInput(
      readFirstValue(toolInfo, ['parameters', 'input', 'arguments', 'args'])
        ?? readFirstValue(step, ['parameters', 'input', 'arguments', 'args']),
      name,
    );
    if (name === 'Write' && isTaskListPath(input.file_path)) this.taskListMode = true;
    const explicitId = readFirstIdentifier(toolInfo, ['tool_call_id', 'tool_id', 'id'])
      ?? readFirstIdentifier(step, ['tool_call_id', 'tool_id', 'id']);
    const stepIndex = readFirstIdentifier(step, ['step_index']);
    const id = explicitId ?? (stepIndex ? `agy-step-${stepIndex}` : `agy-tool-${this.tools.size + 1}`);
    const status = readFirstString(toolInfo, ['status', 'state'])
      ?? readFirstString(step, ['status', 'state']);
    const terminal = isTerminalStatus(status);
    const output = formatUnknownValue(readFirstValue(toolInfo, ['output', 'result', 'content'])
      ?? readFirstValue(step, ['output', 'result', 'content']));
    const chunks: StreamChunk[] = [];
    let state = this.tools.get(id);

    if (!state) {
      state = { input: {}, output: '', resultEmitted: false };
      this.tools.set(id, state);
      state.input = input;
      chunks.push({ id, input, name, type: 'tool_use' });
    } else if (!sameRecord(state.input, input) && Object.keys(input).length > 0) {
      state.input = { ...state.input, ...input };
      chunks.push({ id, input, name, type: 'tool_use' });
    }

    if (output && output !== state.output) {
      if (!terminal) {
        const delta = output.startsWith(state.output) ? output.slice(state.output.length) : output;
        if (delta) chunks.push({ content: delta, id, type: 'tool_output' });
      }
      state.output = output;
    }

    if (terminal && !state.resultEmitted) {
      chunks.push({
        content: state.output || defaultToolResult(status),
        id,
        isError: isErrorStatus(status),
        type: 'tool_result',
      });
      state.resultEmitted = true;
    }

    return chunks;
  }

  private parseTaskBoundary(boundary: JsonObject): StreamChunk[] {
    const subject = readFirstString(boundary, [
      'task_name',
      'task_summary',
      'task_summary_with_citations',
      'delta_summary',
      'delta_summary_with_citations',
      'subject',
      'description',
    ]);
    if (!subject) return [];

    const activeForm = readFirstString(boundary, ['active_form', 'activeForm']) ?? subject;
    const key = readFirstIdentifier(boundary, ['task_id', 'id']) ?? subject;
    const status = normalizeTaskStatus(readFirstString(boundary, ['task_status', 'status', 'state']));
    const chunks: StreamChunk[] = [];
    let task = this.tasks.get(key);

    if (!task) {
      task = {
        activeForm,
        id: String(++this.nextTaskId),
        status: 'pending',
        subject,
      };
      this.tasks.set(key, task);
      chunks.push({
        id: `agy-task-${task.id}`,
        input: { activeForm, subject },
        name: 'TaskCreate',
        type: 'tool_use',
      });
    }

    const nextStatus = status ?? task.status;
    const changed = task.subject !== subject || task.activeForm !== activeForm || task.status !== nextStatus;
    if (changed) {
      task.subject = subject;
      task.activeForm = activeForm;
      task.status = nextStatus;
      chunks.push({
        id: `agy-task-update-${task.id}-${++this.nextTaskUpdateId}`,
        input: {
          activeForm,
          status: nextStatus,
          subject,
          taskId: task.id,
        },
        name: 'TaskUpdate',
        type: 'tool_use',
      });
    }

    return chunks;
  }

  private parseTaskListText(text: string, flush = false): StreamChunk[] {
    this.taskListTextBuffer += text;
    const lines: string[] = [];
    let newlineIndex = this.taskListTextBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      lines.push(this.taskListTextBuffer.slice(0, newlineIndex));
      this.taskListTextBuffer = this.taskListTextBuffer.slice(newlineIndex + 1);
      newlineIndex = this.taskListTextBuffer.indexOf('\n');
    }
    if (flush && this.taskListTextBuffer) {
      lines.push(this.taskListTextBuffer);
      this.taskListTextBuffer = '';
    }

    const chunks: StreamChunk[] = [];
    for (const line of lines) {
      if (/^\s*(?:#{1,6}\s*)?(?:任务列表|task list)\b/i.test(line)) {
        this.taskListMode = true;
      }
      if (!this.taskListMode) continue;

      const match = /^\s*(\d+)\.\s+.*?\*\*(.+?)\*\*\s*(?:[-–—:]\s*)?(.+)$/u.exec(line);
      if (!match) continue;
      const status = parseTaskListStatus(match[3]);
      if (!status) continue;
      chunks.push(...this.parseTaskBoundary({
        task_name: match[2].trim(),
        task_status: status,
      }));
    }
    return chunks;
  }

  private parseResult(result: JsonObject): StreamChunk[] {
    const status = readString(result.status)?.toLowerCase();
    const response = readString(result.response) ?? '';
    if (status === 'success' || status === 'succeeded' || status === 'completed') {
      this.successfulResult = true;
      if (!response || response === this.responseText) return this.parseTaskListText('', true);
      if (response.startsWith(this.responseText)) {
        const suffix = response.slice(this.responseText.length);
        this.responseText = response;
        const chunks: StreamChunk[] = suffix ? [{ content: suffix, type: 'text' }] : [];
        chunks.push(...this.parseTaskListText(suffix, true));
        return chunks;
      }
      if (this.responseText.includes(response)) return this.parseTaskListText('', true);
      this.responseText += response;
      return [
        { content: response, type: 'text' },
        ...this.parseTaskListText(response, true),
      ];
    }

    this.failedResult = true;
    if (this.resultErrorEmitted) return [];
    this.resultErrorEmitted = true;
    const error = readString(result.error) || response || `Antigravity CLI returned status ${result.status ?? 'ERROR'}.`;
    return [{ content: error, type: 'error' }];
  }

  private readDirectToolInfo(step: JsonObject): JsonObject | null {
    const hasToolName = readFirstString(step, ['tool_name', 'name', 'title']) !== null;
    const hasToolInput = ['parameters', 'input', 'arguments', 'args', 'output', 'result', 'content']
      .some(key => step[key] !== undefined);
    return hasToolName && hasToolInput ? step : null;
  }
}

function asObject(value: unknown): JsonObject | null {
  return isPlainObject(value) ? value : null;
}

function defaultToolResult(status: string | null): string {
  return isErrorStatus(status) ? 'Tool failed' : 'Tool completed';
}

function formatUnknownValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hasTaskBoundaryFields(value: JsonObject): boolean {
  return ['task_name', 'task_status', 'task_summary', 'task_summary_with_citations', 'delta_summary']
    .some(key => value[key] !== undefined);
}

function isErrorStatus(status: string | null): boolean {
  if (!status) return false;
  return ['blocked', 'cancelled', 'canceled', 'error', 'failed'].includes(normalizeStatus(status));
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTerminalStatus(status: string | null): boolean {
  if (!status) return false;
  return ['blocked', 'cancelled', 'canceled', 'completed', 'done', 'error', 'failed', 'success', 'succeeded']
    .includes(normalizeStatus(status));
}

function normalizeStatus(status: string): string {
  return status.toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeTaskStatus(status: string | null): TaskState['status'] | null {
  if (!status) return null;
  switch (normalizeStatus(status).replace(/^task_status_/, '')) {
    case 'completed':
    case 'done':
      return 'completed';
    case 'in_progress':
    case 'running':
      return 'in_progress';
    case 'pending':
    case 'todo':
      return 'pending';
    default:
      return null;
  }
}

function normalizeToolInput(rawInput: unknown, toolName: string): Record<string, unknown> {
  let input: Record<string, unknown>;
  if (isPlainObject(rawInput)) {
    input = { ...rawInput };
  } else if (typeof rawInput === 'string') {
    const parsed = parseJson(rawInput);
    input = isPlainObject(parsed) ? { ...parsed } : { value: rawInput };
  } else if (rawInput === undefined) {
    input = {};
  } else {
    input = { value: rawInput };
  }

  if (toolName === 'Bash' && input.command === undefined) {
    const command = readFirstString(input, ['CommandLine', 'cmd', 'command_line', 'script']);
    if (command) {
      input.command = command;
      delete input.CommandLine;
    }
  }
    if (toolName === 'Read' && input.file_path === undefined) {
    const filePath = readFirstString(input, ['path', 'file']);
      if (filePath) input.file_path = filePath;
    }
    if (toolName === 'Write' && input.file_path === undefined) {
      const filePath = readFirstString(input, ['TargetFile', 'target_file', 'path', 'file']);
      if (filePath) {
        input.file_path = filePath;
        delete input.TargetFile;
      }
    }
  if ((toolName === 'Grep' || toolName === 'Glob') && input.pattern === undefined) {
    const pattern = readFirstString(input, ['query', 'regex']);
    if (pattern) input.pattern = pattern;
  }
  if (toolName === 'LS' && input.path === undefined) {
    const directory = readFirstString(input, ['directory', 'dir']);
    if (directory) input.path = directory;
  }
  return input;
}

function normalizeToolName(rawName: string | null): string {
  if (!rawName) return 'tool';
  const normalized = rawName.trim();
  return TOOL_NAME_ALIASES[normalizeStatus(normalized)] ?? normalized;
}

function isTaskListPath(value: unknown): value is string {
  return typeof value === 'string' && /(?:^|[/\\])task_list\.md$/i.test(value);
}

function parseTaskListStatus(summary: string): 'DONE' | 'IN_PROGRESS' | 'TODO' | null {
  const normalized = summary.toLowerCase();
  if (normalized.includes('in progress') || normalized.includes('进行中') || normalized.includes('🔄')) {
    return 'IN_PROGRESS';
  }
  if (normalized.includes('completed') || normalized.includes('complete') || normalized.includes('已完成') || normalized.includes('✅')) {
    return 'DONE';
  }
  if (normalized.includes('pending') || normalized.includes('todo') || normalized.includes('创建') || normalized.includes('🟡')) {
    return 'TODO';
  }
  return null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readFirstIdentifier(record: JsonObject, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readFirstString(record: JsonObject, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return null;
}

function readFirstValue(record: JsonObject, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sameRecord(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
