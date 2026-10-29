# Assistant Navigation

**Let AI agents use your real, logged-in Chrome. No debugger banner, no tab to keep open.**

Part of [Assistant](https://myagents.click/?ref=oss-assistant-navigation), the AI assistant by [Ciro Cesar Maciel](https://ciromaciel.click/?ref=oss-assistant-navigation) that works in your tools: it is how Assistant's agents use your browser. It is also free and open source, for any agent: Claude Code, Cursor or your own app.

<img src="docs/icon-512.png" alt="Assistant Navigation" width="96" />

Your agent needs a dashboard, an inbox or an account that only opens logged in as you. Assistant Navigation gives it your own Chrome: it reads pages, clicks, types and takes pictures in a tab group of its own (named Assistant), in the window you are using. It works from anywhere: Claude Code on your laptop, or an agent running in the cloud.

[Português](README.pt-BR.md)

## Why another browser tool

Most tools drive Chrome through its debugger (the Chrome DevTools Protocol). That is powerful, but Chrome shows **"… started debugging this browser"** on top of every window while it is on, and many tools need a tab or a window held open, or a new id to paste every time.

Assistant Navigation uses only plain extension APIs (`tabs`, `scripting`, `captureVisibleTab`, `userScripts`), so:

- **no banner**, ever;
- **no tab to keep open**: the extension's service worker holds the connection, and turns itself back on with Chrome;
- **one connection code**, made once: paste it into your agent's settings and forget it;
- **your window, your tabs**: the agents' tabs open in the background, in their own tab group, never in another window.

## Install the extension

1. Download `assistant-navigation-extension.zip` from the [latest release](https://github.com/ciro-maciel/assistant-navigation/releases/latest) and unzip it into a folder you will keep.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick that folder.
3. Assistant Navigation opens its page with your **connection code**. Copy it.
4. Optional: in the extension's **Details**, turn on **Allow user scripts** so agents can run code in pages (`browser_script`).

The Chrome Web Store listing is on the way.

## Connect your agent

### Claude Code

```bash
claude mcp add assistant-navigation --scope user --env ASSISTANT_NAVIGATION_CODE="<your connection code>" -- npx -y github:ciro-maciel/assistant-navigation
```

### Cursor, Claude Desktop and other MCP clients

```json
{
    "mcpServers": {
        "assistant-navigation": {
            "command": "npx",
            "args": ["-y", "github:ciro-maciel/assistant-navigation"],
            "env": { "ASSISTANT_NAVIGATION_CODE": "<your connection code>" }
        }
    }
}
```

Instead of the environment variable, you can save `{ "code": "<your connection code>" }` in `~/.config/assistant-navigation/config.json`. The server needs Node 22+ (or Bun) and has no dependencies.

### Your own app

```js
import { call } from 'assistant-navigation/client'
import { functionTools, toolOf } from 'assistant-navigation/tools'

const tools = functionTools() // OpenAI-style tool definitions for your model
const result = await call(code, toolOf('browser_read').method, { tabId: 123 })
```

`npm install github:ciro-maciel/assistant-navigation`. Each tool has a `risk`: `read` only looks or moves around, `act` changes something; if your app asks a person before acting, weigh the `act` ones.

## The tools

| Tool | What it does | Risk |
| --- | --- | --- |
| `browser_tabs` | Lists your open tabs | read |
| `browser_open` | Opens a tab in your window, in the agents' group, and waits for it | act |
| `browser_navigate`, `browser_back` | Goes to an address, or back | act, read |
| `browser_read` | The page's text and its elements, numbered, including iframes and shadow DOM | read |
| `browser_click`, `browser_type`, `browser_select` | Acts on a numbered element | act |
| `browser_hover` | Hovers an element, CSS `:hover` menus included | read |
| `browser_scroll` | Down, up, top, bottom | read |
| `browser_screenshot` | A picture of a tab; you are taken back to the tab you were on | read |
| `browser_script` | Runs JavaScript in the page and returns the result | act |
| `browser_close` | Closes a tab | read |

## How it works

```
your agent ──(MCP or assistant-navigation/client)──▶ tunnel server ◀──(WebSocket, held by the service worker)── Assistant Navigation in your Chrome
            wss://…/tunnel/<id>/extension                 wss://…/tunnel/<id>/upstream
```

The extension makes a random 128-bit id once and keeps one WebSocket open to the tunnel server. Your connection code is that id's address on the server; each request your agent sends travels through the tunnel to the extension, which answers it with extension APIs. The public server, `wss://navigation.myagents.click`, is free; it relays messages and stores nothing.

### Run your own tunnel server

It is one Cloudflare Worker with a Durable Object, on the free plan:

```bash
git clone https://github.com/ciro-maciel/assistant-navigation && cd assistant-navigation
bunx wrangler deploy --config tunnel/wrangler.toml
```

Then, in the extension's popup, open **Advanced** and set the server to `wss://<your worker's host>`. Your connection code changes with it.

## Security

The connection code is a key to your browser, logged in as you: whoever holds it can read and act in your tabs. Keep it like a password. If it leaks, open the popup and click **Make a new code**: the old one stops working at once. **Turn off** in the popup, or the icon's badge `OFF`, cuts every agent off.

Agents are told never to type passwords or card numbers, but that is an instruction, not a wall: give the code only to agents and apps you trust. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Limits

- Chrome only photographs the tab on view: a screenshot shows the agent's tab for an instant.
- Clicks and typing are synthetic events; a few heavily protected pages ignore them.
- No console or network inspection: that needs the debugger, which is what Assistant Navigation avoids.

## Assistant

Assistant Navigation is the browser part of [Assistant](https://myagents.click/?ref=oss-assistant-navigation): agents that work in your tools, with your connections, files and approvals in one place. In Assistant, paste your connection code once in Settings › My Chrome and every agent of your account can use your browser.

## More from Ciro Cesar Maciel

Free, open-source Mac apps and tools at [ciromaciel.click](https://ciromaciel.click/?ref=oss-assistant-navigation).

## License

MIT. The tunnel server is ported from [Playwriter](https://github.com/remorses/playwriter) (MIT); see [NOTICE](NOTICE).
