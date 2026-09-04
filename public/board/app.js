const MAX_PC = 20;
const MAX_ENEMY = 20;
const TOKEN_SIZE = 58;
const MIN_DRAW_SIZE = 10;
const HISTORY_LIMIT = 50;
const BOX_RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const STORAGE_KEY = "dx3rd-combat-board-v3";
const LEGACY_STORAGE_KEY = "dx3rd-combat-board-v2";
const OLDER_STORAGE_KEY = "dx3rd-combat-board-v1";
const REMOTE_STATE_ENDPOINT = "/api/board";
const BAD_STATUSES = Object.freeze([
  { id: "pressure", name: "重圧", description: "オートアクションのエフェクトを使用できない" },
  { id: "rigidity", name: "硬直", description: "全力移動および戦闘移動が行えない" },
  { id: "poison", name: "邪毒", description: "クリンナッププロセスごとに邪毒のLv×3のHPダメージを受ける" },
  { id: "dazed", name: "放心", description: "すべての判定のダイスが2個減少する" },
  { id: "berserk", name: "暴走", description: "ガードを含むリアクションとカバーリングができない" },
  { id: "hatred", name: "憎悪", description: "指定されたキャラクターに対して攻撃を行う" },
]);

const board = document.querySelector("#board");
const boardViewport = document.querySelector("#boardViewport");
const battleArea = document.querySelector(".battle-area");
const appShell = document.querySelector(".app-shell");
const terrainLayer = document.querySelector("#terrainLayer");
const shapeLayer = document.querySelector("#shapeLayer");
const engageLayer = document.querySelector("#engageLayer");
const tokenLayer = document.querySelector("#tokenLayer");
const resizeLayer = document.querySelector("#resizeLayer");
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
const modifierField = document.querySelector("#modifierField");
const diceModifierInput = document.querySelector("#diceModifierInput");
const criticalModifierInput = document.querySelector("#criticalModifierInput");
const attackModifierInput = document.querySelector("#attackModifierInput");
const tokenSizeField = document.querySelector("#tokenSizeField");
const tokenSizeInput = document.querySelector("#tokenSizeInput");
const damageField = document.querySelector("#damageField");
const damageValue = document.querySelector("#damageValue");
const damageInput = document.querySelector("#damageInput");
const applyDamageButton = document.querySelector("#applyDamage");
const clearDamageButton = document.querySelector("#clearDamage");
const badStatusField = document.querySelector("#badStatusField");
const badStatusInputs = [...badStatusField.querySelectorAll('input[name="badStatus"]')];
const poisonLevelField = document.querySelector("#poisonLevelField");
const poisonLevelInput = document.querySelector("#poisonLevelInput");
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
const openMiniWindowButton = document.querySelector("#openMiniWindow");
const compactViewControls = document.querySelector("#compactViewControls");
const compactViewButtons = [...compactViewControls.querySelectorAll("[data-compact-view]")];
const miniWindowPlaceholder = document.querySelector("#miniWindowPlaceholder");
const restoreMiniWindowButton = document.querySelector("#restoreMiniWindow");
const tokenContextMenu = document.querySelector("#tokenContextMenu");
const contextTokenName = document.querySelector("#contextTokenName");
const closeTokenContextMenuButton = document.querySelector("#closeTokenContextMenu");
const contextInitiativeInput = document.querySelector("#contextInitiativeInput");
const contextDiceModifierInput = document.querySelector("#contextDiceModifierInput");
const contextCriticalModifierInput = document.querySelector("#contextCriticalModifierInput");
const contextAttackModifierInput = document.querySelector("#contextAttackModifierInput");
const contextDamageValue = document.querySelector("#contextDamageValue");
const contextDamageInput = document.querySelector("#contextDamageInput");
const applyContextDamageButton = document.querySelector("#applyContextDamage");
const clearContextDamageButton = document.querySelector("#clearContextDamage");
const contextBadStatusInputs = [...tokenContextMenu.querySelectorAll('input[name="contextBadStatus"]')];
const contextPoisonLevelField = document.querySelector("#contextPoisonLevelField");
const contextPoisonLevelInput = document.querySelector("#contextPoisonLevelInput");
const enemyGroupDamageActions = document.querySelector("#enemyGroupDamageActions");
const applyEngageDamageButton = document.querySelector("#applyEngageDamage");
const applyAllEnemyDamageButton = document.querySelector("#applyAllEnemyDamage");
const engageContextMenu = document.querySelector("#engageContextMenu");
const contextEngageName = document.querySelector("#contextEngageName");
const closeEngageContextMenuButton = document.querySelector("#closeEngageContextMenu");
const engageEnemyCount = document.querySelector("#engageEnemyCount");
const engageDamageInput = document.querySelector("#engageDamageInput");
const applyEngageEnemyDamageButton = document.querySelector("#applyEngageEnemyDamage");
const applyAllEnemyDamageFromEngageButton = document.querySelector("#applyAllEnemyDamageFromEngage");
const fsPageLink = document.querySelector("#fsPageLink");

let state = loadState();
let selected = { type: "engage", id: state.engages[0]?.id ?? null };
let activeTool = "select";
let drag = null;
let attentionTokenId = null;
let attentionTimer = null;
let capturedDamageExpression = null;
let contextTokenId = null;
let contextEngageId = null;
let miniWindow = null;
let miniWindowOpening = false;
let compactView = "board";
const standaloneCompactMode = new URLSearchParams(window.location.search).get("compact") === "1";
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
      { id: "token-3", type: "pc", shape: "circle", name: "PC1", initiative: 0, damage: 0, diceModifier: 0, criticalModifier: 0, attackModifier: 0, badStatuses: [], poisonLevel: 1, size: TOKEN_SIZE, x: 215, y: 235, engageId: "engage-1" },
      { id: "token-4", type: "pc", shape: "circle", name: "PC2", initiative: 0, damage: 0, diceModifier: 0, criticalModifier: 0, attackModifier: 0, badStatuses: [], poisonLevel: 1, size: TOKEN_SIZE, x: 285, y: 235, engageId: "engage-1" },
      { id: "token-5", type: "enemy", shape: "circle", name: "敵1", initiative: 0, damage: 0, diceModifier: 0, criticalModifier: 0, attackModifier: 0, badStatuses: [], poisonLevel: 1, size: TOKEN_SIZE, x: 525, y: 235, engageId: "engage-2" },
      { id: "token-6", type: "enemy", shape: "circle", name: "敵2", initiative: 0, damage: 0, diceModifier: 0, criticalModifier: 0, attackModifier: 0, badStatuses: [], poisonLevel: 1, size: TOKEN_SIZE, x: 595, y: 235, engageId: "engage-2" },
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
      diceModifier: normalizeModifier(item.diceModifier),
      criticalModifier: normalizeModifier(item.criticalModifier),
      attackModifier: normalizeAttackModifier(item.attackModifier),
      badStatuses: normalizeBadStatuses(item.badStatuses),
      poisonLevel: normalizePoisonLevel(item.poisonLevel),
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
  const editorDocument = editorForm.ownerDocument;
  const activeElement = editorDocument.activeElement;
  const ElementClass = editorDocument.defaultView?.HTMLElement;
  return Boolean(ElementClass && activeElement instanceof ElementClass && activeElement.closest("#editorForm"));
}

function applySharedState(candidate) {
  if (drag || isEditorActive()) {
    return false;
  }

  applyingSharedState = true;
  try {
    const nextState = normalizeState(candidate);
    queueRemoteMovementAnimations(state, nextState);
    undoStack = rebaseHistoryStack(undoStack, state, nextState);
    redoStack = rebaseHistoryStack(redoStack, state, nextState);
    if (historyTransaction != null) {
      historyTransaction = rebaseHistorySnapshot(historyTransaction, state, nextState);
    }
    state = nextState;
    reconcileSelectionAfterRemoteLoad();
    render();
  } finally {
    applyingSharedState = false;
  }
  return true;
}

function rebaseHistoryStack(stack, currentState, nextState) {
  return stack.map((snapshot) => rebaseHistorySnapshot(snapshot, currentState, nextState));
}

function rebaseHistorySnapshot(snapshot, currentState, nextState) {
  try {
    const historyState = JSON.parse(snapshot);
    return JSON.stringify(applyRemoteDelta(historyState, currentState, nextState));
  } catch {
    return snapshot;
  }
}

function applyRemoteDelta(historyValue, currentValue, nextValue, key = "") {
  if (JSON.stringify(currentValue) === JSON.stringify(nextValue)) {
    return structuredClone(historyValue);
  }

  if (["engages", "tokens", "shapes"].includes(key)) {
    return rebaseEntityCollection(historyValue, currentValue, nextValue);
  }

  if (isPlainObject(currentValue) && isPlainObject(nextValue)) {
    const result = isPlainObject(historyValue) ? structuredClone(historyValue) : {};
    for (const property of new Set([...Object.keys(currentValue), ...Object.keys(nextValue)])) {
      const rebased = applyRemoteDelta(
        historyValue?.[property],
        currentValue[property],
        nextValue[property],
        property,
      );
      if (rebased === undefined) {
        delete result[property];
      } else {
        result[property] = rebased;
      }
    }
    return result;
  }

  return structuredClone(nextValue);
}

function rebaseEntityCollection(historyItems, currentItems, nextItems) {
  const historyMap = toHistoryEntityMap(historyItems);
  const currentMap = toHistoryEntityMap(currentItems);
  const nextMap = toHistoryEntityMap(nextItems);
  const orderedIds = [
    ...nextMap.keys(),
    ...[...historyMap.keys()].filter((id) => !nextMap.has(id)),
  ];

  return orderedIds.flatMap((id) => {
    const historyItem = historyMap.get(id);
    const currentItem = currentMap.get(id);
    const nextItem = nextMap.get(id);
    if (currentItem == null && nextItem == null) {
      return historyItem == null ? [] : [structuredClone(historyItem)];
    }
    if (currentItem == null) {
      return [structuredClone(nextItem)];
    }
    if (nextItem == null || historyItem == null) {
      return [];
    }
    return [applyRemoteDelta(historyItem, currentItem, nextItem)];
  });
}

function toHistoryEntityMap(items) {
  return new Map(
    (Array.isArray(items) ? items : [])
      .filter((item) => isPlainObject(item) && item.id != null)
      .map((item) => [String(item.id), item]),
  );
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
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
  renderTokenContextMenu();
  renderEngageContextMenu();
  renderRoster();
  updateCounts();
  renderInitiativeList();
  renderTurnControls();
  updateTools();
  saveState();
}

function renderShapes() {
  terrainLayer.innerHTML = "";
  resizeLayer.innerHTML = "";
  [...shapeLayer.querySelectorAll(".draw-shape")].forEach((node) => node.remove());
  state.shapes.forEach((shape) => {
    const layer = shape.kind === "terrain-rect" ? terrainLayer : shapeLayer;
    layer.append(createShapeNode(shape));
    if (isSelected("shape", shape.id)) {
      resizeLayer.append(...createShapeResizeHandles(shape));
    }
  });
}

function createShapeResizeHandles(shape) {
  if (shape.kind === "terrain-rect") {
    return createSvgBoxResizeHandles("shape", shape.id, getShapeBounds(shape));
  }
  if (shape.kind === "circle") {
    return [createSvgResizeHandle("shape", shape.id, "radius", shape.x + shape.radius, shape.y)];
  }
  return [createLineHandle(shape, "start"), createLineHandle(shape, "end")];
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
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("draw-shape", "draw-circle-group");
    decorateShapeNode(group, shape);

    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("cx", shape.x);
    node.setAttribute("cy", shape.y);
    node.setAttribute("r", shape.radius);
    node.classList.add("draw-circle");
    group.append(node);
    return group;
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

function createSvgBoxResizeHandles(type, id, bounds) {
  return BOX_RESIZE_HANDLES.map((handle) => {
    const point = getResizeHandlePoint(bounds, handle);
    return createSvgResizeHandle(type, id, handle, point.x, point.y);
  });
}

function createSvgResizeHandle(type, id, handle, x, y) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  node.setAttribute("cx", x);
  node.setAttribute("cy", y);
  node.setAttribute("r", 8);
  node.classList.add("resize-handle", `resize-${handle}`);
  node.dataset.type = type;
  node.dataset.id = id;
  node.dataset.resizeHandle = handle;
  return node;
}

function getResizeHandlePoint(bounds, handle) {
  return {
    x: handle.includes("w") ? bounds.left : handle.includes("e") ? bounds.right : (bounds.left + bounds.right) / 2,
    y: handle.includes("n") ? bounds.top : handle.includes("s") ? bounds.bottom : (bounds.top + bounds.bottom) / 2,
  };
}

function getShapeBounds(shape) {
  return {
    left: shape.x - shape.width / 2,
    top: shape.y - shape.height / 2,
    right: shape.x + shape.width / 2,
    bottom: shape.y + shape.height / 2,
  };
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
    if (isSelected("engage", engage.id)) {
      resizeLayer.append(...createSvgBoxResizeHandles("engage", engage.id, getResizableBounds("engage", engage)));
    }
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
    const effects = getTokenEffects(token);
    if (effects.length) {
      const statuses = document.createElement("span");
      statuses.className = "token-bad-statuses";
      effects.forEach((effect) => {
        const badge = document.createElement("span");
        badge.className = `token-bad-status ${effect.type}`;
        badge.textContent = effect.label;
        if (effect.description) {
          badge.classList.add("status-with-tooltip");
          badge.dataset.description = effect.description;
        }
        statuses.append(badge);
      });
      node.append(statuses);
    }
    if (isSelected("token", token.id) && token.type === "enemy") {
      if (token.shape === "rect") {
        resizeLayer.append(...createSvgBoxResizeHandles("token", token.id, getResizableBounds("token", token)));
      } else {
        resizeLayer.append(createSvgResizeHandle("token", token.id, "radius", token.x + token.size / 2, token.y));
      }
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
  modifierField.hidden = !isToken;
  const canResizeEnemyCircle = isToken && item.type === "enemy" && item.shape !== "rect";
  tokenSizeField.hidden = !canResizeEnemyCircle;
  if (canResizeEnemyCircle) {
    tokenSizeInput.value = item.size;
  }
  damageField.hidden = !isToken;
  badStatusField.hidden = !isToken;
  poisonLevelField.hidden = !isToken || !item.badStatuses?.includes("poison");
  if (isToken) {
    initiativeInput.value = item.initiative;
    diceModifierInput.value = item.diceModifier;
    criticalModifierInput.value = item.criticalModifier;
    attackModifierInput.value = item.attackModifier;
    damageValue.textContent = item.damage;
    damageInput.value = "";
    badStatusInputs.forEach((input) => {
      input.checked = item.badStatuses.includes(input.value);
    });
    poisonLevelInput.value = item.poisonLevel;
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

    const identity = document.createElement("span");
    identity.className = "initiative-identity";

    const name = document.createElement("span");
    name.className = "initiative-name";
    name.textContent = token.name;
    name.title = name.textContent;
    identity.append(name);

    const tokenEffects = getTokenEffects(token);
    const effectLabels = tokenEffects.map((effect) => effect.label);
    if (effectLabels.length) {
      const statuses = document.createElement("span");
      statuses.className = "initiative-statuses";
      statuses.textContent = effectLabels.join("・");
      const descriptions = tokenEffects
        .filter((effect) => effect.description)
        .map((effect) => `${effect.label}: ${effect.description}`);
      if (descriptions.length) {
        statuses.classList.add("status-with-tooltip");
        statuses.dataset.description = descriptions.join(" / ");
      } else {
        statuses.title = effectLabels.join(" / ");
      }
      identity.append(statuses);
    }

    const value = document.createElement("span");
    value.className = "initiative-value";
    value.textContent = token.initiative;

    row.append(identity);
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

function normalizeModifier(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.trunc(number), -99, 99) : 0;
}

function normalizeAttackModifier(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.trunc(number), -999, 999) : 0;
}

function normalizePoisonLevel(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.trunc(number), 1, 99) : 1;
}

function normalizeBadStatuses(value) {
  const selectedStatuses = new Set(Array.isArray(value) ? value.map(String) : []);
  if (selectedStatuses.has("evil-reading")) {
    selectedStatuses.add("poison");
  }
  return BAD_STATUSES.map((status) => status.id).filter((id) => selectedStatuses.has(id));
}

function getBadStatuses(token) {
  const selectedStatuses = new Set(token.badStatuses ?? []);
  return BAD_STATUSES.filter((status) => selectedStatuses.has(status.id));
}

function formatSignedModifier(value) {
  return value > 0 ? `+${value}` : String(value);
}

function getTokenEffects(token) {
  const effects = [];
  if (token.diceModifier) {
    effects.push({ type: "dice", label: `${formatSignedModifier(token.diceModifier)}D` });
  }
  if (token.criticalModifier) {
    effects.push({ type: "critical", label: `C値${formatSignedModifier(token.criticalModifier)}` });
  }
  if (token.attackModifier) {
    effects.push({ type: "attack", label: `攻撃力${formatSignedModifier(token.attackModifier)}` });
  }
  getBadStatuses(token).forEach((status) => {
    const label = status.id === "poison" ? `${status.name} Lv${normalizePoisonLevel(token.poisonLevel)}` : status.name;
    effects.push({ type: "bad-status", label, description: status.description });
  });
  return effects;
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

function getContextToken() {
  return state.tokens.find((token) => token.id === contextTokenId) ?? null;
}

function openTokenContextMenu(tokenId, clientX, clientY) {
  const token = state.tokens.find((item) => item.id === tokenId);
  if (!token) {
    return;
  }
  selected = { type: "token", id: tokenId };
  activeTool = "select";
  closeEngageContextMenu();
  contextTokenId = tokenId;
  contextDamageInput.value = "";
  render();
  tokenContextMenu.hidden = false;
  positionContextMenu(tokenContextMenu, clientX, clientY);
}

function closeTokenContextMenu() {
  contextTokenId = null;
  tokenContextMenu.hidden = true;
}

function renderTokenContextMenu() {
  if (!contextTokenId) {
    return;
  }
  const token = getContextToken();
  if (!token) {
    closeTokenContextMenu();
    return;
  }
  contextTokenName.textContent = token.name || "名称なし";
  contextInitiativeInput.value = token.initiative;
  contextDiceModifierInput.value = token.diceModifier;
  contextCriticalModifierInput.value = token.criticalModifier;
  contextAttackModifierInput.value = token.attackModifier;
  contextDamageValue.textContent = token.damage;
  enemyGroupDamageActions.hidden = token.type !== "enemy";
  applyEngageDamageButton.disabled = !token.engageId || !getEnemyTokens(token.engageId).length;
  contextPoisonLevelField.hidden = !token.badStatuses.includes("poison");
  contextPoisonLevelInput.value = token.poisonLevel;
  contextBadStatusInputs.forEach((input) => {
    input.checked = token.badStatuses.includes(input.value);
  });
}

function updateContextToken(callback) {
  const token = getContextToken();
  if (!token) {
    closeTokenContextMenu();
    return;
  }
  changeWithHistory(() => callback(token));
  render();
}

function applyContextDamage() {
  const token = getContextToken();
  if (!token) {
    closeTokenContextMenu();
    return;
  }
  const delta = parseDamageExpression(contextDamageInput.value);
  if (delta == null) {
    contextDamageInput.select();
    return;
  }
  updateContextToken((item) => {
    item.damage = normalizeDamage(item.damage + delta);
  });
  contextDamageInput.value = "";
  contextDamageInput.focus();
}

function getEnemyTokens(engageId = null) {
  return state.tokens.filter((token) => token.type === "enemy" && (engageId == null || token.engageId === engageId));
}

function applyDamageToTokens(tokens, value, input) {
  const delta = parseDamageExpression(value);
  if (delta == null || !tokens.length) {
    input?.select();
    return false;
  }
  changeWithHistory(() => {
    tokens.forEach((token) => {
      token.damage = normalizeDamage(token.damage + delta);
    });
  });
  render();
  if (input) {
    input.value = "";
    input.focus();
  }
  return true;
}

function openEngageContextMenu(engageId, clientX, clientY) {
  const engage = state.engages.find((item) => item.id === engageId);
  if (!engage) {
    return;
  }
  closeTokenContextMenu();
  selected = { type: "engage", id: engageId };
  activeTool = "select";
  contextEngageId = engageId;
  engageDamageInput.value = "";
  render();
  contextEngageName.textContent = engage.name || "名称なし";
  const enemyCount = getEnemyTokens(engageId).length;
  engageEnemyCount.textContent = `所属エネミー ${enemyCount}体`;
  applyEngageEnemyDamageButton.disabled = enemyCount === 0;
  applyAllEnemyDamageFromEngageButton.disabled = getEnemyTokens().length === 0;
  engageContextMenu.hidden = false;
  positionContextMenu(engageContextMenu, clientX, clientY);
}

function closeEngageContextMenu() {
  contextEngageId = null;
  engageContextMenu.hidden = true;
}

function renderEngageContextMenu() {
  if (!contextEngageId) {
    return;
  }
  const engage = state.engages.find((item) => item.id === contextEngageId);
  if (!engage) {
    closeEngageContextMenu();
    return;
  }
  const enemyCount = getEnemyTokens(contextEngageId).length;
  contextEngageName.textContent = engage.name || "名称なし";
  engageEnemyCount.textContent = `所属エネミー ${enemyCount}体`;
  applyEngageEnemyDamageButton.disabled = enemyCount === 0;
  applyAllEnemyDamageFromEngageButton.disabled = getEnemyTokens().length === 0;
}

function positionContextMenu(menu, clientX, clientY) {
  const menuRect = menu.getBoundingClientRect();
  const menuWindow = menu.ownerDocument.defaultView ?? window;
  menu.style.left = `${clamp(clientX, 8, menuWindow.innerWidth - menuRect.width - 8)}px`;
  menu.style.top = `${clamp(clientY, 8, menuWindow.innerHeight - menuRect.height - 8)}px`;
}

function setCompactView(nextView) {
  compactView = nextView === "initiative" ? "initiative" : "board";
  compactViewButtons.forEach((button) => {
    const active = button.dataset.compactView === compactView;
    button.setAttribute("aria-pressed", String(active));
  });
  const compactDocument = battleArea.ownerDocument;
  compactDocument.body.dataset.compactView = compactView;
  if (compactView === "board") {
    compactDocument.defaultView?.requestAnimationFrame(updateCompactBoardScale);
  }
}

function updateCompactBoardScale() {
  const compactDocument = battleArea.ownerDocument;
  if (!compactDocument.body.classList.contains("compact-mode") || compactView !== "board") {
    return;
  }
  const compactWindow = compactDocument.defaultView;
  const viewportWidth = Math.max(240, boardViewport.clientWidth);
  const viewportTop = boardViewport.getBoundingClientRect().top;
  const viewportHeight = Math.max(168, (compactWindow?.innerHeight ?? 720) - viewportTop - 10);
  const scale = Math.min(1, viewportWidth / board.clientWidth, viewportHeight / board.clientHeight);
  compactDocument.body.style.setProperty("--compact-board-scale", scale.toFixed(4));
  compactDocument.body.style.setProperty("--compact-board-height", `${Math.round(board.clientHeight * scale)}px`);
}

function getCompactViewUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("compact", "1");
  return url.href;
}

function openFallbackCompactWindow() {
  const popup = window.open(
    getCompactViewUrl(),
    "dx3rd-compact-board",
    "popup,width=560,height=720,resizable=yes,scrollbars=no",
  );
  if (!popup) {
    window.alert("小窓を開けませんでした。ブラウザのポップアップ許可を確認してください。");
  } else {
    popup.focus();
  }
}

async function openMiniWindow() {
  if (miniWindowOpening) {
    return;
  }
  if (standaloneCompactMode) {
    if (window.opener && !window.opener.closed) {
      window.opener.focus();
      window.close();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("compact");
    window.location.assign(url.href);
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
  closeTokenContextMenu();
  closeEngageContextMenu();
  try {
    const pipWindow = await window.documentPictureInPicture.requestWindow({ width: 560, height: 720 });
    const pipDocument = pipWindow.document;
    const viewport = pipDocument.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1.0";
    const stylesheet = pipDocument.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = document.querySelector('link[rel="stylesheet"]').href;
    stylesheet.addEventListener("load", updateCompactBoardScale, { once: true });
    pipDocument.head.append(viewport, stylesheet);
    pipDocument.title = "DX3rd Combat Board - 小窓";
    pipDocument.documentElement.lang = "ja";
    pipDocument.body.className = "compact-mode";

    miniWindow = pipWindow;
    miniWindowPlaceholder.hidden = false;
    pipDocument.body.append(battleArea, tokenContextMenu, engageContextMenu);
    compactViewControls.hidden = false;
    openMiniWindowButton.textContent = "小窓を閉じる";
    registerInteractionWindow(pipWindow);
    pipWindow.addEventListener("resize", updateCompactBoardScale);
    pipWindow.addEventListener("pagehide", restoreMainWindow, { once: true });
    setCompactView(compactView);
  } catch (error) {
    console.warn("Compact window could not be opened.", error);
    window.alert("小窓を開けませんでした。ブラウザの設定を確認してください。");
  } finally {
    miniWindowOpening = false;
    openMiniWindowButton.disabled = false;
  }
}

function restoreMainWindow() {
  const closingWindow = miniWindow;
  if (drag) {
    endPointer();
  }
  if (closingWindow) {
    unregisterInteractionWindow(closingWindow);
    closingWindow.removeEventListener("resize", updateCompactBoardScale);
  }
  if (battleArea.ownerDocument !== document) {
    appShell.insertBefore(battleArea, miniWindowPlaceholder);
    document.body.append(tokenContextMenu, engageContextMenu);
  }
  miniWindow = null;
  miniWindowPlaceholder.hidden = true;
  compactViewControls.hidden = true;
  openMiniWindowButton.textContent = "小窓表示";
  document.body.style.removeProperty("--compact-board-scale");
  document.body.style.removeProperty("--compact-board-height");
}

function initializeStandaloneCompactMode() {
  if (!standaloneCompactMode) {
    return;
  }
  document.body.classList.add("compact-mode");
  compactViewControls.hidden = false;
  openMiniWindowButton.textContent = "小窓を閉じる";
  window.addEventListener("resize", updateCompactBoardScale);
  setCompactView(compactView);
}

function getBoardPoint(event) {
  const rect = board.getBoundingClientRect();
  const scaleX = rect.width ? board.clientWidth / rect.width : 1;
  const scaleY = rect.height ? board.clientHeight / rect.height : 1;
  return {
    x: clamp((event.clientX - rect.left) * scaleX, 0, board.clientWidth),
    y: clamp((event.clientY - rect.top) * scaleY, 0, board.clientHeight),
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
    diceModifier: 0,
    criticalModifier: 0,
    attackModifier: 0,
    badStatuses: [],
    poisonLevel: 1,
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
    diceModifier: 0,
    criticalModifier: 0,
    attackModifier: 0,
    badStatuses: [],
    poisonLevel: 1,
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

  if (target.dataset.resizeHandle) {
    drag = createResizeDrag(type, id, target.dataset.resizeHandle);
  } else if (type === "shape" && target.dataset.handle) {
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

function createResizeDrag(type, id, handle) {
  const item =
    type === "engage"
      ? state.engages.find((candidate) => candidate.id === id)
      : type === "token"
        ? state.tokens.find((candidate) => candidate.id === id)
        : state.shapes.find((candidate) => candidate.id === id);
  return {
    type: "resize",
    objectType: type,
    id,
    handle,
    itemStart: structuredClone(item),
    bounds: getResizableBounds(type, item),
  };
}

function getResizableBounds(type, item) {
  if (type === "engage") {
    return {
      left: item.x - item.radiusX,
      top: item.y - item.radiusY,
      right: item.x + item.radiusX,
      bottom: item.y + item.radiusY,
    };
  }
  if (type === "token") {
    const width = getTokenWidth(item);
    const height = getTokenHeight(item);
    return {
      left: item.x - width / 2,
      top: item.y - height / 2,
      right: item.x + width / 2,
      bottom: item.y + height / 2,
    };
  }
  if (item.kind === "circle") {
    return {
      left: item.x - item.radius,
      top: item.y - item.radius,
      right: item.x + item.radius,
      bottom: item.y + item.radius,
    };
  }
  return getShapeBounds(item);
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
  } else if (drag.type === "resize") {
    moveResizeHandle(point);
  }
}

function moveResizeHandle(point) {
  const item =
    drag.objectType === "engage"
      ? state.engages.find((candidate) => candidate.id === drag.id)
      : drag.objectType === "token"
        ? state.tokens.find((candidate) => candidate.id === drag.id)
        : state.shapes.find((candidate) => candidate.id === drag.id);
  if (!item) {
    return;
  }

  if (drag.handle === "radius") {
    resizeCircularItem(item, point);
  } else {
    resizeBoxItem(item, point);
  }
  render();
}

function resizeCircularItem(item, point) {
  const start = drag.itemStart;
  const maxRadius = Math.max(
    MIN_DRAW_SIZE,
    Math.min(
      drag.objectType === "shape" ? 240 : 90,
      start.x,
      board.clientWidth - start.x,
      start.y,
      board.clientHeight - start.y,
    ),
  );
  const radius = clamp(Math.hypot(point.x - start.x, point.y - start.y), MIN_DRAW_SIZE, maxRadius);
  if (drag.objectType === "token") {
    item.size = clamp(radius * 2, 40, Math.min(180, maxRadius * 2));
  } else {
    item.radius = radius;
  }
}

function resizeBoxItem(item, point) {
  const bounds = drag.bounds;
  const handle = drag.handle;
  const minWidth = drag.objectType === "engage" ? 180 : drag.objectType === "token" ? 40 : 24;
  const minHeight = drag.objectType === "engage" ? 120 : minWidth;
  const maxWidth = drag.objectType === "engage" ? 720 : board.clientWidth;
  const maxHeight = drag.objectType === "engage" ? 520 : board.clientHeight;
  let { left, top, right, bottom } = bounds;

  if (handle.includes("w")) {
    left = clamp(point.x, Math.max(0, right - maxWidth), right - minWidth);
  }
  if (handle.includes("e")) {
    right = clamp(point.x, left + minWidth, Math.min(board.clientWidth, left + maxWidth));
  }
  if (handle.includes("n")) {
    top = clamp(point.y, Math.max(0, bottom - maxHeight), bottom - minHeight);
  }
  if (handle.includes("s")) {
    bottom = clamp(point.y, top + minHeight, Math.min(board.clientHeight, top + maxHeight));
  }

  const width = right - left;
  const height = bottom - top;
  item.x = left + width / 2;
  item.y = top + height / 2;
  if (drag.objectType === "engage") {
    item.radiusX = width / 2;
    item.radiusY = height / 2;
  } else {
    item.width = width;
    item.height = height;
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
  const completedDrawing = ["draw", "draw-terrain-rect", "draw-token-rect"].includes(completedDrag?.type);
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
  if (completedDrawing) {
    activeTool = "select";
  }
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

function handleContextMenu(event) {
  const tokenTarget = event.target?.closest?.('[data-type="token"][data-id]');
  if (tokenTarget) {
    event.preventDefault();
    openTokenContextMenu(tokenTarget.dataset.id, event.clientX, event.clientY);
    return;
  }
  const engageTarget = event.target?.closest?.('[data-type="engage"][data-id]');
  if (engageTarget) {
    event.preventDefault();
    openEngageContextMenu(engageTarget.dataset.id, event.clientX, event.clientY);
  }
}

function handleOutsidePointerDown(event) {
  if (!tokenContextMenu.hidden && event.button === 0 && !tokenContextMenu.contains(event.target)) {
    closeTokenContextMenu();
  }
  if (!engageContextMenu.hidden && event.button === 0 && !engageContextMenu.contains(event.target)) {
    closeEngageContextMenu();
  }
}

function registerInteractionWindow(targetWindow) {
  targetWindow.document.addEventListener("contextmenu", handleContextMenu);
  targetWindow.document.addEventListener("pointerdown", handleOutsidePointerDown);
  targetWindow.addEventListener("pointermove", movePointer);
  targetWindow.addEventListener("pointerup", endPointer);
  targetWindow.addEventListener("pointercancel", endPointer);
  targetWindow.addEventListener("keydown", handleGlobalKeyDown);
}

function unregisterInteractionWindow(targetWindow) {
  targetWindow.document.removeEventListener("contextmenu", handleContextMenu);
  targetWindow.document.removeEventListener("pointerdown", handleOutsidePointerDown);
  targetWindow.removeEventListener("pointermove", movePointer);
  targetWindow.removeEventListener("pointerup", endPointer);
  targetWindow.removeEventListener("pointercancel", endPointer);
  targetWindow.removeEventListener("keydown", handleGlobalKeyDown);
}

board.addEventListener("pointerdown", startPointer);

closeTokenContextMenuButton.addEventListener("click", closeTokenContextMenu);
closeEngageContextMenuButton.addEventListener("click", closeEngageContextMenu);
openMiniWindowButton.addEventListener("click", openMiniWindow);
restoreMiniWindowButton.addEventListener("click", () => {
  if (miniWindow && !miniWindow.closed) {
    miniWindow.close();
  } else {
    restoreMainWindow();
  }
});
compactViewButtons.forEach((button) => {
  button.addEventListener("click", () => setCompactView(button.dataset.compactView));
});
contextInitiativeInput.addEventListener("input", () => {
  if (contextInitiativeInput.value === "") {
    return;
  }
  updateContextToken((token) => {
    token.initiative = normalizeInitiative(contextInitiativeInput.value);
  });
  contextInitiativeInput.focus();
});
contextDiceModifierInput.addEventListener("input", () => {
  if (contextDiceModifierInput.value === "") {
    return;
  }
  updateContextToken((token) => {
    token.diceModifier = normalizeModifier(contextDiceModifierInput.value);
  });
  contextDiceModifierInput.focus();
});
contextCriticalModifierInput.addEventListener("input", () => {
  if (contextCriticalModifierInput.value === "") {
    return;
  }
  updateContextToken((token) => {
    token.criticalModifier = normalizeModifier(contextCriticalModifierInput.value);
  });
  contextCriticalModifierInput.focus();
});
contextAttackModifierInput.addEventListener("input", () => {
  if (contextAttackModifierInput.value === "") {
    return;
  }
  updateContextToken((token) => {
    token.attackModifier = normalizeAttackModifier(contextAttackModifierInput.value);
  });
  contextAttackModifierInput.focus();
});
contextPoisonLevelInput.addEventListener("input", () => {
  if (contextPoisonLevelInput.value === "") {
    return;
  }
  updateContextToken((token) => {
    token.poisonLevel = normalizePoisonLevel(contextPoisonLevelInput.value);
  });
  contextPoisonLevelInput.focus();
});
applyContextDamageButton.addEventListener("click", applyContextDamage);
applyEngageDamageButton.addEventListener("click", () => {
  const token = getContextToken();
  if (token?.engageId) {
    applyDamageToTokens(getEnemyTokens(token.engageId), contextDamageInput.value, contextDamageInput);
  }
});
applyAllEnemyDamageButton.addEventListener("click", () => {
  applyDamageToTokens(getEnemyTokens(), contextDamageInput.value, contextDamageInput);
});
applyEngageEnemyDamageButton.addEventListener("click", () => {
  if (contextEngageId) {
    applyDamageToTokens(getEnemyTokens(contextEngageId), engageDamageInput.value, engageDamageInput);
  }
});
applyAllEnemyDamageFromEngageButton.addEventListener("click", () => {
  applyDamageToTokens(getEnemyTokens(), engageDamageInput.value, engageDamageInput);
});
engageDamageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && contextEngageId) {
    event.preventDefault();
    applyDamageToTokens(getEnemyTokens(contextEngageId), engageDamageInput.value, engageDamageInput);
  }
});
clearContextDamageButton.addEventListener("click", () => {
  updateContextToken((token) => {
    token.damage = 0;
  });
});
contextDamageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyContextDamage();
  }
});
contextBadStatusInputs.forEach((input) => {
  input.addEventListener("change", () => {
    updateContextToken((token) => {
      token.badStatuses = normalizeBadStatuses(
        contextBadStatusInputs
          .filter((statusInput) => statusInput.checked)
          .map((statusInput) => statusInput.value),
      );
    });
    input.focus();
  });
});

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
  if (initiativeInput.value === "") {
    return;
  }
  const item = getSelectedItem();
  if (item && selected.type === "token") {
    item.initiative = normalizeInitiative(initiativeInput.value);
    render();
    initiativeInput.focus();
  }
});

diceModifierInput.addEventListener("input", () => {
  if (diceModifierInput.value === "") {
    return;
  }
  const item = getSelectedItem();
  if (item && selected.type === "token") {
    item.diceModifier = normalizeModifier(diceModifierInput.value);
    render();
    diceModifierInput.focus();
  }
});

criticalModifierInput.addEventListener("input", () => {
  if (criticalModifierInput.value === "") {
    return;
  }
  const item = getSelectedItem();
  if (item && selected.type === "token") {
    item.criticalModifier = normalizeModifier(criticalModifierInput.value);
    render();
    criticalModifierInput.focus();
  }
});

attackModifierInput.addEventListener("input", () => {
  if (attackModifierInput.value === "") {
    return;
  }
  const item = getSelectedItem();
  if (item && selected.type === "token") {
    item.attackModifier = normalizeAttackModifier(attackModifierInput.value);
    render();
    attackModifierInput.focus();
  }
});

poisonLevelInput.addEventListener("input", () => {
  if (poisonLevelInput.value === "") {
    return;
  }
  const item = getSelectedItem();
  if (item && selected.type === "token") {
    item.poisonLevel = normalizePoisonLevel(poisonLevelInput.value);
    render();
    poisonLevelInput.focus();
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

badStatusInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const item = getSelectedItem();
    if (!item || selected.type !== "token") {
      return;
    }
    changeWithHistory(() => {
      item.badStatuses = normalizeBadStatuses(
        badStatusInputs.filter((statusInput) => statusInput.checked).map((statusInput) => statusInput.value),
      );
    });
    render();
    input.focus();
  });
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

function isHistoryShortcut(event, key) {
  return event.key.toLowerCase() === key || event.code === `Key${key.toUpperCase()}`;
}

function handleGlobalKeyDown(event) {
  if (event.key === "Escape" && (!tokenContextMenu.hidden || !engageContextMenu.hidden)) {
    event.preventDefault();
    closeTokenContextMenu();
    closeEngageContextMenu();
    return;
  }
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && !event.altKey && isHistoryShortcut(event, "z")) {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }
  if (modifier && !event.altKey && isHistoryShortcut(event, "y")) {
    event.preventDefault();
    redo();
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && !isEditingText(event)) {
    event.preventDefault();
    deleteSelected();
  }
}

function updateFsPageLink() {
  if (!fsPageLink) {
    return;
  }
  const destination = new URL("fs/", window.location.href);
  destination.searchParams.delete("compact");
  destination.hash = window.location.hash;
  fsPageLink.href = destination.href;
}

window.DX3RDBoard = Object.freeze({
  applySharedState,
  serializeState,
});

registerInteractionWindow(window);
updateFsPageLink();
window.addEventListener("hashchange", updateFsPageLink);
initializeStandaloneCompactMode();
render();
initializeRemoteState();
