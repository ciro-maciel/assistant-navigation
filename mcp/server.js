#!/usr/bin/env node
// Assistant Navigation as an MCP server over stdio: the tools in src/tools.js, each one request to your
// browser through its connection code. No dependencies: it speaks the protocol's few messages
// itself (initialize, tools/list, tools/call, ping), so it runs with Node 22+ or Bun.
//
// The connection code comes from ASSISTANT_NAVIGATION_CODE, or from ~/.config/assistant-navigation/config.json
// ({ "code": "wss://…/tunnel/…/extension" }).

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'

import { call, codeOf } from '../src/client.js'
import { mcpTools, toolOf } from '../src/tools.js'

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const CONFIG = path.join(homedir(), '.config/assistant-navigation/config.json')

function connectionCode() {
    let code = codeOf(process.env.ASSISTANT_NAVIGATION_CODE)
    if (!code) {
        try {
            code = codeOf(JSON.parse(readFileSync(CONFIG, 'utf8')).code)
        } catch {}
    }
    if (!code) throw new Error(`no connection code: set ASSISTANT_NAVIGATION_CODE, or save { "code": "…" } in ${CONFIG}. Copy the code from the Assistant Navigation extension's popup.`)
    return code
}

async function callTool(name, args) {
    const tool = toolOf(name)
    if (!tool) return { isError: true, content: [{ type: 'text', text: `unknown tool: ${name}` }] }
    try {
        const result = await call(connectionCode(), tool.method, args ?? {})
        if (result?.mimeType && result?.data) return { content: [{ type: 'image', mimeType: result.mimeType, data: result.data }] }
        return { isError: Boolean(result?.isError), content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] }
    } catch (error) {
        return { isError: true, content: [{ type: 'text', text: `error: ${error.message}` }] }
    }
}

async function answer(message) {
    switch (message.method) {
        case 'initialize':
            return { protocolVersion: message.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'assistant-navigation', version: VERSION } }
        case 'tools/list':
            return { tools: mcpTools() }
        case 'tools/call':
            return callTool(message.params?.name, message.params?.arguments)
        case 'ping':
            return {}
        default:
            throw Object.assign(new Error(`method not found: ${message.method}`), { code: -32601 })
    }
}

const send = data => process.stdout.write(`${JSON.stringify(data)}\n`)

createInterface({ input: process.stdin }).on('line', async line => {
    let message
    try {
        message = JSON.parse(line)
    } catch {
        return
    }
    // Notifications (no id) need no answer.
    if (message.id === undefined) return
    try {
        send({ jsonrpc: '2.0', id: message.id, result: await answer(message) })
    } catch (error) {
        send({ jsonrpc: '2.0', id: message.id, error: { code: error.code ?? -32603, message: error.message } })
    }
})
