import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("root page redirects to the shared combat board", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /from "next\/navigation"/);
  assert.match(page, /redirect\("\/board\/"\)/);
});

test("combat board static assets are bundled for hosting", async () => {
  const [html, script, syncScript, mergeScript, styles] = await Promise.all([
    readFile(new URL("../public/board/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/board/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/board/sync.js", import.meta.url), "utf8"),
    readFile(new URL("../public/board/sync-merge.js", import.meta.url), "utf8"),
    readFile(new URL("../public/board/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /DX3rd Combat Board/);
  assert.match(html, /terrainLayer/);
  assert.match(html, /syncPanel/);
  assert.match(html, /joinRoomForm/);
  assert.match(html, /styles\.css\?v=20260810-14/);
  assert.match(html, /PC・エネミーはそれぞれ最大20体/);
  assert.match(html, /描画後は自動で選択に戻ります/);
  assert.match(html, /name="badStatus" value="pressure"/);
  assert.match(html, /name="badStatus" value="berserk"/);
  assert.match(html, /name="badStatus" value="poison"/);
  assert.match(html, /id="tokenContextMenu"/);
  assert.match(html, /id="contextDiceModifierInput"/);
  assert.match(html, /name="contextBadStatus" value="poison"/);
  assert.match(html, /id="poisonLevelInput"/);
  assert.match(html, /id="contextPoisonLevelInput"/);
  assert.equal((html.match(/累積ダメージ/g) ?? []).length, 2);
  const contextMenuMarkup = html.slice(html.indexOf('id="tokenContextMenu"'), html.indexOf("<script>"));
  assert.doesNotMatch(contextMenuMarkup, /status-with-tooltip|data-description/);
  assert.match(html, /app\.js\?v=20260810-14/);
  assert.match(html, /type="module" src="sync\.js\?v=20260810-14"/);
  assert.match(script, /REMOTE_STATE_ENDPOINT = "\/api\/board"/);
  assert.match(script, /const MAX_PC = 20/);
  assert.match(script, /const MAX_ENEMY = 20/);
  assert.match(script, /badStatuses: normalizeBadStatuses\(item\.badStatuses\)/);
  assert.match(script, /diceModifier: normalizeModifier\(item\.diceModifier\)/);
  assert.match(script, /selectedStatuses\.has\("evil-reading"\)/);
  assert.match(script, /name: "邪毒"/);
  assert.match(script, /poisonLevel: normalizePoisonLevel\(item\.poisonLevel\)/);
  assert.match(script, /`\$\{status\.name\} Lv\$\{normalizePoisonLevel\(token\.poisonLevel\)\}`/);
  assert.match(script, /getTokenEffects/);
  assert.match(script, /openTokenContextMenu/);
  assert.match(script, /const completedDrawing = \["draw", "draw-terrain-rect", "draw-token-rect"\]/);
  assert.match(script, /if \(completedDrawing\) \{\s*activeTool = "select";/);
  assert.match(script, /initializeRemoteState\(\)/);
  assert.match(script, /DX3RDBoard/);
  assert.match(script, /capturedDamageExpression/);
  assert.match(script, /queueRemoteMovementAnimations/);
  assert.match(syncScript, /createClient/);
  assert.match(syncScript, /dx3rd_load_board/);
  assert.match(syncScript, /dx3rd_apply_board_patch/);
  assert.match(syncScript, /event: "board-state"/);
  assert.match(syncScript, /dx3rd-room-state-/);
  assert.match(syncScript, /copyInviteLink/);
  assert.match(syncScript, /parseRoomCode/);
  assert.match(syncScript, /key = id/);
  assert.match(syncScript, /createBoardPatch/);
  assert.match(syncScript, /setInterval\(refreshLatestState, 1500\)/);
  assert.match(syncScript, /remoteSerialized !== boardApi\.serializeState\(\)/);
  assert.match(mergeScript, /createCollectionPatch/);
  assert.match(styles, /\.terrain-layer/);
  assert.match(styles, /\.sync-status/);
  assert.match(styles, /\.sync-join-form/);
  assert.match(styles, /@keyframes board-object-move/);
  assert.match(styles, /\.token-bad-statuses/);
  assert.match(styles, /\.bad-status-options/);
  assert.match(styles, /\.token-context-menu/);
  assert.match(styles, /\.status-with-tooltip:hover::after/);
  assert.match(styles, /bottom: calc\(100% \+ 6px\)/);
  assert.match(styles, /\.token-bad-status \{[\s\S]*?font-size: 13px/);
  assert.match(styles, /prefers-reduced-motion/);
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

test("Japanese manuals cover the main workflows and include screenshots", async () => {
  const [manual, imageGuide, boardImage, settingsImage] = await Promise.all([
    readFile(new URL("../docs/MANUAL.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/IMAGE_GUIDE.md", import.meta.url), "utf8"),
    stat(new URL("../docs/assets/manual-board.png", import.meta.url)),
    stat(new URL("../docs/assets/manual-settings.png", import.meta.url)),
  ]);

  assert.match(manual, /共有ルーム/);
  assert.match(manual, /右クリック/);
  assert.match(manual, /累積ダメージ/);
  assert.match(manual, /邪毒/);
  assert.match(manual, /assets\/manual-board\.png/);
  assert.match(manual, /assets\/manual-settings\.png/);
  assert.match(imageGuide, /画像クイックガイド/);
  assert.ok(boardImage.size > 10_000);
  assert.ok(settingsImage.size > 10_000);
});
