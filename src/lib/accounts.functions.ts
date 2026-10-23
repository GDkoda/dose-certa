import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { accountEmail, authorizeAccountChange, normalizeUsername } from './account-rules';
import type { Role } from './store';

export const registerAccount = createServerFn({ method: 'POST' })
  .inputValidator((data: { login: string; password: string }) => data)
  .handler(async ({ data }) => {
    const username = normalizeUsername(data.login);
    if (username === 'koda') throw new Error('Este login está reservado.');
    if (data.password.length < 8) throw new Error('Escolha uma senha com pelo menos 8 caracteres.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.auth.admin.createUser({ email: accountEmail(username), password: data.password, email_confirm: true, user_metadata: { username } });
    if (error) throw new Error(error.message.includes('registered') ? 'Este login já existe.' : 'Não foi possível criar a conta. Use uma senha longa e única ou outro login.');
    return { ok: true };
  });

export const manageAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { action: 'create' | 'update' | 'delete'; id?: string; login?: string; password?: string; role?: Role }) => data)
  .handler(async ({ context, data }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'mestre' });
    if (roleError || !allowed) throw new Error('Somente o Mestre pode gerenciar contas.');
    if (data.action !== 'create') {
      if (!data.id) throw new Error('Selecione a conta.');
      authorizeAccountChange('mestre', context.userId, data.id);
    }
    if (data.role && !['mestre', 'operador', 'cuidador'].includes(data.role)) throw new Error('Função inválida.');
    if (data.password && data.password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    if (data.action === 'create') {
      if (!data.login || !data.password) throw new Error('Informe login e senha.');
      const username = normalizeUsername(data.login);
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email: accountEmail(username), password: data.password, email_confirm: true, user_metadata: { username } });
      if (error || !created.user) throw new Error('Não foi possível criar a conta; confira se o login existe e use uma senha forte.');
      const { error: updateError } = await supabaseAdmin.from('user_roles').update({ role: data.role ?? 'operador' }).eq('user_id', created.user.id);
      if (updateError) throw new Error('A conta foi criada, mas a função não foi alterada. Atualize a lista.');
    } else if (data.action === 'delete' && data.id) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
      if (error) throw new Error('Não foi possível excluir a conta.');
    } else if (data.id) {
      if (data.login || data.password) {
        const username = data.login ? normalizeUsername(data.login) : undefined;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { ...(username ? { email: accountEmail(username), email_confirm: true } : {}), ...(data.password ? { password: data.password } : {}) });
        if (error) throw new Error('Não foi possível salvar: login já utilizado ou senha fraca.');
        const { error: profileError } = await supabaseAdmin.from('profiles').update({ ...(username ? { username } : {}), ...(data.password ? { must_change: true } : {}) }).eq('id', data.id);
        if (profileError) throw new Error('Não foi possível atualizar o perfil.');
      }
      if (data.role) {
        const { error } = await supabaseAdmin.from('user_roles').update({ role: data.role }).eq('user_id', data.id);
        if (error) throw new Error('Não foi possível alterar a função.');
      }
    }
    return { ok: true };
  });

export const finishPasswordChange = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('profiles').update({ must_change: false }).eq('id', context.userId);
    if (error) throw new Error('Não foi possível concluir a alteração.');
    return { ok: true };
  });