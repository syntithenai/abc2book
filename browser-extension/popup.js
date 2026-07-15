chrome.runtime.sendMessage({ type: 'tunebook.ping' }, function (response) {
  const el = document.getElementById('ver')
  if (!el) return
  if (chrome.runtime.lastError) {
    el.textContent = 'unavailable'
    return
  }
  el.textContent = (response && response.version) || 'unknown'
})
