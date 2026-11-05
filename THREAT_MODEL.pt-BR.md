# Modelo de ameaças

O que o Assistant Navigation defende, o que não defende e por quê. Cada linha aponta o código que a torna verdadeira. A ideia de publicar isto veio do [Coral](https://github.com/noelschwarz/coral).

## O que ele protege

O seu Chrome, logado como você: cada conta aberta nele. Quem consegue mandar pedidos pelo túnel consegue ler as suas abas e agir nelas como você.

## As peças

- **A extensão** (`extension/`): mantém um WebSocket com o servidor de túnel e responde aos pedidos com APIs comuns de extensão (`tabs`, `tabGroups`, `scripting`, `userScripts`, `captureVisibleTab`). Ela pede acesso a todos os sites (`<all_urls>`), porque um agente pode precisar de qualquer um.
- **O servidor de túnel** (`tunnel/worker.js`): um Durable Object da Cloudflare por navegador. Ele retransmite mensagens entre a extensão (`/tunnel/<id>/upstream`) e os clientes (`/tunnel/<id>/extension`).
- **O cliente** (`src/client.js`, `mcp/server.js`): o lado do seu agente.

## Defendido

| Ameaça | Como |
| --- | --- |
| Alguém adivinha o seu código de conexão | O id tem 128 bits aleatórios de `crypto.getRandomValues` (`extension/background.js`). Não sai de nada sobre você. |
| Um código vazado continua valendo | **Gerar um código novo** no popup troca o id; o endereço antigo deixa de chegar ao seu navegador na hora. |
| Você quer todos os agentes fora agora | **Desligar** no popup fecha a conexão e a mantém fechada (selo `OFF`) até você ligar de novo. |
| O túnel guarda as suas páginas | O worker não tem armazenamento nem registro: só segura as mensagens na memória enquanto as retransmite (`tunnel/worker.js`). |
| Uma ferramenta sem aviso esconde um depurador | Ele nunca usa o depurador do Chrome: não há a permissão `debugger` no `extension/manifest.json`. |

## Não defendido

Leia antes de dar o código a qualquer coisa.

| Ameaça | Por que não | O que você pode fazer |
| --- | --- | --- |
| **Quem tem o código é você, no seu navegador.** | O código é a única credencial. Não há segundo fator, permissão por site nem etapa de aprovação. | Guarde como uma senha; gere outro se ele pode ter vazado. |
| **Quem tem o código também pode se passar pelo seu navegador.** | O túnel aceita qualquer conexão em `/upstream` para aquele id, e a mais nova vence. Quem tiver o código pode receber os pedidos do seu agente e responder com páginas inventadas. | O mesmo: o código é tudo. |
| **O agente lê todas as abas, não só as do grupo dele.** | `browser_tabs` lista todas as abas, e `browser_read`, `browser_screenshot` e `browser_script` aceitam qualquer aba. O grupo só decide onde as abas novas abrem. | Feche as abas que um agente não deve ver, ou desligue a extensão quando não precisar. |
| **`browser_script` roda qualquer JavaScript na página.** | É o que deixa os agentes lidarem com páginas que as outras ferramentas não alcançam. | Use agentes em que você confia. |
| **Uma página pode falar com o seu agente.** | O texto da página chega ao modelo que a lê (injeção de prompt). Uma página pode pedir ao agente para visitar, clicar ou enviar algo. | Prefira agentes que perguntam antes de agir; não deixe um agente sozinho em sites em que você não confia. |
| **Senhas e números de cartão.** | Os agentes são instruídos a nunca digitá-los (`src/tools.js`), mas isso é uma instrução a um modelo, não uma parede. | Não entregue essas tarefas a um agente. |
| **Quem opera o túnel pode ler o que passa.** | O tráfego vai criptografado até o servidor (TLS) e é retransmitido em texto dentro dele. O servidor público (`wss://navigation.myagents.click`) é operado por Ciro Cesar Maciel na Cloudflare, e os pedidos passam pela Cloudflare como qualquer pedido da web. | [Rode o seu próprio túnel](README.pt-BR.md): um Worker no plano grátis. |

## Para relatar

Achou um jeito de contornar uma linha do **Defendido**, ou algo que falta no **Não defendido**? Veja o [SECURITY.md](SECURITY.md) e relate em particular.
