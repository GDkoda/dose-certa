import { supabase } from '@/integrations/supabase/client';
import { accountEmail } from './account-rules';
import { connectCloudWriter, getState, replaceCloudState, type State, type User } from './store';
import type { Json } from '@/integrations/supabase/types';

const kinds = ['patients', 'meds', 'doses', 'alerts', 'tickets'] as const;
let currentId: string | null = null;
let queue = Promise.resolve();
let refreshing: Promise<void> | undefined;
let errorHandler: (message: string) => void = () => {};
let writeFailed = false;
export async function flushCloudWrites() { await queue; if (writeFailed) throw new Error('Os registros não foram salvos. Confira a conexão e tente novamente.'); }
export function onCloudError(handler: (message: string) => void) { errorHandler = handler; }

export async function refreshCloud() {
  if (refreshing) { await refreshing; return refreshCloud(); }
  const id = currentId;
  refreshing = (async () => {
    if (!id) { replaceCloudState({ users: [], patients: [], meds: [], doses: [], alerts: [], tickets: [], texts: {}, images: {}, sessionId: null }); return; }
    const [profiles, roles, records] = await Promise.all([
      supabase.from('profiles').select('*'), supabase.from('user_roles').select('*'), supabase.from('app_records').select('*'),
    ]);
    if (profiles.error || roles.error || records.error) throw new Error('Não foi possível carregar seus dados. Tente novamente.');
    if (currentId !== id) return;
    const users: User[] = profiles.data.map((profile) => ({ id: profile.id, login: profile.username, password: '', role: roles.data.find((role) => role.user_id === profile.id)?.role ?? 'cuidador', question: '', answer: '', mustChange: profile.must_change }));
    const next: State = { users, patients: [], meds: [], doses: [], alerts: [], tickets: [], texts: {}, images: {}, sessionId: id };
    for (const kind of kinds) {
      const values = records.data.filter((record) => record.kind === kind).map((record) => ({ ...(record.payload as object), id: record.id, ...(kind === 'tickets' ? { userId: record.owner_id } : { ownerId: record.owner_id }) }));
      Object.assign(next, { [kind]: values });
    }
    const config = records.data.find((record) => record.kind === 'config')?.payload as { texts?: Record<string, string>; images?: Record<string, string> } | undefined;
    next.texts = config?.texts ?? {}; next.images = config?.images ?? {};
    replaceCloudState(next);
  })();
  try { await refreshing; } finally { refreshing = undefined; }
}

async function saveChanges(before: State, after: State, actorId: string) {
  const writes: { id: string; kind: string; owner_id: string; payload: Json }[] = [];
  const deletes: string[] = [];
  for (const kind of kinds) {
    for (const record of after[kind]) {
      const previous = before[kind].find((item) => item.id === record.id);
      if (JSON.stringify(previous) !== JSON.stringify(record)) writes.push({ id: record.id, kind, owner_id: 'ownerId' in record ? record.ownerId : record.userId, payload: record as unknown as Json });
    }
    for (const record of before[kind]) if (!after[kind].some((item) => item.id === record.id)) deletes.push(record.id);
  }
  if (before.texts !== after.texts || before.images !== after.images) writes.push({ id: 'app-config', kind: 'config', owner_id: actorId, payload: { texts: after.texts, images: after.images } });
  if (writes.length) { const { error } = await supabase.from('app_records').upsert(writes); if (error) throw error; }
  if (deletes.length) { const { error } = await supabase.from('app_records').delete().in('id', deletes); if (error) throw error; }
}

export async function initializeCloud() {
  // Keep the legacy copy untouched so old accounts can be recovered on their original device.
  getState();
  connectCloudWriter((before, after) => {
    const actorId = currentId;
    if (!actorId) return;
    queue = queue.then(async () => { await saveChanges(before, after, actorId); writeFailed = false; }).catch(async () => { writeFailed = true; errorHandler('Não foi possível salvar a alteração. Confira sua conexão e permissões.'); await refreshCloud(); });
  });
  const { data } = await supabase.auth.getSession();
  currentId = data.session?.user.id ?? null;
  await refreshCloud();
  const auth = supabase.auth.onAuthStateChange((event, session) => {
    if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
    currentId = session?.user.id ?? null;
    setTimeout(() => { void refreshCloud().catch(() => errorHandler('Não foi possível atualizar a conta.')); }, 0);
  });
  const channel = supabase.channel('dose-certa-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void queue.then(refreshCloud); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => { void queue.then(refreshCloud); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_records' }, () => { void queue.then(refreshCloud); }).subscribe();
  return () => { auth.data.subscription.unsubscribe(); void supabase.removeChannel(channel); };
}

export async function cloudLogin(login: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: accountEmail(login), password });
  if (error || !data.user) throw new Error('Login ou senha incorretos.');
  currentId = data.user.id; await refreshCloud();
}
export async function cloudLogout() {
  await queue; await supabase.auth.signOut(); currentId = null; await refreshCloud();
}
export async function updateOwnPassword(currentPassword: string, password: string) {
  const me = getState().users.find((user) => user.id === currentId);
  if (!me) throw new Error('Entre novamente.');
  const { error: verified } = await supabase.auth.signInWithPassword({ email: accountEmail(me.login), password: currentPassword });
  if (verified) throw new Error('Senha atual incorreta.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error('Use uma senha longa e única, com pelo menos 8 caracteres.');
}