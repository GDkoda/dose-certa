# Dose Certa — confiabilidade dos alarmes

Branch de implementação: `Alpha2`

## Implementado no repositório

- O motor local usa regras puras para gerar doses diárias e selecionar a próxima dose pendente.
- A criação das doses evita duplicatas para o mesmo medicamento e instante programado.
- A seleção do alerta respeita status, horário previsto, adiamento, intervalo de repetição e limite de 12 horas.
- Há testes unitários para horários, geração de doses, repetição e prioridade.
- O service worker mostra notificações de dados recebidas pelo Firebase Messaging em segundo plano e trata cliques para abrir o app.
- A interface esclarece que registrar o aparelho não garante que o serviço de envio esteja operacional.
- A Edge Function `send-dose-reminders` consulta doses e dispositivos, limita lembretes a 12 horas após o horário previsto, usa mensagens FCM data-only e tenta remover tokens inválidos.
- A migration `202610270001_push_delivery_claim.sql` define o controle de idempotência por dose, intervalo e dispositivo.

## Configuração obrigatória antes de ativar

A implementação está versionada, mas o envio real **não estará ativo** até que o projeto Supabase e o Firebase sejam configurados. Não há como confirmar credenciais, executar migrations no projeto remoto ou agendar a função a partir deste repositório.

1. Aplique a migration no projeto Supabase ligado ao app.
2. Configure os secrets da Edge Function:
   - `DOSE_REMINDER_CRON_SECRET`: segredo aleatório forte, usado para autorizar somente o agendador.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON da conta de serviço do Firebase com acesso ao Firebase Cloud Messaging. Não coloque esse JSON no frontend nem no Git.
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: disponibilizados no ambiente Supabase para Edge Functions; confirme a configuração do projeto.
3. Faça deploy da função `send-dose-reminders`.
4. Configure Supabase Cron para chamar a função a cada minuto, enviando o header `x-cron-secret` com o mesmo valor guardado em `DOSE_REMINDER_CRON_SECRET`. Guarde a credencial do agendador em Supabase Vault ou em outro mecanismo de secrets do lado servidor; não a grave em SQL versionado.
5. Verifique logs da Edge Function e do Cron antes de testar com uma dose de teste e um dispositivo real.

Exemplo de deploy (com Supabase CLI já autenticado e projeto vinculado):

```sh
supabase db push
supabase secrets set DOSE_REMINDER_CRON_SECRET='<segredo-forte>'
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='<JSON-da-conta-de-servico>'
supabase functions deploy send-dose-reminders
```

A forma de armazenar e referenciar o segredo no Supabase Cron depende da configuração do projeto. Não crie uma chamada agendada pública sem autenticação.

## Como funciona o envio

- A função busca registros `app_records` do tipo `doses` e `meds`, mais dispositivos em `push_devices`.
- Só processa doses `pendente` cujo horário chegou e que não tenham mais de 12 horas.
- Respeita `snoozeUntil`; usa uma janela de cinco minutos para gerar a chave idempotente de entrega.
- Envia mensagem FCM data-only para o service worker, que monta a notificação localmente.
- Registra tentativa e envio em `push_deliveries`. Uma tentativa sem sucesso pode ser reivindicada novamente após dois minutos.
- Tokens que o FCM reporta como não registrados são removidos.

## Limitações e pontos a validar

- O processo consulta todos os registros de doses e medicamentos; para grandes volumes, adicionar paginação e filtros no banco.
- A chave idempotente evita duplicação de processamento por intervalo, mas falhas entre o FCM aceitar a mensagem e o banco registrar `sent_at` ainda podem causar um reenvio após a janela de recuperação.
- O envio usa horário UTC da dose armazenada; confirmar que os horários são persistidos como instantes UTC corretos. O campo de fuso dos dispositivos está disponível para futuras regras de agenda local.
- O estado do aplicativo pode mudar depois que a função consulta a dose. A função revalida no ciclo de execução, mas para cargas maiores deve buscar/validar cada dose imediatamente antes do envio.
- A função não consegue garantir que o sistema operacional mostre cada notificação; permissões, conectividade, economia de bateria e políticas do dispositivo podem interferir.
- Tokens FCM e nomes de medicamentos são dados sensíveis. Limite acesso aos logs e retenção, e nunca registre tokens completos ou payloads de saúde em logs.
- O projeto precisa validar RLS e permissões das tabelas `app_records`, `push_devices` e `push_deliveries` antes de produção.

## Etapa seguinte: vínculos entre pacientes e cuidadores

The overdue-dose notification currently reaches devices registered under the medication owner's account. To notify a different family member, the product still needs an explicit patient-caregiver relationship, invitation/approval flow, database policies, and authorization checks. Do not expose patient data by simply allowing a second account to query another owner's records.

Stock duration is only an estimate: the current medication model does not encode units per dose or liquid volume, so the calculation assumes one stock unit per scheduled time. It must not be interpreted as a prescription or dosing recommendation.

## Matriz mínima de validação manual

- Chrome desktop: app aberto, aba em segundo plano, aba fechada, permissão permitida e negada.
- Android/Chrome: tela bloqueada, economia de bateria, rede alternada, app PWA e navegador fechado.
- iPhone/Safari: Safari normal e web app instalado na Tela de Início; registrar a versão do iOS e o estado das permissões.
- Retorno após ficar offline: verificar reconciliação das doses sem duplicar nem reabrir doses confirmadas.
- Sincronização multiaparelho: confirmar dose num dispositivo e verificar que os demais não continuam notificando após sincronização.

## Critérios de aceite

- Nenhuma dose duplicada ao atualizar/reabrir a página ou após sincronização.
- Doses confirmadas não voltam a pendente.
- Adiar cinco minutos atualiza a próxima janela de alerta.
- Notificações server-side são enviadas com a página fechada, dentro das limitações documentadas de cada plataforma.
- Falhas de envio ficam observáveis e o app não promete entrega garantida.
- Testes automatizados, build e lint passam; cenários reais em Android e iOS são documentados.

## Comandos de verificação

```sh
npm run test
npm run lint
npm run build
```

Os comandos precisam ser executados num ambiente com dependências e variáveis configuradas. A existência dos testes não significa que tenham sido executados nesta alteração.
