// Assistant Navigation's popup (also opened as a page on install): the state, the on/off switch, the
// connection code and the advanced settings. It talks to background.js only.

const t = key => chrome.i18n.getMessage(key) || key
const $ = id => document.getElementById(id)

for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n)
if (new URLSearchParams(location.search).has('welcome')) {
    $('welcome').hidden = false
    document.body.classList.add('page')
}

const ask = message => chrome.runtime.sendMessage({ action: 'state', ...message })

function show(state) {
    $('status').className = `status${state.isConnected ? ' on' : ''}`
    $('status').querySelector('span').textContent = state.isOff ? t('status_off') : state.isConnected ? t('status_on') : t('status_wait')
    $('toggle').textContent = state.isOff ? t('toggle_on') : t('toggle_off')
    $('toggle').onclick = async () => show(await ask({ action: 'set', isOff: !state.isOff }))
    $('code').value = state.code
    if (document.activeElement !== $('server')) $('server').value = state.server
    if (document.activeElement !== $('group')) $('group').value = state.groupTitle
    $('version').textContent = `v${state.version}`
}

$('show').onclick = () => {
    const isHidden = $('code').type === 'password'
    $('code').type = isHidden ? 'text' : 'password'
    $('show').classList.toggle('on', isHidden)
}
$('copy').onclick = async () => {
    await navigator.clipboard.writeText($('code').value)
    $('copy').textContent = t('copied')
    setTimeout(() => ($('copy').textContent = t('copy')), 1500)
}
$('save').onclick = async () => {
    show(await ask({ action: 'set', server: $('server').value, groupTitle: $('group').value }))
    $('save').textContent = t('saved')
    setTimeout(() => ($('save').textContent = t('save')), 1500)
}
$('newCode').onclick = async () => show(await ask({ action: 'set', isNewCode: true }))

show(await ask({}))
// The connection settles a moment after the popup opens.
setInterval(async () => show(await ask({})), 1500)
