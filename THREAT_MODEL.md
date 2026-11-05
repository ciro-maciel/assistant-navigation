# Threat model

What Assistant Navigation defends, what it does not, and why. Each line points at the code that makes it true. The idea of publishing this comes from [Coral](https://github.com/noelschwarz/coral).

## What it protects

Your Chrome, logged in as you: every account open in it. Whoever can send requests through the tunnel can read your tabs and act in them as you.

## The pieces

- **The extension** (`extension/`): holds one WebSocket to the tunnel server and answers requests with plain extension APIs (`tabs`, `tabGroups`, `scripting`, `userScripts`, `captureVisibleTab`). It asks for access to every site (`<all_urls>`), because an agent may need any of them.
- **The tunnel server** (`tunnel/worker.js`): one Cloudflare Durable Object per browser. It relays messages between the extension (`/tunnel/<id>/upstream`) and clients (`/tunnel/<id>/extension`).
- **The client** (`src/client.js`, `mcp/server.js`): your agent's side.

## Defended

| Threat | How |
| --- | --- |
| Someone guesses your connection code | The id is 128 random bits from `crypto.getRandomValues` (`extension/background.js`). It is not derived from anything about you. |
| A leaked code keeps working | **Make a new code** in the popup replaces the id; the old address stops reaching your browser at once. |
| You want every agent out now | **Turn off** in the popup closes the connection and keeps it closed (badge `OFF`) until you turn it on. |
| Someone with the code pretends to be your browser | Since 1.2.0 the extension also holds a key of its own, never shown, and sends it when it connects. The first keyed connection of an id stores the key's SHA-256; from then on the tunnel refuses any other key, or none (`tunnel/worker.js`, tested end to end by `scripts/tunnel-key-test.mjs`). |
| The tunnel keeps your pages | The worker logs nothing and stores only that hash: messages stay in memory only while it relays them (`tunnel/worker.js`). |
| A banner-free tool hides a debugger | It never attaches Chrome's debugger: there is no `debugger` permission in `extension/manifest.json`. |

## Not defended

Read these before you give the code to anything.

| Threat | Why not | What you can do |
| --- | --- | --- |
| **Whoever holds the code is you, in your browser.** | The code is the only credential. There is no second factor, no per-site permission and no approval step. | Treat it like a password; make a new one if it may have leaked. |
| **An extension older than 1.2.0 has no key.** | Until a 1.2.0 extension connects once and claims its id, the tunnel still takes a keyless browser on that id, so older versions keep working. | Update the extension: its first connection closes that door. |
| **The agent can read every tab, not only its own group.** | `browser_tabs` lists all tabs and `browser_read`, `browser_screenshot` and `browser_script` take any tab id. The group only decides where new tabs open. | Close tabs you don't want an agent to see, or turn the extension off while you don't need it. |
| **`browser_script` runs any JavaScript in the page.** | It is what lets agents handle pages the other tools can't. | Use agents you trust. |
| **A page can talk to your agent.** | Text on a page reaches the model that reads it (prompt injection). A page can ask the agent to visit, click or send something. | Prefer agents that ask before acting; don't leave an agent alone on untrusted sites. |
| **Passwords and card numbers.** | Agents are told never to type them (`src/tools.js`), but that is an instruction to a model, not a wall. | Don't hand those tasks to an agent. |
| **The tunnel operator can read what passes.** | Traffic is encrypted to the server (TLS), then relayed in the clear inside it. The public server (`wss://navigation.myagents.click`) is run by Ciro Cesar Maciel on Cloudflare, and requests pass through Cloudflare like any web request. | [Run your own tunnel](README.md#run-your-own-tunnel-server): one Worker on the free plan. |

## Reporting

Found a way around a line in **Defended**, or something missing from **Not defended**? See [SECURITY.md](SECURITY.md): report it privately.
