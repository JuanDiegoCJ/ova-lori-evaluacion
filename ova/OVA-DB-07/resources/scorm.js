(function (global) {
  const PREFERRED = '1.2'
  const API_NAMES = { '1.2': 'API', '2004': 'API_1484_11' }
  const METHODS = {
    '1.2': {
      initialize: 'LMSInitialize',
      getValue: 'LMSGetValue',
      setValue: 'LMSSetValue',
      commit: 'LMSCommit',
      finish: 'LMSFinish',
    },
    '2004': {
      initialize: 'Initialize',
      getValue: 'GetValue',
      setValue: 'SetValue',
      commit: 'Commit',
      finish: 'Terminate',
    },
  }
  let api = null
  let version = null

  function safeApi(win, name) {
    try {
      return win[name] || null
    } catch (error) {
      // Ventana de otro origen: su API no es legible, seguir con la cadena.
      return null
    }
  }

  function findApi(win, name) {
    let current = win
    let attempts = 0
    while (current && attempts < 500) {
      const found = safeApi(current, name)
      if (found) {
        return found
      }
      attempts += 1
      if (current.parent === current) {
        return null
      }
      current = current.parent
    }
    return null
  }

  function locate(name) {
    let found = findApi(global, name)
    if (!found && global.opener) {
      found = findApi(global.opener, name)
    }
    return found
  }

  function getApi() {
    if (api) {
      return api
    }
    const order = PREFERRED === '2004' ? ['2004', '1.2'] : ['1.2', '2004']
    for (let i = 0; i < order.length; i += 1) {
      const found = locate(API_NAMES[order[i]])
      if (found) {
        api = found
        version = order[i]
        return api
      }
    }
    return null
  }

  function rawCall(method, args) {
    const handle = getApi()
    const name = handle && METHODS[version][method]
    if (!name || typeof handle[name] !== 'function') {
      return null
    }
    try {
      return handle[name].apply(handle, args)
    } catch (error) {
      return null
    }
  }

  function call(method, args) {
    const result = rawCall(method, args)
    return result === true || result === 'true'
  }

  // --- Traducción del modelo de datos 1.2 (cmi.core.*) a SCORM 2004 ---

  function toIsoDuration(value) {
    // HHHH:MM:SS.SS -> PT#H#M#S
    const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(String(value))
    if (!match) {
      return 'PT0S'
    }
    return 'PT' + Number(match[1]) + 'H' + Number(match[2]) + 'M' + Number(match[3]) + 'S'
  }

  function set2004(element, value) {
    return call('setValue', [element, String(value)])
  }

  function setValue2004(element, value) {
    switch (element) {
      case 'cmi.core.lesson_status':
        if (value === 'passed' || value === 'failed') {
          set2004('cmi.success_status', value)
          return set2004('cmi.completion_status', 'completed')
        }
        if (value === 'completed' || value === 'incomplete') {
          return set2004('cmi.completion_status', value)
        }
        return set2004('cmi.completion_status', 'unknown')
      case 'cmi.core.score.raw': {
        const raw = Number(value)
        if (Number.isFinite(raw)) {
          set2004('cmi.score.scaled', Math.max(-1, Math.min(1, raw / 100)))
        }
        return set2004('cmi.score.raw', value)
      }
      case 'cmi.core.score.min':
        return set2004('cmi.score.min', value)
      case 'cmi.core.score.max':
        return set2004('cmi.score.max', value)
      case 'cmi.core.session_time':
        return set2004('cmi.session_time', toIsoDuration(value))
      case 'cmi.core.exit':
        return set2004('cmi.exit', value === '' ? 'normal' : value)
      case 'cmi.core.lesson_location':
        return set2004('cmi.location', value)
      default:
        return set2004(element, value)
    }
  }

  function getValue2004(element) {
    if (element === 'cmi.core.lesson_status') {
      const status = rawCall('getValue', ['cmi.completion_status']) || ''
      return status === 'unknown' ? 'not attempted' : status
    }
    if (element === 'cmi.core.lesson_location') {
      return rawCall('getValue', ['cmi.location']) || ''
    }
    return rawCall('getValue', [element]) || ''
  }

  function initialize() {
    return call('initialize', [''])
  }

  function getValue(element) {
    if (!getApi()) {
      return ''
    }
    if (version === '2004') {
      return getValue2004(element)
    }
    return rawCall('getValue', [element]) || ''
  }

  function setValue(element, value) {
    if (!getApi()) {
      return false
    }
    if (version === '2004') {
      return setValue2004(element, String(value))
    }
    return call('setValue', [element, String(value)])
  }

  function commit() {
    return call('commit', [''])
  }

  function finish() {
    return call('finish', [''])
  }

  global.GenovaScorm = {
    initialize,
    getValue,
    setValue,
    commit,
    finish,
    version: function () {
      getApi()
      return version
    },
  }
})(window)
