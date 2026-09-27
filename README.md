# Protocolo Hub

Projeto Next.js preparado para Vercel, com login Discord, sessão protegida e perfis persistidos no MongoDB.

## Implementado

- Login OAuth pelo Discord com NextAuth, proteção de state e CSRF.
- Painel e APIs protegidos no servidor; clientes acessam somente suas licenças.
- Perfil Discord salvo em `discord_users` (ID Discord como chave única).
- Reconhecimento do proprietário por `OWNER_DISCORD_ID`; sem esse valor, todos são clientes.
- Pool MongoDB registrado com `attachDatabasePool`.

**Painel:** interface escura inspirada em menus táticos, com visão geral, biblioteca e controle de licenças. Login Discord abre diretamente a home. A antiga rota `/conta` apenas redireciona para `/`.

- Proprietário: publicar scripts com versão, descrição e ZIP; substituir ZIP; gerar chaves sem Discord predefinido; definir validade; revogar; excluir scripts.
- Cliente: resgatar uma chave informando o servidor, vinculá-la à própria conta Discord e consultar as próprias licenças e baixar scripts com licença ativa.
- ZIP: até 3 MB, armazenado no MongoDB GridFS e servido por uma rota autenticada. O limite fica abaixo dos [4,5 MB da Vercel](https://vercel.com/docs/functions/limitations). Não são usadas URLs públicas para os arquivos.
- Resgate: todos os usuários têm um campo para digitar a chave. O primeiro resgate válido vincula e ativa a licença na conta autenticada, em uma atualização atômica. Resgates simultâneos têm somente um vencedor. Novas chaves não aparecem para clientes antes do resgate; a biblioteca do cliente inclui apenas scripts com licença ativa. Licenças antigas já atribuídas mantêm seu vínculo. Nenhum ID Discord enviado pelo navegador pode substituir o da sessão.
- Expiração: armazenada em UTC e verificada em toda ativação, validação e download. A interface mostra o horário local. Licenças antigas sem expiração continuam vitalícias. Não é necessário cron para bloquear uma licença vencida.
- Exclusão: remove o script da biblioteca, bloqueia novos downloads/validações e revoga as licenças. Registros e arquivo são preservados internamente para histórico; substituir um ZIP remove o arquivo anterior.
- Persistência: `hub_scripts`, `hub_licenses`, `hub_files.files`/`hub_files.chunks` e `hub_validation_limits` (TTL). Índices são criados automaticamente; o usuário MongoDB precisa de permissão de leitura, escrita e criação de índices no banco.

A validação está disponível em `POST /api/licenses/validate`. Cada script precisa chamar essa API no servidor para aplicar o bloqueio de execução. Veja [a integração](docs/license-validation.md). O upload do ZIP não modifica automaticamente seu código. Dados da aplicação antiga não são importados automaticamente.

## Desenvolvimento

Node.js 24.x e npm.

```sh
npm ci
```

Copie `.env.example` para `.env.local` e preencha MongoDB e Discord. Então:

```sh
npm run auth:prepare
npm run dev
```

`auth:prepare` valida o callback e gera um segredo de sessão local quando necessário, sem imprimir credenciais. Não execute esse comando na Vercel: use as variáveis do projeto.

Acesse `http://localhost:3000/login`.

## Publicar na Vercel

1. Importe o repositório [R4ze-Corps/Hub](https://github.com/R4ze-Corps/Hub).
2. Use a raiz do repositório como **Root Directory**, framework **Next.js** e Node.js **24.x**.
3. Instalação: `npm ci`. Build: `npm run build`. Deixe o diretório de saída automático.
4. Configure as variáveis abaixo antes de fazer o deploy.
5. Cadastre a URL de retorno exata no Discord Developer Portal > OAuth2 > Redirects.
6. Faça o deploy e teste o login em `/login`.

| Variável | Valor em produção |
| --- | --- |
| `MONGODB_URI` | String de conexão com o banco da aplicação |
| `DISCORD_CLIENT_ID` | Application ID da aplicação Discord |
| `DISCORD_CLIENT_SECRET` | Client Secret da aplicação Discord |
| `NEXTAUTH_URL` | Origem HTTPS estável, por exemplo `https://seu-hub.vercel.app` |
| `DISCORD_REDIRECT_URI` | A mesma origem seguida de `/api/auth/callback/discord` |
| `NEXTAUTH_SECRET` | Segredo aleatório forte e estável; pode ser gerado com o comando abaixo |
| `OWNER_DISCORD_ID` | ID numérico da sua conta pessoal Discord, não o Application ID |

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Salve o segredo diretamente nas variáveis da Vercel. Não o publique no GitHub.

O NextAuth deriva seu callback de `NEXTAUTH_URL`; mantenha `DISCORD_REDIRECT_URI` e o cadastro no Discord alinhados a ele. Para testar Preview com OAuth, use um domínio estável de Preview e cadastre também esse callback no Discord. Não use localhost em Production.

Configure a permissão de rede do MongoDB para aceitar conexões da hospedagem. As variáveis secretas não usam o prefixo `NEXT_PUBLIC_`.

## Verificação

```sh
npm run typecheck
npm run build
npm run start
# Em outro terminal, com o servidor em localhost:3000:
npm run test:auth
npm run test:studio
```

O teste verifica acesso anônimo bloqueado, CSRF, destino Discord, escopo identify, state, callback inválido e rejeição de sessão adulterada. Ele não realiza uma autorização real na conta do Discord. O primeiro login completo precisa ser testado no navegador.

`npm run test:integration` inicia um servidor local na porta 3087, usa um banco aleatório `protocolo_test_*` no cluster configurado e limpa suas coleções ao finalizar. Requer permissão para criar coleções, gravar registros e remover os dados temporários. Não usa dados de produção. Execute após a build. Para capturas e testes opcionais de navegador, defina `TEST_PLAYWRIGHT_MODULE` com o caminho do módulo Playwright instalado; o teste usa Edge headless.

`npm run auth:check` testa a conexão MongoDB sem revelar a string de conexão.

## Arquivo de distribuição

O ZIP de entrega é um arquivo do código versionado, sem `.env.local`, `node_modules` ou saída de build. Na Vercel, importe diretamente o repositório; a plataforma instala e compila o código.

## Referências

- [NextAuth: Discord](https://next-auth.js.org/providers/discord)
- [NextAuth: variáveis de autenticação](https://next-auth.js.org/configuration/options)
- [Vercel: Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel: variáveis de ambiente](https://vercel.com/docs/environment-variables)
