import { spawn } from 'child_process';

const child = spawn('agy', ['--acp']);

let output = '';
child.stdout.on('data', (data) => {
  output += data.toString();
  try {
    const json = JSON.parse(output.split('\n').filter(Boolean).pop());
    console.log(JSON.stringify(json, null, 2));
    process.exit(0);
  } catch (e) {
    // wait for more data
  }
});

child.stderr.on('data', (data) => {
  console.error(data.toString());
});

const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: 1,
    clientInfo: { name: 'test', version: '1.0.0' },
    clientCapabilities: {}
  }
};

child.stdin.write(JSON.stringify(initRequest) + '\n');

setTimeout(() => {
  console.log('Timeout');
  console.log('Partial output:', output);
  process.exit(1);
}, 5000);
