// What runs inside a page, injected by background.js with chrome.scripting into every frame: no
// debugger, so Chrome shows no bar. Each function is self-contained (it is serialized into the
// page), and each walks open shadow roots too, so closed-looking components are read and acted on.

/**
 * One frame as an agent reads it: its text, and the elements it can act on, numbered. The number
 * is written on the element (data-assistant-ref) so a later action finds it again.
 */
export function readPage(maxChars) {
    const SELECTOR = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option], [role=switch], [role=combobox], [role=textbox], [contenteditable=""], [contenteditable=true], [onclick], [tabindex]:not([tabindex="-1"])'
    const deepAll = (root, selector, found = []) => {
        for (const element of root.querySelectorAll(selector)) found.push(element)
        for (const host of root.querySelectorAll('*')) if (host.shadowRoot) deepAll(host.shadowRoot, selector, found)
        return found
    }
    const isVisible = element => {
        const box = element.getBoundingClientRect()
        if (box.width < 1 || box.height < 1) return false
        const style = getComputedStyle(element)
        return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0
    }
    const clean = text => String(text || '').replace(/\s+/g, ' ').trim()
    const labelOf = element => {
        const root = element.getRootNode()
        const byId = element.id && root.querySelector ? root.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null
        return clean(
            element.getAttribute('aria-label') ||
                byId?.innerText ||
                element.closest('label')?.innerText ||
                element.getAttribute('placeholder') ||
                element.getAttribute('title') ||
                element.getAttribute('alt') ||
                element.innerText ||
                element.querySelector?.('img[alt]')?.getAttribute('alt') ||
                element.querySelector?.('svg title')?.textContent ||
                element.value ||
                element.getAttribute('name') ||
                ''
        ).slice(0, 120)
    }
    for (const old of deepAll(document, '[data-assistant-ref]')) old.removeAttribute('data-assistant-ref')
    const elements = []
    let ref = 0
    for (const element of deepAll(document, SELECTOR)) {
        if (!isVisible(element) || element.closest('[aria-hidden=true]')) continue
        ref += 1
        element.setAttribute('data-assistant-ref', String(ref))
        const tag = element.tagName.toLowerCase()
        const item = { ref, kind: element.getAttribute('role') || (tag === 'input' ? `input:${element.type || 'text'}` : tag), label: labelOf(element) }
        if (tag === 'a') item.href = element.href
        if (tag === 'input' || tag === 'textarea' || tag === 'select') item.value = clean(element.type === 'password' ? (element.value ? '••••' : '') : element.value).slice(0, 120)
        if (element.type === 'checkbox' || element.type === 'radio') item.checked = element.checked
        if (tag === 'select') item.options = [...element.options].slice(0, 30).map(option => clean(option.text))
        if (element.disabled) item.disabled = true
        elements.push(item)
        if (elements.length >= 400) break
    }
    const text = clean(document.body?.innerText || '')
    return {
        url: location.href,
        title: document.title,
        text: text.length > maxChars ? `${text.slice(0, maxChars)} [text cut]` : text,
        elements,
        scroll: { y: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight },
    }
}

/** Acts on one numbered element of this frame: click, hover, type, select. Returns what happened. */
export function actOn(ref, action, value, submit) {
    const deepFind = (root, selector) => {
        const direct = root.querySelector(selector)
        if (direct) return direct
        for (const host of root.querySelectorAll('*')) {
            if (host.shadowRoot) {
                const inside = deepFind(host.shadowRoot, selector)
                if (inside) return inside
            }
        }
        return null
    }
    const element = deepFind(document, `[data-assistant-ref="${ref}"]`)
    if (!element) return { isError: true, text: `element ${ref} is no longer on the page; read the page again` }
    element.scrollIntoView({ block: 'center', inline: 'center' })
    const box = element.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, composed: true, view: window, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }
    const fire = types => {
        for (const type of types) element.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...at, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, at))
    }
    if (action === 'hover') {
        fire(['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'])
        // A script cannot put an element in CSS :hover: the page's :hover rules are copied to a
        // class, set on the element and its parents (one at a time, the last hover wins).
        if (!document.getElementById('assistant-hover-rules')) {
            const copied = []
            for (const sheet of document.styleSheets) {
                let rules
                try {
                    rules = sheet.cssRules
                } catch {
                    continue
                }
                for (const rule of rules) if (rule.selectorText?.includes(':hover')) copied.push(rule.cssText.replaceAll(':hover', '.assistant-hover'))
            }
            const style = document.createElement('style')
            style.id = 'assistant-hover-rules'
            style.textContent = copied.join('\n')
            document.head.append(style)
        }
        for (const old of document.querySelectorAll('.assistant-hover')) old.classList.remove('assistant-hover')
        for (let node = element; node && node !== document.documentElement; node = node.parentElement) node.classList.add('assistant-hover')
        return { text: `hovered ${ref}` }
    }
    if (action === 'click') {
        element.focus?.()
        fire(['pointerover', 'pointerenter', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup'])
        element.click()
        return { text: `clicked ${ref}` }
    }
    if (action === 'type') {
        element.focus()
        if (element.isContentEditable) {
            document.execCommand('selectAll', false)
            document.execCommand('insertText', false, value)
        } else {
            // The native setter, so frameworks (React, Vue) see the change.
            const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
            Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
            element.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
        }
        if (submit) {
            for (const type of ['keydown', 'keypress', 'keyup']) element.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true }))
            element.form?.requestSubmit?.()
        }
        return { text: `typed into ${ref}${submit ? ' and submitted' : ''}` }
    }
    if (action === 'select') {
        const option = [...(element.options || [])].find(item => item.value === value || item.text.trim() === value)
        if (!option) return { isError: true, text: `option "${value}" is not in ${ref}` }
        element.value = option.value
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
        return { text: `selected "${option.text.trim()}" in ${ref}` }
    }
    return { isError: true, text: `unknown action: ${action}` }
}

/** Scrolls the page by most of a screen. */
export function scrollPage(direction) {
    const by = Math.round(innerHeight * 0.8) * (direction === 'up' ? -1 : 1)
    if (direction === 'top') scrollTo(0, 0)
    else if (direction === 'bottom') scrollTo(0, document.documentElement.scrollHeight)
    else scrollBy(0, by)
    return { y: Math.round(scrollY), height: document.documentElement.scrollHeight }
}
