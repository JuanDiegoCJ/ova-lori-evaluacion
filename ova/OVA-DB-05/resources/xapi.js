(function (global) {
  var XAPI_VERSION = '1.0.3'

  function qs() {
    var out = {}
    var q = (global.location.search || '').replace(/^\?/, '')
    q.split('&').forEach(function (pair) {
      if (!pair) { return }
      var kv = pair.split('=')
      out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '))
    })
    return out
  }

  var p = qs()
  var endpoint = p.endpoint
  var registration = p.registration
  var activityId = p.activityId || p.activityid
  var actor = null
  try { actor = p.actor ? JSON.parse(p.actor) : null } catch (e) { actor = null }

  // Sin parámetros de lanzamiento cmi5 => modo no-op (SCORM/preview).
  var active = !!(endpoint && actor && (p.auth || p.fetch))
  var auth = p.auth || null
  var ready = false
  var queue = []

  function headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'X-Experience-API-Version': XAPI_VERSION
    }
  }

  function postStatement(stmt) {
    if (!active) { return }
    if (!ready) { queue.push(stmt); return }
    try {
      var url = endpoint.replace(/\/$/, '') + '/statements'
      global.fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(stmt) })
        .catch(function () {})
    } catch (e) { /* best-effort */ }
  }

  function flush() {
    ready = true
    var pending = queue.slice()
    queue = []
    pending.forEach(postStatement)
  }

  function stmt(verbId, verbLabel, objName) {
    var s = {
      actor: actor,
      verb: { id: verbId, display: { 'es': verbLabel, 'en-US': verbLabel } },
      object: {
        id: objName ? (activityId + '/' + encodeURIComponent(objName)) : activityId,
        definition: { name: { 'es': objName || activityId } }
      },
      timestamp: new Date().toISOString()
    }
    if (registration) { s.context = { registration: registration } }
    return s
  }

  function init() {
    if (!active) { return }
    // cmi5: si hay fetch, obtener el auth-token antes de enviar nada.
    if (p.fetch && !auth) {
      try {
        global.fetch(p.fetch, { method: 'POST' })
          .then(function (r) { return r.json() })
          .then(function (j) {
            auth = j['auth-token'] ? ('Basic ' + j['auth-token']) : auth
            flush()
            postStatement(stmt('http://adlnet.gov/expapi/verbs/initialized', 'inició', null))
          })
          .catch(function () { active = false })
      } catch (e) { active = false }
    } else {
      if (auth && auth.indexOf(' ') < 0) { auth = 'Basic ' + auth }
      flush()
      postStatement(stmt('http://adlnet.gov/expapi/verbs/initialized', 'inició', null))
    }
  }

  global.GenovaXapi = {
    experienced: function (name) {
      postStatement(stmt('http://adlnet.gov/expapi/verbs/experienced', 'experimentó', name))
    },
    completed: function () {
      postStatement(stmt('http://adlnet.gov/expapi/verbs/completed', 'completó', null))
      postStatement(stmt('http://adlnet.gov/expapi/verbs/passed', 'aprobó', null))
    },
    terminated: function () {
      postStatement(stmt('http://adlnet.gov/expapi/verbs/terminated', 'terminó', null))
    },
    active: function () { return active }
  }

  init()
})(window)
