import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";
import { createBoardPatch } from "./sync-merge.js?v=20260725-5";

const SUPABASE_URL = "https://znyyanfyllcecwabxpir.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Rey10satxUWgAodSyNhmIw_L83SF187";

const syncPanel = document.querySelector("#syncPanel");
const syncStatus = document.querySelector("#syncStatus");
const syncRoomCode = document.querySelector("#syncRoomCode");
const syncParticipants = document.querySelector("#syncParticipants");
const copyInviteLink = document.querySelector("#copyInviteLink");
const joinRoomForm = document.querySelector("#joinRoomForm");
const roomJoinInput = document.querySelector("#roomJoinInput");
const boardApi = window.DX3RDBoard;

if (window.DX3RD_USE_PEER_SYNC && syncPanel && boardApi) {
  initializeSupabaseSync();
}

async function initializeSupabaseSync() {
  const room = resolveRoom();
  const ownerStorageKey = `dx3rd-room-owner-${room.id}`;
  const roomStateStorageKey = `dx3rd-room-state-${room.id}`;
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
  let lastSerializedState = null;
  let lastObservedLocalState = boardApi.serializeState();
  let lastRevision = 0;
  let pendingLocalState = null;
  let pendingPatchBaseState = null;
  let pendingRemoteState = null;
  let saveTimer = null;
  let saveRetryTimer = null;
  let retryTimer = null;
  let saving = false;

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
    .on("broadcast", { event: "board-state" }, ({ payload }) => {
      if (
        payload &&
        typeof payload.state === "string" &&
        Number.isFinite(Number(payload.revision))
      ) {
        receiveRemoteState(payload.state, Number(payload.revision));
      }
    })
    .on("presence", { event: "sync" }, updateParticipantCount)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ joinedAt: new Date().toISOString() });
        await loadInitialState();
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        updateStatus("接続エラー", "error");
      } else if (status === "CLOSED") {
        updateStatus("オフライン", "error");
      }
    });

  window.addEventListener("dx3rd-state-change", (event) => {
    if (roomStateReady && typeof event.detail === "string") {
      queueSave(event.detail);
    }
  });

  copyInviteLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const previousLabel = copyInviteLink.textContent;
      copyInviteLink.textContent = "コピーしました";
      window.setTimeout(() => {
        copyInviteLink.textContent = previousLabel;
      }, 1600);
    } catch {
      updateStatus("コピー失敗", "error");
    }
  });

  joinRoomForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const destination = parseRoomCode(roomJoinInput.value);
    if (destination == null) {
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
    if (destination.key !== destination.id) {
      params.set("key", destination.key);
    }
    window.location.hash = params.toString();
    window.location.reload();
  });

  async function loadInitialState() {
    const { data, error } = await client.rpc("dx3rd_load_board", {
      p_room_id: room.id,
      p_room_secret: room.key,
    });

    if (error) {
      console.warn("Shared room could not be loaded.", error);
      updateStatus("読込エラー", "error");
      return;
    }

    const remoteRoom = Array.isArray(data) ? data[0] : null;
    if (remoteRoom?.board_state) {
      const serialized = JSON.stringify(remoteRoom.board_state);
      lastRevision = Number(remoteRoom.revision) || 0;
      receiveRemoteState(serialized, lastRevision, true);
      return;
    }

    if (cachedRoomState != null) {
      receiveRemoteState(cachedRoomState, 0, true);
      queueSave(cachedRoomState, true);
    } else if (ownsRoom) {
      const serialized = boardApi.serializeState();
      roomStateReady = true;
      lastSerializedState = serialized;
      localStorage.setItem(roomStateStorageKey, serialized);
      queueSave(serialized, true);
    } else {
      updateStatus("ルーム待機", "waiting");
    }
  }

  function queueSave(serialized, immediate = false) {
    if (pendingLocalState == null) {
      pendingPatchBaseState = lastObservedLocalState;
    }
    pendingLocalState = serialized;
    lastObservedLocalState = serialized;
    window.clearTimeout(saveTimer);
    window.clearTimeout(saveRetryTimer);
    saveRetryTimer = null;
    if (immediate) {
      flushSaveQueue();
      return;
    }
    saveTimer = window.setTimeout(flushSaveQueue, 100);
  }

  async function flushSaveQueue() {
    if (saving || pendingLocalState == null) {
      return;
    }

    saving = true;
    let inFlight = null;
    try {
      while (pendingLocalState != null) {
        const serialized = pendingLocalState;
        const patchBaseSerialized =
          pendingPatchBaseState ?? lastSerializedState ?? serialized;
        pendingLocalState = null;
        pendingPatchBaseState = null;
        inFlight = { serialized, patchBaseSerialized };
        const patch = createBoardPatch(
          JSON.parse(patchBaseSerialized),
          JSON.parse(serialized),
        );
        if (!patchHasChanges(patch) && lastRevision > 0) {
          inFlight = null;
          continue;
        }

        updateStatus("保存中", "waiting");
        const { data, error } = await client.rpc(
          "dx3rd_apply_board_patch",
          {
            p_room_id: room.id,
            p_room_secret: room.key,
            p_patch: patch,
            p_initial_state: JSON.parse(serialized),
          },
        );
        if (error) {
          throw error;
        }

        const result = Array.isArray(data) ? data[0] : null;
        const resultRevision = Number(result?.revision) || 0;
        const resultSerialized = result?.board_state
          ? JSON.stringify(result.board_state)
          : serialized;

        lastRevision = resultRevision;
        lastSerializedState = resultSerialized;
        roomStateReady = true;
        localStorage.setItem(roomStateStorageKey, resultSerialized);
        if (
          pendingLocalState == null &&
          boardApi.serializeState() !== resultSerialized
        ) {
          applyBoardSnapshot(resultSerialized, resultRevision);
        }
        await channel.send({
          type: "broadcast",
          event: "board-state",
          payload: {
            revision: resultRevision,
            state: resultSerialized,
          },
        });
        inFlight = null;
      }
      updateStatus("同期中", "connected");
    } catch (error) {
      if (inFlight != null) {
        if (pendingLocalState == null) {
          pendingLocalState = inFlight.serialized;
        }
        pendingPatchBaseState = inFlight.patchBaseSerialized;
      }
      console.warn("Shared room could not be saved.", error);
      updateStatus("保存エラー", "error");
      saveRetryTimer = window.setTimeout(() => {
        saveRetryTimer = null;
        flushSaveQueue();
      }, 1000);
    } finally {
      saving = false;
      if (pendingLocalState != null && saveRetryTimer == null) {
        flushSaveQueue();
      }
    }
  }

  function receiveRemoteState(serialized, revision, force = false) {
    if (!force && revision <= lastRevision) {
      return;
    }
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
      const candidate = JSON.parse(serialized);
      if (!boardApi.applySharedState(candidate)) {
        pendingRemoteState = {
          serialized,
          revision,
          force,
          mode: "remote",
        };
        scheduleRetry();
        return;
      }

      pendingRemoteState = null;
      roomStateReady = true;
      lastRevision = Math.max(lastRevision, revision);
      lastSerializedState = boardApi.serializeState();
      lastObservedLocalState = lastSerializedState;
      localStorage.setItem(roomStateStorageKey, lastSerializedState);
      updateStatus("同期中", "connected");
    } catch (error) {
      console.warn("Shared room state could not be applied.", error);
      updateStatus("同期エラー", "error");
    }
  }

  function scheduleRetry() {
    if (retryTimer != null) {
      return;
    }
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      if (pendingRemoteState != null) {
        const pending = pendingRemoteState;
        if (pending.mode === "apply") {
          applyBoardSnapshot(pending.serialized, pending.revision);
        } else {
          receiveRemoteState(
            pending.serialized,
            pending.revision,
            pending.force,
          );
        }
      }
    }, 250);
  }

  function applyBoardSnapshot(serialized, revision) {
    try {
      const candidate = JSON.parse(serialized);
      if (!boardApi.applySharedState(candidate)) {
        pendingRemoteState = {
          serialized,
          revision,
          force: true,
          mode: "apply",
        };
        scheduleRetry();
        return;
      }
      pendingRemoteState = null;
      lastObservedLocalState = boardApi.serializeState();
      localStorage.setItem(roomStateStorageKey, lastObservedLocalState);
    } catch (error) {
      console.warn("Merged room state could not be applied.", error);
      updateStatus("統合エラー", "error");
    }
  }

  function updateParticipantCount() {
    const presenceState = channel.presenceState();
    const participantCount = Math.max(
      1,
      Object.values(presenceState).reduce(
        (total, participants) => total + participants.length,
        0,
      ),
    );
    syncParticipants.textContent = `${participantCount}人`;
  }

  function updateStatus(label, status) {
    syncStatus.textContent = label;
    syncStatus.dataset.state = status;
  }
}

function patchHasChanges(patch) {
  if (Object.keys(patch.scalars).length > 0) {
    return true;
  }
  return Object.values(patch.collections).some(
    (collection) =>
      collection.upserts.length > 0 || collection.deletes.length > 0,
  );
}

function resolveRoom() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  let id = params.get("room");
  let key = params.get("key");

  if (isValidToken(id) && !isValidToken(key)) {
    key = id;
  }

  if (!isValidToken(id) || !isValidToken(key)) {
    id = randomToken(16);
    key = id;
    const ownerStorageKey = `dx3rd-room-owner-${id}`;
    localStorage.setItem(ownerStorageKey, key);
    params.set("room", id);
    params.delete("key");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${params.toString()}`,
    );
  }

  return {
    id,
    key,
    shareCode: key === id ? id : `${id}.${key}`,
  };
}

function parseRoomCode(value) {
  const parts = value.trim().split(".");
  if (parts.length === 1 && isValidToken(parts[0])) {
    return {
      id: parts[0],
      key: parts[0],
      shareCode: parts[0],
    };
  }
  if (
    parts.length === 2 &&
    isValidToken(parts[0]) &&
    isValidToken(parts[1])
  ) {
    return {
      id: parts[0],
      key: parts[1],
      shareCode: `${parts[0]}.${parts[1]}`,
    };
  }
  return null;
}

async function hashRoomTopic(roomId, roomKey) {
  const encoded = new TextEncoder().encode(`${roomId}:${roomKey}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function isValidToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function randomToken(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (value) => value.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, byteLength * 2);
}
