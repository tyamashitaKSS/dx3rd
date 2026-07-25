import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root page redirects to the shared combat board", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /from "next\/navigation"/);
  assert.match(page, /redirect\("\/board\/"\)/);
});

test("combat board static assets are bundled for hosting", async () => {
  const [html, script, syncScript, styles] = await Promise.all([
    readFile(new URL("../public/board/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/board/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/board/sync.js", import.meta.url), "utf8"),
    readFile(new URL("../public/board/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /DX3rd Combat Board/);
  assert.match(html, /terrainLayer/);
  assert.match(html, /syncPanel/);
  assert.match(html, /type="module" src="sync\.js"/);
  assert.match(script, /REMOTE_STATE_ENDPOINT = "\/api\/board"/);
  assert.match(script, /initializeRemoteState\(\)/);
  assert.match(script, /DX3RDBoard/);
  assert.match(syncScript, /joinRoom/);
  assert.match(syncScript, /\[sendBoardState, onBoardState\]/);
  assert.match(syncScript, /copyInviteLink/);
  assert.match(styles, /\.terrain-layer/);
  assert.match(styles, /\.sync-status/);
});

test("GitHub Pages deploys the static combat board", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/pages.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /path: public\/board/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
