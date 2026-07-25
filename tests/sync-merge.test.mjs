import assert from "node:assert/strict";
import test from "node:test";

import { mergeBoardStates } from "../sync-merge.js";

function createState() {
  return {
    version: 3,
    nextId: 10,
    engages: [{ id: "engage-1", name: "A", x: 100, y: 100 }],
    tokens: [
      { id: "token-1", name: "PC1", x: 100, y: 100, damage: 0 },
      { id: "token-2", name: "PC2", x: 200, y: 100, damage: 0 },
    ],
    shapes: [],
    round: 1,
  };
}

test("keeps simultaneous edits to different objects", () => {
  const base = createState();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.tokens[0].x = 150;
  remote.tokens[1].damage = 12;

  const merged = mergeBoardStates(base, local, remote);

  assert.equal(merged.tokens[0].x, 150);
  assert.equal(merged.tokens[1].damage, 12);
});

test("merges different fields on the same object", () => {
  const base = createState();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.tokens[0].x = 180;
  remote.tokens[0].name = "リモートPC";

  const merged = mergeBoardStates(base, local, remote);

  assert.equal(merged.tokens[0].x, 180);
  assert.equal(merged.tokens[0].name, "リモートPC");
});

test("keeps additions from both users", () => {
  const base = createState();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.tokens.push({ id: "token-local", name: "PC3", x: 300, y: 100 });
  remote.shapes.push({ id: "shape-remote", kind: "circle", x: 50, y: 50 });

  const merged = mergeBoardStates(base, local, remote);

  assert.ok(merged.tokens.some((item) => item.id === "token-local"));
  assert.ok(merged.shapes.some((item) => item.id === "shape-remote"));
});

test("does not resurrect an object deleted during a concurrent edit", () => {
  const base = createState();
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.tokens = local.tokens.filter((item) => item.id !== "token-1");
  remote.tokens[0].damage = 20;

  const merged = mergeBoardStates(base, local, remote);

  assert.equal(merged.tokens.some((item) => item.id === "token-1"), false);
});
