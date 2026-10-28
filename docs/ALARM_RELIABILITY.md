# Dose Certa — confiabilidade dos alarmes

Branch de implementação: `Alpha2`

## Estado desta implementação

- O motor local usa regras puras para gerar doses diárias e selecionar a próxima dose pendente.
- A criação das doses evita duplicatas para o mesmo medicamento e instante programado.
- A seleção do alerta respeita status, horário previsto, adiamento, intervalo de repetição e limite de 12 horas.
- Há testes unitários para horários, geração de doses, repetição e prioridade.
- O service worker mostra notificações recebidas pelo Firebase Messaging em segundo plano e trata cliques para abrir o app.
- A interface esclarece que registrar o aparelho não garante que o serviço de envio esteja operacional.

## Limitação importante ainda aberta

O cadastro de token em `push_devices` não envia notificações por si só. A inspeção atual do repositório não encontrou um agendador servidor ativo que consulte as doses e envie mensagens FCM nos horários corretos. Portanto, notificações push agendadas com a página fechada **não podem ser consideradas concluídas** até essa infraestrutura ser criada, configurada e validada.

## Próxima etapa de backend obrigatória

1. Definir uma rotina de servidor agendada (por exemplo, Supabase Cron chamando uma Edge Function).
2. Consultar registros de doses pendentes e dispositivos registrados, verificando a autorização do usuário e a relação com o cuidador.
3. Calcular os envios por horário e fuso horário armazenados no dispositivo/agenda; não confiar no relógio do navegador como fonte única.
4. Fazer envio FCM autenticado no servidor usando credenciais guardadas em secrets, nunca no bundle do navegador.
5. Registrar uma chave idempotente por dose, janela de repetição e dispositivo para evitar envios duplicados em retries.
6. Revalidar o status da dose imediatamente antes do envio; uma dose tomada, cancelada ou alterada não deve gerar lembrete antigo.
7. Tratar tokens inválidos, limites de envio, erros transitórios, repetição com backoff e observabilidade sem registrar dados de saúde desnecessários.
8. Validar políticas RLS e permissões de acesso às tabelas `app_records` e `push_devices` antes de usar dados de doses no processo de envio.

## Matriz mínima de validação manual

- Chrome desktop: app aberto, aba em segundo plano, aba fechada, permissão permitida e negada.
- Android/Chrome: tela bloqueada, economia de bateria, rede alternada, app PWA e navegador fechado.
- iPhone/Safari: Safari normal e web app instalado na Tela de Início; registrar a versão do iOS e o estado das permissões.
- Retorno após ficar offline: verificar reconciliação das doses sem duplicar nem reabrir doses confirmadas.
- Sincronização multiaparelho: confirmar dose num dispositivo e verificar que os demais não continuam notificando após sincronização.

## Critérios de aceite para considerar confiável

- Nenhuma dose duplicada ao atualizar/reabrir a página ou após sincronização.
- Doses confirmadas não voltam a pendente.
- Adiar cinco minutos atualiza a próxima janela de alerta.
- Notificações servidor-side são enviadas mesmo sem a página aberta, dentro das limitações documentadas de cada plataforma.
- Falhas de envio ficam observáveis e o app não promete entrega garantida.
- Testes automatizados, build e lint passam; cenários reais em Android e iOS são documentados.

## Comandos de verificação

```sh
bun test
bun run lint
bun run build
```

Os comandos acima devem ser executados num ambiente com dependências e variáveis de ambiente configuradas. A existência dos testes não significa que já tenham sido executados nesta alteração.
