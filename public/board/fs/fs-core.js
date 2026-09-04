const FS_COLLECTIONS = ["participants", "events", "history"];
const PARTICIPANT_STATES = new Set(["ready", "waiting", "acted"]);
const FS_STATUSES = new Set(["active", "success", "failure"]);
const HISTORY_TYPES = new Set(["progress", "support"]);

export function createInitialFsState() {
  return {
    version: 1,
    title: "",
    description: "",
    endCondition: "",
    targetProgress: 10,
    roundLimit: 5,
    skill: "",
    difficulty: 8,
    maxAchievement: 30,
    supportCheck: "",
    experiencePoints: 0,
    memo: "",
    round: 1,
    status: "active",
    currentParticipantId: null,
    participants: [],
    events: [],
    history: [],
  };
}

export function normalizeFsState(candidate) {
  const source = isRecord(candidate) ? candidate : {};
  const participants = normalizeEntityList(source.participants, normalizeParticipant, 80);
  const participantIds = new Set(participants.map((item) => item.id));
  return {
    version: 1,
    title: normalizeText(source.title),
    description: normalizeText(source.description),
    endCondition: normalizeText(source.endCondition),
    targetProgress: clampInteger(source.targetProgress, 1, 999, 10),
    roundLimit: clampInteger(source.roundLimit, 1, 99, 5),
    skill: normalizeText(source.skill),
    difficulty: clampInteger(source.difficulty, -99, 999, 8),
    maxAchievement: clampInteger(source.maxAchievement, 1, 999, 30),
    supportCheck: normalizeText(source.supportCheck),
    experiencePoints: clampInteger(source.experiencePoints, 0, 999, 0),
    memo: normalizeText(source.memo),
    round: clampInteger(source.round, 1, 999, 1),
    status: FS_STATUSES.has(source.status) ? source.status : "active",
    currentParticipantId: participantIds.has(String(source.currentParticipantId))
      ? String(source.currentParticipantId)
      : null,
    participants,
    events: normalizeEntityList(source.events, normalizeEvent, 100),
    history: normalizeEntityList(source.history, normalizeHistoryEntry, 1000),
  };
}

function normalizeParticipant(item) {
  if (!isRecord(item) || item.id == null) {
    return null;
  }
  const source = item.source === "board" ? "board" : "extra";
  return {
    id: String(item.id),
    source,
    boardTokenId: source === "board" && item.boardTokenId != null
      ? String(item.boardTokenId)
      : null,
    name: normalizeText(item.name),
    initiative: clampInteger(item.initiative, -99, 999, 0),
    turnState: PARTICIPANT_STATES.has(item.turnState) ? item.turnState : "ready",
  };
}

function normalizeEvent(item) {
  if (!isRecord(item) || item.id == null) {
    return null;
  }
  const newDifficulty = item.newDifficulty === "" || item.newDifficulty == null
    ? null
    : clampInteger(item.newDifficulty, -99, 999, 0);
  return {
    id: String(item.id),
    threshold: clampInteger(item.threshold, 0, 999, 0),
    title: normalizeText(item.title),
    body: normalizeText(item.body),
    newSkill: normalizeText(item.newSkill),
    newDifficulty,
    newSupportCheck: normalizeText(item.newSupportCheck),
    revealed: Boolean(item.revealed),
  };
}

function normalizeHistoryEntry(item) {
  const type = item?.type === "adjustment" ? "progress" : item?.type;
  if (!isRecord(item) || item.id == null || !HISTORY_TYPES.has(type)) {
    return null;
  }
  return {
    id: String(item.id),
    type,
    participantId: item.participantId == null ? null : String(item.participantId),
    participantName: normalizeText(item.participantName),
    achievement: item.achievement == null
      ? null
      : clampInteger(item.achievement, -9999, 9999, 0),
    delta: clampInteger(item.delta, -999, 999, 0),
    success: item.success == null ? null : Boolean(item.success),
    note: normalizeText(item.note),
    createdAt: normalizeTimestamp(item.createdAt),
  };
}

export function calculateProgress(state) {
  return (Array.isArray(state?.history) ? state.history : []).reduce(
    (total, entry) => total + (entry?.type === "support" ? 0 : Number(entry?.delta) || 0),
    0,
  );
}

export function getEffectiveFsConditions(state) {
  const conditions = {
    skill: normalizeText(state?.skill),
    difficulty: clampInteger(state?.difficulty, -99, 999, 8),
    supportCheck: normalizeText(state?.supportCheck),
    sources: {
      skill: null,
      difficulty: null,
      supportCheck: null,
    },
  };
  const events = (Array.isArray(state?.events) ? state.events : [])
    .filter((event) => event?.revealed)
    .sort((left, right) =>
      (Number(left?.threshold) || 0) - (Number(right?.threshold) || 0)
      || String(left?.id ?? "").localeCompare(String(right?.id ?? "")),
    );

  events.forEach((event) => {
    const source = normalizeText(event.title) || "名称なし";
    if (event.newSkill) {
      conditions.skill = normalizeText(event.newSkill);
      conditions.sources.skill = source;
    }
    if (event.newDifficulty !== "" && event.newDifficulty != null) {
      conditions.difficulty = clampInteger(event.newDifficulty, -99, 999, conditions.difficulty);
      conditions.sources.difficulty = source;
    }
    if (event.newSupportCheck) {
      conditions.supportCheck = normalizeText(event.newSupportCheck);
      conditions.sources.supportCheck = source;
    }
  });

  return conditions;
}

export function suggestProgressDelta(achievement, difficulty, maxAchievement) {
  const value = Number(achievement);
  const target = Number(difficulty);
  const cap = Number(maxAchievement);
  if (!Number.isFinite(value) || !Number.isFinite(target) || value < 0 || value < target) {
    return 0;
  }
  const capped = Math.min(value, Number.isFinite(cap) && cap > 0 ? cap : value);
  return 1 + Math.floor(capped / 10);
}

export function createFsPatch(baseState, nextState) {
  const base = isRecord(baseState) ? baseState : {};
  const next = isRecord(nextState) ? nextState : {};
  const patch = { scalars: {}, collections: {} };

  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (FS_COLLECTIONS.includes(key)) {
      patch.collections[key] = createCollectionPatch(base[key], next[key]);
    } else if (!deepEqual(base[key], next[key])) {
      patch.scalars[key] = clone(next[key]);
    }
  }
  for (const key of FS_COLLECTIONS) {
    patch.collections[key] ??= { upserts: [], deletes: [] };
  }
  return patch;
}

export function mergeFsStates(baseState, localState, remoteState) {
  const base = isRecord(baseState) ? baseState : {};
  const local = isRecord(localState) ? localState : {};
  const remote = isRecord(remoteState) ? remoteState : {};
  const merged = {};

  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(remote),
    ...Object.keys(local),
  ])) {
    merged[key] = FS_COLLECTIONS.includes(key)
      ? mergeEntityCollection(base[key], local[key], remote[key])
      : mergeValue(base[key], local[key], remote[key]);
  }
  return merged;
}

export function getValidOutcomes(rawFormula) {
  const formula = normalizeDiceFormula(rawFormula);
  const diceMatch = /^(\d+)D(\d+)$/.exec(formula);
  if (diceMatch) {
    const count = Number(diceMatch[1]);
    const sides = Number(diceMatch[2]);
    const resultCount = count * sides - count + 1;
    if (count < 1 || count > 100 || sides < 2 || sides > 1000 || resultCount > 2000) {
      return null;
    }
    return range(count, count * sides);
  }
  if (formula === "D66" || formula === "D66N") {
    return flatMapRange(1, 6, (tens) => range(1, 6).map((ones) => tens * 10 + ones));
  }
  if (formula === "D66A" || formula === "D66S") {
    return flatMapRange(1, 6, (tens) => range(tens, 6).map((ones) => tens * 10 + ones));
  }
  if (formula === "D66D") {
    return flatMapRange(1, 6, (ones) => range(ones, 6).map((tens) => tens * 10 + ones)).sort((a, b) => a - b);
  }
  return null;
}

export function normalizeDiceFormula(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function validateRollTable(table) {
  const errors = [];
  const warnings = [];
  const name = String(table?.name ?? "");
  const formula = normalizeDiceFormula(table?.formula);
  const validOutcomes = getValidOutcomes(formula);
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const assignments = new Map();

  if (!name.trim()) {
    errors.push("表の名前を入力してください。");
  } else if (/\r|\n/.test(name)) {
    errors.push("表の名前に改行は使用できません。");
  }
  if (!formula) {
    errors.push("ダイス式を入力してください。");
  } else if (!validOutcomes) {
    errors.push("ダイス式は nDx または D66系を半角で入力してください。");
  }
  if (rows.length === 0) {
    errors.push("出目と結果を1件以上追加してください。");
  }

  rows.forEach((row, rowIndex) => {
    const label = `${rowIndex + 1}行目`;
    const parsed = parseOutcomeRange(row?.range);
    if (parsed.error) {
      errors.push(`${label}: ${parsed.error}`);
      return;
    }
    if (!String(row?.text ?? "").trim()) {
      warnings.push(`${label}: 結果が空欄です。`);
    }
    for (const outcome of range(parsed.start, parsed.end)) {
      if (assignments.has(outcome)) {
        errors.push(`${label}: 出目${outcome}が重複しています。`);
      } else {
        assignments.set(outcome, String(row?.text ?? ""));
      }
    }
  });

  if (validOutcomes) {
    const validSet = new Set(validOutcomes);
    const outside = [...assignments.keys()].filter((outcome) => !validSet.has(outcome));
    if (outside.length > 0) {
      errors.push(`範囲外の出目があります: ${formatNumberList(outside)}`);
    }
    const missing = validOutcomes.filter((outcome) => !assignments.has(outcome));
    if (missing.length > 0) {
      errors.push(`未設定の出目があります: ${formatNumberList(missing)}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: unique(errors),
    warnings: unique(warnings),
    name: name.trim(),
    formula,
    assignments,
  };
}

export function generateRollTableCommand(table) {
  const result = validateRollTable(table);
  if (!result.valid) {
    return { ...result, command: "" };
  }
  const rows = [...result.assignments.entries()]
    .sort(([left], [right]) => left - right)
    .map(([outcome, text]) => `${outcome}:${escapeResultText(text)}`);
  return {
    ...result,
    command: ["/roll-table", result.name, result.formula, ...rows].join("\n"),
  };
}

export function parseRollTableText(rawText, defaults = {}, idFactory = defaultIdFactory) {
  const text = String(rawText ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) {
    return { ok: false, errors: ["取り込むテキストを入力してください。"] };
  }
  const lines = text.split("\n");
  if (lines[0].trim().toLowerCase() === "/roll-table") {
    lines.shift();
  }

  let name = String(defaults.name ?? "");
  let formula = normalizeDiceFormula(defaults.formula ?? "1D6");
  if (lines.length >= 2 && getValidOutcomes(lines[1])) {
    name = lines.shift().trim();
    formula = normalizeDiceFormula(lines.shift());
  }

  const errors = [];
  const parsedRows = [];
  lines.forEach((line, index) => {
    if (!line.trim()) {
      return;
    }
    if (/[０-９：－]/.test(line)) {
      errors.push(`${index + 1}行目: 数字・コロン・ハイフンは半角で入力してください。`);
      return;
    }
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*:(.*)$/.exec(line);
    if (!match) {
      errors.push(`${index + 1}行目: 「出目:結果」の形式ではありません。`);
      return;
    }
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start > end) {
      errors.push(`${index + 1}行目: 出目範囲の大小が逆です。`);
      return;
    }
    parsedRows.push({
      id: idFactory("row"),
      range: start === end ? String(start) : `${start}-${end}`,
      start,
      end,
      text: match[3].replace(/\\n/g, "\n").trimStart(),
    });
  });
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (parsedRows.length === 0) {
    return { ok: false, errors: ["出目と結果を読み取れませんでした。"] };
  }

  const rows = [];
  for (const row of parsedRows) {
    const previous = rows.at(-1);
    if (previous && previous.text === row.text && previous.end + 1 === row.start) {
      previous.end = row.end;
      previous.range = `${previous.start}-${previous.end}`;
    } else {
      rows.push({ ...row });
    }
  }
  return {
    ok: true,
    table: {
      id: String(defaults.id ?? idFactory("table")),
      name,
      formula,
    rows: rows.map((row) => ({ id: row.id, range: row.range, text: row.text })),
    },
    errors: [],
  };
}

export function createInitialRollTable(idFactory = defaultIdFactory) {
  return {
    id: idFactory("table"),
    name: "ハプニング表",
    formula: "1D6",
    rows: range(1, 6).map((outcome) => ({
      id: idFactory("row"),
      range: String(outcome),
      text: "",
    })),
  };
}

export function normalizeRollTableLibrary(candidate, idFactory = defaultIdFactory) {
  const source = isRecord(candidate) ? candidate : {};
  const seen = new Set();
  const tables = (Array.isArray(source.tables) ? source.tables : [])
    .slice(0, 100)
    .map((table) => normalizeRollTable(table, idFactory))
    .filter((table) => table && !seen.has(table.id) && seen.add(table.id));
  if (tables.length === 0) {
    tables.push(createInitialRollTable(idFactory));
  }
  return {
    version: 1,
    selectedTableId: tables.some((table) => table.id === String(source.selectedTableId))
      ? String(source.selectedTableId)
      : tables[0].id,
    tables,
  };
}

export function normalizeRollTable(table, idFactory = defaultIdFactory) {
  if (!isRecord(table)) {
    return null;
  }
  const rows = (Array.isArray(table.rows) ? table.rows : [])
    .slice(0, 2000)
    .filter(isRecord)
    .map((row) => ({
      id: row.id == null ? idFactory("row") : String(row.id),
      range: String(row.range ?? ""),
      text: String(row.text ?? ""),
    }));
  return {
    id: table.id == null ? idFactory("table") : String(table.id),
    name: String(table.name ?? ""),
    formula: normalizeDiceFormula(table.formula ?? "1D6"),
    rows,
  };
}

export function mergeRollTableLibraryImport(
  currentLibrary,
  sourceTables,
  mode = "append",
  idFactory = defaultIdFactory,
) {
  const source = Array.isArray(sourceTables) ? sourceTables : [];
  if (mode === "replace") {
    return normalizeRollTableLibrary({ tables: source }, idFactory);
  }
  const current = normalizeRollTableLibrary(currentLibrary, idFactory);
  const imported = source
    .map((table) => normalizeRollTable(table, idFactory))
    .filter(Boolean)
    .map((table) => ({
      ...table,
      id: idFactory("table"),
      rows: table.rows.map((row) => ({ ...row, id: idFactory("row") })),
    }));
  const tables = [...current.tables, ...imported].slice(0, 100);
  return {
    version: 1,
    selectedTableId: imported[0]?.id ?? current.selectedTableId,
    tables,
  };
}

function parseOutcomeRange(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) {
    return { error: "出目を入力してください。" };
  }
  if (/[０-９：－]/.test(value)) {
    return { error: "数字とハイフンは半角で入力してください。" };
  }
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(value);
  if (!match) {
    return { error: "出目は「1」または「1-5」の形式で入力してください。" };
  }
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (start > end) {
    return { error: "出目範囲の大小が逆です。" };
  }
  if (end - start > 2000) {
    return { error: "1行の範囲が大きすぎます。" };
  }
  return { start, end };
}

function escapeResultText(value) {
  return String(value ?? "").replace(/\r\n?|\n/g, "\\n");
}

function createCollectionPatch(baseItems, nextItems) {
  const baseMap = toEntityMap(baseItems);
  const nextMap = toEntityMap(nextItems);
  const upserts = [];
  const deletes = [];
  for (const [id, nextItem] of nextMap) {
    const baseItem = baseMap.get(id);
    if (baseItem == null) {
      upserts.push({ id, changes: clone(nextItem) });
      continue;
    }
    const changes = {};
    for (const key of new Set([...Object.keys(baseItem), ...Object.keys(nextItem)])) {
      if (!deepEqual(baseItem[key], nextItem[key])) {
        changes[key] = clone(nextItem[key]);
      }
    }
    if (Object.keys(changes).length > 0) {
      upserts.push({ id, changes });
    }
  }
  for (const id of baseMap.keys()) {
    if (!nextMap.has(id)) {
      deletes.push(id);
    }
  }
  return { upserts, deletes };
}

function mergeEntityCollection(baseItems, localItems, remoteItems) {
  const baseMap = toEntityMap(baseItems);
  const localMap = toEntityMap(localItems);
  const remoteMap = toEntityMap(remoteItems);
  const orderedIds = [
    ...remoteMap.keys(),
    ...[...localMap.keys()].filter((id) => !remoteMap.has(id)),
  ];
  return orderedIds.flatMap((id) => {
    const merged = mergeEntity(baseMap.get(id), localMap.get(id), remoteMap.get(id));
    return merged == null ? [] : [merged];
  });
}

function mergeEntity(base, local, remote) {
  if (base == null) {
    if (local == null) return clone(remote);
    if (remote == null) return clone(local);
    return mergeEntityFields({}, local, remote);
  }
  if (local == null || remote == null) return null;
  if (deepEqual(local, base)) return clone(remote);
  if (deepEqual(remote, base)) return clone(local);
  return mergeEntityFields(base, local, remote);
}

function mergeEntityFields(base, local, remote) {
  const merged = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(remote), ...Object.keys(local)])) {
    merged[key] = mergeValue(base[key], local[key], remote[key]);
  }
  return merged;
}

function mergeValue(base, local, remote) {
  if (deepEqual(local, base)) return clone(remote);
  if (deepEqual(remote, base)) return clone(local);
  return clone(local);
}

function normalizeEntityList(value, normalizer, limit) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .slice(0, limit)
    .map(normalizer)
    .filter((item) => item && !seen.has(item.id) && seen.add(item.id));
}

function toEntityMap(items) {
  return new Map(
    (Array.isArray(items) ? items : [])
      .filter((item) => isRecord(item) && item.id != null)
      .map((item) => [String(item.id), item]),
  );
}

function normalizeText(value) {
  return value == null ? "" : String(value);
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function range(start, end) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function flatMapRange(start, end, mapper) {
  return range(start, end).flatMap(mapper);
}

function formatNumberList(values) {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length <= 12) {
    return sorted.join(", ");
  }
  return `${sorted.slice(0, 10).join(", ")} ほか${sorted.length - 10}件`;
}

function unique(values) {
  return [...new Set(values)];
}

function defaultIdFactory(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}
