const REQUIRED_HEADERS = {
  firstName: ["firstname", "first_name", "first name"],
  lastName: ["lastname", "last_name", "last name"],
  idNumber: ["idnumber", "id_number", "id number", "studentid", "student id"],
  email: ["emailaddress", "email_address", "email address", "email"],
};

const state = {
  headers: [],
  headerMap: {},
  students: [],
  selectedTen: [],
  winner: null,
  sourceFileName: "students.csv",
  isSpinning: false,
  repoGuess: guessRepoConfig(),
};

const elements = {
  csvFile: document.querySelector("#csv-file"),
  loadDefaultBtn: document.querySelector("#load-default-btn"),
  statusText: document.querySelector("#status-text"),
  startBtn: document.querySelector("#start-btn"),
  continueBtn: document.querySelector("#continue-btn"),
  downloadBtn: document.querySelector("#download-btn"),
  syncBtn: document.querySelector("#sync-btn"),
  selectedGrid: document.querySelector("#selected-grid"),
  summaryList: document.querySelector("#summary-list"),
  spinnerTrack: document.querySelector("#spinner-track"),
  winnerCard: document.querySelector("#winner-card"),
  activityLog: document.querySelector("#activity-log"),
  dialog: document.querySelector("#result-dialog"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogCopy: document.querySelector("#dialog-copy"),
  markCorrectBtn: document.querySelector("#mark-correct-btn"),
  markWrongBtn: document.querySelector("#mark-wrong-btn"),
  githubOwner: document.querySelector("#github-owner"),
  githubRepo: document.querySelector("#github-repo"),
  githubBranch: document.querySelector("#github-branch"),
  githubPath: document.querySelector("#github-path"),
  githubToken: document.querySelector("#github-token"),
};

bootstrap();

function bootstrap() {
  applyRepoGuess();
  bindEvents();
  renderSummary();
  updateActionState();
  loadBundledCsv(true);
}

function bindEvents() {
  elements.csvFile.addEventListener("change", handleFileUpload);
  elements.loadDefaultBtn.addEventListener("click", () => loadBundledCsv(false));
  elements.startBtn.addEventListener("click", runSelectionAnimation);
  elements.continueBtn.addEventListener("click", runSpinAnimation);
  elements.downloadBtn.addEventListener("click", downloadCsv);
  elements.syncBtn.addEventListener("click", () => syncToGitHub(false));
  elements.markCorrectBtn.addEventListener("click", () => resolveWinner(true));
  elements.markWrongBtn.addEventListener("click", () => resolveWinner(false));

  [
    elements.githubOwner,
    elements.githubRepo,
    elements.githubBranch,
    elements.githubPath,
    elements.githubToken,
  ].forEach((input) => {
    input.addEventListener("input", updateActionState);
  });
}

async function handleFileUpload(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  state.sourceFileName = file.name;
  try {
    const text = await file.text();
    applyCsvText(text, `Loaded ${file.name}.`);
  } catch (error) {
    setStatus(`Could not read ${file.name}: ${error.message}`, true);
  }
}

async function loadBundledCsv(silent) {
  try {
    const response = await fetch("./students.csv", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("students.csv not found");
    }

    state.sourceFileName = "students.csv";
    const text = await response.text();
    applyCsvText(text, silent ? "Bundled students.csv loaded." : "Loaded bundled students.csv.");
  } catch (error) {
    if (!silent) {
      setStatus(`Could not load bundled students.csv: ${error.message}`, true);
    }
  }
}

function applyCsvText(text, successMessage) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error("CSV needs a header row and at least one student row.");
  }

  const headers = rows[0].map((header) => header.trim());
  const headerMap = mapHeaders(headers);

  state.headers = [...headers];
  state.headerMap = headerMap;
  state.students = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row, index) => makeStudentRecord(headers, row, headerMap, index));

  if (!state.students.length) {
    throw new Error("No student rows were found.");
  }

  if (!state.headers.includes(headerMap.bonus)) {
    state.headers.push(headerMap.bonus);
  }

  state.selectedTen = [];
  state.winner = null;
  renderSelectedStudents();
  renderSpinnerPlaceholder();
  renderWinnerCard();
  renderSummary();
  updateActionState();
  setStatus(successMessage);
  addLog(`Roster ready with ${state.students.length} students from ${state.sourceFileName}.`);
}

function makeStudentRecord(headers, row, headerMap, index) {
  const record = {};
  headers.forEach((header, headerIndex) => {
    record[header] = (row[headerIndex] || "").trim();
  });

  if (!record[headerMap.bonus]) {
    record[headerMap.bonus] = "0";
  }

  const bonusValue = Number.parseInt(record[headerMap.bonus], 10);
  record[headerMap.bonus] = Number.isFinite(bonusValue) ? String(bonusValue) : "0";
  record.__index = index;
  return record;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function mapHeaders(headers) {
  const normalized = new Map(
    headers.map((header) => [normalizeHeader(header), header])
  );

  const mapped = {};
  Object.entries(REQUIRED_HEADERS).forEach(([key, aliases]) => {
    const header = aliases
      .map((alias) => normalized.get(normalizeHeader(alias)))
      .find(Boolean);
    if (!header) {
      throw new Error(`Missing required column for ${key}.`);
    }
    mapped[key] = header;
  });

  const bonusHeader = headers.find((header) => normalizeHeader(header) === "bonus");
  mapped.bonus = bonusHeader || "bonus";
  return mapped;
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function runSelectionAnimation() {
  if (!state.students.length || state.isSpinning) {
    return;
  }

  state.selectedTen = [];
  state.winner = null;
  elements.selectedGrid.classList.remove("empty-state");
  renderSpinnerPlaceholder();
  renderWinnerCard();
  updateActionState();

  const pool = shuffle([...state.students]).slice(0, Math.min(10, state.students.length));
  setStatus("Drawing the first ten students...");
  addLog("Started a new 10-student draw.");

  for (const student of pool) {
    state.selectedTen.push(student);
    renderSelectedStudents(student.__index);
    await wait(220);
  }

  setStatus(`Selected ${state.selectedTen.length} students. Ready to spin.`);
  addLog(`Selected ten: ${state.selectedTen.map(formatName).join(", ")}.`);
  updateActionState();
}

async function runSpinAnimation() {
  if (state.selectedTen.length === 0 || state.isSpinning) {
    return;
  }

  state.isSpinning = true;
  updateActionState();
  setStatus("Spinning inside the selected ten...");

  const winnerIndex = Math.floor(Math.random() * state.selectedTen.length);
  const winner = state.selectedTen[winnerIndex];
  const cycles = 7;
  const repeated = Array.from({ length: cycles }, () => state.selectedTen).flat();
  const itemHeight = 76;
  const centerOffset = 87;
  const startIndex = winnerIndex + state.selectedTen.length;
  const endIndex = winnerIndex + state.selectedTen.length * (cycles - 2);

  elements.spinnerTrack.innerHTML = repeated.map(renderReelItem).join("");
  elements.spinnerTrack.style.transition = "none";
  elements.spinnerTrack.style.transform = `translateY(${centerOffset - startIndex * itemHeight}px)`;
  void elements.spinnerTrack.offsetHeight;
  elements.spinnerTrack.style.transition = "transform 4.8s cubic-bezier(0.16, 1, 0.3, 1)";
  elements.spinnerTrack.style.transform = `translateY(${centerOffset - endIndex * itemHeight}px)`;

  await wait(4950);

  state.winner = winner;
  state.isSpinning = false;
  renderWinnerCard();
  updateActionState();
  addLog(`Spin result: ${formatName(winner)} is up next.`);
  openResultDialog(winner);
}

function resolveWinner(isCorrect) {
  if (!state.winner) {
    return;
  }

  const student = state.winner;
  const bonusHeader = state.headerMap.bonus;

  if (isCorrect) {
    const bonusValue = Number.parseInt(student[bonusHeader], 10) || 0;
    student[bonusHeader] = String(bonusValue + 1);
    setStatus(`${formatName(student)} marked correct. bonus is now ${student[bonusHeader]}.`);
    addLog(`${formatName(student)} answered correctly. bonus -> ${student[bonusHeader]}.`);
    renderSelectedStudents(student.__index);
    renderWinnerCard();
    updateActionState();
    maybeAutoSync();
  } else {
    setStatus(`${formatName(student)} marked wrong. bonus unchanged.`);
    addLog(`${formatName(student)} answered incorrectly. bonus unchanged.`);
  }

  state.winner = null;
  safeCloseDialog();
}

function maybeAutoSync() {
  if (!hasSyncConfig()) {
    return;
  }

  syncToGitHub(true).catch((error) => {
    setStatus(`Bonus updated locally, but GitHub sync failed: ${error.message}`, true);
  });
}

function renderSelectedStudents(activeIndex) {
  if (!state.selectedTen.length) {
    elements.selectedGrid.className = "selected-grid empty-state";
    elements.selectedGrid.innerHTML = "<p>Load a roster, then press Start.</p>";
    return;
  }

  elements.selectedGrid.className = "selected-grid";
  elements.selectedGrid.innerHTML = state.selectedTen
    .map((student) => {
      const activeClass = activeIndex === student.__index ? ' style="outline: 2px solid rgba(135, 117, 106, 0.24)"' : "";
      return `
        <article class="student-card"${activeClass}>
          <span class="badge">+${student[state.headerMap.bonus]}</span>
          <h3>${escapeHtml(formatName(student))}</h3>
          <div class="meta">
            <span>ID: ${escapeHtml(student[state.headerMap.idNumber])}</span>
            <span>${escapeHtml(student[state.headerMap.email])}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSpinnerPlaceholder() {
  elements.spinnerTrack.innerHTML =
    '<div class="spinner-placeholder">Press Continue after the first draw.</div>';
  elements.spinnerTrack.style.transition = "none";
  elements.spinnerTrack.style.transform = "translateY(0)";
}

function renderWinnerCard() {
  if (!state.winner) {
    elements.winnerCard.className = "winner-card muted";
    elements.winnerCard.innerHTML = `
      <p class="winner-label">Next speaker</p>
      <h3>Not selected yet</h3>
      <p>Spin after the first draw.</p>
    `;
    return;
  }

  const student = state.winner;
  elements.winnerCard.className = "winner-card";
  elements.winnerCard.innerHTML = `
    <p class="winner-label">Next speaker</p>
    <h3>${escapeHtml(formatName(student))}</h3>
    <p>ID: ${escapeHtml(student[state.headerMap.idNumber])}</p>
    <p>${escapeHtml(student[state.headerMap.email])}</p>
    <p>Current bonus: ${escapeHtml(student[state.headerMap.bonus])}</p>
  `;
}

function renderSummary() {
  if (!state.students.length) {
    elements.summaryList.innerHTML = "<li>No roster loaded.</li>";
    return;
  }

  const bonusTotal = state.students.reduce(
    (sum, student) => sum + (Number.parseInt(student[state.headerMap.bonus], 10) || 0),
    0
  );

  elements.summaryList.innerHTML = `
    <li>${state.students.length} students loaded from ${escapeHtml(state.sourceFileName)}.</li>
    <li>${state.selectedTen.length} students currently on the stage.</li>
    <li>Total recorded bonus points: ${bonusTotal}.</li>
  `;
}

function openResultDialog(student) {
  elements.dialogTitle.textContent = `Did ${formatName(student)} answer correctly?`;
  elements.dialogCopy.textContent = `${student[state.headerMap.idNumber]} · ${student[state.headerMap.email]}`;
  if (typeof elements.dialog.showModal === "function") {
    elements.dialog.showModal();
    return;
  }

  elements.dialog.setAttribute("open", "open");
}

function safeCloseDialog() {
  if (elements.dialog.open) {
    if (typeof elements.dialog.close === "function") {
      elements.dialog.close();
    } else {
      elements.dialog.removeAttribute("open");
    }
  }
}

function renderReelItem(student) {
  return `
    <div class="reel-item">
      <div>
        <h3>${escapeHtml(formatName(student))}</h3>
        <p>${escapeHtml(student[state.headerMap.idNumber])}</p>
      </div>
      <span class="badge">+${student[state.headerMap.bonus]}</span>
    </div>
  `;
}

function downloadCsv() {
  if (!state.students.length) {
    return;
  }

  const csv = buildCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.sourceFileName.replace(/\.csv$/i, "") + "-updated.csv";
  link.click();
  URL.revokeObjectURL(url);
  addLog("Downloaded updated CSV.");
}

async function syncToGitHub(isAutomatic) {
  if (!state.students.length) {
    return;
  }

  const owner = elements.githubOwner.value.trim();
  const repo = elements.githubRepo.value.trim();
  const branch = elements.githubBranch.value.trim() || "main";
  const path = elements.githubPath.value.trim() || "students.csv";
  const token = elements.githubToken.value.trim();

  if (!owner || !repo || !token) {
    if (!isAutomatic) {
      setStatus("Owner, repo, and token are required for GitHub sync.", true);
    }
    return;
  }

  const csv = buildCsv();
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let sha;
  const encodedPath = encodeGitHubPath(path);
  const currentResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { headers }
  );

  if (currentResponse.ok) {
    const currentData = await currentResponse.json();
    sha = currentData.sha;
  } else if (currentResponse.status !== 404) {
    const errorBody = await currentResponse.json().catch(() => ({}));
    throw new Error(errorBody.message || "Could not read current file from GitHub.");
  }

  const message = `Update bonus scores from Lecture Lucky Spin (${new Date().toISOString()})`;
  const payload = {
    message,
    branch,
    content: toBase64(csv),
    sha,
  };

  const writeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    }
  );

  if (!writeResponse.ok) {
    const errorBody = await writeResponse.json().catch(() => ({}));
    throw new Error(errorBody.message || "GitHub rejected the file update.");
  }

  const mode = isAutomatic ? "Auto-synced" : "Synced";
  setStatus(`${mode} bonus updates to ${owner}/${repo}:${path}.`);
  addLog(`${mode} CSV back to GitHub.`);
}

function buildCsv() {
  const headers = [...state.headers];
  if (!headers.includes(state.headerMap.bonus)) {
    headers.push(state.headerMap.bonus);
  }

  const lines = [
    headers.map(escapeCsv).join(","),
    ...state.students.map((student) => headers.map((header) => escapeCsv(student[header] || "")).join(",")),
  ];

  return lines.join("\n");
}

function escapeCsv(value) {
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function updateActionState() {
  const hasRoster = state.students.length > 0;
  const hasSelection = state.selectedTen.length > 0;
  elements.startBtn.disabled = !hasRoster || state.isSpinning;
  elements.continueBtn.disabled = !hasSelection || state.isSpinning;
  elements.downloadBtn.disabled = !hasRoster || state.isSpinning;
  elements.syncBtn.disabled = !hasRoster || !hasSyncConfig() || state.isSpinning;
  renderSummary();
}

function hasSyncConfig() {
  return (
    elements.githubOwner.value.trim() &&
    elements.githubRepo.value.trim() &&
    elements.githubToken.value.trim()
  );
}

function formatName(student) {
  return `${student[state.headerMap.firstName]} ${student[state.headerMap.lastName]}`.trim();
}

function addLog(message) {
  const entry = document.createElement("article");
  entry.className = "log-item";
  entry.innerHTML = `
    <time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    <p>${escapeHtml(message)}</p>
  `;

  if (elements.activityLog.textContent.includes("No activity yet.")) {
    elements.activityLog.innerHTML = "";
  }
  elements.activityLog.prepend(entry);
}

function setStatus(message, isError = false) {
  elements.statusText.textContent = message;
  elements.statusText.style.color = isError ? "#9b5f55" : "";
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shuffle(list) {
  const array = [...list];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function toBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function encodeGitHubPath(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function guessRepoConfig() {
  const host = window.location.hostname;
  const pathParts = window.location.pathname.split("/").filter(Boolean);

  if (host.endsWith(".github.io")) {
    return {
      owner: host.replace(".github.io", ""),
      repo: pathParts[0] || "",
      branch: "main",
      path: "students.csv",
    };
  }

  return {
    owner: "",
    repo: "",
    branch: "main",
    path: "students.csv",
  };
}

function applyRepoGuess() {
  elements.githubOwner.value = state.repoGuess.owner;
  elements.githubRepo.value = state.repoGuess.repo;
  elements.githubBranch.value = state.repoGuess.branch;
  elements.githubPath.value = state.repoGuess.path;
}
