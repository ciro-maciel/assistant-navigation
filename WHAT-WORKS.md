# What works and what does not

What Assistant Navigation can do in a real, logged-in Chrome, and what it cannot, written from the tasks it has run and from what Chrome allows an extension to do. When something here changes, this page changes with it.

[Português](WHAT-WORKS.pt-BR.md)

## Works

| Task | How | Seen on |
| --- | --- | --- |
| Read a dashboard that only opens logged in as you | `browser_read` returns the text and numbered elements, iframes and open shadow roots included | analytics, search and billing dashboards |
| Fill and submit forms | `browser_type`, `browser_select`, `browser_click` on the numbered elements | settings pages, sign-up forms |
| Upload a file into a page | `browser_script` fetches the file and puts it into the page's `input[type=file]` with a `DataTransfer` | uploading a video in YouTube Studio |
| Run a long sequence inside one page | `browser_script` starts the loop in the page, keeps its results on `window`, and later calls read them back | requesting indexing for a list of URLs in Google Search Console |
| Work while you use the same window | the agents' tabs open in the background, in their own tab group | every task above |
| Look at a page | `browser_screenshot` photographs the tab and takes you back to the one you were on | checking a layout after a deploy |

## Needs you

| Moment | Why | What the agent should do |
| --- | --- | --- |
| A CAPTCHA | It exists to tell a person from a program; solving it for you is exactly what it forbids | Stop and ask you to solve it in the tab |
| A 2FA code, a password, a card number | The agent is told never to type them; it is an instruction, not a wall (see [THREAT_MODEL.md](THREAT_MODEL.md)) | Stop and ask you to type it yourself |
| Turning on **Allow user scripts** | Only you can, in `chrome://extensions`; without it `browser_script` is off | Ask once, then use the other tools meanwhile |
| A file the page fetches from your own computer | Chrome asks you before a site reaches `localhost` (Local Network Access) | Serve the file from a public address, or ask you to allow it |

## Does not work

| What | Why |
| --- | --- |
| `chrome://` pages, the Chrome Web Store, the built-in PDF viewer | Chrome closes them to every extension |
| Native dialogs: file picker, print, `alert`/`confirm` | They are drawn by the browser or the system, not by the page; a pending `alert` also stops the page's scripts until someone answers it |
| Text drawn on a canvas (some document and design editors) | There is no text in the page to read; a screenshot still shows it |
| Closed shadow roots | The page hides them from every script, ours included |
| Widgets that only render in the tab on view | Some date pickers and menus draw nothing in a background tab; values set by script there have failed silently. Do that step in the tab on view, or through the site's API |
| Pages that check `isTrusted` | Clicks and keys come from scripts, so a few heavily protected pages ignore them |
| Console and network inspection | That needs the debugger, which Assistant Navigation avoids on purpose |
| One call longer than 45 seconds | The client stops waiting there (`timeoutMs` in `assistant-navigation/client`), and nothing is kept between calls except what the page keeps; split the work, or start it in the page with `browser_script` and read the result later |

## Learned from

The idea of publishing this list came from [browser-mcp](https://github.com/Agent360dk/browser-mcp), which publishes what it can and cannot do.
