import { describe, expect, it } from 'vitest';
import { accountEmail, authorizeAccountChange, formatAuthPassword } from '@/lib/account-rules';
describe('Account administration rules', () => {
  it('only the Master can promote an existing account to operator', () => {
    expect(() => authorizeAccountChange('mestre', 'master', 'existing')).not.toThrow();
    expect(() => authorizeAccountChange('cuidador', 'caregiver', 'existing')).toThrow();
    expect(() => authorizeAccountChange('operador', 'operator', 'existing')).toThrow();
  });
  it('the Master cannot remove or demote their own account', () => {
    expect(() => authorizeAccountChange('mestre', 'master', 'master')).toThrow();
  });
  it('username sign-in is case insensitive and does not require a real email', () => {
    expect(accountEmail(' Koda ')).toBe('koda@dosecerta.local');
  });
});
describe('Auth password formatting', () => {
  it('applies a deterministic provider-compatible wrapper', () => {
    expect(formatAuthPassword('aaaaaaaa')).toBe('dc#aaaaaaaa#9!');
    expect(formatAuthPassword('11111111')).toBe('dc#11111111#9!');
    expect(formatAuthPassword('batata')).toBe('dc#batata#9!');
    expect(formatAuthPassword('batata')).toBe(formatAuthPassword('batata'));
  });

  it('preserves arbitrary characters inside the wrapper', () => {
    expect(formatAuthPassword('áç! @#$%')).toBe('dc#áç! @#$%#9!');
  });
});
