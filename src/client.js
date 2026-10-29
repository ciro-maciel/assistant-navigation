// One request to a Assistant Navigation browser: dial its connection code (the tunnel's /extension door),
// send { id, method, params }, wait for { id, result } or { id, error }, close. Works in Node 22+,
// Bun, Deno, Workers and browsers (anything with a global WebSocket).

const CODE = /^wss?:\/\/[^/\s]+\/tunnel\/[a-f0-9]{32}\/extension$/

/** The connection code, cleaned, or null when it is not one. */
export function codeOf(text) {
    const value = String(text || '').trim()
    return CODE.test(value) ? value : null
}

// The tunnel's close codes (tunnel/worker.js) that mean the browser is not there.
const OFFLINE = new Set([4008, 4009, 4010, 1012])
export const OFFLINE_TEXT = 'the browser is closed or Assistant Navigation is turned off'

export function call(code, method, params = {}, timeoutMs = 45_000) {
    const request = { id: crypto.randomUUID(), method, params }
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(code)
        let isDone = false
        const timer = setTimeout(() => {
            isDone = true
            ws.close()
            reject(new Error(`the browser did not answer in ${Math.round(timeoutMs / 1000)} s`))
        }, timeoutMs)
        ws.onopen = () => ws.send(JSON.stringify(request))
        ws.onmessage = event => {
            let reply
            try {
                reply = JSON.parse(event.data)
            } catch {
                return
            }
            if (reply.id !== request.id) return
            isDone = true
            clearTimeout(timer)
            ws.close()
            if (reply.error) reject(new Error(reply.error))
            else resolve(reply.result)
        }
        ws.onclose = event => {
            if (isDone) return
            clearTimeout(timer)
            reject(new Error(OFFLINE.has(event.code) ? OFFLINE_TEXT : `the tunnel closed (${event.code} ${event.reason || ''})`.trim()))
        }
        ws.onerror = () => {}
    })
}
