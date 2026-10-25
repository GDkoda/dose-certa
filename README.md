# Dose Certa

Criar o aplicativo Dose Certa completo integrando todas as diretrizes do documento conceitual (PDF anexado) e da referência visual (imagem anexada):

1. Identidade Visual e Estilo Gráfico:
- Seguir o design 'Equilíbrio e Bem-Estar': Verde Sálvia (#4E7766), toques de Lavanda (#8A85B8) e Índigo (#2B2D5C), com fundo suave acolhedor.
- Elementos botânicos de lavanda, cantos arredondados, tipografia nítida e legível.
- Interface responsiva com navegação desktop (sidebar verde sálvia com logo e itens de menu) e mobile fluida.
- Modo Noturno (Dark Mode) facilmente ativável por qualquer usuário no topo da tela (alternância Sol/Lua), adaptando os tons sálvia para conforto noturno.

2. Autenticação, Cadastro e Gestão de Pacientes:
- Cadastro rápido do usuário (cuidador): login, senha e uma pergunta de segurança personalizada com resposta para recuperação de senha.
- Recuperação de senha: ao errar ou esquecer a senha, o usuário informa seu login e responde à pergunta secreta. Se acertar, a senha é redefinida temporariamente para '123'. Ao logar com '123', o app obriga a cadastrar uma nova senha imediatamente antes de navegar.
- Área no perfil do usuário para alterar a própria senha a qualquer momento.
- Gestão de dependentes: cada cuidador pode adicionar até no máximo 3 pacientes (nome, idade, observações) e pode excluir pacientes quando necessário.

3. Sistema de Alarmes e Notificações por Pop-up:
- Solicitação de permissão de pop-ups/notificações com aviso acolhedor assim que o usuário entra no app/site.
- Pop-up de alarme na tela no horário programado com som de alerta e opções: 'Já tomei meu medicamento' (verde), 'Lembrar em 5 minutos' (lavanda) e 'Não tomei' (outline).
- Tolerância de atraso configurável por medicamento pelo cuidador.
- Se o paciente marcar 'Não tomei', dispara um aviso de alerta imediato na tela do cuidador.
- Repetição automática a cada 5 minutos caso a dose continue pendente.

4. Hierarquia de Usuários e Poder do Mestre:
- Cuidador: gerencia seus pacientes (até 3), cadastra medicamentos, horários, estoque de comprimidos e acompanha histórico de doses.
- Operador: atende chamados na Central de Atendimento para suporte do app e dúvidas gerais de bulas/medicamentos.
- Operador Mestre (login inicial 'Koda', senha 'batata'):
  * Poder total sobre todas as contas (editar login/senha de cuidadores e operadores, excluir contas, criar novos operadores).
  * Edição inline com ícone de lápis: quando o Mestre está logado, aparece um ícone sutil de lápis ao lado de cada texto do site, nas imagens de fundo e no ícone do aplicativo, permitindo editar frases, trocar imagens e alterar o ícone diretamente na tela sem menus extras. Para outros usuários, a interface é limpa sem nenhum lápis.

5. Central de Atendimento e Histórico:
- Aba de suporte/perguntas com abertura e resposta de chamados.
- Histórico completo de doses com filtros e exportação de relatório visual.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7c570cef-13f2-4f6d-bd75-a7214c132990).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
