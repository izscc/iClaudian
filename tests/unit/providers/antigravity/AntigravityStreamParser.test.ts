import { foldTaskTodos } from '@/core/tools/todo';
import type { StreamChunk } from '@/core/types';
import { AntigravityStreamParser } from '@/providers/antigravity/runtime/AntigravityStreamParser';

function toolChunks(chunks: StreamChunk[]): Array<Extract<StreamChunk, { type: 'tool_use' }>> {
  return chunks.filter((chunk): chunk is Extract<StreamChunk, { type: 'tool_use' }> => chunk.type === 'tool_use');
}

describe('AntigravityStreamParser', () => {
  it('normalizes streamed response deltas without repeating the terminal response', () => {
    const parser = new AntigravityStreamParser();

    expect(parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: { step_type: 'agent_response', text_delta: 'done' },
    }))).toEqual([{ type: 'text', content: 'done' }]);

    expect(parser.parseLine(JSON.stringify({
      event: 'result',
      result: { response: 'done', status: 'SUCCESS' },
    }))).toEqual([]);
    expect(parser.hasSuccessfulResult).toBe(true);
    expect(parser.hasFailedResult).toBe(false);
  });

  it('normalizes tool_info into a visible Bash call and result', () => {
    const parser = new AntigravityStreamParser();

    const chunks = parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'DONE',
        step_index: 2,
        tool_info: {
          output: 'Sat Aug 1 12:00:00 CST 2026',
          parameters: { CommandLine: 'date' },
          tool_name: 'run_command',
        },
      },
    }));

    expect(chunks).toEqual([
      { id: 'agy-step-2', input: { command: 'date' }, name: 'Bash', type: 'tool_use' },
      { content: 'Sat Aug 1 12:00:00 CST 2026', id: 'agy-step-2', isError: false, type: 'tool_result' },
    ]);
  });

  it('keeps an anonymous tool result attached to its active tool call', () => {
    const parser = new AntigravityStreamParser();
    const started = parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'ACTIVE',
        tool_info: { name: 'run_command', parameters: { CommandLine: 'date' } },
      },
    }));
    const completed = parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'DONE',
        tool_info: { name: 'run_command', output: 'today' },
      },
    }));

    expect(started[0]).toEqual({ id: 'agy-tool-1', input: { command: 'date' }, name: 'Bash', type: 'tool_use' });
    expect(completed).toEqual([{ content: 'today', id: 'agy-tool-1', isError: false, type: 'tool_result' }]);
  });

  it('does not merge concurrent anonymous tools with the same name', () => {
    const parser = new AntigravityStreamParser();
    const first = parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'ACTIVE',
        tool_info: { name: 'run_command', parameters: { CommandLine: 'date' } },
      },
    }));
    const second = parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'ACTIVE',
        tool_info: { name: 'run_command', parameters: { CommandLine: 'pwd' } },
      },
    }));

    expect(first[0]).toEqual({ id: 'agy-tool-1', input: { command: 'date' }, name: 'Bash', type: 'tool_use' });
    expect(second[0]).toEqual({ id: 'agy-tool-2', input: { command: 'pwd' }, name: 'Bash', type: 'tool_use' });
    expect(parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'DONE',
        tool_info: { name: 'run_command', output: 'ambiguous' },
      },
    }))).toEqual([]);
    expect(parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'DONE',
        tool_info: { name: 'run_command', output: 'today', parameters: { CommandLine: 'date' } },
      },
    }))).toEqual([{ content: 'today', id: 'agy-tool-1', isError: false, type: 'tool_result' }]);
    expect(parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'DONE',
        tool_info: { name: 'run_command', output: '/tmp', parameters: { CommandLine: 'pwd' } },
      },
    }))).toEqual([{ content: '/tmp', id: 'agy-tool-2', isError: false, type: 'tool_result' }]);
  });

  it('turns task boundaries into the shared task list tool calls', () => {
    const parser = new AntigravityStreamParser();
    const chunks = [
      ...parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
          step_type: 'task_boundary',
          step_index: 1,
          task_boundary: { task_name: 'Inspect repository', task_status: 'IN_PROGRESS' },
        },
      })),
      ...parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
          step_type: 'task_boundary',
          step_index: 2,
          task_boundary: { task_name: 'Inspect repository', task_status: 'DONE' },
        },
      })),
    ];

    const tasks = toolChunks(chunks);
    expect(tasks.map(task => task.name)).toEqual(['TaskCreate', 'TaskUpdate', 'TaskUpdate']);
    expect(foldTaskTodos(tasks.map(task => ({ name: task.name, input: task.input })))).toEqual([{
      activeForm: 'Inspect repository',
      content: 'Inspect repository',
      status: 'completed',
    }]);
  });

  it('extracts Antigravity task_list.md responses into the shared task list', () => {
    const parser = new AntigravityStreamParser();
    const response = [
      '1. **创建任务**：`Inspect repository`（未开始）',
      '2. **状态更新**：标记为 进行中（In Progress）',
      '3. **状态更新**：标记为 已完成（Completed）',
    ].join('\n');
    const chunks = [
      ...parser.parseLine(JSON.stringify({
        event: 'step_update',
        step_update: {
          step_type: 'tool',
          state: 'DONE',
          tool_info: {
            name: 'write_to_file',
            parameters: { TargetFile: '/tmp/task_list.md' },
          },
        },
      })),
      ...parser.parseLine(JSON.stringify({
        event: 'step_update',
        step_update: { step_type: 'agent_response', text_delta: response.slice(0, 58) },
      })),
      ...parser.parseLine(JSON.stringify({
        event: 'step_update',
        step_update: { step_type: 'agent_response', text_delta: response.slice(58) },
      })),
      ...parser.parseLine(JSON.stringify({
        event: 'result',
        result: { response, status: 'SUCCESS' },
      })),
    ];
    const tasks = toolChunks(chunks).filter(task => task.name === 'TaskCreate' || task.name === 'TaskUpdate');

    expect(tasks.map(task => task.name)).toEqual(['TaskCreate', 'TaskUpdate', 'TaskUpdate']);
    expect(foldTaskTodos(tasks.map(task => ({ name: task.name, input: task.input })))).toEqual([{
      activeForm: 'Inspect repository',
      content: 'Inspect repository',
      status: 'completed',
    }]);
  });

  it('surfaces structured result errors even when the process output is JSON', () => {
    const parser = new AntigravityStreamParser();

    expect(parser.parseLine(JSON.stringify({
      event: 'result',
      result: { error: 'Eligibility check failed', status: 'ERROR' },
    }))).toEqual([{ type: 'error', content: 'Eligibility check failed' }]);
    expect(parser.hasFailedResult).toBe(true);
    expect(parser.hasSuccessfulResult).toBe(false);
  });

  it('ignores text deltas from non-response steps and preserves task offsets', () => {
    const parser = new AntigravityStreamParser({ taskOffset: 2 });

    expect(parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: { step_type: 'internal_reasoning', text_delta: 'hidden' },
    }))).toEqual([]);

    const chunks = parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: { step_type: 'task_boundary', task_boundary: { task_name: 'Continue work', task_status: 'IN_PROGRESS' } },
    }));
    const tasks = toolChunks(chunks);
    expect(tasks[0]).toEqual({ id: 'agy-task-3', input: { activeForm: 'Continue work', subject: 'Continue work' }, name: 'TaskCreate', type: 'tool_use' });
    expect(tasks[1]).toEqual({
      id: 'agy-task-update-3-1',
      input: { activeForm: 'Continue work', status: 'in_progress', subject: 'Continue work', taskId: '3' },
      name: 'TaskUpdate',
      type: 'tool_use',
    });
  });

  it('does not mark a task completed from a negative status phrase', () => {
    const parser = new AntigravityStreamParser();
    parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        state: 'DONE',
        tool_info: { name: 'write_to_file', parameters: { TargetFile: '/tmp/task_list.md' } },
      },
    }));

    expect(parser.parseLine(JSON.stringify({
      event: 'step_update',
      step_type: 'agent_response',
      step_update: { step_type: 'agent_response', text_delta: '1. **Inspect** - Not completed' },
    }))).toEqual([{ content: '1. **Inspect** - Not completed', type: 'text' }]);
  });

  it('ignores non-JSON and informational events', () => {
    const parser = new AntigravityStreamParser();

    expect(parser.parseLine('not-json')).toEqual([]);
    expect(parser.parseLine(JSON.stringify({
      event: 'init',
      init: { tools: ['run_command'] },
    }))).toEqual([]);
  });
});
