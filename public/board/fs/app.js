import {
  calculateProgress,
  createInitialFsState,
  createInitialRollTable,
  generateRollTableCommand,
  mergeRollTableLibraryImport,
  mergeFsStates,
  normalizeFsState,
  normalizeRollTableLibrary,
  parseRollTableText,
  suggestProgressDelta,
} from "./fs-core.js?v=20260904-20";

const FS_STORAGE_KEY = "dx3rd-fs-manager-v1";
const ROLL_TABLE_STORAGE_KEY = "dx3rd-fs-roll-tables-v1";
const HISTORY_LIMIT = 80;
const REMOTE_STATE_ENDPOINT = "/api/fs";

const fsLayout = document.querySelector(".fs-layout");
const fsWorkspace = document.querySelector("#fsWorkspace");
const battlePageLink = document.querySelector("#battlePageLink");
const fsSettingsForm = document.querySelector("#fsSettingsForm");
const settingInputs = [...fsSettingsForm.querySelectorAll("[data-fs-field]")];
const fsTitleDisplay = document.querySelector("#fsTitleDisplay");
const fsDescriptionDisplay = document.querySelector("#fsDescriptionDisplay");
const fsConditionSummary = document.querySelector("#fsConditionSummary");
const roundDisplay = document.querySelector("#roundDisplay");
const progressValue = document.querySelector("#progressValue");
const targetProgressValue = document.querySelector("#targetProgressValue");
const progressBar = document.querySelector("#progressBar");
const statusBadge = document.querySelector("#statusBadge");
const fsWarnings = document.querySelector("#fsWarnings");
const undoButton = document.querySelector("#undoFs");
const redoButton = document.querySelector("#redoFs");
const advanceActorButton = document.querySelector("#advanceActor");
const newRoundButton = document.querySelector("#newRound");
const statusButtons = [...document.querySelectorAll("[data-set-status]")];
const addParticipantButton = document.querySelector("#addParticipant");
const participantList = document.querySelector("#participantList");
const boardRosterStatus = document.querySelector("#boardRosterStatus");
const judgmentForm = document.querySelector("#judgmentForm");
const entryTypeButtons = [...document.querySelectorAll("[data-entry-type]")];
const judgmentParticipant = document.querySelector("#judgmentParticipant");
const achievementInput = document.querySelector("#achievementInput");
const progressDeltaField = document.querySelector("#progressDeltaField");
const progressDeltaInput = document.querySelector("#progressDeltaInput");
const progressSuggestion = document.querySelector("#progressSuggestion");
const supportResultField = document.querySelector("#supportResultField");
const supportResultInput = document.querySelector("#supportResultInput");
const judgmentNote = document.querySelector("#judgmentNote");
const addAdjustmentButton = document.querySelector("#addAdjustment");
const historyList = document.querySelector("#historyList");
const newEventButton = document.querySelector("#newEvent");
const eventForm = document.querySelector("#eventForm");
const eventId = document.querySelector("#eventId");
const eventThreshold = document.querySelector("#eventThreshold");
const eventTitle = document.querySelector("#eventTitle");
const eventBody = document.querySelector("#eventBody");
const eventSkill = document.querySelector("#eventSkill");
const eventDifficulty = document.querySelector("#eventDifficulty");
const eventSupportCheck = document.querySelector("#eventSupportCheck");
const cancelEventButton = document.querySelector("#cancelEvent");
const eventList = document.querySelector("#eventList");
const exportFsButton = document.querySelector("#exportFs");
const importFsButton = document.querySelector("#importFs");
const importFsFile = document.querySelector("#importFsFile");
const resetFsButton = document.querySelector("#resetFs");
const openMiniWindowButton = document.querySelector("#openFsMiniWindow");
const miniWindowPlaceholder = document.querySelector("#miniWindowPlaceholder");
const restoreMiniWindowButton = document.querySelector("#restoreFsMiniWindow");
const compactViewControls = document.querySelector(".compact-view-controls");
const compactViewButtons = [...document.querySelectorAll("[data-compact-view]")];
const closeCompactButton = document.querySelector("#closeCompactFs");

const rollTableList = document.querySelector("#rollTableList");
const newRollTableButton = document.querySelector("#newRollTable");
const duplicateRollTableButton = document.querySelector("#duplicateRollTable");
const deleteRollTableButton = document.querySelector("#deleteRollTable");
const rollTableName = document.querySelector("#rollTableName");
const rollTableFormula = document.querySelector("#rollTableFormula");
const addRollTableRowButton = document.querySelector("#addRollTableRow");
const rollTableRows = document.querySelector("#rollTableRows");
const bulkRollTableInput = document.querySelector("#bulkRollTableInput");
const parseRollTableTextButton = document.querySelector("#parseRollTableText");
const rollTableMessages = document.querySelector("#rollTableMessages");
const rollTablePreview = document.querySelector("#rollTablePreview");
const copyRollTableCommandButton = document.querySelector("#copyRollTableCommand");
const copyRollTableStatus = document.querySelector("#copyRollTableStatus");
const exportRollTablesButton = document.querySelector("#exportRollTables");
const importRollTablesButton = document.querySelector("#importRollTables");
const importRollTablesFile = document.querySelector("#importRollTablesFile");
const rollTableImportMode = document.querySelector("#rollTableImportMode");

let state = normalizeFsState(readJsonStorage(FS_STORAGE_KEY) ?? createInitialFsState());
let rollTableLibrary = normalizeRollTableLibrary(readJsonStorage(ROLL_TABLE_STORAGE_KEY), createId);
let entryType = "progress";
let lastSuggestedDelta = 0;
let undoStack = [];
let redoStack = [];
let historyTransaction = null;
let applyingSharedState = false;
let miniWindow = null;
let miniWindowOpening = false;
let compactView = "progress";
const standaloneCompactMode = new URLSearchParams(window.location.search).get("compact") === "1";
let remoteSync = {
  enabled: false,
  loading: false,
  saving: false,
  timer: null,
  pollTimer: null,
  lastUpdatedAt: null,
  lastSerialized: null,
};

function createId(prefix) {
  if (crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readJsonStorage(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function serializeState() {
  return JSON.stringify(state);
}

function saveState() {
  const serialized = serializeState();
  localStorage.setItem(FS_STORAGE_KEY, serialized);
  queueRemoteSave();
  if (!applyingSharedState) {
    window.dispatchEvent(new CustomEvent("dx3rd-fs-state-change", { detail: serialized }));
  }
}

function queueRemoteSave() {
  if (!remoteSync.enabled || remoteSync.loading) {
    return;
  }
  window.clearTimeout(remoteSync.timer);
  remoteSync.timer = window.setTimeout(saveRemoteState, 350);
}

async function initializeRemoteState() {
  if (window.DX3RD_USE_PEER_SYNC || !window.fetch || window.location.protocol === "file:") {
    return;
  }
  remoteSync.loading = true;
  try {
    const response = await fetch(REMOTE_STATE_ENDPOINT, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    remoteSync.enabled = true;
    remoteSync.lastUpdatedAt = payload.updatedAt ?? null;
    if (payload.state) {
      state = normalizeFsState(payload.state);
      remoteSync.lastSerialized = serializeState();
      localStorage.setItem(FS_STORAGE_KEY, remoteSync.lastSerialized);
      render();
    } else {
      remoteSync.lastSerialized = serializeState();
      await saveRemoteState(true);
    }
    remoteSync.pollTimer = window.setInterval(refreshRemoteState, 2500);
  } catch (error) {
    console.warn("FS sync is unavailable.", error);
  } finally {
    remoteSync.loading = false;
  }
}

async function saveRemoteState(force = false) {
  if (!remoteSync.enabled || (remoteSync.loading && !force)) return;
  const serialized = serializeState();
  if (!force && serialized === remoteSync.lastSerialized) return;
  remoteSync.saving = true;
  try {
    const response = await fetch(REMOTE_STATE_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: serialized,
    });
    if (!response.ok) throw new Error(`Save failed: ${response.status}`);
    const payload = await response.json();
    remoteSync.lastUpdatedAt = payload.updatedAt ?? remoteSync.lastUpdatedAt;
    remoteSync.lastSerialized = serialized;
  } catch (error) {
    console.warn("FS state could not be saved.", error);
  } finally {
    remoteSync.saving = false;
  }
}

async function refreshRemoteState() {
  if (!remoteSync.enabled || remoteSync.loading || remoteSync.saving || isEditorActive()) return;
  try {
    const response = await fetch(REMOTE_STATE_ENDPOINT, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload.state || (payload.updatedAt && payload.updatedAt === remoteSync.lastUpdatedAt)) return;
    const next = normalizeFsState(payload.state);
    const serialized = JSON.stringify(next);
    if (serialized !== remoteSync.lastSerialized) {
      state = next;
      remoteSync.lastSerialized = serialized;
      localStorage.setItem(FS_STORAGE_KEY, serialized);
      render();
    }
    remoteSync.lastUpdatedAt = payload.updatedAt ?? remoteSync.lastUpdatedAt;
  } catch (error) {
    console.warn("FS state could not be refreshed.", error);
  }
}

function applySharedState(candidate) {
  if (isEditorActive()) return false;
  const next = normalizeFsState(candidate);
  applyingSharedState = true;
  try {
    undoStack = undoStack.map((snapshot) => rebaseSnapshot(snapshot, state, next));
    redoStack = redoStack.map((snapshot) => rebaseSnapshot(snapshot, state, next));
    if (historyTransaction != null) {
      historyTransaction = rebaseSnapshot(historyTransaction, state, next);
    }
    state = next;
    localStorage.setItem(FS_STORAGE_KEY, serializeState());
    render();
  } finally {
    applyingSharedState = false;
  }
  return true;
}

function rebaseSnapshot(snapshot, currentState, nextState) {
  try {
    return JSON.stringify(mergeFsStates(currentState, JSON.parse(snapshot), nextState));
  } catch {
    return snapshot;
  }
}

function applyBoardRoster(boardTokens) {
  const tokens = (Array.isArray(boardTokens) ? boardTokens : [])
    .filter((token) => token?.type === "pc" && token.id != null)
    .map((token) => ({
      id: `board-${String(token.id)}`,
      source: "board",
      boardTokenId: String(token.id),
      name: token.name == null ? "" : String(token.name),
      initiative: clampInteger(token.initiative, -99, 999, 0),
    }));
  const existing = new Map(
    state.participants
      .filter((participant) => participant.source === "board")
      .map((participant) => [participant.boardTokenId, participant]),
  );
  const linked = tokens.map((token) => ({
    ...token,
    turnState: existing.get(token.boardTokenId)?.turnState ?? "ready",
  }));
  const extras = state.participants.filter((participant) => participant.source === "extra");
  const next = normalizeFsState({ ...state, participants: [...linked, ...extras] });
  const changed = JSON.stringify(next.participants) !== JSON.stringify(state.participants);
  state = next;
  boardRosterStatus.textContent = linked.length > 0
    ? `戦闘ボードのPC ${linked.length}名を参照中`
    : "戦闘ボードにPCが登録されていません。";
  if (changed) {
    saveState();
    renderParticipants();
    renderJudgmentParticipants();
  }
  return changed;
}

function isEditorActive() {
  return [document, fsWorkspace.ownerDocument].some((ownerDocument) =>
    ownerDocument.activeElement?.matches?.("input, textarea, select"),
  );
}

function beginHistoryTransaction() {
  if (historyTransaction == null) historyTransaction = serializeState();
}

function commitHistoryTransaction() {
  if (historyTransaction == null) return;
  const before = historyTransaction;
  historyTransaction = null;
  if (before !== serializeState()) {
    undoStack.push(before);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  }
  renderHistoryControls();
}

function mutate(mutator, renderAfter = render) {
  const before = serializeState();
  mutator();
  state = normalizeFsState(state);
  if (before === serializeState()) return false;
  undoStack.push(before);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
  saveState();
  renderAfter();
  return true;
}

function undo() {
  commitHistoryTransaction();
  const snapshot = undoStack.pop();
  if (!snapshot) return;
  redoStack.push(serializeState());
  state = normalizeFsState(JSON.parse(snapshot));
  saveState();
  render();
}

function redo() {
  commitHistoryTransaction();
  const snapshot = redoStack.pop();
  if (!snapshot) return;
  undoStack.push(serializeState());
  state = normalizeFsState(JSON.parse(snapshot));
  saveState();
  render();
}

function render() {
  renderSettings();
  renderProgress();
  renderParticipants();
  renderJudgmentParticipants();
  renderHistory();
  renderEvents();
  renderHistoryControls();
}

function renderSettings() {
  settingInputs.forEach((input) => {
    if (input.ownerDocument.activeElement !== input) {
      input.value = state[input.dataset.fsField] ?? "";
    }
  });
}

function renderProgress() {
  const progress = calculateProgress(state);
  fsTitleDisplay.textContent = state.title || "名称未設定";
  fsDescriptionDisplay.textContent = state.description || "判定内容は未設定です。";
  const conditionLabels = [
    `判定: ${state.skill || "技能未設定"}`,
    `難易度 ${state.difficulty}`,
    `最大達成値 ${state.maxAchievement}`,
  ];
  if (state.supportCheck) conditionLabels.push(`支援: ${state.supportCheck}`);
  if (state.endCondition) conditionLabels.push(`終了条件: ${state.endCondition}`);
  if (state.experiencePoints > 0) conditionLabels.push(`経験点 ${state.experiencePoints}`);
  fsConditionSummary.innerHTML = conditionLabels
    .map((label) => `<span>${escapeHtml(label)}</span>`)
    .join("");
  roundDisplay.textContent = `${state.round} / ${state.roundLimit}`;
  progressValue.textContent = String(progress);
  targetProgressValue.textContent = String(state.targetProgress);
  progressBar.style.width = `${Math.max(0, Math.min(100, (progress / state.targetProgress) * 100))}%`;
  const statusLabels = { active: "進行中", success: "成功", failure: "失敗" };
  statusBadge.dataset.status = state.status;
  statusBadge.textContent = statusLabels[state.status];
  statusButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.setStatus === state.status));
  });

  const warnings = [];
  if (progress >= state.targetProgress) warnings.push("終了進行値に到達");
  if (state.round >= state.roundLimit) warnings.push("ラウンド制限に到達");
  const reachedUnrevealed = state.events.filter((event) => progress >= event.threshold && !event.revealed).length;
  if (reachedUnrevealed > 0) warnings.push(`公開待ちイベント ${reachedUnrevealed}件`);
  fsWarnings.innerHTML = warnings.map((label) => `<span class="warning-chip">${escapeHtml(label)}</span>`).join("");
}

function getSortedParticipants() {
  return [...state.participants].sort((left, right) =>
    right.initiative - left.initiative || left.name.localeCompare(right.name, "ja"),
  );
}

function renderParticipants() {
  const participants = getSortedParticipants();
  if (participants.length === 0) {
    participantList.innerHTML = '<p class="empty-state">参加者はいません。</p>';
    return;
  }
  participantList.innerHTML = participants.map((participant) => {
    const currentClass = participant.id === state.currentParticipantId ? " current" : "";
    const identity = participant.source === "board"
      ? `<div class="participant-identity"><div class="participant-name">${escapeHtml(participant.name || "名称なし")}</div><span class="source-label">戦闘ボードPC</span></div><span class="source-label">参照中</span>`
      : `<div class="participant-identity"><input aria-label="参加者名" data-participant-field="name" data-participant-id="${escapeAttribute(participant.id)}" type="text" maxlength="80" value="${escapeAttribute(participant.name)}" /></div><input aria-label="行動値" data-participant-field="initiative" data-participant-id="${escapeAttribute(participant.id)}" type="number" min="-99" max="999" value="${participant.initiative}" />`;
    return `<div class="participant-row${currentClass}" data-participant-id="${escapeAttribute(participant.id)}" data-turn-state="${participant.turnState}">
      <button class="initiative-value" type="button" data-current-participant="${escapeAttribute(participant.id)}" title="手番に指定">${participant.initiative}</button>
      ${identity}
      <div class="turn-state-control" role="group" aria-label="${escapeAttribute(participant.name || "参加者")}の状態">
        ${renderTurnStateButton(participant, "ready", "未行動")}
        ${renderTurnStateButton(participant, "waiting", "待機")}
        ${renderTurnStateButton(participant, "acted", "行動済")}
      </div>
      ${participant.source === "extra" ? `<button class="danger row-delete" type="button" data-delete-participant="${escapeAttribute(participant.id)}">削除</button>` : "<span></span>"}
    </div>`;
  }).join("");
}

function renderTurnStateButton(participant, value, label) {
  return `<button type="button" data-participant-state="${value}" data-participant-id="${escapeAttribute(participant.id)}" aria-pressed="${participant.turnState === value}">${label}</button>`;
}

function renderJudgmentParticipants() {
  const previous = judgmentParticipant.value;
  const options = [
    '<option value="">GM調整</option>',
    ...getSortedParticipants().map((participant) =>
      `<option value="${escapeAttribute(participant.id)}">${escapeHtml(participant.name || "名称なし")}（行動値${participant.initiative}）</option>`,
    ),
  ];
  judgmentParticipant.innerHTML = options.join("");
  if ([...judgmentParticipant.options].some((option) => option.value === previous)) {
    judgmentParticipant.value = previous;
  } else if (state.currentParticipantId) {
    judgmentParticipant.value = state.currentParticipantId;
  }
}

function renderHistory() {
  const entries = [...state.history].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
  if (entries.length === 0) {
    historyList.innerHTML = '<p class="empty-state">判定履歴はありません。</p>';
    return;
  }
  const kindLabels = { progress: "進行", support: "支援" };
  historyList.innerHTML = entries.map((entry) => {
    const detail = entry.type === "support"
      ? `${entry.achievement == null ? "達成値なし" : `達成値 ${entry.achievement}`}・${entry.success ? "成功" : "失敗"}`
      : `${entry.achievement == null ? "手動調整" : `達成値 ${entry.achievement}`}${entry.note ? `・${entry.note}` : ""}`;
    const delta = entry.type === "support" ? "" : `<strong class="history-delta">${formatSigned(entry.delta)}</strong>`;
    return `<div class="history-row">
      <span class="history-kind ${entry.type}">${kindLabels[entry.type]}</span>
      <div class="history-main"><strong>${escapeHtml(entry.participantName || "GM")}</strong><span>${escapeHtml(detail)}</span></div>
      ${delta || '<span class="history-delta-spacer"></span>'}
      <time class="history-time" datetime="${escapeAttribute(entry.createdAt)}">${formatDateTime(entry.createdAt)}</time>
      <button class="danger row-delete" type="button" data-delete-history="${escapeAttribute(entry.id)}">削除</button>
    </div>`;
  }).join("");
}

function renderEvents() {
  const progress = calculateProgress(state);
  const events = [...state.events].sort((left, right) => left.threshold - right.threshold || left.title.localeCompare(right.title, "ja"));
  if (events.length === 0) {
    eventList.innerHTML = '<p class="empty-state">進行イベントはありません。</p>';
    return;
  }
  eventList.innerHTML = events.map((event) => {
    const reached = progress >= event.threshold;
    const classes = ["event-card", reached ? "reached" : "", event.revealed ? "revealed" : ""].filter(Boolean).join(" ");
    const stateLabel = event.revealed ? "公開済み" : reached ? "公開待ち" : "未到達";
    const changes = event.revealed ? renderEventChanges(event) : "";
    const body = event.revealed
      ? `<div class="event-body">${escapeHtml(event.body || "内容なし")}${changes}</div>`
      : "";
    return `<article class="${classes}">
      <div class="event-card-header"><span class="event-threshold">${event.threshold}</span><span class="event-name">${escapeHtml(event.title || "名称なし")}</span><span class="event-state">${stateLabel}</span></div>
      ${body}
      <div class="event-actions">
        <button type="button" data-toggle-event="${escapeAttribute(event.id)}" ${!reached && !event.revealed ? "disabled" : ""}>${event.revealed ? "非公開" : "公開"}</button>
        ${event.revealed && hasEventChanges(event) ? `<button type="button" class="ghost" data-apply-event="${escapeAttribute(event.id)}">設定へ反映</button>` : ""}
        <button type="button" class="ghost" data-edit-event="${escapeAttribute(event.id)}">編集</button>
        <button type="button" class="danger" data-delete-event="${escapeAttribute(event.id)}">削除</button>
      </div>
    </article>`;
  }).join("");
}

function renderEventChanges(event) {
  const labels = [];
  if (event.newSkill) labels.push(`技能: ${event.newSkill}`);
  if (event.newDifficulty != null) labels.push(`難易度: ${event.newDifficulty}`);
  if (event.newSupportCheck) labels.push(`支援: ${event.newSupportCheck}`);
  if (labels.length === 0) return "";
  return `<div class="event-changes">${labels.map((label) => `<span class="event-change">${escapeHtml(label)}</span>`).join("")}</div>`;
}

function hasEventChanges(event) {
  return Boolean(event.newSkill || event.newDifficulty != null || event.newSupportCheck);
}

function renderHistoryControls() {
  undoButton.disabled = undoStack.length === 0 && historyTransaction == null;
  redoButton.disabled = redoStack.length === 0;
}

function updateNavigationLink() {
  const destination = new URL("../", window.location.href);
  destination.searchParams.delete("compact");
  destination.hash = window.location.hash;
  battlePageLink.href = destination.href;
}

function updateSetting(input) {
  const field = input.dataset.fsField;
  if (!field) return;
  if (input.type === "number") {
    if (input.value === "") return;
    state[field] = Number(input.value);
  } else {
    state[field] = input.value;
  }
  state = normalizeFsState(state);
  saveState();
  renderProgress();
  updateProgressSuggestion();
  renderEvents();
}

function advanceActor() {
  mutate(() => {
    const current = state.participants.find((participant) => participant.id === state.currentParticipantId);
    if (current && current.turnState !== "acted") current.turnState = "acted";
    const sorted = getSortedParticipants();
    let next = sorted.find((participant) => participant.turnState === "ready");
    next ??= sorted.find((participant) => participant.turnState === "waiting");
    if (!next && sorted.length > 0) {
      state.round += 1;
      state.participants.forEach((participant) => {
        participant.turnState = "ready";
      });
      next = getSortedParticipants()[0];
    }
    state.currentParticipantId = next?.id ?? null;
  });
}

function startNewRound() {
  mutate(() => {
    state.round += 1;
    state.currentParticipantId = null;
    state.participants.forEach((participant) => {
      participant.turnState = "ready";
    });
  });
}

function updateEntryType(nextType) {
  entryType = nextType === "support" ? "support" : "progress";
  entryTypeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.entryType === entryType));
  });
  progressDeltaField.hidden = entryType !== "progress";
  supportResultField.hidden = entryType !== "support";
  updateProgressSuggestion(true);
}

function updateProgressSuggestion(force = false) {
  const achievement = achievementInput.value === "" ? null : Number(achievementInput.value);
  const suggestion = achievement == null
    ? 0
    : suggestProgressDelta(achievement, state.difficulty, state.maxAchievement);
  if (entryType === "progress") {
    if (force || progressDeltaInput.value === "" || Number(progressDeltaInput.value) === lastSuggestedDelta) {
      progressDeltaInput.value = String(suggestion);
    }
    progressSuggestion.textContent = achievement == null
      ? ""
      : `候補 ${formatSigned(suggestion)}（難易度${state.difficulty}・上限${state.maxAchievement}）`;
  } else if (achievement != null) {
    supportResultInput.value = achievement >= state.difficulty ? "success" : "failure";
  }
  lastSuggestedDelta = suggestion;
}

function recordJudgment(event) {
  event.preventDefault();
  const participant = state.participants.find((item) => item.id === judgmentParticipant.value);
  const achievement = achievementInput.value === "" ? null : Number(achievementInput.value);
  if (achievement == null || !Number.isFinite(achievement)) {
    achievementInput.focus();
    return;
  }
  const delta = entryType === "progress" ? Number(progressDeltaInput.value) : 0;
  if (entryType === "progress" && !Number.isFinite(delta)) {
    progressDeltaInput.focus();
    return;
  }
  mutate(() => {
    state.history.push({
      id: createId("history"),
      type: entryType,
      participantId: participant?.id ?? null,
      participantName: participant?.name || "GM",
      achievement,
      delta,
      success: entryType === "support" ? supportResultInput.value === "success" : achievement >= state.difficulty,
      note: judgmentNote.value,
      createdAt: new Date().toISOString(),
    });
    if (participant) participant.turnState = "acted";
  });
  achievementInput.value = "";
  judgmentNote.value = "";
  updateProgressSuggestion(true);
}

function addAdjustment() {
  const rawDelta = window.prompt("加減する進行値を入力してください。", "0");
  if (rawDelta == null) return;
  const delta = Number(rawDelta);
  if (!Number.isInteger(delta) || delta < -999 || delta > 999) {
    window.alert("-999から999までの整数を入力してください。");
    return;
  }
  const note = window.prompt("調整理由を入力してください。", "") ?? "";
  mutate(() => {
    state.history.push({
      id: createId("history"),
      type: "progress",
      participantId: null,
      participantName: "GM",
      achievement: null,
      delta,
      success: null,
      note: note || "手動調整",
      createdAt: new Date().toISOString(),
    });
  });
}

function openEventEditor(event = null) {
  eventForm.hidden = false;
  eventId.value = event?.id ?? "";
  eventThreshold.value = event?.threshold ?? calculateProgress(state);
  eventTitle.value = event?.title ?? "";
  eventBody.value = event?.body ?? "";
  eventSkill.value = event?.newSkill ?? "";
  eventDifficulty.value = event?.newDifficulty ?? "";
  eventSupportCheck.value = event?.newSupportCheck ?? "";
  eventTitle.focus();
}

function closeEventEditor() {
  eventForm.hidden = true;
  eventForm.reset();
  eventId.value = "";
}

function saveEvent(event) {
  event.preventDefault();
  if (!eventTitle.value.trim()) {
    eventTitle.focus();
    return;
  }
  const id = eventId.value;
  mutate(() => {
    const current = state.events.find((item) => item.id === id);
    const value = {
      id: current?.id ?? createId("event"),
      threshold: Number(eventThreshold.value) || 0,
      title: eventTitle.value,
      body: eventBody.value,
      newSkill: eventSkill.value,
      newDifficulty: eventDifficulty.value === "" ? null : Number(eventDifficulty.value),
      newSupportCheck: eventSupportCheck.value,
      revealed: current?.revealed ?? false,
    };
    if (current) Object.assign(current, value);
    else state.events.push(value);
  });
  closeEventEditor();
}

function applyEventChanges(eventItem) {
  mutate(() => {
    if (eventItem.newSkill) state.skill = eventItem.newSkill;
    if (eventItem.newDifficulty != null) state.difficulty = eventItem.newDifficulty;
    if (eventItem.newSupportCheck) state.supportCheck = eventItem.newSupportCheck;
  });
}

function exportFsState() {
  downloadJson(`dx3rd-fs-${dateStamp()}.json`, {
    format: "dx3rd-fs",
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  });
}

async function importFsState(file) {
  try {
    const payload = JSON.parse(await file.text());
    const candidate = payload?.format === "dx3rd-fs" ? payload.state : payload;
    mutate(() => {
      state = normalizeFsState(candidate);
    });
  } catch {
    window.alert("FSデータを読み込めませんでした。JSONファイルを確認してください。");
  } finally {
    importFsFile.value = "";
  }
}

function resetFsState() {
  if (!window.confirm("FS判定の設定、参加者の状態、イベント、履歴を初期化しますか？")) return;
  mutate(() => {
    const boardParticipants = state.participants
      .filter((participant) => participant.source === "board")
      .map((participant) => ({ ...participant, turnState: "ready" }));
    state = { ...createInitialFsState(), participants: boardParticipants };
  });
}

function saveRollTableLibrary() {
  localStorage.setItem(ROLL_TABLE_STORAGE_KEY, JSON.stringify(rollTableLibrary));
}

function getSelectedRollTable() {
  return rollTableLibrary.tables.find((table) => table.id === rollTableLibrary.selectedTableId)
    ?? rollTableLibrary.tables[0]
    ?? null;
}

function renderRollTableLibrary() {
  const selected = getSelectedRollTable();
  rollTableList.innerHTML = rollTableLibrary.tables.map((table) =>
    `<button type="button" class="roll-table-choice${table.id === selected?.id ? " active" : ""}" data-select-roll-table="${escapeAttribute(table.id)}" title="${escapeAttribute(table.name || "名称未設定")}">${escapeHtml(table.name || "名称未設定")}</button>`,
  ).join("");
  if (!selected) return;
  rollTableName.value = selected.name;
  rollTableFormula.value = selected.formula;
  renderRollTableRows();
  renderRollTableValidation();
  deleteRollTableButton.disabled = rollTableLibrary.tables.length <= 1;
}

function renderRollTableRows() {
  const table = getSelectedRollTable();
  if (!table || table.rows.length === 0) {
    rollTableRows.innerHTML = '<p class="empty-state">出目行はありません。</p>';
    return;
  }
  rollTableRows.innerHTML = table.rows.map((row, index) => `<div class="roll-table-row" data-roll-row-id="${escapeAttribute(row.id)}">
    <input aria-label="出目または範囲" data-roll-row-field="range" type="text" inputmode="numeric" spellcheck="false" value="${escapeAttribute(row.range)}" />
    <textarea aria-label="結果" data-roll-row-field="text" rows="1">${escapeHtml(row.text)}</textarea>
    <div class="row-actions">
      <button type="button" class="ghost" data-move-roll-row="up" title="上へ" aria-label="上へ" ${index === 0 ? "disabled" : ""}>↑</button>
      <button type="button" class="ghost" data-move-roll-row="down" title="下へ" aria-label="下へ" ${index === table.rows.length - 1 ? "disabled" : ""}>↓</button>
      <button type="button" class="danger" data-delete-roll-row title="削除" aria-label="削除">×</button>
    </div>
  </div>`).join("");
}

function renderRollTableValidation() {
  const table = getSelectedRollTable();
  if (!table) return;
  const result = generateRollTableCommand(table);
  const messages = [
    ...result.errors.map((message) => ({ message, type: "error" })),
    ...result.warnings.map((message) => ({ message, type: "warning" })),
  ];
  if (messages.length === 0) messages.push({ message: "ココフォリア用コマンドを生成できます。", type: "valid" });
  rollTableMessages.innerHTML = messages.map(({ message, type }) =>
    `<div class="validation-message ${type}">${escapeHtml(message)}</div>`,
  ).join("");
  rollTablePreview.value = result.command || createDraftRollTableCommand(table);
  copyRollTableCommandButton.disabled = !result.valid;
}

function createDraftRollTableCommand(table) {
  return [
    "/roll-table",
    table.name,
    table.formula,
    ...table.rows.map((row) => `${row.range}:${String(row.text).replace(/\r\n?|\n/g, "\\n")}`),
  ].join("\n");
}

function addRollTable() {
  const table = createInitialRollTable(createId);
  rollTableLibrary.tables.push(table);
  rollTableLibrary.selectedTableId = table.id;
  saveRollTableLibrary();
  renderRollTableLibrary();
  rollTableName.focus();
  rollTableName.select();
}

function duplicateRollTable() {
  const selected = getSelectedRollTable();
  if (!selected) return;
  const copy = {
    ...structuredClone(selected),
    id: createId("table"),
    name: `${selected.name || "名称未設定"} のコピー`,
    rows: selected.rows.map((row) => ({ ...row, id: createId("row") })),
  };
  rollTableLibrary.tables.push(copy);
  rollTableLibrary.selectedTableId = copy.id;
  saveRollTableLibrary();
  renderRollTableLibrary();
}

function deleteRollTable() {
  if (rollTableLibrary.tables.length <= 1) return;
  const selected = getSelectedRollTable();
  if (!selected || !window.confirm(`「${selected.name || "名称未設定"}」を削除しますか？`)) return;
  const index = rollTableLibrary.tables.findIndex((table) => table.id === selected.id);
  rollTableLibrary.tables.splice(index, 1);
  rollTableLibrary.selectedTableId = rollTableLibrary.tables[Math.max(0, index - 1)].id;
  saveRollTableLibrary();
  renderRollTableLibrary();
}

function updateSelectedRollTableMeta() {
  const table = getSelectedRollTable();
  if (!table) return;
  table.name = rollTableName.value;
  table.formula = rollTableFormula.value.toUpperCase();
  saveRollTableLibrary();
  const choice = rollTableList.querySelector(`[data-select-roll-table="${cssEscape(table.id)}"]`);
  if (choice) {
    choice.textContent = table.name || "名称未設定";
    choice.title = table.name || "名称未設定";
  }
  renderRollTableValidation();
}

function addRollTableRow() {
  const table = getSelectedRollTable();
  if (!table) return;
  table.rows.push({ id: createId("row"), range: "", text: "" });
  saveRollTableLibrary();
  renderRollTableRows();
  renderRollTableValidation();
  rollTableRows.querySelector(".roll-table-row:last-child input")?.focus();
}

function importRollTableText() {
  const selected = getSelectedRollTable();
  if (!selected) return;
  const result = parseRollTableText(bulkRollTableInput.value, selected, createId);
  if (!result.ok) {
    rollTableMessages.innerHTML = result.errors.map((message) => `<div class="validation-message error">${escapeHtml(message)}</div>`).join("");
    return;
  }
  Object.assign(selected, result.table, { id: selected.id });
  saveRollTableLibrary();
  bulkRollTableInput.value = "";
  renderRollTableLibrary();
}

async function copyRollTableCommand() {
  const result = generateRollTableCommand(getSelectedRollTable());
  if (!result.valid) return;
  let copied = false;
  try {
    await navigator.clipboard.writeText(result.command);
    copied = true;
  } catch {
    rollTablePreview.focus();
    rollTablePreview.select();
    copied = document.execCommand?.("copy") ?? false;
  }
  copyRollTableStatus.textContent = copied
    ? "コピーしました。"
    : "生成結果を選択しました。手動でコピーしてください。";
  window.setTimeout(() => {
    copyRollTableStatus.textContent = "";
  }, 2200);
}

function exportRollTableLibrary() {
  downloadJson(`dx3rd-roll-tables-${dateStamp()}.json`, {
    format: "dx3rd-roll-table-library",
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: rollTableLibrary.tables,
  });
}

async function importRollTableLibrary(file) {
  try {
    const payload = JSON.parse(await file.text());
    const sourceTables = Array.isArray(payload?.tables)
      ? payload.tables
      : payload?.table
        ? [payload.table]
        : Array.isArray(payload)
          ? payload
          : [];
    if (sourceTables.length === 0) throw new Error("No tables");
    rollTableLibrary = mergeRollTableLibraryImport(
      rollTableLibrary,
      sourceTables,
      rollTableImportMode.value,
      createId,
    );
    saveRollTableLibrary();
    renderRollTableLibrary();
  } catch {
    window.alert("ダイス表を読み込めませんでした。JSONファイルを確認してください。");
  } finally {
    importRollTablesFile.value = "";
  }
}

function setCompactView(nextView) {
  compactView = nextView === "participants" ? "participants" : "progress";
  compactViewButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.compactView === compactView));
  });
  const compactDocument = fsWorkspace.ownerDocument;
  compactDocument.body.dataset.compactView = compactView;
}

function getCompactViewUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("compact", "1");
  return url.href;
}

function openFallbackCompactWindow() {
  const popup = window.open(
    getCompactViewUrl(),
    "dx3rd-fs-compact",
    "popup,width=560,height=720,resizable=yes,scrollbars=yes",
  );
  if (!popup) window.alert("小窓を開けませんでした。ポップアップ許可を確認してください。");
  else popup.focus();
}

async function openMiniWindow() {
  if (miniWindowOpening) return;
  if (standaloneCompactMode) {
    closeCompactWindow();
    return;
  }
  if (miniWindow && !miniWindow.closed) {
    miniWindow.close();
    return;
  }
  if (typeof window.documentPictureInPicture?.requestWindow !== "function") {
    openFallbackCompactWindow();
    return;
  }
  miniWindowOpening = true;
  openMiniWindowButton.disabled = true;
  try {
    const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 560, height: 720 });
    const pipDocument = pipWindow.document;
    const viewport = pipDocument.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1.0";
    const stylesheet = pipDocument.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = document.querySelector('link[rel="stylesheet"]').href;
    pipDocument.head.append(viewport, stylesheet);
    pipDocument.title = "DX3rd FS判定 - 小窓";
    pipDocument.documentElement.lang = "ja";
    pipDocument.body.className = "compact-mode";
    miniWindow = pipWindow;
    miniWindowPlaceholder.hidden = false;
    compactViewControls.hidden = false;
    pipDocument.body.append(fsWorkspace);
    pipWindow.addEventListener("keydown", handleGlobalKeyDown);
    pipWindow.addEventListener("pagehide", restoreMainWindow, { once: true });
    setCompactView(compactView);
  } catch (error) {
    console.warn("FS compact window could not be opened.", error);
    window.alert("小窓を開けませんでした。ブラウザの設定を確認してください。");
  } finally {
    miniWindowOpening = false;
    openMiniWindowButton.disabled = false;
  }
}

function restoreMainWindow() {
  const closingWindow = miniWindow;
  if (closingWindow) closingWindow.removeEventListener("keydown", handleGlobalKeyDown);
  if (fsWorkspace.ownerDocument !== document) fsLayout.append(fsWorkspace);
  miniWindow = null;
  miniWindowPlaceholder.hidden = true;
  compactViewControls.hidden = true;
}

function closeCompactWindow() {
  if (standaloneCompactMode) {
    if (window.opener && !window.opener.closed) {
      window.opener.focus();
      window.close();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete("compact");
      window.location.assign(url.href);
    }
    return;
  }
  if (miniWindow && !miniWindow.closed) miniWindow.close();
}

function initializeStandaloneCompactMode() {
  if (!standaloneCompactMode) return;
  document.body.classList.add("compact-mode");
  compactViewControls.hidden = false;
  setCompactView(compactView);
}

function handleGlobalKeyDown(event) {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || event.altKey) return;
  if (event.key.toLowerCase() === "z" || event.code === "KeyZ") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (event.key.toLowerCase() === "y" || event.code === "KeyY") {
    event.preventDefault();
    redo();
  }
}

settingInputs.forEach((input) => {
  input.addEventListener("focus", beginHistoryTransaction);
  input.addEventListener("input", () => updateSetting(input));
  input.addEventListener("blur", () => {
    state = normalizeFsState(state);
    saveState();
    commitHistoryTransaction();
    render();
  });
});

undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
advanceActorButton.addEventListener("click", advanceActor);
newRoundButton.addEventListener("click", startNewRound);
statusButtons.forEach((button) => {
  button.addEventListener("click", () => mutate(() => {
    state.status = button.dataset.setStatus;
  }));
});
addParticipantButton.addEventListener("click", () => mutate(() => {
  state.participants.push({
    id: createId("participant"),
    source: "extra",
    boardTokenId: null,
    name: "追加参加者",
    initiative: 0,
    turnState: "ready",
  });
}));

participantList.addEventListener("click", (event) => {
  const setCurrent = event.target.closest("[data-current-participant]");
  const setState = event.target.closest("[data-participant-state]");
  const remove = event.target.closest("[data-delete-participant]");
  if (setCurrent) {
    mutate(() => {
      state.currentParticipantId = setCurrent.dataset.currentParticipant;
    });
  } else if (setState) {
    mutate(() => {
      const participant = state.participants.find((item) => item.id === setState.dataset.participantId);
      if (participant) participant.turnState = setState.dataset.participantState;
    });
  } else if (remove) {
    mutate(() => {
      state.participants = state.participants.filter((item) => item.id !== remove.dataset.deleteParticipant);
    });
  }
});

participantList.addEventListener("focusin", (event) => {
  if (event.target.matches("[data-participant-field]")) beginHistoryTransaction();
});
participantList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-participant-field]");
  if (!input || (input.type === "number" && input.value === "")) return;
  const participant = state.participants.find((item) => item.id === input.dataset.participantId);
  if (!participant || participant.source !== "extra") return;
  participant[input.dataset.participantField] = input.type === "number" ? Number(input.value) : input.value;
  saveState();
  renderJudgmentParticipants();
});
participantList.addEventListener("focusout", (event) => {
  if (!event.target.matches("[data-participant-field]")) return;
  state = normalizeFsState(state);
  saveState();
  commitHistoryTransaction();
  render();
});

entryTypeButtons.forEach((button) => {
  button.addEventListener("click", () => updateEntryType(button.dataset.entryType));
});
achievementInput.addEventListener("input", () => updateProgressSuggestion());
judgmentForm.addEventListener("submit", recordJudgment);
addAdjustmentButton.addEventListener("click", addAdjustment);
historyList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-history]");
  if (!button) return;
  mutate(() => {
    state.history = state.history.filter((entry) => entry.id !== button.dataset.deleteHistory);
  });
});

newEventButton.addEventListener("click", () => openEventEditor());
cancelEventButton.addEventListener("click", closeEventEditor);
eventForm.addEventListener("submit", saveEvent);
eventList.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-event]");
  const edit = event.target.closest("[data-edit-event]");
  const remove = event.target.closest("[data-delete-event]");
  const apply = event.target.closest("[data-apply-event]");
  const id = toggle?.dataset.toggleEvent ?? edit?.dataset.editEvent ?? remove?.dataset.deleteEvent ?? apply?.dataset.applyEvent;
  const item = state.events.find((entry) => entry.id === id);
  if (!item) return;
  if (toggle) mutate(() => { item.revealed = !item.revealed; });
  else if (edit) openEventEditor(item);
  else if (apply) applyEventChanges(item);
  else if (remove && window.confirm(`「${item.title || "名称なし"}」を削除しますか？`)) {
    mutate(() => { state.events = state.events.filter((entry) => entry.id !== item.id); });
  }
});

exportFsButton.addEventListener("click", exportFsState);
importFsButton.addEventListener("click", () => importFsFile.click());
importFsFile.addEventListener("change", () => {
  const [file] = importFsFile.files;
  if (file) importFsState(file);
});
resetFsButton.addEventListener("click", resetFsState);

newRollTableButton.addEventListener("click", addRollTable);
duplicateRollTableButton.addEventListener("click", duplicateRollTable);
deleteRollTableButton.addEventListener("click", deleteRollTable);
rollTableList.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-select-roll-table]");
  if (!choice) return;
  rollTableLibrary.selectedTableId = choice.dataset.selectRollTable;
  saveRollTableLibrary();
  renderRollTableLibrary();
});
rollTableName.addEventListener("input", updateSelectedRollTableMeta);
rollTableFormula.addEventListener("input", updateSelectedRollTableMeta);
addRollTableRowButton.addEventListener("click", addRollTableRow);
rollTableRows.addEventListener("input", (event) => {
  const input = event.target.closest("[data-roll-row-field]");
  const rowElement = event.target.closest("[data-roll-row-id]");
  const table = getSelectedRollTable();
  const row = table?.rows.find((item) => item.id === rowElement?.dataset.rollRowId);
  if (!input || !row) return;
  row[input.dataset.rollRowField] = input.value;
  saveRollTableLibrary();
  renderRollTableValidation();
});
rollTableRows.addEventListener("click", (event) => {
  const rowElement = event.target.closest("[data-roll-row-id]");
  const table = getSelectedRollTable();
  if (!rowElement || !table) return;
  const index = table.rows.findIndex((row) => row.id === rowElement.dataset.rollRowId);
  if (index < 0) return;
  const direction = event.target.closest("[data-move-roll-row]")?.dataset.moveRollRow;
  if (direction === "up" && index > 0) {
    [table.rows[index - 1], table.rows[index]] = [table.rows[index], table.rows[index - 1]];
  } else if (direction === "down" && index < table.rows.length - 1) {
    [table.rows[index + 1], table.rows[index]] = [table.rows[index], table.rows[index + 1]];
  } else if (event.target.closest("[data-delete-roll-row]")) {
    table.rows.splice(index, 1);
  } else {
    return;
  }
  saveRollTableLibrary();
  renderRollTableRows();
  renderRollTableValidation();
});
parseRollTableTextButton.addEventListener("click", importRollTableText);
copyRollTableCommandButton.addEventListener("click", copyRollTableCommand);
exportRollTablesButton.addEventListener("click", exportRollTableLibrary);
importRollTablesButton.addEventListener("click", () => importRollTablesFile.click());
importRollTablesFile.addEventListener("change", () => {
  const [file] = importRollTablesFile.files;
  if (file) importRollTableLibrary(file);
});

openMiniWindowButton.addEventListener("click", openMiniWindow);
restoreMiniWindowButton.addEventListener("click", closeCompactWindow);
closeCompactButton.addEventListener("click", closeCompactWindow);
compactViewButtons.forEach((button) => {
  button.addEventListener("click", () => setCompactView(button.dataset.compactView));
});
window.addEventListener("keydown", handleGlobalKeyDown);
window.addEventListener("hashchange", updateNavigationLink);

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function dateStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSigned(value) {
  const number = Number(value) || 0;
  return number >= 0 ? `+${number}` : String(number);
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replaceAll('"', '\\"');
}

window.DX3RDFS = Object.freeze({
  applyBoardRoster,
  applySharedState,
  serializeState,
});

updateNavigationLink();
render();
renderRollTableLibrary();
updateEntryType("progress");
initializeStandaloneCompactMode();
initializeRemoteState();
window.dispatchEvent(new CustomEvent("dx3rd-fs-ready"));
