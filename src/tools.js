// The tools an AI agent gets for a Tabhand browser: one request each to the extension through
// the tunnel (client.js). The MCP server (mcp/server.js) serves this list as is; an app that
// runs its own agents can import it too.
//
// `risk` says what a tool does to the person's browser: 'read' only looks or moves around,
// 'act' changes something (opens, clicks, types, runs code). An app with an approval step
// should weigh the 'act' ones.

const TAB = { tabId: { type: 'number', description: 'The tab, as returned by browser_tabs or browser_open.' } }
const REF = { ref: { type: 'string', description: 'The element number from browser_read (e.g. "12", or "3.7" inside an iframe).' } }

export const TOOLS = [
    { name: 'browser_tabs', method: 'tabs', risk: 'read', description: "The tabs open in the person's own Chrome, logged in as them: id, title, address, and whether it is one of the agents' tabs. Use it to find a tab they already have open (a dashboard, an inbox)." },
    { name: 'browser_open', method: 'open', risk: 'act', description: "Opens a tab in the window the person is using, in the background, inside the agents' tab group, and waits for it to load. Use it for what only opens logged in as them.", properties: { url: { type: 'string' } }, required: ['url'] },
    { name: 'browser_navigate', method: 'navigate', risk: 'act', description: 'Takes a tab to another address and waits for it to load.', properties: { ...TAB, url: { type: 'string' } }, required: ['tabId', 'url'] },
    { name: 'browser_back', method: 'back', risk: 'read', description: 'Goes back one page in a tab.', properties: TAB, required: ['tabId'] },
    {
        name: 'browser_read',
        method: 'read',
        risk: 'read',
        description: 'Reads a tab: its text and the elements you can act on (links, buttons, fields, lists), numbered, including inside iframes and shadow DOM. Read before acting, and again after the page changes.',
        properties: { ...TAB, maxChars: { type: 'number', description: 'How many characters of text at most (default 30,000).' } },
        required: ['tabId'],
    },
    { name: 'browser_click', method: 'click', risk: 'act', description: 'Clicks an element, by the number browser_read gave.', properties: { ...TAB, ...REF }, required: ['tabId', 'ref'] },
    { name: 'browser_hover', method: 'hover', risk: 'read', description: 'Hovers an element, to open a menu or tooltip that only shows on hover (CSS :hover included); read again afterwards.', properties: { ...TAB, ...REF }, required: ['tabId', 'ref'] },
    { name: 'browser_type', method: 'type', risk: 'act', description: 'Types into a field, by the number browser_read gave; with submit, presses Enter. Never type passwords or card numbers.', properties: { ...TAB, ...REF, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['tabId', 'ref', 'text'] },
    { name: 'browser_select', method: 'select', risk: 'act', description: 'Picks an option in a list, by the number browser_read gave.', properties: { ...TAB, ...REF, value: { type: 'string', description: "The option's text or value." } }, required: ['tabId', 'ref', 'value'] },
    { name: 'browser_scroll', method: 'scroll', risk: 'read', description: 'Scrolls a tab: down, up, top or bottom.', properties: { ...TAB, direction: { type: 'string', enum: ['down', 'up', 'top', 'bottom'] } }, required: ['tabId'] },
    { name: 'browser_screenshot', method: 'screenshot', risk: 'read', description: 'Takes a picture of a tab. The tab shows for an instant and the person is taken back to the tab they were on. Use it when the text is not enough (a chart, a layout).', properties: TAB, required: ['tabId'] },
    {
        name: 'browser_script',
        method: 'script',
        risk: 'act',
        description: 'Runs a piece of JavaScript in the page and returns the result (the last expression). For what the other tools do not reach: a page state, a value in an attribute. Needs "Allow user scripts" turned on for the extension.',
        properties: { ...TAB, code: { type: 'string', description: 'The code, e.g. document.querySelectorAll("tr").length' } },
        required: ['tabId', 'code'],
    },
    { name: 'browser_close', method: 'close', risk: 'read', description: "Closes a tab you opened. Close yours when done; never the person's.", properties: TAB, required: ['tabId'] },
]

export const toolOf = name => TOOLS.find(tool => tool.name === name) ?? null

/** The list as OpenAI-style function tools. */
export const functionTools = () => TOOLS.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: { type: 'object', properties: tool.properties ?? {}, required: tool.required ?? [] } } }))

/** The list as MCP tools. */
export const mcpTools = () =>
    TOOLS.map(tool => ({ name: tool.name, description: tool.description, inputSchema: { type: 'object', properties: tool.properties ?? {}, required: tool.required ?? [] }, annotations: { readOnlyHint: tool.risk === 'read' && tool.name !== 'browser_close' } }))
