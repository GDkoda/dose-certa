import type { Role } from './store';

export function normalizeUsername(value: string) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) throw new Error('Login: use de 3 a 40 letras sem acentos, números, ponto, hífen ou sublinhado.');
  return username;
}
export const accountEmail = (username: string) => `${normalizeUsername(username)}@dosecerta.local`;
export function authorizeAccountChange(actorRole: Role, actorId: string, targetId: string) {
  if (actorRole !== 'mestre') throw new Error('Somente o Mestre pode gerenciar contas.');
  if (actorId === targetId) throw new Error('Use Meu perfil para alterar sua própria senha; sua função e conta estão protegidas.');
}