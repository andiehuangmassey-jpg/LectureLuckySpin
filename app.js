const REQUIRED_HEADERS = {
  firstName: ["firstname", "first_name", "first name"],
  lastName: ["lastname", "last_name", "last name"],
  idNumber: ["idnumber", "id_number", "id number", "studentid", "student id"],
  email: ["emailaddress", "email_address", "email address", "email"],
};

const PHASES = {
  idle: "idle",
  step1Ready: "step1-ready",
  step1Drawing: "step1-drawing",
  step1Done: "step1-done",
  step2Ready: "step2-ready",
  step2Spinning: "step2-spinning",
  step2Stopping: "step2-stopping",
  step2Stopped: "step2-stopped",
  step3Ready: "step3-ready",
};

const MOCK_CSV = `First Name,Last Name,ID Number,Email Address,bonus
Amelia,Clark,2026001,amelia.clark@example.edu,0
Noah,Turner,2026002,noah.turner@example.edu,1
Sophia,Ramirez,2026003,sophia.ramirez@example.edu,0
Liam,Patel,2026004,liam.patel@example.edu,0
Olivia,Bennett,2026005,olivia.bennett@example.edu,2
Ethan,Nguyen,2026006,ethan.nguyen@example.edu,0
Isabella,Brooks,2026007,isabella.brooks@example.edu,0
Mason,Carter,2026008,mason.carter@example.edu,1
Mia,Diaz,2026009,mia.diaz@example.edu,0
Lucas,Foster,2026010,lucas.foster@example.edu,0
Charlotte,Hayes,2026011,charlotte.hayes@example.edu,0
James,Kim,2026012,james.kim@example.edu,0`;

const state = {
  headers: [],
  headerMap: {},
  students: [],
  selectedTen: [],
  winner: null,
  lastResult: null,
  sourceFileName: "students.csv",
  repoGuess: guessRepoConfig(),
  phase: PHASES.idle,
  activeStep: 1,
  winnerDialogMode: "preview",
  currentRotation: 0,
  pointerIndex: null,
  spinVelocity: 330,
  spinFrame: null,
  spinLastTime: null,
  animationFrame: null,
  revealToken: 0,
  overlayOpen: false,
};

const elements = {
  statusText: document.querySelector("#status-text"),
  startBtn: document.querySelector("#start-btn"),
  toSpinBtn: document.querySelector("#to-spin-btn"),
  spinStartBtn: document.querySelector("#spin-start-btn"),
  spinStopBtn: document.querySelector("#spin-stop-btn"),
  showStudentBtn: document.querySelector("#show-student-btn"),
  downloadBtn: document.querySelector("#download-btn"),
  windowStepLabel: document.querySelector("#window-step-label"),
  windowTitle: document.querySelector("#window-title"),
  windowCopy: document.querySelector("#window-copy"),
  drawContent: document.querySelector("#draw-content"),
  spinContent: document.querySelector("#spin-content"),
  drawActions: document.querySelector("#draw-actions"),
  spinActions: document.querySelector("#spin-actions"),
  selectedGrid: document.querySelector("#selected-grid"),
  wheelShell: document.querySelector("#wheel-shell"),
  wheelDisc: document.querySelector("#wheel-disc"),
  wheelItems: document.querySelector("#wheel-items"),
  wheelPlaceholder: document.querySelector("#wheel-placeholder"),
  spinReadout: document.querySelector("#spin-readout"),
  sessionOverlay: document.querySelector("#session-overlay"),
  closeSessionButtons: Array.from(document.querySelectorAll("[data-close-session], #close-session-btn")),
  dialog: document.querySelector("#winner-dialog"),
  dialogStepLabel: document.querySelector("#dialog-step-label"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogCopy: document.querySelector("#dialog-copy"),
  dialogQuestion: document.querySelector("#dialog-question"),
  dialogNextBtn: document.querySelector("#dialog-next-btn"),
  markCorrectBtn: document.querySelector("#mark-correct-btn"),
  markWrongBtn: document.querySelector("#mark-wrong-btn"),
};

bootstrap();

function bootstrap() {
  applyRepoGuess();
  bindEvents();
  applyCsvText(MOCK_CSV, "Built-in mock data is ready.");
  loadBundledCsv(true);
}

function bindEvents() {
  elements.startBtn.addEventListener("click", runSelectionAnimation);
  elements.toSpinBtn.addEventListener("click", moveToSpinStep);
  elements.spinStartBtn.addEventListener("click", startLiveSpin);
  elements.spinStopBtn.addEventListener("click", stopLiveSpin);
  elements.showStudentBtn.addEventListener("click", openWinnerDialog);
  elements.dialogNextBtn.addEventListener("click", moveToJudgeStep);
  if (elements.downloadBtn) {
    elements.downloadBtn.addEventListener("click", downloadCsv);
  }
  elements.closeSessionButtons.forEach((button) => {
    button.addEventListener("click", closeSessionOverlay);
  });
  elements.markCorrectBtn.addEventListener("click", () => resolveWinner(true));
  elements.markWrongBtn.addEventListener("click", () => resolveWinner(false));
  elements.dialog.addEventListener("close", handleDialogClose);
}

async function loadBundledCsv(silent) {
  try {
    const response = await fetch("./students.csv", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("students.csv not found");
    }

    state.sourceFileName = "students.csv";
    const text = await response.text();
    applyCsvText(
      text,
      silent
        ? "students.csv loaded from the repository."
        : "Reloaded students.csv from the repository."
    );
  } catch (error) {
    state.sourceFileName = "mock-students.csv";
    setStatus("students.csv could not be loaded, so the app is using built-in mock data.", true);
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

  resetFlow();
  renderAll();
  setStatus(successMessage);
}

function resetFlow() {
  stopAnimations();
  state.selectedTen = [];
  state.winner = null;
  state.lastResult = null;
  state.currentRotation = 0;
  state.pointerIndex = null;
  state.phase = state.students.length ? PHASES.step1Ready : PHASES.idle;
  state.activeStep = 1;
  state.winnerDialogMode = "preview";
  state.overlayOpen = false;
  state.revealToken += 1;
}

function stopAnimations() {
  if (state.spinFrame) {
    cancelAnimationFrame(state.spinFrame);
    state.spinFrame = null;
  }

  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  state.spinLastTime = null;
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
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mapped = {};

  Object.entries(REQUIRED_HEADERS).forEach(([key, aliases]) => {
    const match = aliases
      .map((alias) => normalized.get(normalizeHeader(alias)))
      .find(Boolean);

    if (!match) {
      throw new Error(`Missing required column for ${key}.`);
    }

    mapped[key] = match;
  });

  const bonusHeader = headers.find((header) => normalizeHeader(header) === "bonus");
  mapped.bonus = bonusHeader || "bonus";
  return mapped;
}

function normalizeHeader(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
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

async function runSelectionAnimation() {
  if (!state.students.length || isBusy()) {
    return;
  }

  stopAnimations();
  state.revealToken += 1;
  const token = state.revealToken;

  state.overlayOpen = true;
  state.phase = PHASES.step1Drawing;
  state.activeStep = 1;
  state.winnerDialogMode = "preview";
  state.selectedTen = [];
  state.winner = null;
  state.lastResult = null;
  state.currentRotation = 0;
  state.pointerIndex = null;
  renderAll();
  setStatus("Step 1 started. Revealing 10 random students...");

  const pool = shuffle([...state.students]).slice(0, Math.min(10, state.students.length));

  for (const student of pool) {
    if (token !== state.revealToken) {
      return;
    }

    state.selectedTen.push(student);
    renderSelectedStudents(student.__index);
    await wait(230);
  }

  state.phase = PHASES.step1Done;
  renderWheelStructure();
  paintWheel();
  renderFlowState();
  updateActionState();
  setStatus("Step 1 complete. Press Next Step to move to the live wheel.");
}

function moveToSpinStep() {
  if (state.phase !== PHASES.step1Done) {
    return;
  }

  state.overlayOpen = true;
  state.phase = PHASES.step2Ready;
  state.activeStep = 2;
  renderFlowState();
  updateActionState();
  setStatus("Step 2 ready. Press Start Spin, then Stop whenever you want.");
}

function startLiveSpin() {
  if (!state.selectedTen.length || state.phase !== PHASES.step2Ready) {
    return;
  }

  stopAnimations();
  state.phase = PHASES.step2Spinning;
  state.activeStep = 2;
  state.winner = null;
  state.lastResult = null;
  state.winnerDialogMode = "preview";
  state.spinVelocity = 320 + Math.random() * 80;
  updateActionState();
  setStatus("Wheel is spinning. Press Stop when you want the wheel to slow down.");

  state.spinFrame = requestAnimationFrame(runSpinFrame);
}

function runSpinFrame(timestamp) {
  if (state.phase !== PHASES.step2Spinning) {
    return;
  }

  if (!state.spinLastTime) {
    state.spinLastTime = timestamp;
  }

  const delta = timestamp - state.spinLastTime;
  state.spinLastTime = timestamp;
  state.currentRotation += ((state.spinVelocity + Math.sin(timestamp / 180) * 18) * delta) / 1000;
  paintWheel();
  state.spinFrame = requestAnimationFrame(runSpinFrame);
}

function stopLiveSpin() {
  if (state.phase !== PHASES.step2Spinning) {
    return;
  }

  stopAnimations();
  state.phase = PHASES.step2Stopping;
  updateActionState();

  const winnerIndex = getPointerIndex(state.currentRotation);
  const slice = 360 / state.selectedTen.length;
  const targetNormalized = modulo(-winnerIndex * slice, 360);
  const currentNormalized = modulo(state.currentRotation, 360);
  let delta = modulo(targetNormalized - currentNormalized, 360);

  if (delta < 48) {
    delta += 360;
  }

  const targetRotation = state.currentRotation + delta + 720;
  const startRotation = state.currentRotation;
  const duration = 2100;
  const startTime = performance.now();

  setStatus("Slowing down the wheel...");

  const animate = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    state.currentRotation = startRotation + (targetRotation - startRotation) * eased;
    paintWheel();

    if (progress < 1) {
      state.animationFrame = requestAnimationFrame(animate);
      return;
    }

    state.animationFrame = null;
    state.currentRotation = targetRotation;
    state.pointerIndex = winnerIndex;
    state.winner = state.selectedTen[winnerIndex];
    state.phase = PHASES.step2Stopped;
    state.winnerDialogMode = "preview";
    renderFlowState();
    updateActionState();
    renderSelectedStudents();
    setStatus(`Wheel stopped on ${formatName(state.winner)}.`);
    openWinnerDialog();
  };

  state.animationFrame = requestAnimationFrame(animate);
}

function moveToJudgeStep() {
  if (!state.winner || state.phase !== PHASES.step2Stopped) {
    return;
  }

  state.phase = PHASES.step3Ready;
  state.activeStep = 3;
  state.winnerDialogMode = "judge";
  renderFlowState();
  updateActionState();
  renderWinnerDialog();
}

function closeSessionOverlay() {
  safeCloseDialog();
  resetFlow();
  renderAll();
  setStatus("Session closed. Press Start to open the first floating step again.");
}

function handleDialogClose() {
  if (state.phase === PHASES.step3Ready && state.winner) {
    state.phase = PHASES.step2Stopped;
    state.activeStep = 2;
    state.winnerDialogMode = "preview";
    renderFlowState();
    updateActionState();
  }
}

function resolveWinner(isCorrect) {
  if (!state.winner) {
    return;
  }

  const bonusHeader = state.headerMap.bonus;
  const bonusValue = Number.parseInt(state.winner[bonusHeader], 10) || 0;

  if (isCorrect) {
    state.winner[bonusHeader] = String(bonusValue + 1);
    setStatus(`${formatName(state.winner)} marked correct. bonus is now ${state.winner[bonusHeader]}.`);
  } else {
    setStatus(`${formatName(state.winner)} marked wrong. bonus unchanged.`);
  }

  state.lastResult = {
    index: state.winner.__index,
    correct: isCorrect,
  };
  state.phase = PHASES.step2Ready;
  state.activeStep = 2;
  state.winnerDialogMode = "preview";
  safeCloseDialog();
  renderAll();
}

function renderAll() {
  renderSelectedStudents();
  renderWheelStructure();
  paintWheel();
  renderWinnerDialog();
  renderFlowState();
  updateActionState();
}

function renderFlowState() {
  elements.sessionOverlay.hidden = !state.overlayOpen;
  document.body.classList.toggle("overlay-open", state.overlayOpen);
  const drawVisible = state.overlayOpen && state.activeStep === 1;
  const spinVisible = state.overlayOpen && state.activeStep >= 2;
  elements.drawContent.hidden = !drawVisible;
  elements.drawActions.hidden = !drawVisible;
  elements.spinContent.hidden = !spinVisible;
  elements.spinActions.hidden = !spinVisible;

  if (drawVisible) {
    elements.windowStepLabel.textContent = "Step 1";
    elements.windowTitle.textContent = "10 Lucky Students";
    elements.windowCopy.textContent =
      "This floating window reveals 10 randomly selected students one by one.";
  } else if (spinVisible) {
    elements.windowStepLabel.textContent = "Step 2";
    elements.windowTitle.textContent = "Spin the Wheel";
    elements.windowCopy.innerHTML =
      "Press <code>Start Spin</code>, let the wheel run, then hit <code>Stop</code> exactly when you want.";
  }
}

function renderSelectedStudents(revealIndex) {
  if (!state.selectedTen.length) {
    elements.selectedGrid.className = "selected-grid empty-state";
    elements.selectedGrid.innerHTML = "<p>Press Start to begin the first draw.</p>";
    return;
  }

  elements.selectedGrid.className = "selected-grid";
  elements.selectedGrid.innerHTML = state.selectedTen
    .map((student) => {
      const isReveal = revealIndex === student.__index;
      const isSpeaker = state.winner && state.winner.__index === student.__index;
      return `
        <article class="student-card${isReveal ? " is-focus" : ""}${isSpeaker ? " is-speaker" : ""}">
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

function renderWheelStructure() {
  if (!state.selectedTen.length) {
    elements.wheelShell.classList.add("is-empty");
    elements.wheelItems.innerHTML = "";
    elements.wheelDisc.style.background = "";
    return;
  }

  elements.wheelShell.classList.remove("is-empty");
  elements.wheelDisc.style.background = buildWheelGradient(state.selectedTen.length);
  elements.wheelItems.innerHTML = state.selectedTen
    .map((student, index) => {
      const angle = (360 / state.selectedTen.length) * index;
      return `
        <div
          class="wheel-item"
          style="transform: translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--wheel-radius) * -1));"
        >
          <span style="transform: rotate(${-angle}deg);">
            ${escapeHtml(student[state.headerMap.firstName])}<br />
            ${escapeHtml(student[state.headerMap.lastName])}
          </span>
        </div>
      `;
    })
    .join("");
}

function paintWheel() {
  if (!state.selectedTen.length) {
    renderSpinReadout();
    return;
  }

  elements.wheelDisc.style.transform = `rotate(${state.currentRotation}deg)`;
  state.pointerIndex = getPointerIndex(state.currentRotation);
  renderSpinReadout();
}

function renderSpinReadout() {
  if (!state.selectedTen.length || state.pointerIndex === null) {
    elements.spinReadout.className = "spin-readout muted";
    elements.spinReadout.innerHTML =
      "<p>The live pointer will show who is under the arrow.</p><strong>Waiting for the wheel</strong>";
    return;
  }

  const student = state.selectedTen[state.pointerIndex];
  const isLive = state.phase === PHASES.step2Spinning || state.phase === PHASES.step2Stopping;
  elements.spinReadout.className = `spin-readout${isLive ? "" : " muted"}`;
  elements.spinReadout.innerHTML = `
    <p>${isLive ? "Pointer is currently on" : "Pointer is resting on"}</p>
    <strong>${escapeHtml(formatName(student))}</strong>
  `;
}

function renderWinnerDialog() {
  if (!state.winner) {
    elements.dialogStepLabel.textContent = "Lucky Student";
    elements.dialogTitle.textContent = "Selected Student";
    elements.dialogCopy.innerHTML = "";
    elements.dialogQuestion.hidden = true;
    elements.dialogNextBtn.hidden = false;
    elements.markCorrectBtn.hidden = true;
    elements.markWrongBtn.hidden = true;
    return;
  }

  elements.dialogCopy.innerHTML = `
    <article class="dialog-student-inner">
      <span class="badge">+${escapeHtml(state.winner[state.headerMap.bonus])}</span>
      <h3>${escapeHtml(formatName(state.winner))}</h3>
      <p>ID: ${escapeHtml(state.winner[state.headerMap.idNumber])}</p>
      <p>${escapeHtml(state.winner[state.headerMap.email])}</p>
    </article>
  `;

  if (state.winnerDialogMode === "judge") {
    elements.dialogStepLabel.textContent = "Step 3";
    elements.dialogTitle.textContent = "Answer Result";
    elements.dialogQuestion.hidden = false;
    elements.dialogNextBtn.hidden = true;
    elements.markCorrectBtn.hidden = false;
    elements.markWrongBtn.hidden = false;
  } else {
    elements.dialogStepLabel.textContent = "Lucky Student";
    elements.dialogTitle.textContent = "Selected Student";
    elements.dialogQuestion.hidden = true;
    elements.dialogNextBtn.hidden = false;
    elements.markCorrectBtn.hidden = true;
    elements.markWrongBtn.hidden = true;
  }
}

function updateActionState() {
  const hasRoster = state.students.length > 0;
  const busy = isBusy();

  elements.startBtn.disabled = !hasRoster || busy;
  elements.toSpinBtn.disabled = state.phase !== PHASES.step1Done;
  elements.spinStartBtn.disabled = state.phase !== PHASES.step2Ready;
  elements.spinStopBtn.disabled = state.phase !== PHASES.step2Spinning;
  elements.showStudentBtn.disabled = state.phase !== PHASES.step2Stopped;
  if (elements.downloadBtn) {
    elements.downloadBtn.disabled = !hasRoster || busy;
  }
}

function getPhaseNote() {
  switch (state.phase) {
    case PHASES.step1Ready:
      return "Press Start to reveal the 10 random students.";
    case PHASES.step1Drawing:
      return "Step 1 is running. The shortlist is being revealed card by card.";
    case PHASES.step1Done:
      return "Step 1 is complete. Press Next Step to move to the live wheel.";
    case PHASES.step2Ready:
      return "Step 2 is ready. Press Start Spin, then Stop when you want the wheel to settle.";
    case PHASES.step2Spinning:
      return "The wheel is spinning. Press Stop to slow it down and choose the speaker.";
    case PHASES.step2Stopping:
      return "The wheel is slowing down. Wait for the final speaker to lock in.";
    case PHASES.step2Stopped:
      return "A speaker is selected. Press Next Step to open the judgment dialog.";
    case PHASES.step3Ready:
      return "The dialog is open. Mark the answer as correct or wrong.";
    default:
      return "Load the roster, then start the first reveal.";
  }
}

function isBusy() {
  return [
    PHASES.step1Drawing,
    PHASES.step2Spinning,
    PHASES.step2Stopping,
    PHASES.step3Ready,
  ].includes(state.phase);
}

function getPointerIndex(rotation) {
  if (!state.selectedTen.length) {
    return null;
  }

  const slice = 360 / state.selectedTen.length;
  return normalizeIndex(Math.round(-rotation / slice), state.selectedTen.length);
}

function normalizeIndex(value, length) {
  return ((value % length) + length) % length;
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function openResultDialog(student) {
  renderWinnerDialog();
  if (typeof elements.dialog.showModal === "function") {
    elements.dialog.showModal();
    return;
  }

  elements.dialog.setAttribute("open", "open");
}

function safeCloseDialog() {
  if (!elements.dialog.open) {
    return;
  }

  if (typeof elements.dialog.close === "function") {
    elements.dialog.close();
  } else {
    elements.dialog.removeAttribute("open");
  }
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
}

function buildCsv() {
  const headers = [...state.headers];
  if (!headers.includes(state.headerMap.bonus)) {
    headers.push(state.headerMap.bonus);
  }

  const rows = [
    headers.map(escapeCsv).join(","),
    ...state.students.map((student) => headers.map((header) => escapeCsv(student[header] || "")).join(",")),
  ];

  return rows.join("\n");
}

function escapeCsv(value) {
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function formatName(student) {
  return `${student[state.headerMap.firstName]} ${student[state.headerMap.lastName]}`.trim();
}

function setStatus(message, isError = false) {
  elements.statusText.textContent = message;
  elements.statusText.classList.toggle("is-hidden", !isError);
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

function buildWheelGradient(count) {
  const colors = [
    "rgba(168, 179, 160, 0.72)",
    "rgba(199, 158, 151, 0.72)",
    "rgba(204, 183, 163, 0.72)",
    "rgba(143, 157, 155, 0.72)",
  ];
  const slice = 360 / count;

  return `conic-gradient(from -90deg, ${Array.from({ length: count }, (_, index) => {
    const start = slice * index;
    const end = slice * (index + 1);
    return `${colors[index % colors.length]} ${start}deg ${end}deg`;
  }).join(", ")})`;
}

function toBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
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
}

function openWinnerDialog() {
  openResultDialog(state.winner);
}
