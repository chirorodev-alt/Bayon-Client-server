import { spawn } from 'node:child_process';
import electron from 'electron';

const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.toLowerCase() !== 'electron_run_as_node') {
    env[key] = value;
  }
}

const child = spawn(electron, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: false,
  env,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
