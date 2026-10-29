import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modRoot = path.join(projectRoot, 'fabric-mod');
const wrapper = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const wrapperPath = path.join(modRoot, wrapper);
const wrapperJar = path.join(modRoot, 'gradle', 'wrapper', 'gradle-wrapper.jar');
const useWrapperJar = process.platform !== 'win32' && !existsSync(wrapperPath);
if (useWrapperJar && !existsSync(wrapperJar)) {
  console.error('Could not run the Fabric build: the Gradle wrapper script and wrapper JAR are both missing.');
  process.exit(1);
}
const command = useWrapperJar ? 'java' : wrapper;
const args = useWrapperJar
  ? ['-classpath', wrapperJar, 'org.gradle.wrapper.GradleWrapperMain', 'prepareLauncherBundle']
  : ['prepareLauncherBundle'];
const result = spawnSync(command, args, {
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
