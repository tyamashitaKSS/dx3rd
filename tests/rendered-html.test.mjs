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
  assert.match(html, /resizeLayer/);
  assert.match(html, /syncPanel/);
  assert.match(html, /joinRoomForm/);
  assert.match(html, /styles\.css\?v=20260904-20/);
  assert.match(html, /id="fsPageLink"/);
  assert.match(html, /PC・エネミーはそれぞれ最大20体/);
  assert.match(html, /描画後は自動で選択に戻ります/);
  assert.match(html, /name="badStatus" value="pressure"/);
  assert.match(html, /name="badStatus" value="berserk"/);
  assert.match(html, /name="badStatus" value="poison"/);
  assert.match(html, /id="tokenContextMenu"/);
  assert.match(html, /id="contextDiceModifierInput"/);
  assert.match(html, /id="contextAttackModifierInput"/);
  assert.match(html, /id="applyEngageDamage"/);
  assert.match(html, /id="applyAllEnemyDamage"/);
  assert.match(html, /id="engageContextMenu"/);
  assert.match(html, /id="openMiniWindow"/);
  assert.match(html, /id="compactViewControls"/);
  assert.match(html, /id="boardViewport"/);
  assert.match(html, /id="miniWindowPlaceholder"/);
  assert.match(html, /name="contextBadStatus" value="poison"/);
  assert.match(html, /id="poisonLevelInput"/);
  assert.match(html, /id="contextPoisonLevelInput"/);
  assert.equal((html.match(/累積ダメージ/g) ?? []).length, 2);
  const contextMenuMarkup = html.slice(html.indexOf('id="tokenContextMenu"'), html.indexOf("<script>"));
  assert.doesNotMatch(contextMenuMarkup, /status-with-tooltip|data-description/);
  assert.match(html, /app\.js\?v=20260904-20/);
  assert.match(html, /type="module" src="sync\.js\?v=20260810-14"/);
  assert.match(script, /REMOTE_STATE_ENDPOINT = "\/api\/board"/);
  assert.match(script, /const MAX_PC = 20/);
  assert.match(script, /const MAX_ENEMY = 20/);
  assert.match(script, /badStatuses: normalizeBadStatuses\(item\.badStatuses\)/);
  assert.match(script, /diceModifier: normalizeModifier\(item\.diceModifier\)/);
  assert.match(script, /attackModifier: normalizeAttackModifier\(item\.attackModifier\)/);
  assert.match(script, /function applyDamageToTokens/);
  assert.match(script, /function openEngageContextMenu/);
  assert.match(script, /documentPictureInPicture\.requestWindow/);
  assert.match(script, /function openFallbackCompactWindow/);
  assert.match(script, /function registerInteractionWindow/);
  assert.match(script, /board\.clientWidth \/ rect\.width/);
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
  assert.match(script, /BOX_RESIZE_HANDLES/);
  assert.match(script, /function moveResizeHandle/);
  assert.match(script, /if \(token\.shape === "rect"\)/);
  assert.match(script, /event\.code === `Key\$\{key\.toUpperCase\(\)\}`/);
  assert.match(script, /undoStack = rebaseHistoryStack\(undoStack, state, nextState\)/);
  assert.doesNotMatch(script, /undoStack = \[\];\s*redoStack = \[\];\s*historyTransaction = null;/);
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
  assert.match(styles, /\.resize-handle/);
  assert.match(styles, /\.resize-layer/);
  assert.match(styles, /\.status-with-tooltip:hover::after/);
  assert.match(styles, /bottom: calc\(100% \+ 6px\)/);
  assert.match(styles, /\.token-bad-status \{[\s\S]*?font-size: 13px/);
  assert.match(styles, /\.token-bad-status\.attack/);
  assert.match(styles, /body\.compact-mode/);
  assert.match(styles, /\.compact-mode\[data-compact-view="initiative"\]/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /\.page-switch/);
});

test("FS manager and roll-table builder are bundled for hosting", async () => {
  const [html, script, syncScript, coreScript, styles, apiRoute, sql] = await Promise.all([
    readFile(new URL("../public/board/fs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/board/fs/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/board/fs/sync.js", import.meta.url), "utf8"),
    readFile(new URL("../public/board/fs/fs-core.js", import.meta.url), "utf8"),
    readFile(new URL("../public/board/fs/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/fs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/dx3rd_rooms.sql", import.meta.url), "utf8"),
  ]);

  assert.match(html, /DX3rd FS判定管理/);
  assert.match(html, /id="battlePageLink"/);
  assert.match(html, /id="fsSettingsForm"/);
  assert.match(html, /id="fsConditionSummary"/);
  assert.match(html, /data-fs-field="targetProgress"/);
  assert.match(html, /id="participantList"/);
  assert.match(html, /id="judgmentForm"/);
  assert.match(html, /id="eventList"/);
  assert.match(html, /id="rollTableRows"/);
  assert.match(html, /id="copyRollTableCommand"/);
  assert.match(html, /id="openFsMiniWindow"/);
  assert.doesNotMatch(html, /ハプニング結果|ハプニング履歴/);
  assert.match(html, /styles\.css\?v=20260904-22/);
  assert.match(html, /app\.js\?v=20260904-22/);
  assert.match(html, /sync\.js\?v=20260904-22/);
  assert.match(html, /id="progressEventPins"/);
  assert.match(html, /id="achievementInput" type="number" min="0"/);
  assert.ok(html.indexOf('class="surface judgment-surface"') < html.indexOf('class="surface participants-surface"'));
  assert.match(script, /window\.DX3RDFS/);
  assert.match(script, /documentPictureInPicture\.requestWindow/);
  assert.match(script, /dx3rd-fs-roll-tables-v1/);
  assert.match(script, /const options = \[\s*\.\.\.getSortedParticipants\(\)[\s\S]*'<option value="">GM調整<\/option>'/);
  assert.match(script, /achievementInput\.value !== "" && Number\(achievementInput\.value\) < 0/);
  assert.match(syncScript, /dx3rd_load_fs/);
  assert.match(syncScript, /dx3rd_apply_fs_patch/);
  assert.match(syncScript, /event: "fs-state"/);
  assert.match(syncScript, /event: "board-state"/);
  assert.match(coreScript, /createFsPatch/);
  assert.match(coreScript, /getEffectiveFsConditions/);
  assert.match(coreScript, /generateRollTableCommand/);
  assert.match(coreScript, /parseRollTableText/);
  assert.match(styles, /\.progress-band/);
  assert.match(styles, /#supportResultField\[hidden\]/);
  assert.match(styles, /body\.compact-mode/);
  assert.match(apiRoute, /CREATE TABLE IF NOT EXISTS fs_state/);
  assert.match(sql, /add column if not exists fs_state jsonb/);
  assert.match(sql, /create or replace function public\.dx3rd_load_fs/);
  assert.match(sql, /create or replace function public\.dx3rd_apply_fs_patch/);
  assert.match(sql, /set search_path = public, extensions/);
  assert.match(sql, /revoke all on table public\.dx3rd_rooms from anon, authenticated/);
  assert.match(sql, /grant execute on function public\.dx3rd_apply_fs_patch[\s\S]*to anon, authenticated/);
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
  assert.match(manual, /全エネミー/);
  assert.match(manual, /攻撃力補正/);
  assert.match(manual, /小窓表示/);
  assert.match(manual, /FS判定/);
  assert.match(manual, /\/roll-table/);
  assert.match(manual, /邪毒/);
  assert.match(manual, /assets\/manual-board\.png/);
  assert.match(manual, /assets\/manual-settings\.png/);
  assert.match(imageGuide, /画像クイックガイド/);
  assert.ok(boardImage.size > 10_000);
  assert.ok(settingsImage.size > 10_000);
});
