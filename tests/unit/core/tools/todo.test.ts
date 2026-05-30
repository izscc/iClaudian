import { extractLastTodosFromMessages, foldTaskTodos, parseTodoInput } from '@/core/tools/todo';
import { TOOL_TASK_CREATE, TOOL_TASK_UPDATE, TOOL_TODO_WRITE } from '@/core/tools/toolNames';

describe('parseTodoInput', () => {
  it('should parse valid todo items', () => {
    const input = {
      todos: [
        { content: 'Run tests', status: 'pending', activeForm: 'Running tests' },
        { content: 'Fix bug', status: 'in_progress', activeForm: 'Fixing bug' },
        { content: 'Deploy', status: 'completed', activeForm: 'Deploying' },
      ],
    };

    const result = parseTodoInput(input);

    expect(result).toHaveLength(3);
    expect(result![0]).toEqual({ content: 'Run tests', status: 'pending', activeForm: 'Running tests' });
    expect(result![1].status).toBe('in_progress');
    expect(result![2].status).toBe('completed');
  });

  it('should return null when todos key is missing', () => {
    expect(parseTodoInput({})).toBeNull();
  });

  it('should return null when todos is not an array', () => {
    expect(parseTodoInput({ todos: 'not an array' })).toBeNull();
    expect(parseTodoInput({ todos: 42 })).toBeNull();
    expect(parseTodoInput({ todos: null })).toBeNull();
  });

  it('should filter out invalid items', () => {
    const input = {
      todos: [
        { content: 'Valid', status: 'pending', activeForm: 'Working' },
        { content: '', status: 'pending', activeForm: 'Working' }, // empty content
        { content: 'No status', activeForm: 'Working' }, // missing status
        { content: 'Bad status', status: 'unknown', activeForm: 'Working' }, // invalid status
        null,
        42,
        'string',
      ],
    };

    const result = parseTodoInput(input);

    expect(result).toHaveLength(1);
    expect(result![0].content).toBe('Valid');
  });

  it('should return null when all items are invalid', () => {
    const input = {
      todos: [
        { content: '', status: 'pending', activeForm: 'Working' },
        null,
        { status: 'pending' }, // missing content and activeForm
      ],
    };

    expect(parseTodoInput(input)).toBeNull();
  });

  it('should return null for empty todos array', () => {
    expect(parseTodoInput({ todos: [] })).toBeNull();
  });

  it('should reject items with missing activeForm', () => {
    const input = {
      todos: [
        { content: 'Task', status: 'pending' }, // no activeForm
      ],
    };

    expect(parseTodoInput(input)).toBeNull();
  });

  it('should reject items with empty activeForm', () => {
    const input = {
      todos: [
        { content: 'Task', status: 'pending', activeForm: '' },
      ],
    };

    expect(parseTodoInput(input)).toBeNull();
  });

  it('should reject non-object items', () => {
    const input = {
      todos: [undefined, false, 0],
    };

    expect(parseTodoInput(input)).toBeNull();
  });
});

describe('extractLastTodosFromMessages', () => {
  it('should extract todos from the last TodoWrite tool call', () => {
    const messages = [
      {
        role: 'user',
        content: 'Do something',
      },
      {
        role: 'assistant',
        toolCalls: [
          {
            name: TOOL_TODO_WRITE,
            input: {
              todos: [
                { content: 'First', status: 'completed' as const, activeForm: 'First-ing' },
              ],
            },
          },
        ],
      },
      {
        role: 'assistant',
        toolCalls: [
          {
            name: TOOL_TODO_WRITE,
            input: {
              todos: [
                { content: 'Second', status: 'pending' as const, activeForm: 'Second-ing' },
              ],
            },
          },
        ],
      },
    ];

    const result = extractLastTodosFromMessages(messages);

    expect(result).toHaveLength(1);
    expect(result![0].content).toBe('Second');
  });

  it('should return null when no messages exist', () => {
    expect(extractLastTodosFromMessages([])).toBeNull();
  });

  it('should return null when no assistant messages have tool calls', () => {
    const messages = [
      { role: 'user' },
      { role: 'assistant' },
    ];

    expect(extractLastTodosFromMessages(messages)).toBeNull();
  });

  it('should return null when no TodoWrite tool calls exist', () => {
    const messages = [
      {
        role: 'assistant',
        toolCalls: [
          { name: 'Read', input: { file_path: '/test.txt' } },
        ],
      },
    ];

    expect(extractLastTodosFromMessages(messages)).toBeNull();
  });

  it('should skip user messages', () => {
    const messages = [
      {
        role: 'user',
        toolCalls: [
          {
            name: TOOL_TODO_WRITE,
            input: {
              todos: [{ content: 'Should not find', status: 'pending', activeForm: 'Nope' }],
            },
          },
        ],
      },
    ];

    expect(extractLastTodosFromMessages(messages)).toBeNull();
  });

  it('should pick the last TodoWrite within a message with multiple tool calls', () => {
    const messages = [
      {
        role: 'assistant',
        toolCalls: [
          {
            name: TOOL_TODO_WRITE,
            input: {
              todos: [{ content: 'Earlier', status: 'pending' as const, activeForm: 'Earlier-ing' }],
            },
          },
          {
            name: 'Read',
            input: { file_path: '/test.txt' },
          },
          {
            name: TOOL_TODO_WRITE,
            input: {
              todos: [{ content: 'Later', status: 'in_progress' as const, activeForm: 'Later-ing' }],
            },
          },
        ],
      },
    ];

    const result = extractLastTodosFromMessages(messages);

    expect(result).toHaveLength(1);
    expect(result![0].content).toBe('Later');
  });

  it('should return null when TodoWrite has invalid input', () => {
    const messages = [
      {
        role: 'assistant',
        toolCalls: [
          {
            name: TOOL_TODO_WRITE,
            input: { todos: 'not-an-array' },
          },
        ],
      },
    ];

    expect(extractLastTodosFromMessages(messages)).toBeNull();
  });

  it('should fold Task* tool calls into a todo snapshot', () => {
    const messages = [
      {
        role: 'assistant',
        toolCalls: [
          { name: TOOL_TASK_CREATE, input: { subject: 'Explore', description: 'd', activeForm: 'Exploring' } },
          { name: TOOL_TASK_CREATE, input: { subject: 'Implement', description: 'd' } },
        ],
      },
      {
        role: 'assistant',
        toolCalls: [
          { name: TOOL_TASK_UPDATE, input: { taskId: '1', status: 'completed' } },
          { name: TOOL_TASK_UPDATE, input: { taskId: '2', status: 'in_progress' } },
        ],
      },
    ];

    const result = extractLastTodosFromMessages(messages);

    expect(result).toEqual([
      { content: 'Explore', activeForm: 'Exploring', status: 'completed' },
      { content: 'Implement', activeForm: 'Implement', status: 'in_progress' },
    ]);
  });

  it('should prefer Task* over a stale TodoWrite when both are present', () => {
    const messages = [
      {
        role: 'assistant',
        toolCalls: [
          { name: TOOL_TODO_WRITE, input: { todos: [{ content: 'Old', status: 'pending' as const, activeForm: 'Old-ing' }] } },
          { name: TOOL_TASK_CREATE, input: { subject: 'New', description: 'd' } },
        ],
      },
    ];

    const result = extractLastTodosFromMessages(messages);

    expect(result).toEqual([{ content: 'New', activeForm: 'New', status: 'pending' }]);
  });
});

describe('foldTaskTodos', () => {
  it('returns null when there are no Task* tool calls', () => {
    expect(foldTaskTodos([{ name: 'Read', input: { file_path: '/x' } }])).toBeNull();
  });

  it('drops tasks deleted via TaskUpdate', () => {
    const result = foldTaskTodos([
      { name: TOOL_TASK_CREATE, input: { subject: 'A' } },
      { name: TOOL_TASK_CREATE, input: { subject: 'B' } },
      { name: TOOL_TASK_UPDATE, input: { taskId: '1', status: 'deleted' } },
    ]);

    expect(result).toEqual([{ content: 'B', activeForm: 'B', status: 'pending' }]);
  });

  it('ignores TaskUpdate referencing an unknown task', () => {
    const result = foldTaskTodos([
      { name: TOOL_TASK_CREATE, input: { subject: 'A' } },
      { name: TOOL_TASK_UPDATE, input: { taskId: '9', status: 'completed' } },
    ]);

    expect(result).toEqual([{ content: 'A', activeForm: 'A', status: 'pending' }]);
  });
});
