# Integrar a validação nos scripts

Endpoint: `POST https://hub-smoky-xi.vercel.app/api/licenses/validate`.

Envie a chave pelo header `Authorization: Bearer SUA_CHAVE`, nunca pela URL. Corpo JSON:

```json
{
  "scriptId": "ID do script exibido nos detalhes da licença",
  "binding": "identificação exata informada ao liberar a licença"
}
```

Uma licença válida retorna HTTP 200:

```json
{
  "valid": true,
  "scriptId": "ID_DO_SCRIPT",
  "expiresAt": "2030-01-01T00:00:00.000Z",
  "checkedAt": "2026-09-27T12:00:00.000Z"
}
```

`expiresAt: null` significa vitalícia. Licenças pendentes, expiradas, revogadas, de script excluído ou com chave/script/servidor incorretos retornam HTTP 200 com `valid: false` e `reason: invalid_license`. Não execute o script quando a resposta não for `valid: true`.

- HTTP 400: requisição malformada.
- HTTP 429: mais de 120 tentativas por minuto por IP; respeite `Retry-After`.
- HTTP 503: serviço indisponível; não autorize execução. Tente novamente com intervalo.

O vínculo usa um identificador informado pelo script; não é atestado de hardware nem verificação automática de IP. Quem conhece a chave e o identificador pode apresentá-los à API. Mantenha a chave no ambiente do servidor e não a exponha em código de navegador/NUI.

## Exemplo para um script Node.js

```js
async function validateLicense() {
  try {
    const response = await fetch(
      'https://hub-smoky-xi.vercel.app/api/licenses/validate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PROTOCOLO_LICENSE_KEY}`,
        },
        body: JSON.stringify({
          scriptId: process.env.PROTOCOLO_SCRIPT_ID,
          binding: process.env.PROTOCOLO_SERVER_ID,
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return false;
    return (await response.json()).valid === true;
  } catch {
    return false;
  }
}

// Ligue esta condição ao ponto real de inicialização do seu script.
if (!(await validateLicense())) {
  throw new Error('Licença indisponível. Inicialização bloqueada.');
}
```

Revalide durante a execução (por exemplo, a cada 60 segundos) e suspenda as operações do seu script quando a validação falhar. A revogação passa a ser percebida na próxima consulta. Um arquivo já baixado não pode ser recuperado remotamente; bloquear sua execução exige essa integração. Nenhum segredo MongoDB ou Discord é necessário no script cliente.
