# Notes for coding agents

Assistant Navigation lets AI agents act in a person's own Chrome without the debugger. Four parts, no build step, no dependencies.

## Layout

| Path | What it is |
| --- | --- |
| `extension/background.js` | The service worker: holds the WebSocket to the tunnel (`/tunnel/<id>/upstream`), answers `{ id, method, params }` with extension APIs, keeps itself on with an alarm |
| `extension/page.js` | What runs inside pages (`chrome.scripting`): reads text and numbers the actionable elements (shadow DOM included), acts on them, emulates CSS `:hover` |
| `extension/popup.*` | The popup and the install page: state, on/off, connection code, server and tab group name |
| `extension/_locales/` | Every person-facing text, in `en` and `pt_BR` |
| `tunnel/worker.js` | The tunnel server: a Cloudflare Worker, one Durable Object per browser id, relaying virtual connections (`ws_open`, `ws_frame`, `ws_close`) |
| `src/tools.js` | The tool catalog (name, method, risk, description, JSON Schema) for MCP and for apps |
| `src/client.js` | One request through a connection code |
| `mcp/server.js` | The MCP server over stdio, speaking the protocol directly |

## Rules

- Never use `chrome.debugger` or anything that shows Chrome's debugging banner.
- The agents' tabs open in the window the person is using, in one tab group; never in another window.
- Keep `src/` and `mcp/` free of dependencies and of Node-only APIs outside `mcp/`.
- A connection code is a secret: never log it, never put one in examples (use `<your connection code>`).
