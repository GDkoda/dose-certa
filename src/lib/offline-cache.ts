import type { State } from "./store";

export type OfflineChange = {
  key: string;
  id: string;
  kind: string;
  ownerId: string;
  payload: unknown | null;
  changedAt: number;
};

export type OfflinePackage = {
  userId: string;
  snapshot: State;
  pending: OfflineChange[];
  lastSyncedAt: string | null;
};

const DATABASE_NAME = "dose-certa-offline";
const DATABASE_VERSION = 1;
const STORE_NAME = "accounts";
let lastChangeRevision = 0;

function nextChangeRevision(): number {
  lastChangeRevision = Math.max(Date.now(), lastChangeRevision + 1);
  return lastChangeRevision;
}

/** Ask the browser to reduce the chance of evicting the offline cache. */
export async function requestPersistentOfflineStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("O armazenamento offline não está disponível neste navegador."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento offline."));
    request.onblocked = () => reject(new Error("O armazenamento offline está ocupado por outra aba."));
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readPackage(database: IDBDatabase, userId: string): Promise<OfflinePackage | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as OfflinePackage | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Falha ao ler os dados offline."));
  });
}

function updatePackage(
  database: IDBDatabase,
  userId: string,
  update: (current: OfflinePackage | null) => OfflinePackage,
): Promise<OfflinePackage> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(userId);
    let result: OfflinePackage | null = null;
    let updateError: unknown;

    request.onsuccess = () => {
      try {
        result = update((request.result as OfflinePackage | undefined) ?? null);
        store.put(result);
      } catch (error) {
        updateError = error;
        transaction.abort();
      }
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => {
      if (result) resolve(result);
      else reject(new Error("O pacote offline não foi atualizado."));
    };
    transaction.onerror = () => reject(updateError ?? transaction.error ?? new Error("Falha ao atualizar os dados offline."));
    transaction.onabort = () => reject(updateError ?? transaction.error ?? new Error("A atualização offline foi cancelada."));
  });
}

export async function readOfflinePackage(userId: string): Promise<OfflinePackage | null> {
  const database = await openDatabase();
  try {
    return await readPackage(database, userId);
  } finally {
    database.close();
  }
}

export async function cacheServerSnapshot(userId: string, snapshot: State): Promise<void> {
  const database = await openDatabase();
  try {
    await updatePackage(database, userId, (current) => ({
      userId,
      snapshot: clone(snapshot),
      pending: current?.pending ?? [],
      lastSyncedAt: new Date().toISOString(),
    }));
  } finally {
    database.close();
  }
}

function ownerFor(kind: string, record: Record<string, unknown>, fallback: string): string {
  return String(kind === "tickets" ? record["userId"] ?? fallback : record["ownerId"] ?? fallback);
}

export async function persistLocalMutation(userId: string, before: State, after: State): Promise<number> {
  const database = await openDatabase();
  try {
    let pendingSize = 0;
    await updatePackage(database, userId, (cached) => {
      const pending = new Map((cached?.pending ?? []).map((change) => [change.key, change]));
      const kinds = ["patients", "meds", "doses", "alerts", "tickets"] as const;

      for (const kind of kinds) {
        const previousRecords = before[kind] as unknown as Record<string, unknown>[];
        const nextRecords = after[kind] as unknown as Record<string, unknown>[];
        const previousById = new Map(previousRecords.map((record) => [String(record["id"]), record]));
        const nextIds = new Set(nextRecords.map((record) => String(record["id"])));

        for (const record of nextRecords) {
          const id = String(record["id"]);
          const previous = previousById.get(id);
          if (previous && JSON.stringify(previous) === JSON.stringify(record)) continue;
          const key = kind + ":" + id;
          pending.set(key, {
            key,
            id,
            kind,
            ownerId: ownerFor(kind, record, userId),
            payload: clone(record),
            changedAt: nextChangeRevision(),
          });
        }

        for (const record of previousRecords) {
          const id = String(record["id"]);
          if (nextIds.has(id)) continue;
          const key = kind + ":" + id;
          pending.set(key, {
            key,
            id,
            kind,
            ownerId: ownerFor(kind, record, userId),
            payload: null,
            changedAt: nextChangeRevision(),
          });
        }
      }

      if (JSON.stringify(before.texts) !== JSON.stringify(after.texts)
        || JSON.stringify(before.images) !== JSON.stringify(after.images)) {
        const key = "config:app-config";
        pending.set(key, {
          key,
          id: "app-config",
          kind: "config",
          ownerId: userId,
          payload: clone({ texts: after.texts, images: after.images }),
          changedAt: nextChangeRevision(),
        });
      }

      pendingSize = pending.size;
      return {
        userId,
        snapshot: clone(after),
        pending: [...pending.values()],
        lastSyncedAt: cached?.lastSyncedAt ?? null,
      };
    });
    return pendingSize;
  } finally {
    database.close();
  }
}

export async function clearSyncedChanges(userId: string, synced: OfflineChange[]): Promise<number> {
  const database = await openDatabase();
  try {
    if (!(await readPackage(database, userId))) return 0;
    let remaining = 0;
    await updatePackage(database, userId, (cached) => {
      if (!cached) throw new Error("O pacote offline foi removido durante a sincronização.");
      const completed = new Map(synced.map((change) => [change.key, change.changedAt]));
      const pending = cached.pending.filter((change) => completed.get(change.key) !== change.changedAt);
      remaining = pending.length;
      return {
        ...cached,
        pending,
        lastSyncedAt: pending.length === 0 ? new Date().toISOString() : cached.lastSyncedAt,
      };
    });
    return remaining;
  } finally {
    database.close();
  }
}

/**
 * A finalized server dose is authoritative over a stale offline "pending" copy.
 * This is needed when a notification action confirms a dose while a tab is suspended.
 */
export function reconcilePendingChanges(remote: State, changes: OfflineChange[]): OfflineChange[] {
  const finalizedRemoteDoses = new Set(
    remote.doses.filter((dose) => dose.status !== "pendente").map((dose) => dose.id),
  );
  return changes.filter((change) => !(change.kind === "doses" && finalizedRemoteDoses.has(change.id)));
}

export function applyPendingChanges(remote: State, changes: OfflineChange[]): State {
  const merged = clone(remote);
  for (const change of changes) {
    if (change.kind === "config") {
      const config = change.payload as { texts?: Record<string, string>; images?: Record<string, string> } | null;
      if (config) {
        merged.texts = config.texts ?? {};
        merged.images = config.images ?? {};
      }
      continue;
    }

    if (!["patients", "meds", "doses", "alerts", "tickets"].includes(change.kind)) continue;
    const kind = change.kind as "patients" | "meds" | "doses" | "alerts" | "tickets";
    const list = merged[kind] as unknown as Record<string, unknown>[];
    const index = list.findIndex((record) => record["id"] === change.id);
    if (change.payload === null) {
      if (index >= 0) list.splice(index, 1);
      continue;
    }

    const payload = clone(change.payload as Record<string, unknown>);
    payload["id"] = change.id;
    if (kind === "tickets") payload["userId"] = change.ownerId;
    else payload["ownerId"] = change.ownerId;
    if (index >= 0) list[index] = payload;
    else list.push(payload);
  }
  return merged;
}

export function publishOfflineStatus(online: boolean, pending: number, lastSyncedAt: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("dc-offline-status", {
    detail: { online, pending, lastSyncedAt },
  }));
}
