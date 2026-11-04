import type { State } from "./store";

export type OfflineChange = {
  key: string;
  id: string;
  kind: string;
  ownerId: string;
  payload: unknown | null;
  basePayload: unknown | null;
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

function writePackage(database: IDBDatabase, value: OfflinePackage): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao salvar os dados offline."));
    transaction.onabort = () => reject(transaction.error ?? new Error("O salvamento offline foi cancelado."));
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
    const current = await readPackage(database, userId);
    await writePackage(database, {
      userId,
      snapshot: clone(snapshot),
      pending: current?.pending ?? [],
      lastSyncedAt: new Date().toISOString(),
    });
  } finally {
    database.close();
  }
}

function ownerFor(kind: string, record: Record<string, unknown>, fallback: string): string {
  return String(kind === "tickets" ? record.userId ?? fallback : record.ownerId ?? fallback);
}

export async function persistLocalMutation(userId: string, before: State, after: State): Promise<number> {
  const database = await openDatabase();
  try {
    const cached = await readPackage(database, userId);
    const pending = new Map((cached?.pending ?? []).map((change) => [change.key, change]));
    const kinds = ["patients", "meds", "doses", "alerts", "tickets"] as const;

    for (const kind of kinds) {
      const previousRecords = before[kind] as unknown as Record<string, unknown>[];
      const nextRecords = after[kind] as unknown as Record<string, unknown>[];
      for (const record of nextRecords) {
        const id = String(record.id);
        const previous = previousRecords.find((item) => item.id === id);
        if (previous && JSON.stringify(previous) === JSON.stringify(record)) continue;
        const key = kind + ":" + id;
        const existing = pending.get(key);
        pending.set(key, {
          key,
          id,
          kind,
          ownerId: ownerFor(kind, record, userId),
          payload: clone(record),
          basePayload: existing ? existing.basePayload : previous ? clone(previous) : null,
          changedAt: Date.now(),
        });
      }
      for (const record of previousRecords) {
        const id = String(record.id);
        if (nextRecords.some((item) => item.id === id)) continue;
        const key = kind + ":" + id;
        const existing = pending.get(key);
        pending.set(key, {
          key,
          id,
          kind,
          ownerId: ownerFor(kind, record, userId),
          payload: null,
          basePayload: existing ? existing.basePayload : clone(record),
          changedAt: Date.now(),
        });
      }
    }

    if (JSON.stringify(before.texts) !== JSON.stringify(after.texts)
      || JSON.stringify(before.images) !== JSON.stringify(after.images)) {
      const key = "config:app-config";
      const existing = pending.get(key);
      pending.set(key, {
        key,
        id: "app-config",
        kind: "config",
        ownerId: userId,
        payload: clone({ texts: after.texts, images: after.images }),
        basePayload: existing ? existing.basePayload : clone({ texts: before.texts, images: before.images }),
        changedAt: Date.now(),
      });
    }

    await writePackage(database, {
      userId,
      snapshot: clone(after),
      pending: [...pending.values()],
      lastSyncedAt: cached?.lastSyncedAt ?? null,
    });
    return pending.size;
  } finally {
    database.close();
  }
}

export async function clearSyncedChanges(userId: string, synced: OfflineChange[]): Promise<number> {
  const database = await openDatabase();
  try {
    const cached = await readPackage(database, userId);
    if (!cached) return 0;
    const completed = new Map(synced.map((change) => [change.key, change.changedAt]));
    const pending = cached.pending.filter((change) => completed.get(change.key) !== change.changedAt);
    await writePackage(database, {
      ...cached,
      pending,
      lastSyncedAt: pending.length === 0 ? new Date().toISOString() : cached.lastSyncedAt,
    });
    return pending.length;
  } finally {
    database.close();
  }
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
    const index = list.findIndex((record) => record.id === change.id);
    if (change.payload === null) {
      if (index >= 0) list.splice(index, 1);
      continue;
    }

    const payload = clone(change.payload as Record<string, unknown>);
    payload.id = change.id;
    if (kind === "tickets") payload.userId = change.ownerId;
    else payload.ownerId = change.ownerId;
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
