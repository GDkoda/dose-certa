# Dose Certa — checklist de segurança e publicação

Este checklist registra validações pendentes; não representa certificação de segurança nem confirmação de que o app está pronto para produção.

## Antes de publicar

- [ ] Executar `npm run test`, `npm run lint` e `npm run build` em ambiente limpo e corrigir falhas.
- [ ] Validar as políticas RLS de `app_records`, `push_devices` e `push_deliveries` com duas contas independentes; comprovar que uma conta não lê nem altera registros da outra.
- [ ] Confirmar que operações privilegiadas usam apenas a chave `service_role` no servidor e que ela nunca é enviada ao navegador.
- [ ] Verificar que a Edge Function exige o segredo do agendador, rejeita chamadas sem segredo ou com segredo inválido e não registra credenciais.
- [ ] Confirmar que Firebase service account, segredos do Cron e tokens FCM não estão no repositório, nos logs do cliente nem em mensagens de erro.
- [ ] Confirmar que tokens FCM são removidos no logout e que permissões de notificação negadas não bloqueiam o uso principal do app.
- [ ] Revisar autenticação e recuperação de senha: senhas não devem ser armazenadas em texto puro, credenciais padrão de demonstração devem ser removidas, e erros não devem revelar se uma conta existe.
- [ ] Testar isolamento de dados, alteração de senha, logout, expiração de sessão e acesso direto às rotas com sessão ausente.
- [ ] Testar fluxo de doses em aparelhos reais: app aberto, segundo plano, offline, retorno de conexão, fuso horário e economia de bateria.
- [ ] Conferir acessibilidade por teclado, foco visível, leitor de tela, contraste, zoom e formulários com campos identificados.
- [ ] Validar exportação CSV com acentos, separadores, aspas e conteúdo que possa ser interpretado como fórmula por planilhas.
- [ ] Definir política de privacidade, retenção/exclusão de dados e procedimento de resposta a incidentes antes de usar dados reais de saúde.

## Escopo atual

O vínculo entre familiares e cuidadores foi descartado e não deve ser implementado nesta etapa. Os alertas de doses ficam restritos aos dispositivos da mesma conta proprietária. A estimativa de estoque é aproximada e assume uma unidade por horário cadastrado.

## Evidência de validação

Registre aqui a data, versão/commit, ambiente, comandos executados, resultados e dispositivos testados. Não marque um item como concluído sem evidência observável.
