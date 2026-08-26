/**
 * The selection bridge injected into a same-origin preview iframe, and the
 * snippet a cross-origin preview app must include itself to participate.
 * In selection mode it highlights the hovered element, toggles persistent
 * selection boxes on click, supports shift-click multi-select, and posts each
 * change back to the parent window keyed by a stable element id. The parent
 * drives the mode and per-id clearing through postMessage.
 */
export const BRIDGE_SOURCE = `(function () {
  if (window.__dshDesignBridge) return
  window.__dshDesignBridge = true

  var active = false
  var hoverEl = null
  var idCounter = 0
  // Element -> { id, box }: one selection box per selected element.
  var selected = new Map()

  function makeBox(color, bg) {
    var box = document.createElement('div')
    box.setAttribute('data-dsh-overlay', 'true')
    box.style.cssText = 'position:fixed;pointer-events:none;border:2px solid ' + color + ';border-radius:3px;z-index:2147483647;background:' + bg + ';display:none;'
    document.documentElement.appendChild(box)
    return box
  }

  var hoverBox = makeBox('#4f46e5', 'rgba(79,70,229,0.08)')

  var tagLabel = document.createElement('div')
  tagLabel.setAttribute('data-dsh-overlay', 'true')
  tagLabel.style.cssText = 'position:fixed;pointer-events:none;background:#4f46e5;color:#fff;font:11px/1.5 -apple-system,"Segoe UI",sans-serif;padding:2px 7px;border-radius:4px;z-index:2147483647;display:none;white-space:nowrap;'
  document.documentElement.appendChild(tagLabel)

  function isOverlay(el) {
    return !!el && el.getAttribute && el.getAttribute('data-dsh-overlay') === 'true'
  }

  function cssPath(node) {
    var parts = []
    var depth = 0
    while (node && node.nodeType === 1 && node !== document.body && depth < 6) {
      var part = node.tagName.toLowerCase()
      if (node.id) { parts.unshift(part + '#' + node.id); break }
      var cls = (typeof node.className === 'string' ? node.className : '').trim().split(/\\s+/).slice(0, 2).join('.')
      if (cls) part += '.' + cls
      parts.unshift(part)
      node = node.parentElement
      depth += 1
    }
    return parts.join(' > ')
  }

  function place(box, el) {
    var r = el.getBoundingClientRect()
    if (r.width < 1 && r.height < 1) { box.style.display = 'none'; return false }
    box.style.display = 'block'
    box.style.left = r.left + 'px'
    box.style.top = r.top + 'px'
    box.style.width = r.width + 'px'
    box.style.height = r.height + 'px'
    return true
  }

  function refreshHover() {
    if (hoverEl && active) {
      if (place(hoverBox, hoverEl)) {
        var r = hoverEl.getBoundingClientRect()
        tagLabel.style.display = 'block'
        tagLabel.textContent = hoverEl.tagName.toLowerCase()
        tagLabel.style.left = r.left + 'px'
        tagLabel.style.top = Math.max(0, r.top - 22) + 'px'
      } else {
        tagLabel.style.display = 'none'
      }
    } else {
      hoverBox.style.display = 'none'
      tagLabel.style.display = 'none'
    }
  }

  function refreshSelected() {
    selected.forEach(function (entry, el) { place(entry.box, el) })
  }

  function describe(el) {
    return {
      type: 'dsh-design:selection',
      id: '',
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 500),
      selector: cssPath(el),
      tagName: el.tagName.toLowerCase(),
      href: location.href,
    }
  }

  function select(el) {
    if (selected.has(el)) return
    var id = 'dsh-' + (++idCounter)
    var box = makeBox('#e11d48', 'rgba(225,29,72,0.10)')
    box.setAttribute('data-dsh-selected', 'true')
    selected.set(el, { id: id, box: box })
    place(box, el)
    var data = describe(el)
    data.id = id
    parent.postMessage(data, '*')
  }

  function deselect(el, post) {
    var entry = selected.get(el)
    if (!entry) return
    entry.box.remove()
    selected.delete(el)
    if (post !== false) {
      parent.postMessage({ type: 'dsh-design:deselect', id: entry.id }, '*')
    }
  }

  function clearAll() {
    var els = []
    selected.forEach(function (_entry, el) { els.push(el) })
    for (var i = 0; i < els.length; i++) { deselect(els[i], true) }
  }

  function setActive(v) {
    if (active === v) return
    active = v
    if (!v) {
      hoverEl = null
      hoverBox.style.display = 'none'
      tagLabel.style.display = 'none'
      clearAll()
    }
  }

  function onMove(e) {
    if (!active) return
    var el = document.elementFromPoint(e.clientX, e.clientY)
    if (el && isOverlay(el)) el = null
    hoverEl = el
    refreshHover()
  }

  function onClick(e) {
    if (!active) return
    var el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || isOverlay(el)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.shiftKey) {
      if (selected.has(el)) { deselect(el, true) } else { select(el) }
    } else if (selected.size === 1 && selected.has(el)) {
      deselect(el, true)
    } else {
      clearAll()
      select(el)
    }
  }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  window.addEventListener('scroll', function () { refreshHover(); refreshSelected() }, true)
  window.addEventListener('resize', function () { refreshHover(); refreshSelected() })

  window.addEventListener('message', function (event) {
    var data = event.data
    if (!data || typeof data !== 'object') return
    if (data.type === 'dsh-design:mode') setActive(data.active === true)
    if (data.type === 'dsh-design:clear') {
      selected.forEach(function (entry, el) {
        if (entry.id === data.id) deselect(el, false)
      })
    }
  })
})()`;
//# sourceMappingURL=bridge.js.map