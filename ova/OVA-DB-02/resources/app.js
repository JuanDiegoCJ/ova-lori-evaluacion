window.addEventListener('DOMContentLoaded', function () {
  const statusNode = document.getElementById('scorm-status')
  const completeButton = document.getElementById('complete-btn')
  const frame = document.getElementById('res-frame')
  const tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'))
  const format = document.body.getAttribute('data-package-format')
  // Web/IMS guardan el progreso en el navegador, salvo que haya una API de LMS: el
  // reproductor LTI la expone para enviar la nota por AGS (sin ella la nota se perdería).
  const lmsApi = Boolean(window.GenovaScorm && window.GenovaScorm.initialize())
  const localMode = (format === 'html' || format === 'ims') && !lmsApi
  const storageKey = 'genova-progress-v1:' + document.body.getAttribute('data-progress-key')
  const resourceSources = tabs.map(function (tab) { return tab.getAttribute('data-src') })
  const localCompleted = new Set()
  let lastResource = null
  let storageAvailable = true
  const visited = {}
  const completed = {}
  const startedAt = Date.now()
  let finished = false

  function saveTime() {
    const cs = Math.max(0, Math.round((Date.now() - startedAt) / 10))
    const hours = Math.min(9999, Math.floor(cs / 360000))
    const minutes = Math.floor(cs / 6000) % 60
    const seconds = Math.floor(cs / 100) % 60
    const pad = (v, n) => String(v).padStart(n, '0')
    window.GenovaScorm.setValue('cmi.core.session_time',
      pad(hours, 4) + ':' + pad(minutes, 2) + ':' + pad(seconds, 2) + '.' + pad(cs % 100, 2))
  }

  const initialized = lmsApi
  const xapi = localMode ? null : window.GenovaXapi || null

  function showLocalProgress() {
    const prefix = storageAvailable ? 'Progreso local: ' : 'Progreso de esta sesión: '
    statusNode.textContent = prefix + localCompleted.size + ' de ' + tabs.length + ' recursos completados.'
  }

  function saveLocalProgress() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        completed: Array.from(localCompleted), lastResource: lastResource,
      }))
    } catch (error) {
      // file://, navegación privada o cuota llena: la navegación sigue funcionando.
      storageAvailable = false
    }
    showLocalProgress()
  }

  if (localMode) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey))
      if (saved && Array.isArray(saved.completed)) {
        saved.completed.forEach(function (src) {
          if (resourceSources.includes(src)) { localCompleted.add(src) }
        })
        if (resourceSources.includes(saved.lastResource)) { lastResource = saved.lastResource }
      }
    } catch (error) {
      // Un registro inválido se ignora; no impide abrir el paquete.
    }
  }

  function selectTab(btn, focus) {
    tabs.forEach(function (t) {
      const isSel = t === btn
      t.setAttribute('aria-selected', isSel ? 'true' : 'false')
      t.tabIndex = isSel ? 0 : -1
    })
    if (btn) {
      frame.src = btn.getAttribute('data-src')
      frame.setAttribute('aria-label', 'Contenido: ' + btn.textContent.trim())
      const src = btn.getAttribute('data-src')
      visited[src] = true
      if (localMode) {
        lastResource = src
        saveLocalProgress()
      }
      if (xapi) { xapi.experienced(btn.textContent.trim()) }
      if (focus) { btn.focus() }
    }
  }

  function markComplete() {
    if (localMode) {
      resourceSources.forEach(function (src) { localCompleted.add(src) })
      saveLocalProgress()
      return
    }
    if (xapi) { xapi.completed() }
    if (!initialized) {
      statusNode.textContent = 'OVA completado. Vista sin aula virtual: tu progreso no se enviará'
      return
    }
    window.GenovaScorm.setValue('cmi.core.lesson_status', 'completed')
    const scores = Object.values(completed)
    // Sin recursos puntuados solo se marca completado: un 100 inventado llegaría
    // al libro de calificaciones (SCORM o AGS en LTI).
    if (scores.length) {
      const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      window.GenovaScorm.setValue('cmi.core.score.min', '0')
      window.GenovaScorm.setValue('cmi.core.score.max', '100')
      window.GenovaScorm.setValue('cmi.core.score.raw', score)
    }
    saveTime()
    window.GenovaScorm.commit()
    statusNode.textContent = 'Estado LMS: completado y guardado.'
  }

  function maybeComplete() {
    // Visitar una pestaña no demuestra completar una interacción.
    if (tabs.length > 1 && Object.keys(completed).length >= tabs.length) {
      markComplete()
    }
  }

  // Patrón ARIA Tabs: flechas mueven el foco, Home/End a extremos.
  function onKeydown(e) {
    const idx = tabs.indexOf(e.currentTarget)
    if (idx < 0) { return }
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next = (idx + 1) % tabs.length }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { next = (idx - 1 + tabs.length) % tabs.length }
    else if (e.key === 'Home') { next = 0 }
    else if (e.key === 'End') { next = tabs.length - 1 }
    if (next >= 0) {
      e.preventDefault()
      selectTab(tabs[next], true)
    }
  }

  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () { selectTab(btn, false) })
    btn.addEventListener('keydown', onKeydown)
  })

  if (tabs.length) {
    selectTab(tabs.find(function (tab) { return tab.getAttribute('data-src') === lastResource }) || tabs[0], false)
  }

  if (localMode) {
    showLocalProgress()
  } else if (!initialized) {
    statusNode.textContent =
      'Vista sin aula virtual: tu progreso no se enviará'
  } else {
    const currentStatus = window.GenovaScorm.getValue('cmi.core.lesson_status')
    if (!currentStatus || currentStatus === 'not attempted') {
      window.GenovaScorm.setValue('cmi.core.lesson_status', 'incomplete')
      window.GenovaScorm.commit()
      statusNode.textContent = 'Progreso: en curso.'
    } else {
      statusNode.textContent = 'Progreso actual: ' + currentStatus
    }
  }

  completeButton.addEventListener('click', markComplete)

  // Los recursos están en sandbox sin allow-same-origin. Su origin es null:
  // autenticar por la ventana del iframe activo, no por event.origin.
  window.addEventListener('message', function (event) {
    if (event.source !== frame.contentWindow || event.data?.type !== 'genova-resource-completed') return
    const src = frame.getAttribute('src')
    if (!resourceSources.includes(src)) return
    if (localMode) {
      localCompleted.add(src)
      saveLocalProgress()
      return
    }
    const raw = Number(event.data.score)
    if (!Number.isFinite(raw)) return
    completed[src] = Math.max(0, Math.min(100, raw))
    maybeComplete()
  })

  window.addEventListener('beforeunload', function () {
    if (xapi) { xapi.terminated() }
    if (initialized && !finished) {
      finished = true
      saveTime()
      window.GenovaScorm.setValue('cmi.core.exit',
        window.GenovaScorm.getValue('cmi.core.lesson_status') === 'completed' ? '' : 'suspend')
      window.GenovaScorm.commit()
      window.GenovaScorm.finish()
    }
  })

  maybeComplete()
})
