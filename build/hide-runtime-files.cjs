const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function hideWindowsRuntimeFiles(context) {
  if (context.electronPlatformName !== 'win32') return;

  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const attrib = path.join(systemRoot, 'System32', 'attrib.exe');
  const appDirectory = context.appOutDir;

  for (const name of fs.readdirSync(appDirectory)) {
    if (name.toLowerCase() === 'bayon client.exe') continue;
    execFileSync(attrib, ['+h', '+s', path.join(appDirectory, name)], { stdio: 'ignore' });
  }

  const appArchive = path.join(appDirectory, 'resources', 'app.asar');
  if (!fs.existsSync(appArchive)) {
    throw new Error(`Expected packaged app archive at ${appArchive}`);
  }
  execFileSync(attrib, ['+h', '+s', appArchive], { stdio: 'ignore' });
};
