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
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: accountEmail(username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username },
    });

    if (error) {
      // Keep the provider's detailed error in server logs so configuration failures
      // are diagnosable without exposing internal details to the user.
      console.error('[registerAccount] Supabase createUser failed', {
        code: error.code,
        status: error.status,
        message: error.message,
      });

      const message = error.message.toLowerCase();
      if (
        error.code === 'email_exists' ||
        error.code === 'user_already_exists' ||
        message.includes('already registered') ||
        message.includes('already exists') ||
        message.includes('already been registered')
      ) {
        throw new Error('Este login já existe. Escolha outro login.');
      }
      if (
        error.code === 'weak_password' ||
        message.includes('password') ||
        message.includes('senha')
      ) {
        // Surface the provider's policy reason instead of incorrectly implying
        // that every rejection is caused by password length or reuse.
        throw new Error(`O Supabase recusou a senha: ${error.message}`);
      }
      if (message.includes('invalid email') || message.includes('email address')) {
        throw new Error('O Supabase recusou o endereço interno usado para este login. A configuração de autenticação precisa ser ajustada.');
      }
      if (error.status === 429) {
        throw new Error('Muitas tentativas de cadastro. Aguarde um pouco e tente novamente.');
      }
      throw new Error('Falha ao criar a conta no Supabase. Consulte os logs do servidor para identificar a causa.');
    }
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
        const { data: original, error: originalError } = await context.supabase.from('profiles').select('username').eq('id', data.id).single();
        if (originalError || !original) throw new Error('Conta não encontrada.');
        const username = data.login ? normalizeUsername(data.login) : undefined;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { ...(username ? { email: accountEmail(username), email_confirm: true } : {}), ...(data.password ? { password: data.password } : {}) });
        if (error) throw new Error('Não foi possível salvar: login já utilizado ou senha fraca.');
        const { error: profileError } = await supabaseAdmin.from('profiles').update({ ...(username ? { username } : {}), ...(data.password ? { must_change: true } : {}) }).eq('id', data.id);
        if (profileError) {
          if (username) await supabaseAdmin.auth.admin.updateUserById(data.id, { email: accountEmail(original.username), email_confirm: true });
          throw new Error('Não foi possível atualizar o perfil. O login anterior foi preservado.');
        }
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