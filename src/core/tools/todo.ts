/**
 * Todo tool helpers.
 *
 * Parses TodoWrite tool input into typed todo items, and folds the newer
 * Task* tool calls (TaskCreate/TaskUpdate, CLI 2.1.x / SDK 0.3) into the same
 * snapshot model so the todo panel keeps working after the SDK upgrade.
 */

import {
  isTaskTodoTool,
  TOOL_TASK_CREATE,
  TOOL_TASK_UPDATE,
  TOOL_TODO_WRITE,
} from './toolNames';

export interface TodoItem {
  /** Imperative description (e.g., "Run tests") */
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  /** Present continuous form (e.g., "Running tests") */
  activeForm: string;
}

interface ToolCallLike {
  name: string;
  input: Record<string, unknown>;
}

function isValidTodoItem(item: unknown): item is TodoItem {
  if (typeof item !== 'object' || item === null) return false;
  const record = item as Record<string, unknown>;
  return (
    typeof record.content === 'string' &&
    record.content.length > 0 &&
    typeof record.activeForm === 'string' &&
    record.activeForm.length > 0 &&
    typeof record.status === 'string' &&
    ['pending', 'in_progress', 'completed'].includes(record.status)
  );
}

export function parseTodoInput(input: Record<string, unknown>): TodoItem[] | null {
  if (!input.todos || !Array.isArray(input.todos)) {
    return null;
  }

  const validTodos: TodoItem[] = [];
  for (const item of input.todos) {
    if (isValidTodoItem(item)) {
      validTodos.push(item);
    }
  }

  return validTodos.length > 0 ? validTodos : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Fold an ordered list of Task* tool calls into a todo snapshot.
 *
 * TaskCreate appends a task whose id is its 1-based creation order (matching the
 * CLI's `Task #N`); TaskUpdate(taskId) mutates status/text; status 'deleted'
 * drops the task. Returns null when no Task* tool call is present.
 */
export function foldTaskTodos(toolCalls: ToolCallLike[]): TodoItem[] | null {
  const order: string[] = [];
  const tasks = new Map<string, TodoItem>();
  let createCount = 0;
  let sawTaskTool = false;

  for (const call of toolCalls) {
    if (call.name === TOOL_TASK_CREATE) {
      sawTaskTool = true;
      createCount += 1;
      const id = String(createCount);
      const content = readString(call.input.subject) ?? readString(call.input.description) ?? '';
      const activeForm = readString(call.input.activeForm) ?? content;
      order.push(id);
      tasks.set(id, { content, activeForm, status: 'pending' });
    } else if (call.name === TOOL_TASK_UPDATE) {
      sawTaskTool = true;
      const id = readString(call.input.taskId);
      if (id === null) continue;
      const existing = tasks.get(id);
      if (!existing) continue;

      const status = call.input.status;
      if (status === 'deleted') {
        tasks.delete(id);
        const idx = order.indexOf(id);
        if (idx >= 0) order.splice(idx, 1);
        continue;
      }

      const next: TodoItem = { ...existing };
      const subject = readString(call.input.subject);
      if (subject !== null) next.content = subject;
      const activeForm = readString(call.input.activeForm);
      if (activeForm !== null) next.activeForm = activeForm;
      if (status === 'pending' || status === 'in_progress' || status === 'completed') {
        next.status = status;
      }
      tasks.set(id, next);
    }
  }

  if (!sawTaskTool) return null;
  const todos = order
    .map(id => tasks.get(id))
    .filter((todo): todo is TodoItem => todo !== undefined);
  return todos.length > 0 ? todos : null;
}

/**
 * Build the current todo snapshot from a conversation's messages.
 *
 * Prefers Task* tool calls (current CLI) and falls back to the last TodoWrite
 * tool call (older sessions, Codex/OpenCode plan normalization).
 */
export function extractLastTodosFromMessages(
  messages: Array<{ role: string; toolCalls?: Array<{ name: string; input: Record<string, unknown> }> }>
): TodoItem[] | null {
  const taskCalls: ToolCallLike[] = [];
  let hasTaskTool = false;
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.toolCalls) continue;
    for (const toolCall of msg.toolCalls) {
      if (isTaskTodoTool(toolCall.name)) {
        hasTaskTool = true;
        taskCalls.push(toolCall);
      }
    }
  }
  if (hasTaskTool) {
    return foldTaskTodos(taskCalls);
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
        const toolCall = msg.toolCalls[j];
        if (toolCall.name === TOOL_TODO_WRITE) {
          const todos = parseTodoInput(toolCall.input);
          return todos;
        }
      }
    }
  }
  return null;
}
