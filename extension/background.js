// Assistant Navigation: AI agents act in your own Chrome, logged in as you, through a tunnel.
//
// No debugger: everything is done with plain extension APIs (tabs, scripting,
// captureVisibleTab), so Chrome shows no "is debugging this browser" bar and no tab has to
// stay open. The service worker holds a WebSocket to the tunnel server (tunnel/worker.js);
// a client that holds this browser's connection code sends { id, method, params } and gets
// { id, result } or { id, error }. The agents' tabs open in the window you are using, in one
// tab group, never in another window.

import { actOn, readPage, scrollPage } from './page.js'

const DEFAULT_SERVER = 'wss://navigation.myagents.click'
const TEXT_MAX = 30_000

let socket = null
let pingTimer = null
let retryMs = 1000

// --- Settings: this browser's id, the server, on or off, the tab group's name -------------

// The id is made once. On install, the popup, onInstalled and the worker's start all ask at the
// same moment: one shared promise, or each would make its own id and the socket would hang on a
// code the popup does not show.
let making = null
function ensureId() {
    making ??= chrome.storage.local.get('id').then(async ({ id }) => {
        if (/^[a-f0-9]{32}$/.test(id || '')) return id
        const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('')
        await chrome.storage.local.set({ id: fresh })
        return fresh
    }).finally(() => {
        making = null
    })
    return making
}

async function settings() {
    const id = await ensureId()
    const stored = await chrome.storage.local.get(['server', 'isOff', 'groupTitle'])
    return { id, server: stored.server || DEFAULT_SERVER, isOff: Boolean(stored.isOff), groupTitle: stored.groupTitle || 'Assistant' }
}

/** The connection code: whoever holds it can drive this browser. */
const codeOf = ({ server, id }) => `${server.replace(/\/+$/, '')}/tunnel/${id}/extension`

// --- The tunnel ---------------------------------------------------------------------------

const isOpen = () => socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING

async function connect() {
    const current = await settings()
    const url = `${current.server.replace(/\/+$/, '')}/tunnel/${current.id}/upstream`
    // A socket on another code (a new code, another server) gives way to the right one.
    if (isOpen() && socket.url !== url) disconnect()
    if (isOpen() || current.isOff) return showState()
    const ws = new WebSocket(url)
    socket = ws
    ws.onopen = () => {
        retryMs = 1000
        // A ping every 20 s keeps the service worker alive; the server answers it at the edge.
        clearInterval(pingTimer)
        pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"method":"ping"}'), 20_000)
        showState()
    }
    ws.onmessage = event => onTunnelMessage(ws, event.data)
    ws.onclose = () => {
        clearInterval(pingTimer)
        if (socket === ws) socket = null
        showState()
        settings().then(({ isOff }) => {
            if (!isOff) setTimeout(connect, retryMs)
            retryMs = Math.min(retryMs * 2, 60_000)
        })
    }
}

function disconnect() {
    const ws = socket
    socket = null
    clearInterval(pingTimer)
    ws?.close(1000, 'turned off')
    showState()
}

// The letter never leaves the icon; the badge says when it is off or not connected.
async function showState() {
    const { isOff } = await settings()
    const isConnected = socket?.readyState === WebSocket.OPEN
    await chrome.action.setBadgeBackgroundColor({ color: '#11181C' })
    await chrome.action.setBadgeText({ text: isOff ? 'OFF' : isConnected ? '' : '…' })
}

function onTunnelMessage(ws, raw) {
    let message
    try {
        message = JSON.parse(raw)
    } catch {
        return
    }
    const send = data => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(data))
    if (message.type === 'ws_open') return send({ type: 'ws_opened', connId: message.connId })
    if (message.type !== 'ws_frame') return
    let request
    try {
        request = JSON.parse(message.data)
    } catch {
        return
    }
    const reply = body => send({ type: 'ws_frame', connId: message.connId, data: JSON.stringify({ id: request.id, ...body }), binary: false })
    handle(request.method, request.params ?? {})
        .then(result => reply({ result }))
        .catch(error => reply({ error: error?.message || String(error) }))
}

// --- Tabs ---------------------------------------------------------------------------------

async function agentGroupIds() {
    const { groupTitle } = await settings()
    return new Set((await chrome.tabGroups.query({ title: groupTitle })).map(group => group.id))
}

const tabInfo = async (tab, groups) => ({ tabId: tab.id, title: tab.title, url: tab.url, active: tab.active, isAgentTab: (groups ?? (await agentGroupIds())).has(tab.groupId) })

function loaded(tabId, timeoutMs = 30_000) {
    return new Promise(resolve => {
        const done = () => {
            clearTimeout(timer)
            chrome.tabs.onUpdated.removeListener(listener)
            resolve()
        }
        const listener = (id, change) => id === tabId && change.status === 'complete' && done()
        const timer = setTimeout(done, timeoutMs)
        chrome.tabs.onUpdated.addListener(listener)
        chrome.tabs.get(tabId).then(tab => tab.status === 'complete' && done(), done)
    })
}

// The agents' tabs live in one group of the window, so you see which tabs are theirs.
async function intoAgentGroup(tabId) {
    const { groupTitle } = await settings()
    const tab = await chrome.tabs.get(tabId)
    const [group] = await chrome.tabGroups.query({ title: groupTitle, windowId: tab.windowId })
    if (group) await chrome.tabs.group({ groupId: group.id, tabIds: [tabId] })
    else await chrome.tabGroups.update(await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } }), { title: groupTitle, color: 'grey', collapsed: false })
}

async function inPage(tabId, func, args = [], frameId = 0) {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, func, args })
    if (injection?.result === undefined) throw new Error('the page did not answer (a Chrome or Web Store page, or still loading)')
    return injection.result
}

// A ref is "12" in the page or "3.7" in the frame whose id is 3.
const frameOf = ref => {
    const [frame, number] = String(ref).includes('.') ? String(ref).split('.') : ['0', String(ref)]
    return { frameId: Number(frame), ref: number }
}

// Every frame of the tab: the page's own elements keep plain numbers, a frame's carry its id.
async function readTab(tabId, maxChars) {
    const injections = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: readPage, args: [maxChars] })
    const main = injections.find(item => item.frameId === 0)?.result
    if (!main) throw new Error('the page did not answer (a Chrome or Web Store page, or still loading)')
    const frames = injections
        .filter(item => item.frameId !== 0 && item.result && (item.result.elements.length || item.result.text))
        .map(item => ({ frameId: item.frameId, url: item.result.url, text: item.result.text.slice(0, 4000), elements: item.result.elements.map(element => ({ ...element, ref: `${item.frameId}.${element.ref}` })) }))
    return frames.length ? { ...main, frames } : main
}

// --- What a client can ask (src/tools.js lists them for agents) ----------------------------

async function handle(method, params) {
    switch (method) {
        case 'ping':
            return { isOn: true, version: chrome.runtime.getManifest().version, canScript: Boolean(chrome.userScripts?.execute) }
        case 'tabs': {
            const groups = await agentGroupIds()
            return Promise.all((await chrome.tabs.query({})).map(tab => tabInfo(tab, groups)))
        }
        case 'open': {
            // In the window you are using, behind the tab you are on, inside the agents' group.
            const [window] = (await chrome.windows.getAll({ windowTypes: ['normal'] })).filter(item => item.focused)
            const tab = await chrome.tabs.create({ url: params.url, active: false, ...(window ? { windowId: window.id } : {}) })
            await intoAgentGroup(tab.id).catch(() => {})
            await loaded(tab.id)
            return tabInfo(await chrome.tabs.get(tab.id))
        }
        case 'navigate':
            await chrome.tabs.update(params.tabId, { url: params.url })
            await loaded(params.tabId)
            return tabInfo(await chrome.tabs.get(params.tabId))
        case 'back':
            await chrome.tabs.goBack(params.tabId)
            await loaded(params.tabId)
            return tabInfo(await chrome.tabs.get(params.tabId))
        case 'read':
            return readTab(params.tabId, Math.min(Number(params.maxChars) || TEXT_MAX, 100_000))
        case 'hover':
        case 'click':
        case 'type':
        case 'select': {
            const { frameId, ref } = frameOf(params.ref)
            const result = await inPage(params.tabId, actOn, [ref, method, params.value ?? params.text ?? '', Boolean(params.submit)], frameId)
            if (method === 'hover') return result
            // A click may start a navigation: the answer waits for the page to settle.
            await new Promise(resolve => setTimeout(resolve, 600))
            await loaded(params.tabId, 15_000)
            return result
        }
        case 'scroll':
            return inPage(params.tabId, scrollPage, [params.direction || 'down'])
        case 'screenshot': {
            // Chrome photographs only the tab on view: the tab is shown until the page paints
            // twice, photographed, and the tab you were on comes back.
            const tab = await chrome.tabs.get(params.tabId)
            const [previous] = await chrome.tabs.query({ active: true, windowId: tab.windowId })
            if (!tab.active) await chrome.tabs.update(params.tabId, { active: true })
            try {
                await inPage(params.tabId, () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))).catch(() => {})
                await new Promise(resolve => setTimeout(resolve, 150))
                const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 })
                return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] }
            } finally {
                if (previous && previous.id !== params.tabId) await chrome.tabs.update(previous.id, { active: true }).catch(() => {})
            }
        }
        case 'script': {
            // Arbitrary code goes through the user scripts API, which Chrome opens only when you
            // turn on "Allow user scripts" for this extension.
            if (!chrome.userScripts?.execute) throw new Error('turn on "Allow user scripts" in the Assistant Navigation extension details (chrome://extensions)')
            const [injection] = await chrome.userScripts.execute({ target: { tabId: params.tabId }, js: [{ code: String(params.code || '') }], world: 'MAIN', injectImmediately: true })
            if (injection?.error) throw new Error(injection.error)
            return { result: injection?.result ?? null }
        }
        case 'close':
            await chrome.tabs.remove(params.tabId)
            return { isClosed: true }
        default:
            throw new Error(`unknown request: ${method}`)
    }
}

// --- The popup asks for the state and changes the settings ---------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const run = async () => {
        if (message.action === 'set') {
            const changes = {}
            if (typeof message.isOff === 'boolean') changes.isOff = message.isOff
            if (typeof message.server === 'string') changes.server = message.server.trim() || DEFAULT_SERVER
            if (typeof message.groupTitle === 'string') changes.groupTitle = message.groupTitle.trim() || 'Assistant'
            if (message.isNewCode) await chrome.storage.local.remove('id')
            await chrome.storage.local.set(changes)
            // A new server or code takes a new connection.
            if ('server' in changes || message.isNewCode || changes.isOff) disconnect()
            if (!changes.isOff) await connect()
        }
        const current = await settings()
        return { code: codeOf(current), server: current.server, isOff: current.isOff, groupTitle: current.groupTitle, isConnected: socket?.readyState === WebSocket.OPEN, version: chrome.runtime.getManifest().version }
    }
    run().then(sendResponse)
    return true
})

chrome.runtime.onInstalled.addListener(details => {
    connect()
    if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?welcome=1') })
})
chrome.runtime.onStartup.addListener(connect)
chrome.alarms.create('assistant-navigation-keep-on', { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener(alarm => alarm.name === 'assistant-navigation-keep-on' && connect())
connect()
