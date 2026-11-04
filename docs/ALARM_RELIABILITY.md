# Dose Certa — confiabilidade dos alarmes

Branch de implementação: `teste.1`

## Implementado no código

- As doses diárias geradas no navegador usam IDs determinísticos, compatíveis com a geração do agendador do servidor quando ambos usam o mesmo instante UTC.
- O motor local mantém um único alarme ativo até que ele seja resolvido; a próxima dose não substitui o aviso aberto a cada ciclo de verificação.
- Ao retornar para a aba ou receber uma mensagem do Service Worker, o app atualiza o estado remoto. Uma dose que já esteja finalizada no servidor encerra o alarme local.
- As ações “Já tomei” na notificação e no app usam a função transacional `confirm_doses_and_deduct_stock`: mudança de status e desconto de estoque ocorrem juntos, e uma repetição da ação não desconta novamente.
- O Service Worker fecha a notificação correspondente e avisa as janelas abertas após uma ação concluída. Ele não reexibe repetidamente a mesma notificação em pulsos de meio segundo.
- O cache offline faz operações de leitura-modificação-gravação no IndexedDB dentro de uma transação. Na reconciliação, uma dose finalizada no servidor vence uma cópia offline antiga ainda marcada como pendente.
- O agendador TanStack e a Edge Function usam a mesma chave idempotente por dose, janela de cinco minutos e dispositivo. Se ambos estiverem ativos, apenas um deve reivindicar cada entrega.
- Medicamentos arquivados deixam de gerar doses locais e de acionar os dois emissores; doses finalizadas permanecem no histórico.
- O carregamento do estado remoto, a rota de lembretes e a Edge Function percorrem páginas de 500 registros, em vez de depender de uma única resposta limitada pelo servidor.

## Migrations necessárias

Aplique todas as migrations novas antes de testar:

- `202611040001_atomic_dose_confirmation.sql`: alinha a assinatura da função de idempotência e cria a confirmação transacional da dose com desconto de estoque.
- `202611040002_limit_operator_health_data.sql`: limita a leitura do operador aos chamados e exige que a troca obrigatória de senha esteja concluída antes de acessar registros.

O arquivo equivalente para o fluxo Drizzle está em `drizzle/migrations`.

## Configuração obrigatória

O código versionado não confirma que as credenciais, migrations ou agendadores estejam ativos no projeto remoto.

1. Aplique as migrations no projeto Supabase.
2. Configure `DOSE_ACTION_SIGNING_SECRET` com o mesmo segredo forte no ambiente servidor do app e nas Edge Functions. O app mantém compatibilidade com `LOVABLE_API_KEY` como fallback, mas um segredo dedicado compartilhado é preferível.
3. Para o envio pela Edge Function, configure também `DOSE_REMINDER_CRON_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
4. Para o envio pela rota TanStack, configure `LOVABLE_API_KEY`, `FIREBASE_MESSAGING_API_KEY` e a autenticação de Cron esperada por `authenticateCronRequest`.
5. Confirme qual agendador está configurado no projeto. A chave idempotente comum evita dois envios para a mesma dose/dispositivo/janela; quando os emissores competirem, um grupo de doses pode aparecer dividido em notificações separadas.
6. Faça deploy da Edge Function depois das alterações. Não basta aplicar apenas as migrations.

## Como funciona o envio

- O agendador identifica doses pendentes até 12 horas após o horário previsto e respeita `snoozeUntil`.
- A chave de entrega é `doseId:slot:tokenFinal`, onde `slot` é a janela de cinco minutos. A claim é protegida por uma função SQL no banco.
- O payload FCM é data-only. O Service Worker constrói a notificação e envia a ação assinada para `/api/public/dose-action`.
- A confirmação da notificação valida o HMAC antes de executar a operação privilegiada no banco.
- A função SQL bloqueia as linhas de dose e medicamento, confirma apenas doses ainda pendentes e subtrai o estoque de maneira atômica.
- Tentativas malsucedidas ficam registradas em `push_deliveries` e podem ser reivindicadas novamente após a janela de recuperação.

## Limitações que ainda exigem validação em ambiente real

- Os fusos horários são definidos pelos dispositivos registrados; em contas com aparelhos em fusos diferentes, o agendador usa o dispositivo atualizado mais recentemente. Uma configuração de fuso no nível da conta seria mais consistente em viagens ou uso multi-região.
- A disponibilidade da notificação depende das permissões e das políticas do Android, iOS, navegador, economia de bateria e conectividade. O código não consegue garantir que o sistema operacional exiba ou toque cada alerta.
- O agendador carrega os registros de medicamentos e doses da conta em cada execução. Contas muito grandes podem precisar de paginação adicional nesse caminho.
- Um erro entre o FCM aceitar uma mensagem e o banco gravar `sent_at` pode gerar reenvio depois da janela de recuperação; a ação do usuário, por sua vez, continua idempotente.
- O projeto remoto, Cron, Edge Function, Firebase e migrations aplicadas precisam ser verificados separadamente. A versão do código não prova que a configuração de produção esteja ativa.

## Matriz mínima de validação manual

- Chrome desktop: app aberto, aba em segundo plano, aba fechada e permissões permitidas/negadas.
- Android/Chrome: tela bloqueada, economia de bateria, rede alternada, PWA instalado e navegador.
- iPhone/Safari: Safari e web app na Tela de Início; registrar versão do iOS e permissões.
- Confirmar “Já tomei” na notificação com o app aberto: som e vibração devem parar sem abrir o app.
- Confirmar “Já tomei” com o app fechado: ao abrir novamente, a dose deve aparecer tomada.
- Confirmar estoque: uma dose confirmada por notificação e também por clique repetido deve descontar exatamente uma vez.
- Sincronização multiaparelho: confirmar num aparelho e validar que os demais não mantêm o alarme ativo após sincronização.
- Testar adiamento de cinco minutos, dose não tomada, modo offline, reconexão e transição de horário de verão.

## Critérios de aceite

- Nenhuma dose confirmada volta a pendente após sincronização.
- O alarme local encerra quando a confirmação chega de outra aba, aparelho ou notificação.
- O estoque é descontado uma única vez por dose confirmada.
- O adiamento bloqueia o alerta até o novo horário.
- Falhas de envio ficam observáveis e o app não promete entrega garantida.
- Testes automatizados, build e lint passam; Android e iOS reais são testados manualmente.
