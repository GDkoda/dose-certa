import { useState, type ReactNode } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Activity, ArrowUpRight, BellRing, ClipboardList, Clock3, Pill, Plus, RefreshCw, Save, Search, Shield, Trash2, Upload, Users, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { manageAccount } from '@/lib/accounts.functions';
import { flushCloudWrites, refreshCloud } from '@/lib/cloud-store';
import { getState, setState, useStore, type Role, type State, type User } from '@/lib/store';
import { normalizeUsername } from '@/lib/account-rules';

const field = 'w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring';
type AdminDestination = 'pacientes' | 'medicamentos' | 'historico' | 'suporte';
export function AccountAdmin({ me, onNavigate }: { me: User; onNavigate: (page: AdminDestination) => void }) {
  const users = useStore((state) => state.users);
  const patients = useStore((state) => state.patients);
  const meds = useStore((state) => state.meds);
  const doses = useStore((state) => state.doses);
  const tickets = useStore((state) => state.tickets);
  const alerts = useStore((state) => state.alerts);
  const manage = useServerFn(manageAccount);
  const [section, setSection] = useState<'overview' | 'accounts'>('overview');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (me.role !== 'mestre') return null;
  const caregivers = users.filter((user) => user.role === 'cuidador').length;
  const operators = users.filter((user) => user.role === 'operador').length;
  const openTickets = tickets.filter((ticket) => ticket.status === 'aberto').length;
  const unreadAlerts = alerts.filter((alert) => !alert.read).length;
  const today = new Date().toDateString();
  const todayDoses = doses.filter((dose) => new Date(dose.scheduledAt).toDateString() === today);
  const takenToday = todayDoses.filter((dose) => dose.status === 'tomado').length;
  const adherence = todayDoses.length ? Math.round((takenToday / todayDoses.length) * 100) : null;
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
    await flushCloudWrites();
    setImportPassword('');
  };
  const visible = users.filter((user) => user.login.includes(search.trim().toLowerCase()) && (filter === 'all' || user.role === filter));
  const metric = (label: string, value: string | number, detail: string, icon: ReactNode) => (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-muted-foreground">{label}</span><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span></div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
  return <section className="mx-auto w-full max-w-7xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Administração</p><h1 className="mt-1 font-display text-3xl font-semibold text-foreground">Painel do Mestre</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe a operação e gerencie os recursos do Dose Certa.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void perform(refreshCloud, 'Dados atualizados.')}><RefreshCw className="h-4 w-4" />Atualizar dados</Button>
      </div>
    </header>
    <div className="flex flex-wrap gap-2 border-b border-border pb-3" role="tablist" aria-label="Seções administrativas">
      <button role="tab" aria-selected={section === 'overview'} onClick={() => setSection('overview')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${section === 'overview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Visão geral</button>
      <button role="tab" aria-selected={section === 'accounts'} onClick={() => setSection('accounts')} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${section === 'accounts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Usuários e contas <span className="ml-1 opacity-75">({users.length})</span></button>
    </div>
    {message && <p role="status" className="rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground">{message}</p>}
    {section === 'overview' ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metric('Contas cadastradas', users.length, `${caregivers} cuidadores · ${operators} operadores`, <Users className="h-5 w-5" />)}
        {metric('Pacientes', patients.length, 'Registros no aplicativo', <UsersRound className="h-5 w-5" />)}
        {metric('Medicamentos', meds.length, 'Cadastros existentes', <Pill className="h-5 w-5" />)}
        {metric('Adesão de hoje', adherence === null ? '—' : `${adherence}%`, adherence === null ? 'Sem doses previstas hoje' : `${takenToday} de ${todayDoses.length} doses marcadas como tomadas`, <Activity className="h-5 w-5" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-4"><h2 className="font-display text-xl font-semibold text-foreground">Acesso rápido</h2><p className="mt-1 text-sm text-muted-foreground">Abra diretamente as áreas de gerenciamento.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { title: 'Pacientes', desc: 'Consultar registros de pacientes', icon: <UsersRound />, page: 'pacientes' as const },
              { title: 'Medicamentos', desc: 'Ver medicamentos cadastrados', icon: <Pill />, page: 'medicamentos' as const },
              { title: 'Histórico e doses', desc: 'Acompanhar registros de doses', icon: <ClipboardList />, page: 'historico' as const },
              { title: 'Atendimento', desc: 'Ver e responder chamados', icon: <Clock3 />, page: 'suporte' as const },
            ].map((item) => <button key={item.page} onClick={() => onNavigate(item.page)} className="group flex items-center gap-3 rounded-xl border border-border/70 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{item.icon}</span><span className="min-w-0 flex-1"><span className="block font-semibold text-foreground">{item.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.desc}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" /></button>)}
          </div>
        </section>
        <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="mb-4"><h2 className="font-display text-xl font-semibold text-foreground">Atenção</h2><p className="mt-1 text-sm text-muted-foreground">Itens que podem precisar de acompanhamento.</p></div>
          <button onClick={() => onNavigate('suporte')} className="flex w-full items-center gap-3 rounded-xl border border-border/70 p-3 text-left hover:bg-muted/60"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-700"><BellRing className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">Chamados abertos</span><span className="text-xs text-muted-foreground">Solicitações aguardando atendimento</span></span><strong className="text-xl text-foreground">{openTickets}</strong></button>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/70 p-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><BellRing className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">Alertas não lidos</span><span className="text-xs text-muted-foreground">Registros de alerta armazenados</span></span><strong className="text-xl text-foreground">{unreadAlerts}</strong></div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Os indicadores refletem os registros disponíveis na conta conectada. A taxa de adesão considera as doses de hoje marcadas como tomadas.</p>
        </section>
      </div>
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold text-foreground">Gerenciamento</h2><p className="mt-1 text-sm text-muted-foreground">Administre os acessos ao aplicativo.</p></div><Button onClick={() => setSection('accounts')}><Users className="h-4 w-4" />Gerenciar contas</Button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Cuidadores</p><p className="mt-1 text-2xl font-semibold text-foreground">{caregivers}</p></div><div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Operadores</p><p className="mt-1 text-2xl font-semibold text-foreground">{operators}</p></div><div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">Mestres</p><p className="mt-1 text-2xl font-semibold text-foreground">{users.filter((user) => user.role === 'mestre').length}</p></div></div>
      </section>
    </> : <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-display text-xl font-semibold text-foreground">Usuários e contas</h2><p className="mt-1 text-sm text-muted-foreground">{visible.length} de {users.length} contas</p></div>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Novo operador</summary>
            <form className="absolute right-0 z-20 mt-2 grid w-[min( min( calc(100vw - 2rem), 340px), 340px)] gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl" onSubmit={(event) => { event.preventDefault(); void perform(async () => { await manage({ data: { action: 'create', login, password, role: 'operador' } }); setLogin(''); setPassword(''); }, 'Operador criado.'); }}>
              <p className="font-semibold text-foreground">Cadastrar operador</p>
              <input className={field} required placeholder="Login" value={login} onChange={(event) => setLogin(event.target.value)} />
              <input className={field} required minLength={8} type="password" placeholder="Senha (mín. 8 caracteres)" value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button disabled={busy} type="submit"><Plus className="h-4 w-4" />Criar conta</Button>
            </form>
          </details>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
          <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Buscar conta" className={`${field} pl-10`} placeholder="Buscar por login..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select aria-label="Filtrar função" className={field} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todas as funções</option><option value="cuidador">Cuidadores</option><option value="operador">Operadores</option><option value="mestre">Mestres</option></select>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="hidden grid-cols-[minmax(0,1fr)_150px_110px] items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span>Conta</span><span>Perfil</span><span className="text-right">Ação</span></div>
          {visible.map((user) => <AccountRow key={`${user.id}-${user.login}-${user.role}`} user={user} self={user.id === me.id} busy={busy} onSave={(patch) => void perform(() => manage({ data: { action: 'update', id: user.id, ...patch } }), 'Conta atualizada.')} onDelete={() => { if (confirm(`Excluir ${user.login}, seus pacientes e registros?`)) void perform(() => manage({ data: { action: 'delete', id: user.id } }), 'Conta excluída.'); }} />)}
          {!visible.length && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma conta encontrada. Ajuste a busca ou o filtro.</p>}
        </div>
      </section>
      <details className="rounded-xl border border-border/70 px-4 py-3"><summary className="cursor-pointer text-sm font-medium text-muted-foreground">Importar contas antigas deste aparelho</summary>
        <p className="my-3 max-w-2xl text-sm text-muted-foreground">Use esta opção somente se houver contas antigas salvas localmente neste aparelho. As contas já compartilhadas não serão substituídas.</p>
        <div className="flex flex-wrap gap-3"><input className={`${field} sm:max-w-sm`} type="password" placeholder="Nova senha para contas importadas (mín. 8)" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} /><Button variant="outline" disabled={busy} onClick={() => void perform(importLocal, 'Contas importadas. Informe a nova senha aos titulares; eles deverão trocá-la ao entrar.')}><Upload className="h-4 w-4" />Importar contas</Button></div>
      </details>
    </>}
  </section>;
}

function AccountRow({ user, self, busy, onSave, onDelete }: { user: User; self: boolean; busy: boolean; onSave: (patch: { login?: string; password?: string; role?: Role }) => void; onDelete: () => void }) {
  const [login, setLogin] = useState(user.login);
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState(false);
  return <div className="border-b border-border/70 last:border-b-0">
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_150px_110px] sm:items-center">
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{user.login}{self && <span className="ml-2 text-xs font-normal text-muted-foreground">Sua conta</span>}</p><p className="mt-0.5 text-xs text-muted-foreground">{user.role === 'mestre' ? 'Administrador' : user.role === 'operador' ? 'Atendimento' : 'Cuidador'}</p></div>
      <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize text-muted-foreground">{user.role}</span>
      <div className="flex justify-start sm:justify-end"><Button variant="ghost" size="sm" disabled={self || busy} onClick={() => setEditing((value) => !value)}>{editing ? 'Fechar' : 'Gerenciar'}</Button></div>
    </div>
    {editing && <div className="grid gap-3 border-t border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Login<input aria-label={`Login de ${user.login}`} className={field} disabled={self || busy} value={login} onChange={(event) => setLogin(event.target.value)} /></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">Nova senha<input aria-label={`Nova senha de ${user.login}`} className={field} disabled={self || busy} type="password" minLength={8} placeholder="Deixe em branco para manter" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">Tipo de conta<select aria-label={`Função de ${user.login}`} className={field} disabled={self || busy} value={user.role} onChange={(event) => onSave({ role: event.target.value as Role })}><option value="cuidador">Cuidador</option><option value="operador">Operador</option><option value="mestre">Mestre</option></select></label>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2"><Button variant="destructive" size="sm" disabled={self || busy} onClick={onDelete}><Trash2 className="h-4 w-4" />Excluir conta</Button><Button size="sm" disabled={self || busy || (!password && login === user.login)} onClick={() => { onSave({ ...(login !== user.login ? { login } : {}), ...(password ? { password } : {}) }); setPassword(''); setEditing(false); }}><Save className="h-4 w-4" />Salvar alterações</Button></div>
      {self && <p className="text-xs text-muted-foreground sm:col-span-2">A conta atualmente conectada não pode ser alterada por aqui.</p>}
    </div>}
  </div>;
}
