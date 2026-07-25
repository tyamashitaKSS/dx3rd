const ENTITY_COLLECTIONS = ["engages", "tokens", "shapes"];

export function mergeBoardStates(baseState, localState, remoteState) {
  const base = isRecord(baseState) ? baseState : {};
  const local = isRecord(localState) ? localState : {};
  const remote = isRecord(remoteState) ? remoteState : {};
  const merged = {};

  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(remote),
    ...Object.keys(local),
  ])) {
    if (ENTITY_COLLECTIONS.includes(key)) {
      merged[key] = mergeEntityCollection(base[key], local[key], remote[key]);
      continue;
    }
    if (key === "nextId") {
      merged[key] = Math.max(
        Number(base[key]) || 1,
        Number(local[key]) || 1,
        Number(remote[key]) || 1,
      );
      continue;
    }
    merged[key] = mergeValue(base[key], local[key], remote[key]);
  }

  return merged;
}

function mergeEntityCollection(baseItems, localItems, remoteItems) {
  const baseMap = toEntityMap(baseItems);
  const localMap = toEntityMap(localItems);
  const remoteMap = toEntityMap(remoteItems);
  const orderedIds = [
    ...remoteMap.keys(),
    ...[...localMap.keys()].filter((id) => !remoteMap.has(id)),
  ];

  return orderedIds.flatMap((id) => {
    const merged = mergeEntity(
      baseMap.get(id),
      localMap.get(id),
      remoteMap.get(id),
    );
    return merged == null ? [] : [merged];
  });
}

function mergeEntity(base, local, remote) {
  if (base == null) {
    if (local == null) {
      return clone(remote);
    }
    if (remote == null) {
      return clone(local);
    }
    return mergeEntityFields({}, local, remote);
  }

  // Deletion wins over a concurrent edit so removed objects do not reappear.
  if (local == null || remote == null) {
    return null;
  }
  if (deepEqual(local, base)) {
    return clone(remote);
  }
  if (deepEqual(remote, base)) {
    return clone(local);
  }
  return mergeEntityFields(base, local, remote);
}

function mergeEntityFields(base, local, remote) {
  const merged = {};
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(remote),
    ...Object.keys(local),
  ])) {
    merged[key] = mergeValue(base[key], local[key], remote[key]);
  }
  return merged;
}

function mergeValue(base, local, remote) {
  if (deepEqual(local, base)) {
    return clone(remote);
  }
  if (deepEqual(remote, base)) {
    return clone(local);
  }
  // A local edit is retried after the remote commit, so it is the later edit.
  return clone(local);
}

function toEntityMap(items) {
  return new Map(
    (Array.isArray(items) ? items : [])
      .filter((item) => isRecord(item) && item.id != null)
      .map((item) => [String(item.id), item]),
  );
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}
