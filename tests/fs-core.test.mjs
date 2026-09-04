import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateProgress,
  createFsPatch,
  createInitialFsState,
  generateRollTableCommand,
  getValidOutcomes,
  mergeRollTableLibraryImport,
  mergeFsStates,
  normalizeFsState,
  normalizeRollTableLibrary,
  parseRollTableText,
  suggestProgressDelta,
  validateRollTable,
} from "../public/board/fs/fs-core.js";

function idFactory(prefix) {
  idFactory.count = (idFactory.count ?? 0) + 1;
  return `${prefix}-${idFactory.count}`;
}

function createState() {
  const state = createInitialFsState();
  state.participants = [
    { id: "pc-1", source: "board", boardTokenId: "token-1", name: "PC1", initiative: 12, turnState: "ready" },
  ];
  return normalizeFsState(state);
}

test("suggests FS progress from achievement, difficulty, and maximum", () => {
  assert.equal(suggestProgressDelta(7, 8, 30), 0);
  assert.equal(suggestProgressDelta(8, 8, 30), 1);
  assert.equal(suggestProgressDelta(24, 8, 30), 3);
  assert.equal(suggestProgressDelta(48, 8, 30), 4);
});

test("derives progress from progress history and excludes support history", () => {
  const state = createState();
  state.history = [
    { id: "h1", type: "progress", delta: 3 },
    { id: "h2", type: "support", delta: 9 },
    { id: "h3", type: "progress", delta: -1, note: "手動調整" },
  ];
  assert.equal(calculateProgress(state), 2);
});

test("normalizes legacy adjustment entries as progress history", () => {
  const state = normalizeFsState({
    history: [{ id: "legacy", type: "adjustment", delta: 2, createdAt: "2026-01-01T00:00:00Z" }],
  });

  assert.equal(state.history[0].type, "progress");
  assert.equal(calculateProgress(state), 2);
});

test("keeps simultaneous FS history additions", () => {
  const base = createState();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.history.push({ id: "local", type: "progress", participantName: "PC1", achievement: 18, delta: 2, createdAt: "2026-01-01T00:00:00.000Z" });
  remote.history.push({ id: "remote", type: "progress", participantName: "PC2", achievement: 22, delta: 3, createdAt: "2026-01-01T00:00:01.000Z" });

  const merged = mergeFsStates(base, local, remote);
  assert.deepEqual(new Set(merged.history.map((entry) => entry.id)), new Set(["local", "remote"]));
  assert.equal(calculateProgress(merged), 5);
});

test("merges different fields on one FS participant", () => {
  const base = createState();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.participants[0].turnState = "acted";
  remote.participants[0].name = "PC One";

  const merged = mergeFsStates(base, local, remote);
  assert.equal(merged.participants[0].turnState, "acted");
  assert.equal(merged.participants[0].name, "PC One");
});

test("creates field-level FS patches", () => {
  const base = createState();
  const next = structuredClone(base);
  next.round = 2;
  next.participants[0].turnState = "waiting";
  next.events.push({ id: "event-1", threshold: 4, title: "変化" });

  const patch = createFsPatch(base, next);
  assert.deepEqual(patch.scalars, { round: 2 });
  assert.deepEqual(patch.collections.participants.upserts, [
    { id: "pc-1", changes: { turnState: "waiting" } },
  ]);
  assert.equal(patch.collections.events.upserts[0].id, "event-1");
});

test("generates a CCFOLIA roll-table command and expands ranges", () => {
  const result = generateRollTableCommand({
    name: "ハプニング表",
    formula: "1d6",
    rows: [
      { range: "1-2", text: "足場が崩れる" },
      { range: "3-5", text: "変化なし" },
      { range: "6", text: "増援\n次ラウンドに登場" },
    ],
  });

  assert.equal(result.valid, true);
  assert.equal(result.command, [
    "/roll-table",
    "ハプニング表",
    "1D6",
    "1:足場が崩れる",
    "2:足場が崩れる",
    "3:変化なし",
    "4:変化なし",
    "5:変化なし",
    "6:増援\\n次ラウンドに登場",
  ].join("\n"));
});

test("parses a full roll-table command back into editable rows", () => {
  const parsed = parseRollTableText(`/roll-table
飲み物表
1D3
1:水
2:水
3:お茶\\n温かい`, {}, idFactory);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.table.name, "飲み物表");
  assert.equal(parsed.table.formula, "1D3");
  assert.deepEqual(parsed.table.rows.map((row) => [row.range, row.text]), [
    ["1-2", "水"],
    ["3", "お茶\n温かい"],
  ]);
});

test("validates missing, duplicate, out-of-range, and full-width outcomes", () => {
  const duplicate = validateRollTable({
    name: "表",
    formula: "1D2",
    rows: [{ range: "1-2", text: "A" }, { range: "2", text: "B" }],
  });
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.errors.join("\n"), /重複/);

  const missing = validateRollTable({ name: "表", formula: "1D3", rows: [{ range: "1-2", text: "A" }] });
  assert.match(missing.errors.join("\n"), /未設定/);

  const outside = validateRollTable({ name: "表", formula: "1D2", rows: [{ range: "1-3", text: "A" }] });
  assert.match(outside.errors.join("\n"), /範囲外/);

  const fullWidth = validateRollTable({ name: "表", formula: "1D2", rows: [{ range: "１-２", text: "A" }] });
  assert.match(fullWidth.errors.join("\n"), /半角/);
});

test("supports all documented BCDice original table formula variants", () => {
  assert.equal(getValidOutcomes("2D6").length, 11);
  assert.equal(getValidOutcomes("D66").length, 36);
  assert.equal(getValidOutcomes("D66N").length, 36);
  assert.equal(getValidOutcomes("D66A").length, 21);
  assert.equal(getValidOutcomes("D66S").length, 21);
  assert.equal(getValidOutcomes("D66D").length, 21);
  assert.equal(getValidOutcomes("1D6+1"), null);
});

test("normalizes a damaged local roll-table library", () => {
  const library = normalizeRollTableLibrary({ tables: [{ id: "table-1", name: "表", formula: "1d2", rows: null }] }, idFactory);
  assert.equal(library.tables.length, 1);
  assert.equal(library.tables[0].formula, "1D2");
  assert.deepEqual(library.tables[0].rows, []);
});

test("appends and replaces roll-table JSON libraries", () => {
  const current = normalizeRollTableLibrary({
    selectedTableId: "current",
    tables: [{ id: "current", name: "現在", formula: "1D2", rows: [] }],
  }, idFactory);
  const source = [{ id: "source", name: "読込", formula: "1D3", rows: [{ id: "r1", range: "1-3", text: "結果" }] }];

  const appended = mergeRollTableLibraryImport(current, source, "append", idFactory);
  assert.equal(appended.tables.length, 2);
  assert.equal(appended.tables[1].name, "読込");
  assert.notEqual(appended.tables[1].id, "source");

  const replaced = mergeRollTableLibraryImport(current, source, "replace", idFactory);
  assert.equal(replaced.tables.length, 1);
  assert.equal(replaced.tables[0].name, "読込");
});
