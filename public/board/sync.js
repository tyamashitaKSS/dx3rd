import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";

const SUPABASE_URL = "https://znyyanfyllcecwabxpir.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Rey10satxUWgAodSyNhmIw_L83SF187";

const syncPanel = document.querySelector("#syncPanel");
const syncStatus = document.querySelector("#syncStatus");
const syncRoomCode = document.querySelector("#syncRoomCode");
const syncParticipants = document.querySelector("#syncParticipants");
const copyInviteLink = document.querySelector("#copyInviteLink");
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
  let lastRevision = 0;
  let pendingLocalState = null;
  let pendingRemoteState = null;
  let saveTimer = null;
  let saveRetryTimer = null;
  let retryTimer = null;
  let saving = false;

  syncPanel.hidden = false;
  syncRoomCode.textContent = room.id.slice(0, 8).toUpperCase();
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
    pendingLocalState = serialized;
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
    let inFlightState = null;
    try {
      while (pendingLocalState != null) {
        const serialized = pendingLocalState;
        pendingLocalState = null;
        inFlightState = serialized;
        if (serialized === lastSerializedState && lastRevision > 0) {
          inFlightState = null;
          continue;
        }

        updateStatus("保存中", "waiting");
        const { data, error } = await client.rpc("dx3rd_save_board", {
          p_room_id: room.id,
          p_room_secret: room.key,
          p_board_state: JSON.parse(serialized),
        });
        if (error) {
          throw error;
        }

        const result = Array.isArray(data) ? data[0] : null;
        const savedRevision = Number(result?.saved_revision) || 0;
        if (savedRevision >= lastRevision) {
          lastRevision = savedRevision;
          lastSerializedState = serialized;
          roomStateReady = true;
          localStorage.setItem(roomStateStorageKey, serialized);
          await channel.send({
            type: "broadcast",
            event: "board-state",
            payload: {
              revision: savedRevision,
              state: serialized,
            },
          });
        }
        inFlightState = null;
      }
      updateStatus("同期中", "connected");
    } catch (error) {
      if (pendingLocalState == null && inFlightState != null) {
        pendingLocalState = inFlightState;
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

    try {
      const candidate = JSON.parse(serialized);
      if (!boardApi.applySharedState(candidate)) {
        pendingRemoteState = { serialized, revision };
        scheduleRetry();
        return;
      }

      pendingRemoteState = null;
      roomStateReady = true;
      lastRevision = Math.max(lastRevision, revision);
      lastSerializedState = boardApi.serializeState();
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
        receiveRemoteState(
          pendingRemoteState.serialized,
          pendingRemoteState.revision,
        );
      }
    }, 250);
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

function resolveRoom() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  let id = params.get("room");
  let key = params.get("key");

  if (!isValidToken(id) || !isValidToken(key)) {
    id = randomToken(12);
    key = randomToken(24);
    const ownerStorageKey = `dx3rd-room-owner-${id}`;
    localStorage.setItem(ownerStorageKey, key);
    params.set("room", id);
    params.set("key", key);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${params.toString()}`,
    );
  }

  return { id, key };
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
