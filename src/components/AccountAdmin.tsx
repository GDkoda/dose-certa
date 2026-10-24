import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Plus, RefreshCw, Save, Search, Shield, Trash2, Upload, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { manageAccount } from '@/lib/accounts.functions';
import { refreshCloud } from '@/lib/cloud-store';
import { getState, setState, useStore, type Role, type State, type User } from '@/lib/store';
import { normalizeUsername } from '@/lib/account-rules';

const field = 'w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring';
export function AccountAdmin({ me }: { me: User }) {
  const users = useStore((state) => state.users);
  const manage = useServerFn(manageAccount);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (me.role !== 'mestre') return null;
  const perform = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage('');
    try { await action(); await refreshCloud(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  };
  const importLocal = async () => {
    if (importPassword.length < 8) throw new Error('Informe uma nova senha forte para as contas importadas.');
    const raw = localStorage.getItem('dose-certa-v1');
    if (!raw) throw new Error('Não há contas antigas salvas neste aparelho.');
    const legacy = JSON.parse(raw) as State;
    const mapping = new Map<string, string>();
    for (const old of legacy.users ?? []) {
      if (old.role === 'mestre') { mapping.set(old.id, me.id); continue; }
      const username = normalizeUsername(old.login);
      if (!getState().users.some((user) => user.login === username)) {
        await manage({ data: { action: 'create', login: username, password: importPassword, role: 'cuidador' } });
        await refreshCloud();
        const created = getState().users.find((user) => user.login === username);
        if (created) await manage({ data: { action: 'update', id: created.id, password: importPassword } });
      }
      const cloud = getState().users.find((user) => user.login === username);
      if (cloud) mapping.set(old.id, cloud.id);
    }
    setState((state) => {
      const next = { ...state };
      for (const kind of ['patients', 'meds', 'doses', 'alerts', 'tickets'] as const) {
        const imported = (legacy[kind] ?? []).flatMap((record) => {
          const oldOwner = 'ownerId' in record ? record.ownerId : record.userId;
          const owner = mapping.get(oldOwner);
          if (!owner || state[kind].some((item) => item.id === record.id)) return [];
          return [{ ...record, ...('ownerId' in record ? { ownerId: owner } : { userId: owner }) }];
        });
        Object.assign(next, { [kind]: [...state[kind], ...imported] });
      }
      return next;
    });
    setImportPassword('');
  };
  const visible = users.filter((user) => user.login.includes(search.trim().toLowerCase()) && (filter === 'all' || user.role === filter));
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-display text-3xl text-foreground">Painel do Mestre</h1><p className="mt-1 text-sm text-muted-foreground">{users.length} contas · {users.filter((user) => user.role === 'operador').length} operadores</p></div>
      <Button variant="outline" disabled={busy} onClick={() => void perform(refreshCloud, 'Lista atualizada.')}><RefreshCw />Atualizar</Button>
    </div>
    <form className="grid gap-3 border-y border-border py-5 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); void perform(async () => { await manage({ data: { action: 'create', login, password, role: 'operador' } }); setLogin(''); setPassword(''); }, 'Operador criado.'); }}>
      <input className={field} required placeholder="Login do novo operador" value={login} onChange={(event) => setLogin(event.target.value)} />
      <input className={field} required minLength={8} type="password" placeholder="Senha forte do operador" value={password} onChange={(event) => setPassword(event.target.value)} />
      <Button disabled={busy}><Plus />Criar operador</Button>
    </form>
    <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
      <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Buscar conta" className={`${field} pl-10`} placeholder="Buscar conta" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <select aria-label="Filtrar função" className={field} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todas as funções</option><option value="cuidador">Cuidadores</option><option value="operador">Operadores</option><option value="mestre">Mestres</option></select>
    </div>
    {message && <p role="status" className="text-sm text-foreground">{message}</p>}
    <div className="space-y-3">{visible.map((user) => <AccountRow key={`${user.id}-${user.login}-${user.role}`} user={user} self={user.id === me.id} busy={busy} onSave={(patch) => void perform(() => manage({ data: { action: 'update', id: user.id, ...patch } }), 'Conta atualizada.')} onDelete={() => { if (confirm(`Excluir ${user.login}, seus pacientes e registros?`)) void perform(() => manage({ data: { action: 'delete', id: user.id } }), 'Conta excluída.'); }} />)}
      {!visible.length && <p className="py-8 text-center text-muted-foreground">Nenhuma conta encontrada.</p>}
    </div>
    <details className="border-t border-border pt-5"><summary className="cursor-pointer text-sm font-semibold text-foreground">Recuperar contas antigas deste aparelho</summary>
      <p className="my-3 max-w-2xl text-sm text-muted-foreground">As contas antigas estavam salvas somente no aparelho onde foram criadas. Entre como Mestre nesse aparelho para importá-las. Elas serão importadas como cuidadores; você pode promovê-las abaixo. Contas já compartilhadas não serão substituídas.</p>
      <div className="flex flex-wrap gap-3"><input className={`${field} sm:max-w-sm`} type="password" placeholder="Nova senha forte das contas importadas" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} /><Button variant="outline" disabled={busy} onClick={() => void perform(importLocal, 'Contas importadas. Informe a nova senha aos titulares; eles deverão trocá-la ao entrar.')}><Upload />Importar contas deste aparelho</Button></div>
    </details>
  </section>;
}

function AccountRow({ user, self, busy, onSave, onDelete }: { user: User; self: boolean; busy: boolean; onSave: (patch: { login?: string; password?: string; role?: Role }) => void; onDelete: () => void }) {
  const [login, setLogin] = useState(user.login); const [password, setPassword] = useState('');
  return <div className="rounded-xl border border-border bg-card p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><p className="font-semibold text-foreground">{user.login}{self && <span className="ml-2 text-xs text-muted-foreground">Você</span>}</p><span className="flex items-center gap-1 text-sm text-muted-foreground"><Shield className="h-4 w-4" />{user.role}</span></div>
    <div className="grid items-center gap-3 lg:grid-cols-[1fr_1fr_160px_auto]">
      <input aria-label={`Login de ${user.login}`} className={field} disabled={self || busy} value={login} onChange={(event) => setLogin(event.target.value)} />
      <input aria-label={`Nova senha de ${user.login}`} className={field} disabled={self || busy} type="password" placeholder="Nova senha (opcional)" value={password} onChange={(event) => setPassword(event.target.value)} />
      <select aria-label={`Função de ${user.login}`} className={field} disabled={self || busy} value={user.role} onChange={(event) => onSave({ role: event.target.value as Role })}><option value="cuidador">Cuidador</option><option value="operador">Operador</option><option value="mestre">Mestre</option></select>
      <div className="flex gap-2"><Button variant="outline" size="icon" title="Salvar conta" aria-label={`Salvar ${user.login}`} disabled={self || busy} onClick={() => { onSave({ ...(login !== user.login ? { login } : {}), ...(password ? { password } : {}) }); setPassword(''); }}><Save /></Button><Button variant="ghost" size="icon" title="Excluir conta" aria-label={`Excluir ${user.login}`} disabled={self || busy} onClick={onDelete}><Trash2 className="text-destructive" /></Button></div>
    </div>
    {!self && user.role === 'cuidador' && <Button className="mt-3" variant="secondary" disabled={busy} onClick={() => onSave({ role: 'operador' })}><UserRoundCheck />Tornar operador</Button>}
  </div>;
}