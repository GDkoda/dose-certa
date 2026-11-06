import { supabase } from '@/integrations/supabase/client';
import { accountEmail, formatAuthPassword } from './account-rules';
import { connectCloudWriter, getState, replaceCloudState, type State, type User } from './store';
import type { Json } from '@/integrations/supabase/types';
import {
  applyPendingChanges,
  cacheServerSnapshot,
  clearSyncedChanges,
  persistLocalMutation,
  publishOfflineStatus,
  reconcilePendingChanges,
  replacePendingChanges,
  readOfflinePackage,
} from './offline-cache';

const kinds = ['patients', 'meds', 'doses', 'alerts', 'tickets', 'faqs', 'routines', 'routineLogs', 'routineSettings', 'hydrationLogs', 'careEvents'] as const;
let currentId: string | null = null;
let queue = Promise.resolve();
// Reconciliation must never replace an in-memory edit that has not reached IndexedDB yet.
let localMutationRevision = 0;
let persistedMutationRevision = 0;
let refreshing: Promise<void> | undefined;
let refreshQueued = false;
let errorHandler: (message: string) => void = () => {};
let writeFailed = false;
let lastSyncError: string | null = null;

function cloudErrorDetails(error: unknown): string {
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown; status?: unknown };
    const message = typeof value.message === 'string' ? value.message : 'Falha desconhecida na comunicação com o servidor.';
    const code = typeof value.code === 'string' ? value.code : typeof value.status === 'number' ? String(value.status) : '';
    return (code ? `${message} (código ${code})` : message).slice(0, 240);
  }
  return (typeof error === 'string' ? error : 'Falha desconhecida na comunicação com o servidor.').slice(0, 240);
}

export async function flushCloudWrites() {
  await queue;
  if (writeFailed) throw new Error(lastSyncError ?? 'Os registros não foram sincronizados. Confira a conexão e tente novamente.');
}
export function onCloudError(handler: (message: string) => void) { errorHandler = handler; }

async function fetchAllPages<T>(
  loadPage: (afterId: string | null, limit: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  getId: (row: T) => string,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  let afterId: string | null = null;

  for (;;) {
    const { data, error } = await loadPage(afterId, pageSize);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('O servidor retornou uma página de dados inválida.');

    const page = data;
    if (page.length === 0) return rows;
    const lastId = getId(page[page.length - 1]!);
    if (!lastId || (afterId !== null && lastId <= afterId)) {
      throw new Error('A paginação do servidor não avançou corretamente. A cópia local foi preservada.');
    }

    rows.push(...page);
    if (page.length < pageSize) return rows;
    afterId = lastId;
  }
}

async function loadRemoteState(id: string): Promise<State> {
  const [profiles, roles, records] = await Promise.all([
    fetchAllPages((afterId, limit) => {
      const query = supabase.from('profiles').select('*').order('id', { ascending: true }).limit(limit);
      return afterId ? query.gt('id', afterId) : query;
    }, (profile) => profile.id),
    fetchAllPages((afterId, limit) => {
      const query = supabase.from('user_roles').select('*').order('user_id', { ascending: true }).limit(limit);
      return afterId ? query.gt('user_id', afterId) : query;
    }, (role) => role.user_id),
    fetchAllPages((afterId, limit) => {
      const query = supabase.from('app_records').select('*').order('id', { ascending: true }).limit(limit);
      return afterId ? query.gt('id', afterId) : query;
    }, (record) => record.id),
  ]);

  // RLS can return an empty result set without an error. The authenticated profile
  // must be visible before we trust any remote snapshot as a complete account read.
  if (!profiles.some((profile) => profile.id === id)) {
    throw new Error('A conta autenticada não foi encontrada na leitura dos dados. A cópia local foi preservada.');
  }

  const recordIds = new Set<string>();
  for (const record of records) {
    if (recordIds.has(record.id)) {
      throw new Error('O servidor retornou registros repetidos durante a leitura. A cópia atual foi preservada.');
    }
    recordIds.add(record.id);
    if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) {
      throw new Error('O servidor retornou um registro incompleto. A cópia atual foi preservada.');
    }
  }

  for (const record of records.filter((item) => item.kind === 'patients')) {
    const payload = record.payload as Record<string, unknown>;
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new Error('Um cadastro de paciente chegou sem nome. A atualização foi interrompida para proteger os dados existentes.');
    }
    if (payload.ownerId && payload.ownerId !== record.owner_id) {
      throw new Error('Um cadastro de paciente chegou com proprietário divergente. A atualização foi interrompida.');
    }
  }

  const users: User[] = profiles.map((profile) => ({
    id: profile.id,
    login: profile.username,
    password: '',
    role: roles.find((role) => role.user_id === profile.id)?.role ?? 'cuidador',
    question: '',
    answer: '',
    mustChange: profile.must_change,
  }));
  const next: State = { users, patients: [], meds: [], doses: [], alerts: [], tickets: [], faqs: [], routines: [], routineLogs: [], routineSettings: [], hydrationLogs: [], careEvents: [], texts: {}, images: {}, sessionId: id };
  for (const kind of kinds) {
    const values = records
      .filter((record) => record.kind === kind)
      .map((record) => ({
        ...(record.payload as object),
        id: record.id,
        ...(kind === 'tickets' ? { userId: record.owner_id } : { ownerId: record.owner_id }),
      }));
    Object.assign(next, { [kind]: values });
  }
  const config = records.find((record) => record.kind === 'config')?.payload as { texts?: Record<string, string>; images?: Record<string, string> } | undefined;
  next.texts = config?.texts ?? {};
  next.images = config?.images ?? {};
  return next;
}

async function flushPendingChanges(userId: string): Promise<number> {
  const cached = await readOfflinePackage(userId);
  if (!cached?.pending.length) return 0;
  const pending = cached.pending;
  const upserts = pending.filter((change) => change.payload !== null);
  const deletes = pending.filter((change) => change.payload === null);

  if (upserts.length) {
    const rows = upserts.map((change) => ({
      id: change.id,
      kind: change.kind,
      owner_id: change.ownerId,
      payload: change.payload as Json,
    }));
    const { error } = await supabase.from('app_records').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    await clearSyncedChanges(userId, upserts);
  }

  if (deletes.length) {
    for (const change of deletes) {
      const { error } = await supabase.from('app_records')
        .delete()
        .eq('id', change.id)
        .eq('owner_id', change.ownerId);
      if (error) throw error;
    }
    await clearSyncedChanges(userId, deletes);
  }

  const remaining = await readOfflinePackage(userId);
  return remaining?.pending.length ?? 0;
}

export async function refreshCloud() {
  if (refreshing) {
    refreshQueued = true;
    return refreshing;
  }
  const id = currentId;
  refreshing = (async () => {
    if (!id) {
      lastSyncError = null;
      writeFailed = false;
      replaceCloudState({ users: [], patients: [], meds: [], doses: [], alerts: [], tickets: [], faqs: [], routines: [], routineLogs: [], routineSettings: [], hydrationLogs: [], careEvents: [], texts: {}, images: {}, sessionId: null });
      publishOfflineStatus(typeof navigator === 'undefined' || navigator.onLine, 0, null, null);
      return;
    }

    let remote: State | null = null;
    let remoteError: unknown = null;
    const browserOnline = typeof navigator === 'undefined' || navigator.onLine;
    if (browserOnline) {
      try {
        remote = await loadRemoteState(id);
      } catch (error) {
        remoteError = error;
        console.error('[CloudSync] Não foi possível ler os dados do Supabase.', error);
      }
    } else {
      remoteError = new Error('O aparelho está sem conexão com a internet.');
    }

    // Take a stable view of the local write generation around the IndexedDB read.
    // If a user edit is still being persisted, retry only after the write queue has drained.
    const localRevisionBeforeCacheRead = localMutationRevision;
    const persistedRevisionBeforeCacheRead = persistedMutationRevision;
    let cached: Awaited<ReturnType<typeof readOfflinePackage>> = null;
    try {
      cached = await readOfflinePackage(id);
    } catch (error) {
      console.error('[CloudSync] Não foi possível ler a cópia offline.', error);
    }
    if (
      localMutationRevision !== localRevisionBeforeCacheRead ||
      persistedMutationRevision !== persistedRevisionBeforeCacheRead ||
      persistedMutationRevision < localMutationRevision
    ) {
      refreshQueued = true;
      return;
    }
    if (!remote && !cached) {
      const details = remoteError ? cloudErrorDetails(remoteError) : 'Não existe uma cópia offline neste aparelho.';
      lastSyncError = details;
      writeFailed = true;
      publishOfflineStatus(false, 0, null, details);
      throw new Error(`Não foi possível conectar ao servidor e carregar os dados: ${details}`);
    }
    if (currentId !== id) return;

    const base = remote ?? cached!.snapshot;
    let pending = cached?.pending ?? [];
    let syncError = remoteError ? cloudErrorDetails(remoteError) : null;
    if (remote && pending.length) {
      const reconciled = reconcilePendingChanges(remote, pending);
      const remainingKeys = new Set(reconciled.map((change) => change.key + ":" + change.changedAt));
      const resolved = pending.filter((change) => !remainingKeys.has(change.key + ":" + change.changedAt));
      if (resolved.length) await clearSyncedChanges(id, resolved);
      pending = reconciled;
      // Persist rebased patient payloads before the queue is uploaded. The helper
      // checks changedAt so it cannot overwrite a newer edit created meanwhile.
      if (pending.length) await replacePendingChanges(id, pending);
    }
    // clearSyncedChanges above is asynchronous. Recheck the generation directly
    // before replacing the live store so an edit made during that transaction survives.
    if (
      localMutationRevision !== localRevisionBeforeCacheRead ||
      persistedMutationRevision !== persistedRevisionBeforeCacheRead ||
      persistedMutationRevision < localMutationRevision
    ) {
      refreshQueued = true;
      return;
    }

    const merged = applyPendingChanges(base, pending);
    merged.sessionId = id;
    replaceCloudState(merged);

    if (remote) {
      await cacheServerSnapshot(id, remote).catch((error) => {
        console.error('[CloudSync] Dados remotos carregados, mas a cópia offline não foi atualizada.', error);
      });
      if (pending.length && browserOnline) {
        try {
          const remaining = await flushPendingChanges(id);
          writeFailed = remaining > 0;
          if (remaining === 0) {
            await cacheServerSnapshot(id, merged);
            syncError = null;
          } else {
            syncError = 'Ainda existem alterações aguardando envio.';
          }
        } catch (error) {
          writeFailed = true;
          syncError = cloudErrorDetails(error);
          console.error('[CloudSync] Falha ao enviar alterações pendentes.', error);
        }
      } else {
        writeFailed = false;
        syncError = null;
      }
    } else {
      writeFailed = pending.length > 0;
    }

    lastSyncError = syncError;
    const latest = await readOfflinePackage(id).catch(() => null);
    publishOfflineStatus(
      remote !== null && browserOnline,
      latest?.pending.length ?? pending.length,
      latest?.lastSyncedAt ?? null,
      syncError,
    );
  })();
  try {
    await refreshing;
  } finally {
    refreshing = undefined;
    if (refreshQueued) {
      refreshQueued = false;
      // Wait for edits that were queued while this refresh was fetching remote data.
      // Never start another replacement while a failed local write is still only in memory.
      const writesToFinish = queue;
      void writesToFinish.then(() => {
        if (!currentId || persistedMutationRevision < localMutationRevision) return;
        return refreshCloud();
      }).catch((error) => {
        lastSyncError = cloudErrorDetails(error);
        void readOfflinePackage(currentId ?? '').then((cached) => {
          publishOfflineStatus(false, cached?.pending.length ?? 0, cached?.lastSyncedAt ?? null, lastSyncError);
        }).catch(() => {
          publishOfflineStatus(false, 0, null, lastSyncError);
        });
        errorHandler('Não foi possível atualizar os dados compartilhados. ' + lastSyncError);
      });
    }
  }
}

export async function initializeCloud() {
  // Keep the legacy copy untouched so old accounts can be recovered on their original device.
  getState();
  connectCloudWriter((before, after) => {
    const actorId = currentId;
    if (!actorId) return;
    const revision = ++localMutationRevision;
    queue = queue.then(async () => {
      const pendingCount = await persistLocalMutation(actorId, before, after);
      persistedMutationRevision = Math.max(persistedMutationRevision, revision);
      publishOfflineStatus(typeof navigator === 'undefined' || navigator.onLine, pendingCount, null, null);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        writeFailed = false;
        lastSyncError = null;
        return;
      }
      try {
        const remaining = await flushPendingChanges(actorId);
        writeFailed = remaining > 0;
        lastSyncError = remaining > 0 ? 'Ainda existem alterações aguardando envio.' : null;
        const cached = await readOfflinePackage(actorId);
        publishOfflineStatus(true, remaining, cached?.lastSyncedAt ?? null, lastSyncError);
      } catch (error) {
        writeFailed = true;
        lastSyncError = cloudErrorDetails(error);
        const cached = await readOfflinePackage(actorId).catch(() => null);
        publishOfflineStatus(false, cached?.pending.length ?? pendingCount, cached?.lastSyncedAt ?? null, lastSyncError);
        console.error('[CloudSync] Falha ao salvar alterações no Supabase.', error);
        errorHandler('Alteração guardada neste aparelho, mas não foi sincronizada: ' + lastSyncError);
      }
    }).catch((error) => {
      writeFailed = true;
      lastSyncError = cloudErrorDetails(error);
      errorHandler('Não foi possível guardar esta alteração localmente. ' + lastSyncError);
    });
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Não foi possível recuperar a sessão do Supabase: ' + cloudErrorDetails(error));
  currentId = data.session?.user.id ?? null;
  localMutationRevision = 0;
  persistedMutationRevision = 0;
  await refreshCloud();

  const auth = supabase.auth.onAuthStateChange((event, session) => {
    if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(event)) return;
    const nextUserId = session?.user.id ?? null;
    if (currentId !== nextUserId) {
      currentId = nextUserId;
      localMutationRevision = 0;
      persistedMutationRevision = 0;
    }
    setTimeout(() => {
      void refreshCloud().catch((error) => {
        lastSyncError = cloudErrorDetails(error);
        errorHandler('Não foi possível atualizar a conta. ' + lastSyncError);
      });
    }, 0);
  });

  const syncNow = () => {
    if (!currentId || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    queue = queue.then(() => refreshCloud()).catch((error) => {
      lastSyncError = cloudErrorDetails(error);
      console.error('[CloudSync] Nova tentativa de sincronização falhou.', error);
      void readOfflinePackage(currentId ?? '').then((cached) => {
        publishOfflineStatus(false, cached?.pending.length ?? 0, cached?.lastSyncedAt ?? null, lastSyncError);
      }).catch(() => {
        publishOfflineStatus(false, 0, null, lastSyncError);
      });
    });
  };
  const syncOnReconnect = () => syncNow();
  const syncOnResume = () => {
    if (document.visibilityState === 'visible') syncNow();
  };

  window.addEventListener('online', syncOnReconnect);
  window.addEventListener('focus', syncOnResume);
  document.addEventListener('visibilitychange', syncOnResume);
  // Realtime is the fast path; periodic refresh is the fallback if the browser
  // or Supabase project does not deliver Realtime events to this session.
  const syncInterval = window.setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, 30_000);

  const channel = supabase.channel('dose-certa-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, syncNow)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, syncNow)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_records' }, syncNow)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[CloudSync] Realtime indisponível; a atualização periódica continuará ativa.', error);
      }
    });

  return () => {
    window.removeEventListener('online', syncOnReconnect);
    window.removeEventListener('focus', syncOnResume);
    document.removeEventListener('visibilitychange', syncOnResume);
    window.clearInterval(syncInterval);
    auth.data.subscription.unsubscribe();
    void supabase.removeChannel(channel);
  };
}

export async function cloudLogin(login: string, password: string) {
  const email = accountEmail(login);
  const transformed = await supabase.auth.signInWithPassword({ email, password: formatAuthPassword(password) });
  let user = transformed.data.user;
  if (transformed.error || !user) {
    // Só tenta o formato legado quando o provedor rejeita as credenciais.
    if (transformed.error?.code !== 'invalid_credentials') throw new Error('Não foi possível autenticar agora. Tente novamente.');
    const legacy = await supabase.auth.signInWithPassword({ email, password });
    if (legacy.error || !legacy.data.user) throw new Error('Login ou senha incorretos.');
    user = legacy.data.user;
  }
  if (currentId !== user.id) {
    currentId = user.id;
    localMutationRevision = 0;
    persistedMutationRevision = 0;
  }
  await refreshCloud();
}
export async function cloudLogout() {
  await queue;
  await supabase.auth.signOut();
  currentId = null;
  localMutationRevision = 0;
  persistedMutationRevision = 0;
  await refreshCloud();
}
export async function updateOwnPassword(currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  const me = getState().users.find((user) => user.id === currentId);
  if (!me) throw new Error('Entre novamente.');
  const email = accountEmail(me.login);
  const transformed = await supabase.auth.signInWithPassword({ email, password: formatAuthPassword(currentPassword) });
  if (transformed.error) {
    if (transformed.error.code !== 'invalid_credentials') throw new Error('Não foi possível verificar a senha atual. Tente novamente.');
    // Contas legadas ainda podem validar a senha sem transformação.
    const legacy = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (legacy.error) throw new Error('Senha atual incorreta.');
  }
  const { error } = await supabase.auth.updateUser({ password: formatAuthPassword(newPassword) });
  if (error) throw new Error('Não foi possível salvar a nova senha. Tente novamente.');
}