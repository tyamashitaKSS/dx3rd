import { joinRoom } from "https://esm.sh/trystero@0.24.0?bundle";

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
  const roomIdentity = resolveRoom();
  const ownerStorageKey = `dx3rd-room-owner-${roomIdentity.id}`;
  const ownsRoom = localStorage.getItem(ownerStorageKey) === roomIdentity.key;
  const peerIds = new Set();
  let roomStateReady = ownsRoom;
  let lastPublishedState = ownsRoom ? boardApi.serializeState() : null;
  let pendingLocalState = null;
  let pendingRemoteState = null;
  let publishTimer = null;
  let retryTimer = null;

  syncPanel.hidden = false;
  syncRoomCode.textContent = roomIdentity.id.slice(0, 8).toUpperCase();
  updateStatus("接続待機", "waiting");

  const room = joinRoom(
    {
      appId: "dx3rd-combat-board-v1",
    },
    `${roomIdentity.id}-${roomIdentity.key}`,
  );
  const [sendBoardState, onBoardState] = room.makeAction("board-state");

  room.onPeerJoin((peerId) => {
    peerIds.add(peerId);
    updateParticipantCount();
    if (roomStateReady) {
      sendBoardState(boardApi.serializeState(), peerId);
    }
  });

  room.onPeerLeave((peerId) => {
    peerIds.delete(peerId);
    updateParticipantCount();
  });

  onBoardState((serialized) => {
    if (typeof serialized === "string") {
      receiveRemoteState(serialized);
    }
  });

  window.addEventListener("dx3rd-state-change", (event) => {
    if (roomStateReady && typeof event.detail === "string") {
      queuePublish(event.detail);
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

  function queuePublish(serialized) {
    pendingLocalState = serialized;
    if (publishTimer != null) {
      return;
    }
    publishTimer = window.setTimeout(() => {
      publishTimer = null;
      if (pendingLocalState == null || pendingLocalState === lastPublishedState) {
        pendingLocalState = null;
        return;
      }
      lastPublishedState = pendingLocalState;
      sendBoardState(pendingLocalState);
      pendingLocalState = null;
      updateStatus(peerIds.size > 0 ? "同期中" : "接続待機", peerIds.size > 0 ? "connected" : "waiting");
    }, 70);
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
    const participantCount = peerIds.size + 1;
    syncParticipants.textContent = `${participantCount}人`;
    updateStatus(peerIds.size > 0 ? "同期中" : "接続待機", peerIds.size > 0 ? "connected" : "waiting");
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
