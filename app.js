const MAX_PC = 5;
const MAX_ENEMY = 10;
const TOKEN_SIZE = 58;
const MIN_DRAW_SIZE = 10;
const HISTORY_LIMIT = 50;
const STORAGE_KEY = "dx3rd-combat-board-v3";
const LEGACY_STORAGE_KEY = "dx3rd-combat-board-v2";
const OLDER_STORAGE_KEY = "dx3rd-combat-board-v1";
const REMOTE_STATE_ENDPOINT = "/api/board";

const board = document.querySelector("#board");
const terrainLayer = document.querySelector("#terrainLayer");
const shapeLayer = document.querySelector("#shapeLayer");
const engageLayer = document.querySelector("#engageLayer");
const tokenLayer = document.querySelector("#tokenLayer");
const roster = document.querySelector("#roster");
const counts = document.querySelector("#counts");
const initiativeList = document.querySelector("#initiativeList");
const addEngageButton = document.querySelector("#addEngage");
const addPcButton = document.querySelector("#addPc");
const addEnemyButton = document.querySelector("#addEnemy");
const resetButton = document.querySelector("#resetBoard");
const exportButton = document.querySelector("#exportBoard");
const importButton = document.querySelector("#importBoard");
const importFile = document.querySelector("#importFile");
const editorForm = document.querySelector("#editorForm");
const emptyEditor = document.querySelector("#emptyEditor");
const nameInput = document.querySelector("#nameInput");
const initiativeField = document.querySelector("#initiativeField");
const initiativeInput = document.querySelector("#initiativeInput");
const tokenSizeField = document.querySelector("#tokenSizeField");
const tokenSizeInput = document.querySelector("#tokenSizeInput");
const damageField = document.querySelector("#damageField");
const damageValue = document.querySelector("#damageValue");
const damageInput = document.querySelector("#damageInput");
const applyDamageButton = document.querySelector("#applyDamage");
const clearDamageButton = document.querySelector("#clearDamage");
const radiusField = document.querySelector("#radiusField");
const radiusInput = document.querySelector("#radiusInput");
const engageRadiusXField = document.querySelector("#engageRadiusXField");
const engageRadiusXInput = document.querySelector("#engageRadiusXInput");
const engageRadiusYField = document.querySelector("#engageRadiusYField");
const engageRadiusYInput = document.querySelector("#engageRadiusYInput");
const lineLengthField = document.querySelector("#lineLengthField");
const lineLengthInput = document.querySelector("#lineLengthInput");
const deleteButton = document.querySelector("#deleteSelected");
const toolButtons = [...document.querySelectorAll(".tool-button")];
const undoButton = document.querySelector("#undoAction");
const redoButton = document.querySelector("#redoAction");
const advanceTurnButton = document.querySelector("#advanceTurn");
const resetRoundButton = document.querySelector("#resetRound");
const roundLabel = document.querySelector("#roundLabel");
const currentTurnLabel = document.querySelector("#currentTurnLabel");

let state = loadState();
let selected = { type: "engage", id: state.engages[0]?.id ?? null };
let activeTool = "select";
let drag = null;
let attentionTokenId = null;
let attentionTimer = null;
let capturedDamageExpression = null;
let lastDamagePointerApplyAt = 0;
const movementAnimations = new Map();
let lastInitiativeClick = { id: null, at: 0 };
let applyingSharedState = false;
let undoStack = [];
let redoStack = [];
let historyTransaction = null;
let remoteSync = {
  enabled: false,
  loading: false,
  saving: false,
  timer: null,
  pollTimer: null,
  lastUpdatedAt: null,
  lastSerialized: null,
};

function createInitialState() {
  return {
    version: 3,
    nextId: 8,
    engages: [
      { id: "engage-1", name: "PC側", x: 250, y: 250, radiusX: 135, radiusY: 135 },
      { id: "engage-2", name: "エネミー側", x: 560, y: 250, radiusX: 135, radiusY: 135 },
    ],
    tokens: [
      { id: "token-3", type: "pc", shape: "circle", name: "PC1", initiative: 0, damage: 0, size: TOKEN_SIZE, x: 215, y: 235, engageId: "engage-1" },
      { id: "token-4", type: "pc", shape: "circle", name: "PC2", initiative: 0, damage: 0, size: TOKEN_SIZE, x: 285, y: 235, engageId: "engage-1" },
      { id: "token-5", type: "enemy", shape: "circle", name: "敵1", initiative: 0, damage: 0, size: TOKEN_SIZE, x: 525, y: 235, engageId: "engage-2" },
      { id: "token-6", type: "enemy", shape: "circle", name: "敵2", initiative: 0, damage: 0, size: TOKEN_SIZE, x: 595, y: 235, engageId: "engage-2" },
    ],
    shapes: [],
    activeTurnTokenId: null,
    activeTurnPhase: null,
    round: 1,
    actedTokenIds: [],
  };
}

function loadState() {
  const saved = readStoredState(STORAGE_KEY) ?? readStoredState(LEGACY_STORAGE_KEY) ?? readStoredState(OLDER_STORAGE_KEY);
  return saved ? normalizeState(saved) : createInitialState();
}

function readStoredState(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function normalizeState(candidate) {
  const initial = createInitialState();
  const engages = Array.isArray(candidate.engages) ? candidate.engages : initial.engages;
  const tokens = Array.isArray(candidate.tokens) ? candidate.tokens : initial.tokens;
  const shapes = Array.isArray(candidate.shapes) ? candidate.shapes : [];
  const maxIdNumber = [...engages, ...tokens, ...shapes].reduce((max, item) => {
    const number = Number(String(item.id ?? "").split("-").at(-1));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);

  const normalizedTokens = tokens
    .filter((item) => item.type === "pc" || item.type === "enemy")
    .slice(0, MAX_PC + MAX_ENEMY)
    .map((item) => ({
      id: String(item.id),
      type: item.type,
      shape: item.shape === "rect" ? "rect" : "circle",
      name: item.name == null ? (item.type === "pc" ? "PC" : "敵") : String(item.name),
      initiative: normalizeInitiative(item.initiative),
      damage: normalizeDamage(item.damage),
      size: normalizeTokenSize(item.size),
      width: normalizeTokenSide(item.width, 88),
      height: normalizeTokenSide(item.height, 58),
      x: Number(item.x) || 140,
      y: Number(item.y) || 140,
      engageId: item.engageId ?? null,
    }));
  const tokenIds = new Set(normalizedTokens.map((item) => item.id));

  return {
    version: 3,
    nextId: Math.max(Number(candidate.nextId) || 1, maxIdNumber + 1),
    engages: engages.map((item) => ({
      id: String(item.id),
      name: item.name == null ? "エンゲージ" : String(item.name),
      x: Number(item.x) || 200,
      y: Number(item.y) || 200,
      radiusX: clamp(Number(item.radiusX ?? item.radius) || 125, 60, 420),
      radiusY: clamp(Number(item.radiusY ?? item.radius) || 125, 50, 320),
    })),
    tokens: normalizedTokens,
    shapes: shapes.map(normalizeShape).filter(Boolean),
    activeTurnTokenId: tokenIds.has(String(candidate.activeTurnTokenId))
      ? String(candidate.activeTurnTokenId)
      : null,
    activeTurnPhase: ["setup", "cleanup"].includes(candidate.activeTurnPhase) ? candidate.activeTurnPhase : null,
    round: Math.max(1, Math.trunc(Number(candidate.round) || 1)),
    actedTokenIds: Array.isArray(candidate.actedTokenIds)
      ? [...new Set(candidate.actedTokenIds.map(String).filter((id) => tokenIds.has(id)))]
      : [],
  };
}

function normalizeShape(item) {
  if (!item || !["circle", "arrow", "double-arrow", "terrain-rect"].includes(item.kind)) {
    return null;
  }
  if (item.kind === "terrain-rect") {
    return {
      id: String(item.id),
      kind: "terrain-rect",
      name: item.name == null ? "地形" : String(item.name),
      x: Number(item.x) || 160,
      y: Number(item.y) || 160,
      width: normalizeTokenSide(item.width, 120),
      height: normalizeTokenSide(item.height, 80),
    };
  }
  if (item.kind === "circle") {
    return {
      id: String(item.id),
      kind: "circle",
      x: Number(item.x) || 160,
      y: Number(item.y) || 160,
      radius: clamp(Number(item.radius) || 50, 8, 400),
    };
  }
  return {
    id: String(item.id),
    kind: item.kind,
    name: item.name == null ? getShapeLabel(item) : String(item.name),
    x1: Number(item.x1) || 120,
    y1: Number(item.y1) || 120,
    x2: Number(item.x2) || 240,
    y2: Number(item.y2) || 120,
  };
}

function saveState() {
  const serialized = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, serialized);
  queueRemoteSave();
  if (!applyingSharedState) {
    window.dispatchEvent(new CustomEvent("dx3rd-state-change", { detail: serialized }));
  }
}

function queueRemoteSave() {
  if (!remoteSync.enabled || remoteSync.loading) {
    return;
  }

  clearTimeout(remoteSync.timer);
  remoteSync.timer = window.setTimeout(() => {
    saveRemoteState();
  }, 350);
}

async function initializeRemoteState() {
  if (window.DX3RD_USE_PEER_SYNC || !window.fetch || window.location.protocol === "file:") {
    return;
  }

  remoteSync.loading = true;
  try {
    const response = await fetch(REMOTE_STATE_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    remoteSync.enabled = true;
    remoteSync.lastUpdatedAt = payload.updatedAt ?? null;

    if (payload.state) {
      state = normalizeState(payload.state);
      reconcileSelectionAfterRemoteLoad();
      remoteSync.lastSerialized = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, remoteSync.lastSerialized);
      render();
    } else {
      remoteSync.lastSerialized = JSON.stringify(state);
      await saveRemoteState(true);
    }

    remoteSync.pollTimer = window.setInterval(refreshRemoteState, 2500);
  } catch (error) {
    console.warn("Shared board sync is unavailable.", error);
  } finally {
    remoteSync.loading = false;
  }
}

async function saveRemoteState(force = false) {
  if (!remoteSync.enabled || (remoteSync.loading && !force)) {
    return;
  }

  const serialized = JSON.stringify(state);
  if (!force && serialized === remoteSync.lastSerialized) {
    return;
  }

  remoteSync.saving = true;
  try {
    const response = await fetch(REMOTE_STATE_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: serialized,
    });
    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }
    const payload = await response.json();
    remoteSync.lastUpdatedAt = payload.updatedAt ?? remoteSync.lastUpdatedAt;
    remoteSync.lastSerialized = serialized;
  } catch (error) {
    console.warn("Shared board save failed.", error);
  } finally {
    remoteSync.saving = false;
  }
}

async function refreshRemoteState() {
  if (!remoteSync.enabled || remoteSync.loading || remoteSync.saving || drag || isEditorActive()) {
    return;
  }

  try {
    const response = await fetch(REMOTE_STATE_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (!payload.state || (payload.updatedAt && payload.updatedAt === remoteSync.lastUpdatedAt)) {
      return;
    }

    const nextState = normalizeState(payload.state);
    const serialized = JSON.stringify(nextState);
    if (serialized === remoteSync.lastSerialized) {
      remoteSync.lastUpdatedAt = payload.updatedAt ?? remoteSync.lastUpdatedAt;
      return;
    }

    state = nextState;
    remoteSync.lastUpdatedAt = payload.updatedAt ?? remoteSync.lastUpdatedAt;
    remoteSync.lastSerialized = serialized;
    reconcileSelectionAfterRemoteLoad();
    localStorage.setItem(STORAGE_KEY, serialized);
    render();
  } catch (error) {
    console.warn("Shared board refresh failed.", error);
  }
}

function reconcileSelectionAfterRemoteLoad() {
  if (!selected.type || getSelectedItem()) {
    return;
  }
  selected = { type: "engage", id: state.engages[0]?.id ?? null };
}

function isEditorActive() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && Boolean(activeElement.closest("#editorForm"));
}

function applySharedState(candidate) {
  if (drag || isEditorActive()) {
    return false;
  }

  applyingSharedState = true;
  try {
    const nextState = normalizeState(candidate);
    queueRemoteMovementAnimations(state, nextState);
    state = nextState;
    reconcileSelectionAfterRemoteLoad();
    undoStack = [];
    redoStack = [];
    historyTransaction = null;
    render();
  } finally {
    applyingSharedState = false;
  }
  return true;
}

function serializeState() {
  return JSON.stringify(state);
}

function beginHistoryTransaction() {
  if (historyTransaction == null) {
    historyTransaction = serializeState();
  }
}

function commitHistoryTransaction() {
  if (historyTransaction == null) {
    return;
  }
  const before = historyTransaction;
  historyTransaction = null;
  if (before === serializeState()) {
    return;
  }
  undoStack.push(before);
  if (undoStack.length > HISTORY_LIMIT) {
    undoStack.shift();
  }
  redoStack = [];
}

function changeWithHistory(callback) {
  beginHistoryTransaction();
  callback();
  commitHistoryTransaction();
}

function restoreHistorySnapshot(snapshot) {
  state = normalizeState(JSON.parse(snapshot));
  if (!getSelectedItem()) {
    selected = { type: null, id: null };
  }
  activeTool = "select";
  drag = null;
  render();
}

function undo() {
  commitHistoryTransaction();
  const snapshot = undoStack.pop();
  if (!snapshot) {
    return;
  }
  redoStack.push(serializeState());
  restoreHistorySnapshot(snapshot);
}

function redo() {
  commitHistoryTransaction();
  const snapshot = redoStack.pop();
  if (!snapshot) {
    return;
  }
  undoStack.push(serializeState());
  restoreHistorySnapshot(snapshot);
}

function getNextId(prefix) {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const id = `${prefix}-${randomPart}`;
  state.nextId += 1;
  return id;
}

function render() {
  renderShapes();
  renderEngages();
  renderTokens();
  renderEditor();
  renderRoster();
  updateCounts();
  renderInitiativeList();
  renderTurnControls();
  updateTools();
  saveState();
}

function renderShapes() {
  terrainLayer.innerHTML = "";
  [...shapeLayer.querySelectorAll(".draw-shape")].forEach((node) => node.remove());
  state.shapes.forEach((shape) => {
    const layer = shape.kind === "terrain-rect" ? terrainLayer : shapeLayer;
    layer.append(createShapeNode(shape));
  });
}

function createShapeNode(shape) {
  if (shape.kind === "terrain-rect") {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("draw-shape", "terrain-rect-group");
    decorateShapeNode(group, shape);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", shape.x - shape.width / 2);
    rect.setAttribute("y", shape.y - shape.height / 2);
    rect.setAttribute("width", shape.width);
    rect.setAttribute("height", shape.height);
    rect.classList.add("terrain-rect");

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", shape.x);
    label.setAttribute("y", shape.y);
    label.classList.add("terrain-label");
    label.textContent = shape.name;

    group.append(rect, label);
    return group;
  }

  if (shape.kind === "circle") {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("cx", shape.x);
    node.setAttribute("cy", shape.y);
    node.setAttribute("r", shape.radius);
    node.classList.add("draw-shape", "draw-circle");
    decorateShapeNode(node, shape);
    return node;
  }

  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.classList.add("draw-shape", "draw-line-group");
  decorateShapeNode(group, shape);

  const hitLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  hitLine.setAttribute("x1", shape.x1);
  hitLine.setAttribute("y1", shape.y1);
  hitLine.setAttribute("x2", shape.x2);
  hitLine.setAttribute("y2", shape.y2);
  hitLine.classList.add("draw-line-hit");

  const node = document.createElementNS("http://www.w3.org/2000/svg", "line");
  node.setAttribute("x1", shape.x1);
  node.setAttribute("y1", shape.y1);
  node.setAttribute("x2", shape.x2);
  node.setAttribute("y2", shape.y2);
  node.classList.add("draw-line");
  if (shape.kind === "arrow") {
    node.setAttribute("marker-end", "url(#arrowHead)");
  }
  if (shape.kind === "double-arrow") {
    node.setAttribute("marker-start", "url(#arrowTail)");
    node.setAttribute("marker-end", "url(#arrowHead)");
  }

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  const midpoint = getLineMidpoint(shape);
  label.setAttribute("x", midpoint.x);
  label.setAttribute("y", midpoint.y - 10);
  label.classList.add("draw-line-label");
  label.textContent = shape.name;

  group.append(hitLine, node, label);
  if (isSelected("shape", shape.id)) {
    group.append(createLineHandle(shape, "start"), createLineHandle(shape, "end"));
  }
  return group;
}

function createLineHandle(shape, handle) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  node.setAttribute("cx", handle === "start" ? shape.x1 : shape.x2);
  node.setAttribute("cy", handle === "start" ? shape.y1 : shape.y2);
  node.setAttribute("r", 8);
  node.classList.add("line-handle");
  node.dataset.type = "shape";
  node.dataset.id = shape.id;
  node.dataset.handle = handle;
  return node;
}

function decorateShapeNode(node, shape) {
  node.dataset.type = "shape";
  node.dataset.id = shape.id;
  if (isSelected("shape", shape.id)) {
    node.classList.add("selected");
  }
}

function renderEngages() {
  engageLayer.innerHTML = "";
  state.engages.forEach((engage) => {
    const node = document.createElement("div");
    node.className = `engage${isSelected("engage", engage.id) ? " selected" : ""}`;
    node.dataset.type = "engage";
    node.dataset.id = engage.id;
    node.style.width = `${engage.radiusX * 2}px`;
    node.style.height = `${engage.radiusY * 2}px`;
    node.style.left = `${engage.x - engage.radiusX}px`;
    node.style.top = `${engage.y - engage.radiusY}px`;
    applyMovementAnimation(node, "engage", engage.id);

    const label = document.createElement("div");
    label.className = "engage-label";
    label.textContent = engage.name;
    node.append(label);
    engageLayer.append(node);
  });
}

function renderTokens() {
  tokenLayer.innerHTML = "";
  state.tokens.forEach((token) => {
    const node = document.createElement("div");
    const width = getTokenWidth(token);
    const height = getTokenHeight(token);
    node.className = `token ${token.type} ${token.shape || "circle"}${isSelected("token", token.id) ? " selected" : ""}${
      attentionTokenId === token.id ? " attention" : ""
    }`;
    node.dataset.type = "token";
    node.dataset.id = token.id;
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.left = `${token.x - width / 2}px`;
    node.style.top = `${token.y - height / 2}px`;
    applyMovementAnimation(node, "token", token.id);
    const name = document.createElement("span");
    name.className = "token-name";
    name.textContent = token.name;
    node.append(name);
    if (token.damage > 0) {
      const damage = document.createElement("span");
      damage.className = "token-damage";
      damage.textContent = token.damage;
      node.append(damage);
    }
    tokenLayer.append(node);
  });
}

function renderEditor() {
  const item = getSelectedItem();
  editorForm.hidden = !item;
  emptyEditor.hidden = Boolean(item);
  deleteButton.disabled = !item;

  if (!item) {
    return;
  }

  const isShape = selected.type === "shape";
  const isToken = selected.type === "token";
  const isEngage = selected.type === "engage";
  const isRadiusTarget = !isEngage && item.kind === "circle";
  const isLineShape = isShape && (item.kind === "arrow" || item.kind === "double-arrow");
  const canEditName = !isShape || item.kind !== "circle";
  nameInput.parentElement.hidden = !canEditName;
  nameInput.value = canEditName ? item.name : "";
  initiativeField.hidden = !isToken;
  const canResizeEnemyCircle = isToken && item.type === "enemy" && item.shape !== "rect";
  tokenSizeField.hidden = !canResizeEnemyCircle;
  if (canResizeEnemyCircle) {
    tokenSizeInput.value = item.size;
  }
  damageField.hidden = !isToken;
  if (isToken) {
    initiativeInput.value = item.initiative;
    damageValue.textContent = item.damage;
    damageInput.value = "";
  }
  radiusField.hidden = !isRadiusTarget;
  if (isRadiusTarget) {
    radiusInput.min = item.kind === "circle" ? 8 : 90;
    radiusInput.max = item.kind === "circle" ? 240 : 190;
    radiusInput.step = item.kind === "circle" ? 1 : 10;
    radiusInput.value = item.radius;
  }
  engageRadiusXField.hidden = !isEngage;
  engageRadiusYField.hidden = !isEngage;
  if (isEngage) {
    engageRadiusXInput.value = item.radiusX;
    engageRadiusYInput.value = item.radiusY;
  }
  lineLengthField.hidden = !isLineShape;
  if (isLineShape) {
    lineLengthInput.value = Math.round(getLineLength(item));
  }
}

function renderRoster() {
  roster.innerHTML = "";
  const rows = [
    ...state.engages.map((item) => ({ ...item, type: "engage", label: "円" })),
    ...state.tokens.map((item) => ({ ...item, label: item.type === "pc" ? "PC" : "敵" })),
    ...state.shapes.map((item) => ({
      ...item,
      type: "shape",
      name: item.name == null ? getShapeLabel(item) : item.name,
      label: "描画",
    })),
  ];

  rows.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "roster-item";
    row.dataset.type = item.type;
    row.dataset.id = item.id;
    row.innerHTML = `
      <span class="dot ${item.type}"></span>
      <span>${escapeHtml(item.name)}</span>
      <span class="roster-type">${item.label}</span>
    `;
    roster.append(row);
  });
}

function getShapeLabel(shape) {
  if (shape.kind === "circle") {
    return "描画円";
  }
  if (shape.kind === "terrain-rect") {
    return "地形";
  }
  return shape.kind === "arrow" ? "矢印線" : "両矢印線";
}

function getLineMidpoint(shape) {
  return {
    x: (shape.x1 + shape.x2) / 2,
    y: (shape.y1 + shape.y2) / 2,
  };
}

function getLineLength(shape) {
  return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
}

function setLineLength(shape, nextLength) {
  const length = clamp(Number(nextLength) || MIN_DRAW_SIZE, MIN_DRAW_SIZE, 1400);
  const currentLength = getLineLength(shape) || 1;
  const midpoint = getLineMidpoint(shape);
  const unitX = (shape.x2 - shape.x1) / currentLength;
  const unitY = (shape.y2 - shape.y1) / currentLength;
  const half = length / 2;

  shape.x1 = clamp(midpoint.x - unitX * half, 0, board.clientWidth);
  shape.y1 = clamp(midpoint.y - unitY * half, 0, board.clientHeight);
  shape.x2 = clamp(midpoint.x + unitX * half, 0, board.clientWidth);
  shape.y2 = clamp(midpoint.y + unitY * half, 0, board.clientHeight);
}

function updateCounts() {
  const pcCount = state.tokens.filter((token) => token.type === "pc").length;
  const enemyCount = state.tokens.filter((token) => token.type === "enemy").length;
  counts.innerHTML = `
    <span class="count-pill">エンゲージ ${state.engages.length}</span>
    <span class="count-pill">PC ${pcCount}/${MAX_PC}</span>
    <span class="count-pill">エネミー ${enemyCount}/${MAX_ENEMY}</span>
    <span class="count-pill">描画 ${state.shapes.length}</span>
  `;
  addPcButton.disabled = pcCount >= MAX_PC;
  addEnemyButton.disabled = enemyCount >= MAX_ENEMY;
}

function renderInitiativeList() {
  const tokens = getInitiativeTokens();
  initiativeList.innerHTML = "";
  initiativeList.append(createPhaseRow("setup", "セットアップ"));
  tokens.forEach((token) => {
    const row = document.createElement("button");
    const acted = state.actedTokenIds.includes(token.id);
    row.className = `initiative-row ${token.type}${isSelected("token", token.id) ? " selected" : ""}${acted ? " acted" : ""}${
      state.activeTurnTokenId === token.id ? " active-turn" : ""
    }`;
    row.type = "button";
    row.dataset.tokenId = token.id;
    row.dataset.type = "token";
    row.dataset.id = token.id;
    row.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (lastInitiativeClick.id === token.id && now - lastInitiativeClick.at < 500) {
        lastInitiativeClick = { id: null, at: 0 };
        setActiveTurnToken(token.id);
        return;
      }
      lastInitiativeClick = { id: token.id, at: now };
      selectTokenFromInitiative(token.id);
    });
    row.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectTokenFromInitiative(token.id);
    });
    row.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveTurnToken(token.id);
    });

    const name = document.createElement("span");
    name.className = "initiative-name";
    name.textContent = token.name;
    name.title = name.textContent;

    const value = document.createElement("span");
    value.className = "initiative-value";
    value.textContent = token.initiative;

    row.append(name);
    if (acted && state.activeTurnTokenId !== token.id) {
      const done = document.createElement("span");
      done.className = "initiative-done";
      done.textContent = "済";
      row.append(done);
    } else {
      row.append(value);
    }
    initiativeList.append(row);
  });
  initiativeList.append(createPhaseRow("cleanup", "クリンナップ"));
}

function createPhaseRow(phase, label) {
  const row = document.createElement("button");
  row.className = `initiative-row phase${state.activeTurnPhase === phase ? " active-turn" : ""}`;
  row.type = "button";
  row.dataset.phase = phase;

  const name = document.createElement("span");
  name.className = "initiative-name";
  name.textContent = label;
  name.title = label;

  row.append(name);
  row.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (lastInitiativeClick.id === phase && now - lastInitiativeClick.at < 500) {
      lastInitiativeClick = { id: null, at: 0 };
      setActiveTurnPhase(phase);
      return;
    }
    lastInitiativeClick = { id: phase, at: now };
    selected = { type: null, id: null };
    render();
  });
  row.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  row.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveTurnPhase(phase);
  });

  return row;
}

function setActiveTurnToken(id) {
  if (!state.tokens.some((token) => token.id === id)) {
    return;
  }
  changeWithHistory(() => {
    state.activeTurnTokenId = id;
    state.activeTurnPhase = null;
    selected = { type: "token", id };
    activeTool = "select";
  });
  render();
}

function setActiveTurnPhase(phase) {
  changeWithHistory(() => {
    state.activeTurnPhase = phase;
    state.activeTurnTokenId = null;
    selected = { type: null, id: null };
    activeTool = "select";
  });
  render();
}

function renderTurnControls() {
  roundLabel.textContent = `ラウンド ${state.round}`;
  const activeToken = state.tokens.find((token) => token.id === state.activeTurnTokenId);
  if (state.activeTurnPhase === "setup") {
    currentTurnLabel.textContent = "セットアップ";
    advanceTurnButton.textContent = state.tokens.length ? "最初の手番へ" : "クリンナップへ";
  } else if (state.activeTurnPhase === "cleanup") {
    currentTurnLabel.textContent = "クリンナップ";
    advanceTurnButton.textContent = "次のラウンドへ";
  } else if (activeToken) {
    currentTurnLabel.textContent = `${activeToken.name}（行動値 ${activeToken.initiative}）`;
    advanceTurnButton.textContent = "行動済みにして次へ";
  } else {
    currentTurnLabel.textContent = "未開始";
    advanceTurnButton.textContent = "手番を開始";
  }
  const hasPendingChange = historyTransaction != null && historyTransaction !== serializeState();
  undoButton.disabled = undoStack.length === 0 && !hasPendingChange;
  redoButton.disabled = redoStack.length === 0;
  resetRoundButton.disabled =
    state.round === 1 && state.activeTurnTokenId == null && state.activeTurnPhase == null && state.actedTokenIds.length === 0;
}

function advanceTurn() {
  changeWithHistory(() => {
    const tokens = getInitiativeTokens();
    if (state.activeTurnPhase === "cleanup") {
      state.round += 1;
      state.actedTokenIds = [];
      state.activeTurnPhase = "setup";
      state.activeTurnTokenId = null;
    } else if (!state.activeTurnPhase && !state.activeTurnTokenId) {
      state.activeTurnPhase = "setup";
    } else if (state.activeTurnPhase === "setup") {
      const firstUnacted = tokens.find((token) => !state.actedTokenIds.includes(token.id));
      state.activeTurnPhase = firstUnacted ? null : "cleanup";
      state.activeTurnTokenId = firstUnacted?.id ?? null;
    } else {
      const currentIndex = tokens.findIndex((token) => token.id === state.activeTurnTokenId);
      if (state.activeTurnTokenId && !state.actedTokenIds.includes(state.activeTurnTokenId)) {
        state.actedTokenIds.push(state.activeTurnTokenId);
      }
      const subsequentTokens = currentIndex >= 0
        ? [...tokens.slice(currentIndex + 1), ...tokens.slice(0, currentIndex)]
        : tokens;
      const nextToken = subsequentTokens.find((token) => !state.actedTokenIds.includes(token.id));
      state.activeTurnTokenId = nextToken?.id ?? null;
      state.activeTurnPhase = nextToken ? null : "cleanup";
    }
    selected = state.activeTurnTokenId
      ? { type: "token", id: state.activeTurnTokenId }
      : { type: null, id: null };
    activeTool = "select";
  });
  render();
}

function resetRoundProgress() {
  const isAlreadyReset =
    state.round === 1 && state.activeTurnTokenId == null && state.activeTurnPhase == null && state.actedTokenIds.length === 0;
  if (isAlreadyReset) {
    return;
  }
  changeWithHistory(() => {
    state.round = 1;
    state.activeTurnTokenId = null;
    state.activeTurnPhase = null;
    state.actedTokenIds = [];
  });
  lastInitiativeClick = { id: null, at: 0 };
  render();
}

function getInitiativeTokens() {
  return [...state.tokens].sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    if (a.type !== b.type) {
      return a.type === "pc" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "ja");
  });
}

function normalizeInitiative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function normalizeDamage(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizeTokenSize(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.trunc(number), 40, 180) : TOKEN_SIZE;
}

function normalizeTokenSide(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.trunc(number), 24, 2000) : fallback;
}

function getTokenWidth(token) {
  return token.shape === "rect" ? token.width : token.size || TOKEN_SIZE;
}

function getTokenHeight(token) {
  return token.shape === "rect" ? token.height : token.size || TOKEN_SIZE;
}

function getTokenEngageRadius(token) {
  return Math.max(getTokenWidth(token), getTokenHeight(token)) / 2;
}

function parseDamageExpression(value) {
  let expression = String(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[＋]/g, "+")
    .replace(/[－ー―]/g, "-")
    .replace(/\s+/g, "");
  if (!expression) {
    return null;
  }
  if (/^\d/.test(expression)) {
    expression = `+${expression}`;
  }
  if (!/^[+-]?\d+(?:[+-]\d+)*$/.test(expression)) {
    return null;
  }

  return expression.match(/[+-]?\d+/g).reduce((total, part) => total + Number(part), 0);
}

function applyDamageExpression(value = damageInput.value) {
  const item = getSelectedItem();
  if (!item || selected.type !== "token") {
    return;
  }

  const delta = parseDamageExpression(value);
  if (delta == null) {
    damageInput.select();
    return;
  }

  beginHistoryTransaction();
  item.damage = normalizeDamage(item.damage + delta);
  commitHistoryTransaction();
  render();
  damageInput.focus();
}

function queueRemoteMovementAnimations(previousState, nextState) {
  for (const type of ["engage", "token"]) {
    const key = type === "engage" ? "engages" : "tokens";
    const previousItems = new Map(
      previousState[key].map((item) => [item.id, item]),
    );
    nextState[key].forEach((item) => {
      const previous = previousItems.get(item.id);
      if (!previous || (previous.x === item.x && previous.y === item.y)) {
        return;
      }
      movementAnimations.set(`${type}:${item.id}`, {
        mode: "move",
        x: previous.x - item.x,
        y: previous.y - item.y,
      });
    });
  }
}

function queueReleaseAnimation(activeDrag) {
  if (!activeDrag || !["engage", "token"].includes(activeDrag.type)) {
    return;
  }
  movementAnimations.set(`${activeDrag.type}:${activeDrag.id}`, {
    mode: "settle",
    x: 0,
    y: 0,
  });
  if (activeDrag.type === "engage") {
    activeDrag.tokenStarts.forEach((token) => {
      movementAnimations.set(`token:${token.id}`, {
        mode: "settle",
        x: 0,
        y: 0,
      });
    });
  }
}

function applyMovementAnimation(node, type, id) {
  const animation = movementAnimations.get(`${type}:${id}`);
  if (!animation) {
    return;
  }
  movementAnimations.delete(`${type}:${id}`);
  node.classList.add(
    animation.mode === "move" ? "object-moving" : "object-settling",
  );
  node.style.setProperty("--move-x", `${animation.x}px`);
  node.style.setProperty("--move-y", `${animation.y}px`);
}

function updateTools() {
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === activeTool);
  });
  board.dataset.tool = activeTool;
}

function escapeHtml(value) {
  const template = document.createElement("template");
  template.textContent = value;
  return template.innerHTML;
}

function getSelectedItem() {
  if (!selected.id) {
    return null;
  }
  if (selected.type === "engage") {
    return state.engages.find((engage) => engage.id === selected.id);
  }
  if (selected.type === "token") {
    return state.tokens.find((token) => token.id === selected.id);
  }
  return state.shapes.find((shape) => shape.id === selected.id);
}

function isSelected(type, id) {
  return selected.type === type && selected.id === id;
}

function selectItem(type, id) {
  selected = { type, id };
  activeTool = "select";
  render();
}

function selectTokenFromInitiative(id) {
  if (!state.tokens.some((token) => token.id === id)) {
    return;
  }

  selected = { type: "token", id };
  activeTool = "select";
  attentionTokenId = id;
  clearTimeout(attentionTimer);
  attentionTimer = setTimeout(() => {
    attentionTokenId = null;
    render();
  }, 1200);
  render();
}

function getBoardPoint(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addEngage() {
  beginHistoryTransaction();
  const rect = board.getBoundingClientRect();
  const radiusX = 125;
  const radiusY = 125;
  const offset = state.engages.length * 28;
  const engage = {
    id: getNextId("engage"),
    name: `エンゲージ${state.engages.length + 1}`,
    x: clamp(rect.width / 2 + offset, radiusX, rect.width - radiusX),
    y: clamp(rect.height / 2 + offset, radiusY, rect.height - radiusY),
    radiusX,
    radiusY,
  };
  state.engages.push(engage);
  commitHistoryTransaction();
  selectItem("engage", engage.id);
}

function addToken(type) {
  const limit = type === "pc" ? MAX_PC : MAX_ENEMY;
  const current = state.tokens.filter((token) => token.type === type).length;
  if (current >= limit) {
    return;
  }
  beginHistoryTransaction();

  const engage = state.engages[0];
  const angle = current * 0.9;
  const spread = 38 + current * 4;
  const token = {
    id: getNextId("token"),
    type,
    shape: "circle",
    name: type === "pc" ? `PC${current + 1}` : `敵${current + 1}`,
    initiative: 0,
    damage: 0,
    size: TOKEN_SIZE,
    x: engage ? engage.x + Math.cos(angle) * spread : 120 + current * 48,
    y: engage ? engage.y + Math.sin(angle) * spread : 120,
    engageId: engage?.id ?? null,
  };
  state.tokens.push(token);
  commitHistoryTransaction();
  selectItem("token", token.id);
}

function startPointer(event) {
  if (event.button !== 0) {
    return;
  }
  if (activeTool === "select") {
    beginHistoryTransaction();
    startDrag(event);
    return;
  }
  beginHistoryTransaction();
  startDrawing(event);
}

function startDrawing(event) {
  event.preventDefault();
  const point = getBoardPoint(event);
  if (activeTool === "rect") {
    startRectangleEnemy(point);
    return;
  }
  if (activeTool === "terrain-rect") {
    startTerrainRect(point);
    return;
  }

  const shape =
    activeTool === "circle"
      ? { id: getNextId("shape"), kind: "circle", x: point.x, y: point.y, radius: 1 }
      : {
          id: getNextId("shape"),
          kind: activeTool,
          name: activeTool === "arrow" ? "矢印線" : "両矢印線",
          x1: point.x,
          y1: point.y,
          x2: point.x,
          y2: point.y,
        };

  selected = { type: "shape", id: shape.id };
  state.shapes.push(shape);
  drag = {
    type: "draw",
    id: shape.id,
    startX: point.x,
    startY: point.y,
  };
  render();
}

function startTerrainRect(point) {
  const shape = {
    id: getNextId("shape"),
    kind: "terrain-rect",
    name: "地形",
    x: point.x,
    y: point.y,
    width: 1,
    height: 1,
  };
  selected = { type: "shape", id: shape.id };
  state.shapes.push(shape);
  drag = {
    type: "draw-terrain-rect",
    id: shape.id,
    startX: point.x,
    startY: point.y,
  };
  render();
}

function startRectangleEnemy(point) {
  const current = state.tokens.filter((token) => token.type === "enemy").length;
  if (current >= MAX_ENEMY) {
    return;
  }

  const token = {
    id: getNextId("token"),
    type: "enemy",
    shape: "rect",
    name: `敵${current + 1}`,
    initiative: 0,
    damage: 0,
    size: TOKEN_SIZE,
    width: 1,
    height: 1,
    x: point.x,
    y: point.y,
    engageId: null,
  };
  state.tokens.push(token);
  selected = { type: "token", id: token.id };
  drag = {
    type: "draw-token-rect",
    id: token.id,
    startX: point.x,
    startY: point.y,
  };
  render();
}

function startDrag(event) {
  const target = event.target.closest("[data-type][data-id]");
  if (!target || !board.contains(target)) {
    selected = { type: null, id: null };
    render();
    return;
  }

  event.preventDefault();
  const type = target.dataset.type;
  const id = target.dataset.id;
  const point = getBoardPoint(event);
  selected = { type, id };

  if (type === "shape" && target.dataset.handle) {
    drag = {
      type: "line-handle",
      id,
      handle: target.dataset.handle,
    };
  } else if (type === "engage") {
    const engage = state.engages.find((item) => item.id === id);
    drag = {
      type,
      id,
      startX: point.x,
      startY: point.y,
      itemX: engage.x,
      itemY: engage.y,
      tokenStarts: state.tokens
        .filter((token) => token.engageId === id)
        .map((token) => ({ id: token.id, x: token.x, y: token.y })),
    };
  } else if (type === "token") {
    const token = state.tokens.find((item) => item.id === id);
    drag = { type, id, startX: point.x, startY: point.y, itemX: token.x, itemY: token.y };
  } else {
    const shape = state.shapes.find((item) => item.id === id);
    drag = {
      type,
      id,
      startX: point.x,
      startY: point.y,
      shapeStart: { ...shape },
    };
  }
  render();
}

function movePointer(event) {
  if (!drag) {
    return;
  }

  const point = getBoardPoint(event);
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;

  if (drag.type === "draw") {
    moveDrawing(point);
  } else if (drag.type === "draw-terrain-rect") {
    moveTerrainRect(point);
  } else if (drag.type === "draw-token-rect") {
    moveRectangleEnemy(point);
  } else if (drag.type === "engage") {
    moveEngage(dx, dy);
  } else if (drag.type === "token") {
    moveToken(dx, dy);
  } else if (drag.type === "shape") {
    moveShape(dx, dy);
  } else if (drag.type === "line-handle") {
    moveLineHandle(point);
  }
}

function moveTerrainRect(point) {
  const shape = state.shapes.find((item) => item.id === drag.id);
  const left = Math.min(drag.startX, point.x);
  const top = Math.min(drag.startY, point.y);
  const width = Math.abs(point.x - drag.startX);
  const height = Math.abs(point.y - drag.startY);

  shape.width = clamp(width, 1, board.clientWidth);
  shape.height = clamp(height, 1, board.clientHeight);
  shape.x = clamp(left + shape.width / 2, shape.width / 2, board.clientWidth - shape.width / 2);
  shape.y = clamp(top + shape.height / 2, shape.height / 2, board.clientHeight - shape.height / 2);
  render();
}

function moveRectangleEnemy(point) {
  const token = state.tokens.find((item) => item.id === drag.id);
  const left = Math.min(drag.startX, point.x);
  const top = Math.min(drag.startY, point.y);
  const width = Math.abs(point.x - drag.startX);
  const height = Math.abs(point.y - drag.startY);

  token.width = clamp(width, 1, board.clientWidth);
  token.height = clamp(height, 1, board.clientHeight);
  token.x = clamp(left + token.width / 2, token.width / 2, board.clientWidth - token.width / 2);
  token.y = clamp(top + token.height / 2, token.height / 2, board.clientHeight - token.height / 2);
  render();
}

function moveDrawing(point) {
  const shape = state.shapes.find((item) => item.id === drag.id);
  if (shape.kind === "circle") {
    const radius = Math.hypot(point.x - drag.startX, point.y - drag.startY);
    shape.radius = clamp(radius, 1, 500);
  } else {
    shape.x2 = point.x;
    shape.y2 = point.y;
  }
  render();
}

function moveEngage(dx, dy) {
  const engage = state.engages.find((item) => item.id === drag.id);
  const maxX = board.clientWidth - engage.radiusX;
  const maxY = board.clientHeight - engage.radiusY;
  const nextX = clamp(drag.itemX + dx, engage.radiusX, maxX);
  const nextY = clamp(drag.itemY + dy, engage.radiusY, maxY);
  const movedX = nextX - engage.x;
  const movedY = nextY - engage.y;

  engage.x = nextX;
  engage.y = nextY;

    drag.tokenStarts.forEach((start) => {
      const token = state.tokens.find((item) => item.id === start.id);
      const halfWidth = getTokenWidth(token) / 2;
      const halfHeight = getTokenHeight(token) / 2;
      token.x = clamp(start.x + nextX - drag.itemX, halfWidth, board.clientWidth - halfWidth);
      token.y = clamp(start.y + nextY - drag.itemY, halfHeight, board.clientHeight - halfHeight);
    });

  if (movedX || movedY) {
    render();
  }
}

function moveToken(dx, dy) {
  const token = state.tokens.find((item) => item.id === drag.id);
  const halfWidth = getTokenWidth(token) / 2;
  const halfHeight = getTokenHeight(token) / 2;
  token.x = clamp(drag.itemX + dx, halfWidth, board.clientWidth - halfWidth);
  token.y = clamp(drag.itemY + dy, halfHeight, board.clientHeight - halfHeight);
  token.engageId = getContainingEngage(token)?.id ?? null;
  render();
}

function moveShape(dx, dy) {
  const shape = state.shapes.find((item) => item.id === drag.id);
  const start = drag.shapeStart;
  if (shape.kind === "circle") {
    shape.x = clamp(start.x + dx, shape.radius, board.clientWidth - shape.radius);
    shape.y = clamp(start.y + dy, shape.radius, board.clientHeight - shape.radius);
  } else if (shape.kind === "terrain-rect") {
    shape.x = clamp(start.x + dx, shape.width / 2, board.clientWidth - shape.width / 2);
    shape.y = clamp(start.y + dy, shape.height / 2, board.clientHeight - shape.height / 2);
  } else {
    shape.x1 = clamp(start.x1 + dx, 0, board.clientWidth);
    shape.y1 = clamp(start.y1 + dy, 0, board.clientHeight);
    shape.x2 = clamp(start.x2 + dx, 0, board.clientWidth);
    shape.y2 = clamp(start.y2 + dy, 0, board.clientHeight);
  }
  render();
}

function moveLineHandle(point) {
  const shape = state.shapes.find((item) => item.id === drag.id);
  if (!shape || (shape.kind !== "arrow" && shape.kind !== "double-arrow")) {
    return;
  }

  if (drag.handle === "start") {
    shape.x1 = point.x;
    shape.y1 = point.y;
  } else {
    shape.x2 = point.x;
    shape.y2 = point.y;
  }
  render();
}

function endPointer() {
  const completedDrag = drag;
  if (drag?.type === "draw") {
    const shape = state.shapes.find((item) => item.id === drag.id);
    if (shape && !isMeaningfulShape(shape)) {
      state.shapes = state.shapes.filter((item) => item.id !== shape.id);
      selected = { type: null, id: null };
    }
  }
  if (drag?.type === "draw-terrain-rect") {
    const shape = state.shapes.find((item) => item.id === drag.id);
    if (shape && (shape.width < 24 || shape.height < 24)) {
      state.shapes = state.shapes.filter((item) => item.id !== shape.id);
      selected = { type: null, id: null };
    }
  }
  if (drag?.type === "draw-token-rect") {
    const token = state.tokens.find((item) => item.id === drag.id);
    if (token && (token.width < 24 || token.height < 24)) {
      state.tokens = state.tokens.filter((item) => item.id !== token.id);
      selected = { type: null, id: null };
    }
  }
  if (drag?.type === "token") {
    const token = state.tokens.find((item) => item.id === drag.id);
    const engage = getContainingEngage(token);
    token.engageId = engage?.id ?? null;
  }
  queueReleaseAnimation(completedDrag);
  drag = null;
  commitHistoryTransaction();
  render();
}

function isMeaningfulShape(shape) {
  if (shape.kind === "circle") {
    return shape.radius >= MIN_DRAW_SIZE;
  }
  if (shape.kind === "terrain-rect") {
    return shape.width >= MIN_DRAW_SIZE && shape.height >= MIN_DRAW_SIZE;
  }
  return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) >= MIN_DRAW_SIZE;
}

function getContainingEngage(token) {
  const containing = state.engages
    .map((engage) => ({
      engage,
      distance: Math.hypot(token.x - engage.x, token.y - engage.y),
    }))
    .filter(({ engage }) => isTokenInsideEngage(token, engage))
    .sort((a, b) => a.distance - b.distance);
  return containing[0]?.engage ?? null;
}

function isTokenInsideEngage(token, engage) {
  const tokenRadius = getTokenEngageRadius(token);
  const radiusX = Math.max(1, engage.radiusX - tokenRadius);
  const radiusY = Math.max(1, engage.radiusY - tokenRadius);
  const dx = token.x - engage.x;
  const dy = token.y - engage.y;
  return (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY) <= 1;
}

function deleteSelected() {
  const item = getSelectedItem();
  if (!item) {
    return;
  }
  beginHistoryTransaction();

  if (selected.type === "engage") {
    state.engages = state.engages.filter((engage) => engage.id !== selected.id);
    state.tokens.forEach((token) => {
      if (token.engageId === selected.id) {
        token.engageId = null;
      }
    });
  } else if (selected.type === "token") {
    state.tokens = state.tokens.filter((token) => token.id !== selected.id);
    state.actedTokenIds = state.actedTokenIds.filter((id) => id !== selected.id);
    if (state.activeTurnTokenId === selected.id) {
      state.activeTurnTokenId = null;
    }
  } else {
    state.shapes = state.shapes.filter((shape) => shape.id !== selected.id);
  }

  selected = { type: "engage", id: state.engages[0]?.id ?? null };
  commitHistoryTransaction();
  render();
}

function isEditingText(event) {
  const tagName = event.target?.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || event.target?.isContentEditable;
}

function resetBoard() {
  if (!confirm("ボードを初期状態に戻しますか？この操作は元に戻せます。")) {
    return;
  }
  changeWithHistory(() => {
    state = createInitialState();
    selected = { type: "engage", id: state.engages[0].id };
    activeTool = "select";
  });
  render();
}

function exportBoard() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "dx3rd-combat-board",
    data: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dx3rd-board-${formatDate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function importBoardFile() {
  importFile.click();
}

function handleImportFile(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = parsed.data ?? parsed;
      changeWithHistory(() => {
        state = normalizeState(imported);
        selected = { type: "engage", id: state.engages[0]?.id ?? null };
        activeTool = "select";
      });
      render();
    } catch {
      alert("インポートできませんでした。JSONファイルの内容を確認してください。");
    } finally {
      importFile.value = "";
    }
  });
  reader.readAsText(file);
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeTool = button.dataset.tool;
    selected = { type: null, id: null };
    render();
  });
});

addEngageButton.addEventListener("click", addEngage);
addPcButton.addEventListener("click", () => addToken("pc"));
addEnemyButton.addEventListener("click", () => addToken("enemy"));
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
advanceTurnButton.addEventListener("click", advanceTurn);
resetRoundButton.addEventListener("click", resetRoundProgress);
deleteButton.addEventListener("click", deleteSelected);
resetButton.addEventListener("click", resetBoard);
exportButton.addEventListener("click", exportBoard);
importButton.addEventListener("click", importBoardFile);
importFile.addEventListener("change", handleImportFile);

board.addEventListener("pointerdown", startPointer);
window.addEventListener("pointermove", movePointer);
window.addEventListener("pointerup", endPointer);
window.addEventListener("pointercancel", endPointer);

roster.addEventListener("click", (event) => {
  const row = event.target.closest("[data-type][data-id]");
  if (row) {
    selectItem(row.dataset.type, row.dataset.id);
  }
});

initiativeList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-token-id]");
  if (row) {
    selectTokenFromInitiative(row.dataset.tokenId);
  }
});

editorForm.addEventListener("focusin", (event) => {
  if (event.target.matches("input")) {
    beginHistoryTransaction();
  }
});

editorForm.addEventListener("focusout", (event) => {
  if (event.target.matches("input")) {
    commitHistoryTransaction();
    renderTurnControls();
  }
});

nameInput.addEventListener("input", () => {
  const item = getSelectedItem();
  if (item && selected.type !== "shape") {
    item.name = nameInput.value;
    render();
    nameInput.focus();
  }
  if (item && selected.type === "shape" && item.kind !== "circle") {
    item.name = nameInput.value;
    render();
    nameInput.focus();
  }
});

initiativeInput.addEventListener("input", () => {
  const item = getSelectedItem();
  if (item && selected.type === "token") {
    item.initiative = normalizeInitiative(initiativeInput.value);
    render();
    initiativeInput.focus();
  }
});

tokenSizeInput.addEventListener("input", () => {
  const item = getSelectedItem();
  if (item && selected.type === "token" && item.type === "enemy" && item.shape !== "rect") {
    item.size = normalizeTokenSize(tokenSizeInput.value);
    const half = item.size / 2;
    item.x = clamp(item.x, half, board.clientWidth - half);
    item.y = clamp(item.y, half, board.clientHeight - half);
    item.engageId = getContainingEngage(item)?.id ?? null;
    render();
    tokenSizeInput.focus();
  }
});

applyDamageButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  capturedDamageExpression = damageInput.value;
  lastDamagePointerApplyAt = performance.now();
  applyDamageExpression(capturedDamageExpression);
  capturedDamageExpression = null;
});
applyDamageButton.addEventListener("click", () => {
  if (performance.now() - lastDamagePointerApplyAt < 1000) {
    return;
  }
  applyDamageExpression(capturedDamageExpression ?? damageInput.value);
  capturedDamageExpression = null;
});
clearDamageButton.addEventListener("click", () => {
  const item = getSelectedItem();
  if (item && selected.type === "token") {
    beginHistoryTransaction();
    item.damage = 0;
    commitHistoryTransaction();
    render();
  }
});
damageInput.addEventListener("input", () => {
  capturedDamageExpression = damageInput.value;
});
damageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyDamageExpression();
    capturedDamageExpression = null;
  }
});

radiusInput.addEventListener("input", () => {
  const item = getSelectedItem();
  if (!item) {
    return;
  }
  if (selected.type === "shape" && item.kind === "circle") {
    item.radius = Number(radiusInput.value);
    item.x = clamp(item.x, item.radius, board.clientWidth - item.radius);
    item.y = clamp(item.y, item.radius, board.clientHeight - item.radius);
  }
  render();
});

engageRadiusXInput.addEventListener("input", () => {
  const item = getSelectedItem();
  if (item && selected.type === "engage") {
    item.radiusX = Number(engageRadiusXInput.value);
    item.x = clamp(item.x, item.radiusX, board.clientWidth - item.radiusX);
    render();
    engageRadiusXInput.focus();
  }
});

engageRadiusYInput.addEventListener("input", () => {
  const item = getSelectedItem();
  if (item && selected.type === "engage") {
    item.radiusY = Number(engageRadiusYInput.value);
    item.y = clamp(item.y, item.radiusY, board.clientHeight - item.radiusY);
    render();
    engageRadiusYInput.focus();
  }
});

lineLengthInput.addEventListener("input", () => {
  const item = getSelectedItem();
  if (item && selected.type === "shape" && (item.kind === "arrow" || item.kind === "double-arrow")) {
    setLineLength(item, lineLengthInput.value);
    render();
    lineLengthInput.focus();
  }
});

window.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && !event.altKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if (modifier && !event.altKey && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && !isEditingText(event)) {
    event.preventDefault();
    deleteSelected();
  }
});

window.DX3RDBoard = Object.freeze({
  applySharedState,
  serializeState,
});

render();
initializeRemoteState();
