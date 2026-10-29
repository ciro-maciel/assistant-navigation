// Tabhand's tunnel server: a Cloudflare Worker with one Durable Object per browser.
//
// Ported from Playwriter's remote-control tunnel (website/src/remote-control-tunnel.ts,
// https://github.com/remorses/playwriter, MIT License, Copyright (c) 2026 Tommy D. Rossi; see
// NOTICE). The Tabhand extension dials /tunnel/{id}/upstream and stays there; a client dials
// /tunnel/{id}/extension (the connection code), and each of its connections travels to the
// extension as a virtual connection (ws_open, ws_frame, ws_close). The id is a 128-bit secret the
// extension made: whoever holds the connection code can drive that browser.

import { DurableObject } from 'cloudflare:workers'

const CLOSE_INTERNAL_ERROR = 1011
const CLOSE_SERVICE_RESTART = 1012
const CLOSE_TUNNEL_OFFLINE = 4008
const CLOSE_FAILED_TO_CONTACT = 4009
const CLOSE_LOCAL_TIMEOUT = 4010
const CLOSE_LOCAL_WS_ERROR = 4012
const DOWNSTREAM_OPEN_TIMEOUT_MS = 10_000

/** A tunnel request, or null when the path is not one. */
function routeTunnel(request, env) {
    const match = new URL(request.url).pathname.match(/^\/tunnel\/([a-z0-9-]{16,63})\/(upstream|extension)$/)
    if (!match) return null
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Tabhand tunnel', { status: 200 })
    const rewritten = new URL(request.url)
    rewritten.pathname = match[2] === 'upstream' ? '/upstream' : '/extension'
    return env.BROWSER_TUNNEL.get(env.BROWSER_TUNNEL.idFromName(match[1])).fetch(new Request(rewritten, request))
}

export class BrowserTunnel extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env)
        this.pendingDownstreams = new Map()
        // Keepalives never wake the object: the extension's JSON ping is answered at the edge.
        this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"method":"ping"}', '{"method":"pong"}'))
    }

    async fetch(request) {
        const path = new URL(request.url).pathname
        if (path === '/upstream') return this.openUpstream()
        if (path === '/extension') return this.openDownstream(request.headers)
        return new Response('Not Found', { status: 404 })
    }

    webSocketMessage(socket, message) {
        const attachment = socket.deserializeAttachment()
        if (!attachment) return
        if (attachment.role === 'upstream') {
            if (typeof message === 'string') this.handleUpstreamMessage(message)
            return
        }
        const upstream = this.getUpstream()
        if (!upstream) return closeSocket(socket, CLOSE_SERVICE_RESTART, 'Upstream disconnected')
        // The extension protocol is JSON text only.
        if (typeof message !== 'string') return
        this.sendToUpstream(upstream, { type: 'ws_frame', connId: attachment.connectionId, data: message, binary: false })
    }

    webSocketClose(socket, code, reason) {
        const attachment = socket.deserializeAttachment()
        if (!attachment) return
        if (attachment.role === 'upstream') {
            const active = this.getUpstream()
            if (active && active !== socket) return
            return this.disconnectDownstreams()
        }
        this.clearDownstreamTimeout(attachment.connectionId)
        const upstream = this.getUpstream()
        if (upstream) this.sendToUpstream(upstream, { type: 'ws_close', connId: attachment.connectionId, code, reason })
    }

    webSocketError(socket) {
        closeSocket(socket, CLOSE_INTERNAL_ERROR, 'WebSocket error')
    }

    // The same Chrome reconnecting replaces its older socket: the newest upstream wins.
    openUpstream() {
        const [client, server] = Object.values(new WebSocketPair())
        this.ctx.acceptWebSocket(server, ['upstream'])
        server.serializeAttachment({ role: 'upstream', connectedAt: Date.now() })
        server.send(JSON.stringify({ type: 'upstream_accepted' }))
        return new Response(null, { status: 101, webSocket: client })
    }

    openDownstream(headers) {
        const responseHeaders = new Headers()
        const protocol = headers.get('sec-websocket-protocol')
        if (protocol) responseHeaders.set('Sec-WebSocket-Protocol', protocol)
        const upstream = this.getUpstream()
        if (!upstream) return closingResponse(CLOSE_TUNNEL_OFFLINE, 'Remote control offline', responseHeaders)

        const [client, server] = Object.values(new WebSocketPair())
        const connectionId = crypto.randomUUID()
        this.ctx.acceptWebSocket(server, ['downstream', `connection:${connectionId}`])
        server.serializeAttachment({ role: 'downstream', connectionId })
        const requestHeaders = {}
        headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'upgrade') requestHeaders[key] = value
        })
        if (!this.sendToUpstream(upstream, { type: 'ws_open', connId: connectionId, path: '/extension', headers: requestHeaders })) {
            closeSocket(server, CLOSE_FAILED_TO_CONTACT, 'Failed to contact remote browser')
            return new Response(null, { status: 101, webSocket: client, headers: responseHeaders })
        }
        this.pendingDownstreams.set(
            connectionId,
            setTimeout(() => {
                this.pendingDownstreams.delete(connectionId)
                closeSocket(server, CLOSE_LOCAL_TIMEOUT, 'Remote browser connection timeout')
            }, DOWNSTREAM_OPEN_TIMEOUT_MS)
        )
        return new Response(null, { status: 101, webSocket: client, headers: responseHeaders })
    }

    getUpstream() {
        let latest = null
        for (const socket of this.ctx.getWebSockets('upstream')) {
            const attachment = socket.deserializeAttachment()
            if (attachment?.role === 'upstream' && (!latest || attachment.connectedAt >= latest.connectedAt)) latest = { socket, connectedAt: attachment.connectedAt }
        }
        return latest?.socket ?? null
    }

    sendToUpstream(upstream, message) {
        if (sendSocket(upstream, JSON.stringify(message))) return true
        if (this.getUpstream() === upstream) {
            closeSocket(upstream, CLOSE_INTERNAL_ERROR, 'Network connection lost')
            this.disconnectDownstreams()
        }
        return false
    }

    handleUpstreamMessage(raw) {
        let message
        try {
            message = JSON.parse(raw)
        } catch {
            return
        }
        if (message.type === 'ws_opened') return this.clearDownstreamTimeout(message.connId)
        const downstream = this.ctx.getWebSockets(`connection:${message.connId}`)[0] ?? null
        if (message.type === 'ws_frame') {
            if (downstream && !message.binary) sendSocket(downstream, message.data)
            return
        }
        if (message.type === 'ws_closed' || message.type === 'ws_error') {
            this.clearDownstreamTimeout(message.connId)
            if (downstream) closeSocket(downstream, message.type === 'ws_closed' ? message.code : CLOSE_LOCAL_WS_ERROR, message.type === 'ws_closed' ? message.reason : message.error)
        }
    }

    clearDownstreamTimeout(connectionId) {
        const timeout = this.pendingDownstreams.get(connectionId)
        if (timeout) {
            clearTimeout(timeout)
            this.pendingDownstreams.delete(connectionId)
        }
    }

    disconnectDownstreams() {
        for (const timeout of this.pendingDownstreams.values()) clearTimeout(timeout)
        this.pendingDownstreams.clear()
        for (const socket of this.ctx.getWebSockets('downstream')) closeSocket(socket, CLOSE_SERVICE_RESTART, 'Remote browser disconnected')
    }
}

function closingResponse(code, reason, headers) {
    const [client, server] = Object.values(new WebSocketPair())
    server.accept()
    closeSocket(server, code, reason)
    return new Response(null, { status: 101, webSocket: client, headers })
}

function sendSocket(socket, data) {
    try {
        socket.send(data)
        return true
    } catch {
        return false
    }
}

function closeSocket(socket, code, reason) {
    try {
        socket.close(code, reason)
    } catch {}
}

export default {
    fetch(request, env) {
        const tunnel = routeTunnel(request, env)
        if (tunnel) return tunnel
        if (new URL(request.url).pathname === '/') return new Response('Tabhand tunnel server. https://github.com/ciro-maciel/tabhand\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        return new Response('Not Found', { status: 404 })
    },
}
