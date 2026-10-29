# Contributing

Thanks for helping. Assistant Navigation is small on purpose: an extension, a tunnel server, a tool list and an MCP server, with no build step and no dependencies.

## Run it from a clone

1. Load `extension/` unpacked in `chrome://extensions` (Developer mode on). After a change, click the reload button on its card.
2. Point the MCP server at your browser: `ASSISTANT_NAVIGATION_CODE="<code from the popup>" node mcp/server.js`, or register it in your client with `node /path/to/assistant-navigation/mcp/server.js`.
3. To work on the tunnel: `bunx wrangler dev --config tunnel/wrangler.toml`, and set the server in the popup's Advanced section to `ws://localhost:8787`.

## What a change should keep

- **No debugger.** Nothing that needs `chrome.debugger`: that is the banner Assistant Navigation exists to avoid.
- **No dependencies** in `src/` and `mcp/`; they run on plain Node 22+, Bun, Workers and browsers.
- **Every person-facing text in English and Brazilian Portuguese** (`extension/_locales/`).
- **A new tool** goes in `src/tools.js` (name, method, risk, description, parameters) and in `handle()` in `extension/background.js`, and in both READMEs.

## Pull requests

One topic per pull request, with what it changes and how you checked it in a real Chrome. Commit messages: `type(scope): imperative sentence`, for example `fix(extension): read labels of image-only links`.
