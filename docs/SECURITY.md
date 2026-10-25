# Checklist de segurança do Dose Certa

## Ações urgentes antes de publicar

1. **Rotacione qualquer segredo que já tenha sido commitado.** Gere novas chaves no provedor correspondente (especialmente chaves administrativas/service-role) e atualize as variáveis no ambiente de hospedagem. Remover o arquivo em um commit posterior não invalida o segredo antigo nem apaga o histórico.
2. **Mantenha arquivos de ambiente fora do Git.** Use variáveis de ambiente no provedor de hospedagem. Um `.env.example` deve conter apenas nomes de variáveis e valores fictícios, nunca credenciais reais.
3. **Audite RLS no Supabase.** Ative RLS nas tabelas que contêm dados de usuários e valide, com contas distintas, que um cuidador não consegue consultar ou alterar pacientes, medicamentos, doses, chamados ou configurações de outro cuidador.
4. **Revise autorização no servidor.** Toda ação administrativa precisa verificar a sessão e a função do usuário no servidor; ocultar botões no navegador não é controle de acesso.
5. **Elimine credenciais padrão.** Crie a conta Mestre por um procedimento administrativo seguro e configure uma senha forte e única.
6. **Valide recuperação de conta.** Use os mecanismos de recuperação do provedor de autenticação ou redefinição administrativa autenticada. Não dependa de perguntas secretas ou senhas temporárias previsíveis.
7. **Execute os controles antes do deploy:** `npm run lint`, `npm test` e `npm run build`.

## Limite desta revisão

As alterações de interface e de repositório não substituem uma auditoria das políticas RLS aplicadas no projeto Supabase, da configuração de produção nem do histórico Git. Esses itens precisam ser verificados no painel e nos ambientes correspondentes antes de armazenar dados reais de saúde.
