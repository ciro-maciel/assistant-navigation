# O que funciona e o que não funciona

O que o Assistant Navigation consegue fazer num Chrome real, com a sua sessão, e o que não consegue, escrito a partir das tarefas que ele já fez e do que o Chrome permite a uma extensão. Quando algo aqui muda, esta página muda junto.

[English](WHAT-WORKS.md)

## Funciona

| Tarefa | Como | Visto em |
| --- | --- | --- |
| Ler um painel que só abre com o seu login | `browser_read` devolve o texto e os elementos numerados, com iframes e shadow DOM aberto | painéis de métricas, de busca e de cobrança |
| Preencher e enviar formulários | `browser_type`, `browser_select`, `browser_click` nos elementos numerados | páginas de configuração, cadastros |
| Enviar um arquivo para uma página | `browser_script` baixa o arquivo e o coloca no `input[type=file]` da página com um `DataTransfer` | envio de vídeo no YouTube Studio |
| Rodar uma sequência longa dentro de uma página | `browser_script` começa o laço na página, guarda o resultado em `window`, e chamadas seguintes o leem | pedido de indexação de uma lista de URLs no Google Search Console |
| Trabalhar enquanto você usa a mesma janela | as abas dos agentes abrem em segundo plano, num grupo de abas só delas | todas as tarefas acima |
| Olhar uma página | `browser_screenshot` fotografa a aba e devolve você para a aba em que estava | conferir um layout depois de publicar |

## Precisa de você

| Momento | Por quê | O que o agente deve fazer |
| --- | --- | --- |
| Um CAPTCHA | Ele existe para separar uma pessoa de um programa; resolver por você é exatamente o que ele proíbe | Parar e pedir que você resolva na aba |
| Um código de 2FA, uma senha, um número de cartão | O agente é instruído a nunca digitar; é uma instrução, não uma parede (veja o [THREAT_MODEL.pt-BR.md](THREAT_MODEL.pt-BR.md)) | Parar e pedir que você digite |
| Ligar **Permitir scripts do usuário** | Só você pode, em `chrome://extensions`; sem isso o `browser_script` fica desligado | Pedir uma vez e, enquanto isso, usar as outras ferramentas |
| Um arquivo que a página busca no seu próprio computador | O Chrome pergunta a você antes de um site alcançar o `localhost` (Local Network Access) | Servir o arquivo num endereço público, ou pedir que você permita |

## Não funciona

| O quê | Por quê |
| --- | --- |
| Páginas `chrome://`, a Chrome Web Store, o leitor de PDF do Chrome | O Chrome as fecha para toda extensão |
| Diálogos nativos: seletor de arquivo, impressão, `alert`/`confirm` | Quem desenha é o navegador ou o sistema, não a página; um `alert` aberto também para os scripts da página até alguém responder |
| Texto desenhado num canvas (alguns editores de documento e de design) | Não há texto na página para ler; a captura de tela ainda mostra |
| Shadow DOM fechado | A página o esconde de todo script, inclusive o nosso |
| Componentes que só desenham na aba em primeiro plano | Alguns seletores de data e menus não desenham nada numa aba em segundo plano; valores postos por script ali já falharam em silêncio. Faça esse passo com a aba à frente, ou pela API do site |
| Páginas que conferem `isTrusted` | Cliques e teclas vêm de scripts, e algumas páginas muito protegidas os ignoram |
| Console e inspeção de rede | Isso exige o depurador, que o Assistant Navigation evita de propósito |
| Uma chamada com mais de 45 segundos | O cliente para de esperar ali (`timeoutMs` em `assistant-navigation/client`), e nada passa de uma chamada para outra além do que a página guarda; divida o trabalho, ou comece na página com `browser_script` e leia o resultado depois |

## Aprendido com

A ideia de publicar esta lista veio do [browser-mcp](https://github.com/Agent360dk/browser-mcp), que publica o que consegue e o que não consegue fazer.
