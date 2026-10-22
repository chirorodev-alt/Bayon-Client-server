import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modRoot = path.join(projectRoot, 'fabric-mod');
const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(wrapper, ['prepareLauncherBundle'], {
  cwd: modRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || path.join(modRoot, '.gradle-user'),
  },
});

if (result.error) {
  console.error(`Could not run the Fabric build: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
