# Assistant Navigation

**Deixe agentes de IA usarem o seu Chrome de verdade, já logado. Sem faixa de depuração e sem aba presa.**

Parte do [Assistant](https://myagents.click/?ref=oss-assistant-navigation), o assistente de IA de [Ciro Cesar Maciel](https://ciromaciel.click/?ref=oss-assistant-navigation) que trabalha nas suas ferramentas: é por ele que os agentes do Assistant usam o seu navegador. Também é gratuito e de código aberto, para qualquer agente: Claude Code, Cursor ou o seu próprio app.

<img src="docs/icon-512.png" alt="Assistant Navigation" width="96" />

O seu agente precisa de um painel, de uma caixa de entrada ou de uma conta que só abre logada como você. O Assistant Navigation dá a ele o seu próprio Chrome: ele lê páginas, clica, digita e tira fotos num grupo de abas só dele (chamado Assistant), na janela que você está usando. Funciona de qualquer lugar: do Claude Code no seu computador ou de um agente rodando na nuvem.

[English](README.md)

## Por que mais uma ferramenta de navegador

A maioria das ferramentas controla o Chrome pelo depurador (o Chrome DevTools Protocol). É poderoso, mas o Chrome mostra **"… começou a depurar este navegador"** no topo de toda janela enquanto está ligado, e muitas ferramentas exigem uma aba ou uma janela aberta, ou um código novo para colar a cada vez.

O Assistant Navigation usa só as APIs comuns de extensão (`tabs`, `scripting`, `captureVisibleTab`, `userScripts`), então:

- **nenhuma faixa**, nunca;
- **nenhuma aba presa**: o service worker da extensão segura a conexão e se religa sozinho com o Chrome;
- **um código de conexão**, criado uma vez: cole nos ajustes do seu agente e esqueça;
- **a sua janela, as suas abas**: as abas dos agentes abrem em segundo plano, num grupo só delas, nunca em outra janela.

## Instale a extensão

1. Baixe `assistant-navigation-extension.zip` do [último release](https://github.com/ciro-maciel/assistant-navigation/releases/latest) e descompacte numa pasta que vai ficar no computador.
2. Abra `chrome://extensions`, ligue o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha a pasta.
3. O Assistant Navigation abre a página dele com o seu **código de conexão**. Copie.
4. Opcional: nos **Detalhes** da extensão, ligue **Permitir scripts de usuário** para os agentes rodarem código nas páginas (`browser_script`).

A publicação na Chrome Web Store está a caminho.

## Conecte o seu agente

### Claude Code

```bash
claude mcp add assistant-navigation --scope user --env ASSISTANT_NAVIGATION_CODE="<seu código de conexão>" -- npx -y github:ciro-maciel/assistant-navigation
```

### Cursor, Claude Desktop e outros clientes MCP

```json
{
    "mcpServers": {
        "assistant-navigation": {
            "command": "npx",
            "args": ["-y", "github:ciro-maciel/assistant-navigation"],
            "env": { "ASSISTANT_NAVIGATION_CODE": "<seu código de conexão>" }
        }
    }
}
```

No lugar da variável de ambiente, você pode salvar `{ "code": "<seu código de conexão>" }` em `~/.config/assistant-navigation/config.json`. O servidor precisa do Node 22+ (ou do Bun) e não tem dependências.

### O seu próprio app

```js
import { call } from 'assistant-navigation/client'
import { functionTools, toolOf } from 'assistant-navigation/tools'

const tools = functionTools() // definições de ferramenta no formato da OpenAI, para o seu modelo
const result = await call(code, toolOf('browser_read').method, { tabId: 123 })
```

`npm install github:ciro-maciel/assistant-navigation`. Cada ferramenta tem um `risk`: `read` só olha ou se move, `act` muda alguma coisa; se o seu app pergunta a uma pessoa antes de agir, avalie as `act`.

## As ferramentas

| Ferramenta | O que faz | Risco |
| --- | --- | --- |
| `browser_tabs` | Lista as suas abas abertas | read |
| `browser_open` | Abre uma aba na sua janela, no grupo dos agentes, e espera carregar | act |
| `browser_navigate`, `browser_back` | Vai a um endereço, ou volta | act, read |
| `browser_read` | O texto da página e os elementos numerados, inclusive iframes e shadow DOM | read |
| `browser_click`, `browser_type`, `browser_select` | Age num elemento numerado | act |
| `browser_hover` | Passa o mouse sobre um elemento, inclusive menus de `:hover` em CSS | read |
| `browser_scroll` | Desce, sobe, topo, fim | read |
| `browser_screenshot` | Uma foto da aba; você volta para a aba em que estava | read |
| `browser_script` | Roda JavaScript na página e devolve o resultado | act |
| `browser_close` | Fecha uma aba | read |

## Como funciona

```
seu agente ──(MCP ou assistant-navigation/client)──▶ servidor do túnel ◀──(WebSocket, mantido pelo service worker)── Assistant Navigation no seu Chrome
             wss://…/tunnel/<id>/extension                    wss://…/tunnel/<id>/upstream
```

A extensão cria uma vez um id aleatório de 128 bits e mantém um WebSocket aberto com o servidor do túnel. O seu código de conexão é o endereço desse id no servidor; cada pedido do seu agente passa pelo túnel até a extensão, que responde com as APIs de extensão. O servidor público, `wss://navigation.myagents.click`, é gratuito; ele repassa mensagens e não guarda nada.

### Rode o seu próprio servidor do túnel

É um Cloudflare Worker com um Durable Object, no plano gratuito:

```bash
git clone https://github.com/ciro-maciel/assistant-navigation && cd assistant-navigation
bunx wrangler deploy --config tunnel/wrangler.toml
```

Depois, na janela da extensão, abra **Avançado** e troque o servidor para `wss://<endereço do seu worker>`. O código de conexão muda junto.

## Segurança

O código de conexão é uma chave do seu navegador, logado como você: quem tem o código lê e age nas suas abas. Guarde como uma senha. Se vazar, abra a janela da extensão e clique em **Gerar um código novo**: o antigo para de funcionar na hora. **Desligar**, na janela, ou o selo `OFF` no ícone, corta todos os agentes.

Os agentes são instruídos a nunca digitar senhas nem números de cartão, mas isso é uma instrução, não uma parede: dê o código só a agentes e apps em que você confia. Veja o [SECURITY.md](SECURITY.md) para relatar uma vulnerabilidade.

## Limites

- O Chrome só fotografa a aba visível: uma foto mostra a aba do agente por um instante.
- Cliques e digitação são eventos simulados; algumas páginas muito protegidas os ignoram.
- Sem console nem inspeção de rede: isso exige o depurador, que é justamente o que o Assistant Navigation evita.

## Assistant

O Assistant Navigation é a parte de navegador do [Assistant](https://myagents.click/?ref=oss-assistant-navigation): agentes que trabalham nas suas ferramentas, com conexões, arquivos e aprovações num lugar só. No Assistant, cole o código de conexão uma vez em Configurações › Meu Chrome e todos os agentes da sua conta passam a usar o seu navegador.

## Mais de Ciro Cesar Maciel

Apps de Mac e ferramentas gratuitos e de código aberto em [ciromaciel.click](https://ciromaciel.click/?ref=oss-assistant-navigation).

## Licença

MIT. O servidor do túnel foi portado do [Playwriter](https://github.com/remorses/playwriter) (MIT); veja o [NOTICE](NOTICE).
