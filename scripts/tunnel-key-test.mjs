// The browser key (THREAT_MODEL.md), end to end against a running tunnel:
//   bunx wrangler dev --config tunnel/wrangler.toml --port 8799 --local   (then, in another terminal)
//   node scripts/tunnel-key-test.mjs
const BASE = process.env.TUNNEL ?? 'ws://localhost:8799/tunnel'
const id = crypto.randomUUID().replaceAll('-', '')
const legacyId = crypto.randomUUID().replaceAll('-', '')
const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')
const keyA = hex(), keyB = hex()

/** Opens a socket; resolves with the first message, or with the close code. */
function attempt(url, ms = 3000) {
  return new Promise(resolve => {
    const ws = new WebSocket(url)
    const t = setTimeout(() => resolve({ ws }), ms)
    ws.onmessage = e => { clearTimeout(t); resolve({ ws, first: String(e.data) }) }
    ws.onclose = e => { clearTimeout(t); resolve({ ws, closed: e.code }) }
  })
}

let fails = 0
const check = (ok, what) => { console.log(ok ? `ok   ${what}` : `FAIL ${what}`); if (!ok) fails++ }

const a = await attempt(`${BASE}/${id}/upstream?key=${keyA}`)
check(a.first?.includes('upstream_accepted') ?? false, 'the browser with its key connects and claims the id')
const b = await attempt(`${BASE}/${id}/upstream?key=${keyB}`)
check(b.closed === 4003, `another key is refused (close ${b.closed})`)
const c = await attempt(`${BASE}/${id}/upstream`)
check(c.closed === 4003, `no key is refused once claimed (close ${c.closed})`)

// An agent reaches the real browser through the code: the browser sees ws_open and answers.
const opened = new Promise(resolve => {
  a.ws.onmessage = e => {
    const m = JSON.parse(String(e.data))
    if (m.type === 'ws_open') { a.ws.send(JSON.stringify({ type: 'ws_opened', connId: m.connId })); resolve(true) }
  }
  setTimeout(() => resolve(false), 3000)
})
const agent = new WebSocket(`${BASE}/${id}/extension`)
check(await opened, 'an agent with the code reaches the keyed browser')
agent.close()

a.ws.close()
await new Promise(r => setTimeout(r, 300))
const again = await attempt(`${BASE}/${id}/upstream?key=${keyA}`)
check(again.first?.includes('upstream_accepted') ?? false, 'the same browser reconnects with its key')
again.ws.close()

const legacy = await attempt(`${BASE}/${legacyId}/upstream`)
check(legacy.first?.includes('upstream_accepted') ?? false, 'an id no keyed extension claimed still takes an old keyless extension')
legacy.ws.close()
const bad = await attempt(`${BASE}/${legacyId}/upstream?key=nothex`)
check(bad.closed === 4003, `a malformed key is refused (close ${bad.closed})`)

console.log(fails ? `${fails} failed` : 'all passed')
process.exit(fails ? 1 : 0)
