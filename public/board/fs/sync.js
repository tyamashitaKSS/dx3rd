import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";
import { createFsPatch, createInitialFsState } from "./fs-core.js?v=20260904-22";

const SUPABASE_URL = "https://znyyanfyllcecwabxpir.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Rey10satxUWgAodSyNhmIw_L83SF187";
const syncPanel = document.querySelector("#syncPanel");
const syncStatus = document.querySelector("#syncStatus");
const syncRoomCode = document.querySelector("#syncRoomCode");
const syncParticipants = document.querySelector("#syncParticipants");
const copyInviteLink = document.querySelector("#copyInviteLink");
const joinRoomForm = document.querySelector("#joinRoomForm");
const roomJoinInput = document.querySelector("#roomJoinInput");

if (window.DX3RD_USE_PEER_SYNC && syncPanel) {
  startWhenReady();
}

function startWhenReady() {
  if (window.DX3RDFS) {
    initializeSupabaseSync(window.DX3RDFS);
  } else {
    window.addEventListener("dx3rd-fs-ready", () => initializeSupabaseSync(window.DX3RDFS), { once: true });
  }
}

async function initializeSupabaseSync(fsApi) {
  const room = resolveRoom();
  const ownerStorageKey = `dx3rd-room-owner-${room.id}`;
  const roomStateStorageKey = `dx3rd-fs-room-state-${room.id}`;
  const ownsRoom = localStorage.getItem(ownerStorageKey) === room.key;
  const cachedRoomState = localStorage.getItem(roomStateStorageKey);
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  let roomStateReady = ownsRoom || cachedRoomState != null;
  let roomExists = false;
  let lastSerializedState = null;
  let lastObservedLocalState = fsApi.serializeState();
  let lastRevision = 0;
  let lastBoardRevision = 0;
  let pendingLocalState = null;
  let pendingPatchBaseState = null;
  let pendingRemoteState = null;
  let saveTimer = null;
  let saveRetryTimer = null;
  let retryTimer = null;
  let refreshTimer = null;
  let saving = false;
  let initializing = true;

  syncPanel.hidden = false;
  syncRoomCode.textContent = room.shareCode;
  syncRoomCode.title = room.shareCode;
  roomJoinInput.value = room.shareCode;
  updateStatus("接続中", "waiting");

  const topicHash = await hashRoomTopic(room.id, room.key);
  const channel = client
    .channel(`dx3rd:${topicHash}`, {
      config: {
        broadcast: { self: false },
        presence: { key: randomToken(8) },
        private: false,
      },
    })
    .on("broadcast", { event: "fs-state" }, ({ payload }) => {
      if (payload && typeof payload.state === "string" && Number.isFinite(Number(payload.revision))) {
        receiveRemoteState(payload.state, Number(payload.revision));
      }
    })
    .on("broadcast", { event: "board-state" }, ({ payload }) => {
      if (payload && typeof payload.state === "string") {
        receiveBoardState(payload.state, Number(payload.revision) || 0);
      }
    })
    .on("presence", { event: "sync" }, updateParticipantCount)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ joinedAt: new Date().toISOString(), page: "fs" });
        await loadInitialState();
        if (refreshTimer == null) refreshTimer = window.setInterval(refreshLatestState, 1500);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") updateStatus("接続エラー", "error");
      else if (status === "CLOSED") updateStatus("オフライン", "error");
    });

  window.addEventListener("dx3rd-fs-state-change", (event) => {
    if (!initializing && roomStateReady && typeof event.detail === "string") queueSave(event.detail);
  });

  copyInviteLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const previous = copyInviteLink.textContent;
      copyInviteLink.textContent = "コピーしました";
      window.setTimeout(() => { copyInviteLink.textContent = previous; }, 1600);
    } catch {
      updateStatus("コピー失敗", "error");
    }
  });

  joinRoomForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const destination = parseRoomCode(roomJoinInput.value);
    if (!destination) {
      updateStatus("IDを確認", "error");
      roomJoinInput.focus();
      return;
    }
    if (destination.shareCode === room.shareCode) {
      updateStatus("同期中", "connected");
      return;
    }
    const params = new URLSearchParams();
    params.set("room", destination.id);
    if (destination.key !== destination.id) params.set("key", destination.key);
    window.location.hash = params.toString();
    window.location.reload();
  });

  async function loadInitialState() {
    const initialBoardTokens = await loadBoardState(true, false);
    const { data, error } = await client.rpc("dx3rd_load_fs", {
      p_room_id: room.id,
      p_room_secret: room.key,
    });
    if (error) {
      initializing = false;
      console.warn("Shared FS room could not be loaded.", error);
      updateStatus("読込エラー", "error");
      return;
    }
    const remoteRoom = Array.isArray(data) ? data[0] : null;
    if (remoteRoom?.fs_state) {
      const serialized = JSON.stringify(remoteRoom.fs_state);
      lastRevision = Number(remoteRoom.fs_revision) || 0;
      receiveRemoteState(serialized, lastRevision, true);
      const rosterChanged = fsApi.applyBoardRoster(initialBoardTokens);
      initializing = false;
      if (rosterChanged) queueSave(fsApi.serializeState(), true);
      return;
    }
    if (cachedRoomState != null) {
      receiveRemoteState(cachedRoomState, 0, true);
      roomStateReady = true;
      fsApi.applyBoardRoster(initialBoardTokens);
      initializing = false;
      queueSave(fsApi.serializeState(), true);
    } else if (ownsRoom || roomExists) {
      fsApi.applySharedState(createInitialFsState());
      fsApi.applyBoardRoster(initialBoardTokens);
      const serialized = fsApi.serializeState();
      roomStateReady = true;
      lastSerializedState = serialized;
      localStorage.setItem(roomStateStorageKey, serialized);
      initializing = false;
      queueSave(serialized, true);
    } else {
      initializing = false;
      updateStatus("ルーム待機", "waiting");
    }
  }

  async function loadBoardState(force = false, apply = true) {
    const { data, error } = await client.rpc("dx3rd_load_board", {
      p_room_id: room.id,
      p_room_secret: room.key,
    });
    if (error) return null;
    const remoteRoom = Array.isArray(data) ? data[0] : null;
    if (!remoteRoom?.board_state) return null;
    roomExists = true;
    const revision = Number(remoteRoom.revision) || 0;
    if (force || revision > lastBoardRevision) {
      lastBoardRevision = revision;
      if (apply) fsApi.applyBoardRoster(remoteRoom.board_state.tokens);
    }
    return remoteRoom.board_state.tokens;
  }

  async function refreshLatestState() {
    await loadBoardState();
    if (saving || pendingLocalState != null) return;
    const { data, error } = await client.rpc("dx3rd_load_fs", {
      p_room_id: room.id,
      p_room_secret: room.key,
    });
    if (error) return;
    const remoteRoom = Array.isArray(data) ? data[0] : null;
    const revision = Number(remoteRoom?.fs_revision) || 0;
    if (!remoteRoom?.fs_state) return;
    const serialized = JSON.stringify(remoteRoom.fs_state);
    if (revision > lastRevision) receiveRemoteState(serialized, revision);
    else if (revision === lastRevision && serialized !== fsApi.serializeState()) {
      receiveRemoteState(serialized, revision, true);
    }
  }

  function queueSave(serialized, immediate = false) {
    if (pendingLocalState == null) pendingPatchBaseState = lastObservedLocalState;
    pendingLocalState = serialized;
    lastObservedLocalState = serialized;
    window.clearTimeout(saveTimer);
    window.clearTimeout(saveRetryTimer);
    saveRetryTimer = null;
    if (immediate) flushSaveQueue();
    else saveTimer = window.setTimeout(flushSaveQueue, 100);
  }

  async function flushSaveQueue() {
    if (saving || pendingLocalState == null) return;
    saving = true;
    let inFlight = null;
    try {
      while (pendingLocalState != null) {
        const serialized = pendingLocalState;
        const patchBaseSerialized = pendingPatchBaseState ?? lastSerializedState ?? serialized;
        pendingLocalState = null;
        pendingPatchBaseState = null;
        inFlight = { serialized, patchBaseSerialized };
        const patch = createFsPatch(JSON.parse(patchBaseSerialized), JSON.parse(serialized));
        if (!patchHasChanges(patch) && lastRevision > 0) {
          inFlight = null;
          continue;
        }
        updateStatus("保存中", "waiting");
        const { data, error } = await client.rpc("dx3rd_apply_fs_patch", {
          p_room_id: room.id,
          p_room_secret: room.key,
          p_patch: patch,
          p_initial_state: JSON.parse(serialized),
          p_initial_board_state: createInitialBoardState(),
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : null;
        const resultRevision = Number(result?.fs_revision) || 0;
        const resultSerialized = result?.fs_state ? JSON.stringify(result.fs_state) : serialized;
        lastRevision = resultRevision;
        lastSerializedState = resultSerialized;
        roomStateReady = true;
        roomExists = true;
        localStorage.setItem(roomStateStorageKey, resultSerialized);
        if (pendingLocalState == null && fsApi.serializeState() !== resultSerialized) {
          applyFsSnapshot(resultSerialized, resultRevision);
        }
        await channel.send({
          type: "broadcast",
          event: "fs-state",
          payload: { revision: resultRevision, state: resultSerialized },
        });
        inFlight = null;
      }
      updateStatus("同期中", "connected");
    } catch (error) {
      if (inFlight != null) {
        if (pendingLocalState == null) pendingLocalState = inFlight.serialized;
        pendingPatchBaseState = inFlight.patchBaseSerialized;
      }
      console.warn("Shared FS room could not be saved.", error);
      updateStatus("保存エラー", "error");
      saveRetryTimer = window.setTimeout(() => {
        saveRetryTimer = null;
        flushSaveQueue();
      }, 1000);
    } finally {
      saving = false;
      if (pendingLocalState != null && saveRetryTimer == null) flushSaveQueue();
    }
  }

  function receiveRemoteState(serialized, revision, force = false) {
    if (!force && revision <= lastRevision) return;
    if (!force && serialized === lastSerializedState) {
      lastRevision = Math.max(lastRevision, revision);
      return;
    }
    if (!force && (saving || pendingLocalState != null)) {
      lastRevision = revision;
      lastSerializedState = serialized;
      roomStateReady = true;
      updateStatus("変更を統合中", "waiting");
      return;
    }
    try {
      if (!fsApi.applySharedState(JSON.parse(serialized))) {
        pendingRemoteState = { serialized, revision };
        scheduleRetry();
        return;
      }
      pendingRemoteState = null;
      roomStateReady = true;
      lastRevision = Math.max(lastRevision, revision);
      lastSerializedState = fsApi.serializeState();
      lastObservedLocalState = lastSerializedState;
      localStorage.setItem(roomStateStorageKey, lastSerializedState);
      updateStatus("同期中", "connected");
    } catch (error) {
      console.warn("Shared FS state could not be applied.", error);
      updateStatus("同期エラー", "error");
    }
  }

  function scheduleRetry() {
    if (retryTimer != null) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      if (pendingRemoteState != null) {
        receiveRemoteState(pendingRemoteState.serialized, pendingRemoteState.revision, true);
      }
    }, 250);
  }

  function applyFsSnapshot(serialized, revision) {
    try {
      if (!fsApi.applySharedState(JSON.parse(serialized))) {
        pendingRemoteState = { serialized, revision };
        scheduleRetry();
        return;
      }
      pendingRemoteState = null;
      lastObservedLocalState = fsApi.serializeState();
      localStorage.setItem(roomStateStorageKey, lastObservedLocalState);
    } catch (error) {
      console.warn("Merged FS state could not be applied.", error);
      updateStatus("統合エラー", "error");
    }
  }

  function receiveBoardState(serialized, revision) {
    if (revision && revision <= lastBoardRevision) return;
    try {
      const boardState = JSON.parse(serialized);
      lastBoardRevision = Math.max(lastBoardRevision, revision);
      roomExists = true;
      fsApi.applyBoardRoster(boardState.tokens);
    } catch (error) {
      console.warn("Board participants could not be read.", error);
    }
  }

  function updateParticipantCount() {
    const presenceState = channel.presenceState();
    const count = Math.max(1, Object.values(presenceState).reduce((total, participants) => total + participants.length, 0));
    syncParticipants.textContent = `${count}人`;
  }

  function updateStatus(label, status) {
    syncStatus.textContent = label;
    syncStatus.dataset.state = status;
  }
}

function patchHasChanges(patch) {
  if (Object.keys(patch.scalars).length > 0) return true;
  return Object.values(patch.collections).some((collection) =>
    collection.upserts.length > 0 || collection.deletes.length > 0,
  );
}

function createInitialBoardState() {
  return {
    version: 3,
    nextId: 8,
    engages: [
      { id: "engage-1", name: "PC側", x: 250, y: 250, radiusX: 135, radiusY: 135 },
      { id: "engage-2", name: "エネミー側", x: 560, y: 250, radiusX: 135, radiusY: 135 },
    ],
    tokens: [
      { id: "token-3", type: "pc", shape: "circle", name: "PC1", initiative: 0, damage: 0, diceModifier: 0, criticalModifier: 0, attackModifier: 0, badStatuses: [], poisonLevel: 1, size: 58, x: 215, y: 235, engageId: "engage-1" },
      { id: "token-4", type: "pc", shape: "circle", name: "PC2", initiative: 0, damage: 0, diceModifier: 0, criticalModifier: 0, attackModifier: 0, badStatuses: [], poisonLevel: 1, size: 58, x: 285, y: 235, engageId: "engage-1" },
      { id: "token-5", type: "enemy", shape: "circle", name: "敵1", initiative: 0, damage: 0, diceModifier: 0, criticalModifier: 0, attackModifier: 0, badStatuses: [], poisonLevel: 1, size: 58, x: 525, y: 235, engageId: "engage-2" },
      { id: "token-6", type: "enemy", shape: "circle", name: "敵2", initiative: 0, damage: 0, diceModifier: 0, criticalModifier: 0, attackModifier: 0, badStatuses: [], poisonLevel: 1, size: 58, x: 595, y: 235, engageId: "engage-2" },
    ],
    shapes: [],
    activeTurnTokenId: null,
    activeTurnPhase: null,
    round: 1,
    actedTokenIds: [],
  };
}

function resolveRoom() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  let id = params.get("room");
  let key = params.get("key");
  if (isValidToken(id) && !isValidToken(key)) key = id;
  if (!isValidToken(id) || !isValidToken(key)) {
    id = randomToken(16);
    key = id;
    localStorage.setItem(`dx3rd-room-owner-${id}`, key);
    params.set("room", id);
    params.delete("key");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${params}`);
  }
  return { id, key, shareCode: key === id ? id : `${id}.${key}` };
}

function parseRoomCode(value) {
  const parts = value.trim().split(".");
  if (parts.length === 1 && isValidToken(parts[0])) return { id: parts[0], key: parts[0], shareCode: parts[0] };
  if (parts.length === 2 && isValidToken(parts[0]) && isValidToken(parts[1])) {
    return { id: parts[0], key: parts[1], shareCode: `${parts[0]}.${parts[1]}` };
  }
  return null;
}

async function hashRoomTopic(roomId, roomKey) {
  const encoded = new TextEncoder().encode(`${roomId}:${roomKey}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function isValidToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function randomToken(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (value) => value.toString(36).padStart(2, "0")).join("").slice(0, byteLength * 2);
}
