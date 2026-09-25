# Protocolo Hub

Projeto Next.js preparado para Vercel, com login Discord, sessão protegida e perfis persistidos no MongoDB.

## Implementado

- Login OAuth pelo Discord com NextAuth, proteção de state e CSRF.
- Página de conta e API protegidas no servidor.
- Perfil Discord salvo em `discord_users` (ID Discord como chave única).
- Reconhecimento do proprietário por `OWNER_DISCORD_ID`; sem esse valor, todos são clientes.
- Pool MongoDB registrado com `attachDatabasePool`.

**Escopo desta versão:** autenticação e conta. O painel de gerenciamento de scripts/licenças do projeto separado `license-studio` ainda não foi migrado para este repositório. Emissão e validação de licenças não estão disponíveis nesta aplicação.

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
```

O teste verifica acesso anônimo bloqueado, CSRF, destino Discord, escopo identify, state, callback inválido e rejeição de sessão adulterada. Ele não realiza uma autorização real na conta do Discord. O primeiro login completo precisa ser testado no navegador.

`npm run auth:check` testa a conexão MongoDB sem revelar a string de conexão.

## Arquivo de distribuição

O ZIP de entrega é um arquivo do código versionado, sem `.env.local`, `node_modules` ou saída de build. Na Vercel, importe diretamente o repositório; a plataforma instala e compila o código.

## Referências

- [NextAuth: Discord](https://next-auth.js.org/providers/discord)
- [NextAuth: variáveis de autenticação](https://next-auth.js.org/configuration/options)
- [Vercel: Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel: variáveis de ambiente](https://vercel.com/docs/environment-variables)
