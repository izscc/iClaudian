import type { StreamChunk } from '../../../core/types';

type JsonObject = Record<string, unknown>;

interface ToolState {
  input: Record<string, unknown>;
  name: string;
  output: string;
  resultEmitted: boolean;
}

interface TaskState {
  activeForm: string;
  id: string;
  status: 'pending' | 'in_progress' | 'completed';
  subject: string;
}

interface AntigravityStreamParserOptions {
  taskOffset?: number;
}

const TOOL_NAME_ALIASES: Record<string, string> = {
  execute_command: 'Bash',
  multi_replace_file_content: 'Edit',
  file_search: 'Grep',
  grep_search: 'Grep',
  list_directory: 'LS',
  list_dir: 'LS',
  read_file: 'Read',
  replace_file_content: 'Edit',
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
  private nextToolId = 0;
  private nextTaskId: number;
  private nextTaskUpdateId = 0;
  private resultErrorEmitted = false;
  private responseText = '';
  private successfulResult = false;
  private failedResult = false;
  private taskListMode = false;
  private taskListTextBuffer = '';
  private lastTaskSubject: string | null = null;

  constructor(options: AntigravityStreamParserOptions = {}) {
    this.nextTaskId = options.taskOffset ?? 0;
  }

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
    const textDelta = normalizeStatus(readString(step.step_type) ?? '') === 'agent_response'
      ? readString(step.text_delta)
      : null;
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
    const id = explicitId
      ?? (stepIndex ? `agy-step-${stepIndex}` : this.findOpenToolId(name) ?? `agy-tool-${++this.nextToolId}`);
    const status = readFirstString(toolInfo, ['status', 'state'])
      ?? readFirstString(step, ['status', 'state']);
    const terminal = isTerminalStatus(status);
    const output = readString(readFirstValue(toolInfo, ['output', 'result', 'content'])
      ?? readFirstValue(step, ['output', 'result', 'content'])) ?? '';
    const chunks: StreamChunk[] = [];
    let state = this.tools.get(id);

    if (!state) {
      state = { input: {}, name, output: '', resultEmitted: false };
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
      const taskId = `agy-task-${task.id}`;
      chunks.push({
        id: taskId,
        input: { activeForm, subject },
        name: 'TaskCreate',
        type: 'tool_use',
      });
      chunks.push({ content: 'Task created', id: taskId, isError: false, type: 'tool_result' });
    }

    const nextStatus = status ?? task.status;
    const changed = task.subject !== subject || task.activeForm !== activeForm || task.status !== nextStatus;
    if (changed) {
      task.subject = subject;
      task.activeForm = activeForm;
      task.status = nextStatus;
      const taskUpdateId = `agy-task-update-${task.id}-${++this.nextTaskUpdateId}`;
      chunks.push({
        id: taskUpdateId,
        input: {
          activeForm,
          status: nextStatus,
          subject,
          taskId: task.id,
        },
        name: 'TaskUpdate',
        type: 'tool_use',
      });
      chunks.push({ content: 'Task updated', id: taskUpdateId, isError: false, type: 'tool_result' });
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
      if (!this.taskListMode) continue;

      const codeSubjects = [...line.matchAll(/`([^`\n]+)`/gu)]
        .map(match => match[1]?.trim())
        .filter((value): value is string => Boolean(value))
        .filter(value => !/^\[\s*(?:x|\/)?\s*\]$/i.test(value) && !/task_list\.md$/i.test(value));
      const codeSubject = codeSubjects[codeSubjects.length - 1];
      if (codeSubject) {
        this.lastTaskSubject = codeSubject;
        const codeStatus = parseTaskListStatus(line);
        if (codeStatus) {
          chunks.push(...this.parseTaskBoundary({ task_name: codeSubject, task_status: codeStatus }));
        }
        continue;
      }

      const match = /^\s*(\d+)\.\s+.*?\*\*(.+?)\*\*\s*(?:[-–—:]\s*)?(.+)$/u.exec(line);
      if (!match) continue;
      const status = parseTaskListStatus(match[3]);
      if (!status) continue;
      const label = match[2].trim();
      const subject = isTaskActionLabel(label) ? this.lastTaskSubject : label;
      if (!subject) continue;
      if (!isTaskActionLabel(label)) this.lastTaskSubject = subject;
      chunks.push(...this.parseTaskBoundary({
        task_name: subject,
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

  private findOpenToolId(name: string): string | null {
    const entries = [...this.tools.entries()].reverse();
    return entries.find(([, state]) => state.name === name && !state.resultEmitted)?.[0] ?? null;
  }
}

function asObject(value: unknown): JsonObject | null {
  return isPlainObject(value) ? value : null;
}

function defaultToolResult(status: string | null): string {
  return isErrorStatus(status) ? 'Tool failed' : 'Tool completed';
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
  let raw: Record<string, unknown>;
  if (isPlainObject(rawInput)) {
    raw = { ...rawInput };
  } else if (typeof rawInput === 'string') {
    const parsed = parseJson(rawInput);
    raw = isPlainObject(parsed) ? { ...parsed } : {};
  } else {
    raw = {};
  }

  switch (toolName) {
    case 'Bash': {
      const command = readFirstString(raw, ['command', 'CommandLine', 'cmd', 'command_line', 'script']);
      return command ? { command } : {};
    }
    case 'Edit':
    case 'Read':
    case 'Write': {
      const filePath = readFirstString(raw, ['file_path', 'TargetFile', 'target_file', 'path', 'file']);
      return filePath ? { file_path: filePath } : {};
    }
    case 'Glob':
    case 'Grep': {
      const pattern = readFirstString(raw, ['pattern', 'query', 'regex']);
      return pattern ? { pattern } : {};
    }
    case 'LS': {
      const directory = readFirstString(raw, ['path', 'directory', 'dir']);
      return directory ? { path: directory } : {};
    }
    default:
      return {};
  }
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
  if (/\[x\]/i.test(summary)) return 'DONE';
  if (/\[\/\]/.test(summary)) return 'IN_PROGRESS';
  if (/\[\s\]/.test(summary)) return 'TODO';
  if (normalized.includes('进行中') || normalized.includes('🔄') || /\bin[\s-]+progress\b/i.test(normalized)) {
    return 'IN_PROGRESS';
  }
  if (normalized.includes('未完成') || /\bnot[\s-]+completed?\b/i.test(normalized)) return null;
  if (normalized.includes('已完成') || normalized.includes('✅') || /\bcompleted?\b/i.test(normalized)) {
    return 'DONE';
  }
  if (normalized.includes('待处理') || normalized.includes('创建') || normalized.includes('🟡') || /\b(?:pending|todo)\b/i.test(normalized)) {
    return 'TODO';
  }
  return null;
}

function isTaskActionLabel(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.includes('创建任务')
    || normalized.includes('更新状态')
    || normalized.includes('完成任务')
    || normalized.includes('create task')
    || normalized.includes('update status')
    || normalized.includes('complete task');
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
