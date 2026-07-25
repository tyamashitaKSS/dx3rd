import * as Y from "https://esm.sh/yjs@13.6.27";
import { WebrtcProvider } from "https://esm.sh/y-webrtc@10.3.0?deps=yjs@13.6.27";

const syncPanel = document.querySelector("#syncPanel");
const syncStatus = document.querySelector("#syncStatus");
const syncRoomCode = document.querySelector("#syncRoomCode");
const syncParticipants = document.querySelector("#syncParticipants");
const copyInviteLink = document.querySelector("#copyInviteLink");
const boardApi = window.DX3RDBoard;

if (window.DX3RD_USE_PEER_SYNC && syncPanel && boardApi) {
  initializePeerSync();
}

function initializePeerSync() {
  const room = resolveRoom();
  const ownerStorageKey = `dx3rd-room-owner-${room.id}`;
  const ownsRoom = localStorage.getItem(ownerStorageKey) === room.key;
  const document = new Y.Doc();
  const sharedBoard = document.getMap("board");
  const localOrigin = Symbol("local-board-change");
  let roomStateReady = ownsRoom;
  let lastPublishedState = null;
  let pendingRemoteState = null;
  let retryTimer = null;

  syncPanel.hidden = false;
  syncRoomCode.textContent = room.id.slice(0, 8).toUpperCase();
  updateStatus("接続待機", "waiting");

  const provider = new WebrtcProvider(`dx3rd-board-${room.id}`, document, {
    password: room.key,
    maxConns: 20,
    filterBcConns: false,
  });

  provider.awareness.setLocalStateField("participant", {
    joinedAt: Date.now(),
  });

  provider.awareness.on("change", updateParticipantCount);
  sharedBoard.observe((event) => {
    if (event.transaction.origin === localOrigin) {
      return;
    }
    const serialized = sharedBoard.get("state");
    if (typeof serialized === "string") {
      receiveRemoteState(serialized);
    }
  });

  window.addEventListener("dx3rd-state-change", (event) => {
    if (roomStateReady && typeof event.detail === "string") {
      publishState(event.detail);
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

  updateParticipantCount();
  if (ownsRoom) {
    publishState(boardApi.serializeState());
  }

  function publishState(serialized) {
    if (serialized === lastPublishedState) {
      return;
    }
    lastPublishedState = serialized;
    document.transact(() => {
      sharedBoard.set("state", serialized);
    }, localOrigin);
    updateStatus("同期中", "connected");
  }

  function receiveRemoteState(serialized) {
    if (serialized === lastPublishedState) {
      return;
    }

    try {
      const candidate = JSON.parse(serialized);
      if (!boardApi.applySharedState(candidate)) {
        pendingRemoteState = serialized;
        scheduleRetry();
        return;
      }
      pendingRemoteState = null;
      roomStateReady = true;
      lastPublishedState = boardApi.serializeState();
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
        receiveRemoteState(pendingRemoteState);
      }
    }, 250);
  }

  function updateParticipantCount() {
    const participantCount = Math.max(1, provider.awareness.getStates().size);
    syncParticipants.textContent = `${participantCount}人`;
    if (participantCount > 1 && sharedBoard.has("state")) {
      updateStatus("同期中", "connected");
    } else if (!sharedBoard.has("state")) {
      updateStatus("ホスト待機", "waiting");
    }
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

function isValidToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function randomToken(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (value) => value.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, byteLength * 2);
}
