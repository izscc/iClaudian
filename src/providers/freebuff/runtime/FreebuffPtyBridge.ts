import * as fs from 'node:fs';

const FREEBUFF_PTY_BRIDGE_SCRIPT = String.raw`
import os
import pty
import select
import signal
import sys
import termios
import tty

if len(sys.argv) < 2:
    print('usage: freebuff_pty_bridge command [args...]', file=sys.stderr)
    sys.exit(2)

command = sys.argv[1:]
pid, fd = pty.fork()
if pid == 0:
    os.environ.setdefault('TERM', 'xterm-256color')
    os.execvp(command[0], command)

old_attrs = None
try:
    if os.isatty(sys.stdin.fileno()):
        old_attrs = termios.tcgetattr(sys.stdin.fileno())
        tty.setraw(sys.stdin.fileno())
except Exception:
    old_attrs = None

def forward_signal(signum, _frame):
    try:
        os.kill(pid, signum)
    except Exception:
        pass

for sig in (signal.SIGTERM, signal.SIGINT):
    signal.signal(sig, forward_signal)

exit_status = 0
try:
    while True:
        readable, _, _ = select.select([fd, sys.stdin.fileno()], [], [])
        if fd in readable:
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            os.write(sys.stdout.fileno(), data)
        if sys.stdin.fileno() in readable:
            data = os.read(sys.stdin.fileno(), 4096)
            if not data:
                try:
                    os.close(fd)
                except Exception:
                    pass
                break
            os.write(fd, data)
finally:
    if old_attrs is not None:
        try:
            termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, old_attrs)
        except Exception:
            pass
    try:
        _, status = os.waitpid(pid, os.WNOHANG)
        if status == 0:
            os.kill(pid, signal.SIGTERM)
            _, status = os.waitpid(pid, 0)
        if os.WIFEXITED(status):
            exit_status = os.WEXITSTATUS(status)
        elif os.WIFSIGNALED(status):
            exit_status = 128 + os.WTERMSIG(status)
    except Exception:
        pass

sys.exit(exit_status)
`;

export interface FreebuffSpawnCommand {
  args: string[];
  command: string;
}

export function buildFreebuffSpawnCommand(command: string, args: string[]): FreebuffSpawnCommand {
  if (process.platform === 'win32') return { command, args };
  const python = resolvePythonCommand();
  if (!python) return { command, args };
  return {
    command: python,
    args: ['-c', FREEBUFF_PTY_BRIDGE_SCRIPT, command, ...args],
  };
}

function resolvePythonCommand(): string | null {
  if (process.platform === 'darwin' && fs.existsSync('/usr/bin/python3')) return '/usr/bin/python3';
  return 'python3';
}
