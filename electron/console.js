const logContainer = document.getElementById('logs');
const levelFilter = document.getElementById('level-filter');
const autoScroll = document.getElementById('autoscroll');
const lineCount = document.getElementById('line-count');
const entries = [];
const seen = new Set();
let loadingSnapshot = true;
const liveDuringSnapshot = [];

function createRow(entry) {
  const row = document.createElement('div');
  row.className = `log-entry level-${entry.level}`;
  row.dataset.logId = String(entry.id);
  for (const [className, value] of [
    ['log-time', entry.time],
    ['log-level', entry.level],
    ['log-source', entry.source],
    ['log-message', entry.message],
  ]) {
    const cell = document.createElement('span');
    cell.className = className;
    cell.textContent = String(value ?? '');
    row.append(cell);
  }
  return row;
}

function updateFooter() {
  lineCount.textContent = `${entries.length.toLocaleString()} log lines · ${entries.filter((entry) => entry.level === 'error').length} errors`;
}

function addEntry(entry) {
  if (!entry || seen.has(entry.id)) return;
  seen.add(entry.id);
  entries.push(entry);
  if (entries.length > 3000) {
    const removed = entries.shift();
    seen.delete(removed.id);
    logContainer.querySelector(`[data-log-id="${removed.id}"]`)?.remove();
  }
  if (levelFilter.value === 'all' || entry.level === levelFilter.value) {
    logContainer.append(createRow(entry));
    if (logContainer.childElementCount > 3000) logContainer.firstElementChild?.remove();
  }
  updateFooter();
  if (autoScroll.checked) logContainer.scrollTop = logContainer.scrollHeight;
}

function render() {
  const filter = levelFilter.value;
  const visible = entries.filter((entry) => filter === 'all' || entry.level === filter);
  const fragment = document.createDocumentFragment();
  for (const entry of visible) fragment.append(createRow(entry));
  logContainer.replaceChildren(fragment);
  updateFooter();
  if (autoScroll.checked) logContainer.scrollTop = logContainer.scrollHeight;
}

window.gameConsoleAPI.onLog((entry) => {
  if (loadingSnapshot) liveDuringSnapshot.push(entry);
  else addEntry(entry);
});
window.gameConsoleAPI.getLogs().then((initial) => {
  for (const entry of initial) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  liveDuringSnapshot.forEach(addEntry);
  loadingSnapshot = false;
  render();
}).catch((error) => {
  loadingSnapshot = false;
  addEntry({ id: -1, time: new Date().toLocaleTimeString(), level: 'error', source: 'Console', message: error.message });
});
levelFilter.addEventListener('change', render);
document.getElementById('clear').addEventListener('click', async () => {
  await window.gameConsoleAPI.clearLogs();
  entries.length = 0;
  seen.clear();
  render();
});
document.getElementById('close').addEventListener('click', () => window.gameConsoleAPI.close());
