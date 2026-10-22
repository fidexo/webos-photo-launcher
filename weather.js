// Clima actual con Open-Meteo (HTTPS, sin clave ni backend). Solo pide datos si
// weather-config.js define coordenadas válidas; nunca usa geolocalización del navegador.
// Un valor que no se pudo validar se muestra como desconocido, nunca como 0.
(function () {
  'use strict';
  var ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  var CURRENT = 'temperature_2m,apparent_temperature,weather_code,is_day';
  var REFRESH_MS = 15 * 60 * 1000;
  var STALE_MS = 30 * 60 * 1000;     // más viejo: se marca "Último dato HH:MM"
  var MAX_AGE_MS = 3 * 60 * 60 * 1000; // más viejo: no se muestra como clima actual
  var RETRY_MS = 60 * 1000;
  var TIMEOUT_MS = 8000;
  var CACHE_KEY = 'mi-pantalla-weather-v1';

  // Códigos WMO documentados por Open-Meteo → [condición, ícono].
  var CODES = {
    0: ['Despejado', 'clear'], 1: ['Mayormente despejado', 'partly'], 2: ['Parcialmente nublado', 'partly'],
    3: ['Nublado', 'cloud'], 45: ['Niebla', 'fog'], 48: ['Niebla con escarcha', 'fog'],
    51: ['Llovizna débil', 'drizzle'], 53: ['Llovizna', 'drizzle'], 55: ['Llovizna intensa', 'drizzle'],
    56: ['Llovizna helada', 'drizzle'], 57: ['Llovizna helada intensa', 'drizzle'],
    61: ['Lluvia débil', 'rain'], 63: ['Lluvia', 'rain'], 65: ['Lluvia intensa', 'rain'],
    66: ['Lluvia helada', 'rain'], 67: ['Lluvia helada intensa', 'rain'],
    71: ['Nevada débil', 'snow'], 73: ['Nevada', 'snow'], 75: ['Nevada intensa', 'snow'], 77: ['Nieve granulada', 'snow'],
    80: ['Chaparrones', 'rain'], 81: ['Chaparrones fuertes', 'rain'], 82: ['Chaparrones violentos', 'rain'],
    85: ['Chaparrones de nieve', 'snow'], 86: ['Chaparrones de nieve intensos', 'snow'],
    95: ['Tormenta', 'storm'], 96: ['Tormenta con granizo', 'storm'], 97: ['Tormenta fuerte', 'storm'], 99: ['Tormenta con granizo fuerte', 'storm']
  };
  var REASONS = {
    'no-config': 'Falta configurar la zona',
    offline: 'Sin conexión',
    network: 'Sin conexión con el servicio',
    timeout: 'El servicio no respondió',
    http: 'Servicio no disponible',
    invalid: 'Respuesta no válida'
  };

  function isNumber(value) { return typeof value === 'number' && isFinite(value); }
  function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : ''; }

  function validConfig(config) {
    if (!config || typeof config !== 'object') return null;
    var lat = config.latitude;
    var lon = config.longitude;
    if (!isNumber(lat) || !isNumber(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (!text(config.timezone) || !text(config.name)) return null;
    return { name: text(config.name), region: text(config.region), latitude: lat, longitude: lon, timezone: text(config.timezone) };
  }

  function buildUrl(config) {
    return ENDPOINT +
      '?latitude=' + encodeURIComponent(String(config.latitude)) +
      '&longitude=' + encodeURIComponent(String(config.longitude)) +
      '&current=' + encodeURIComponent(CURRENT).replace(/%2C/g, ',') +
      '&timezone=auto';
  }

  // Devuelve una lectura validada o null. 0 °C es válido; null, NaN o texto no lo son.
  function parseForecast(body) {
    if (!body || typeof body !== 'object' || body.error) return null;
    var current = body.current;
    if (!current || typeof current !== 'object') return null;
    // Open-Meteo entrega hora local sin sufijo: el offset de la respuesta la convierte a UTC.
    var local = typeof current.time === 'string' && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(current.time);
    var offset = body.utc_offset_seconds;
    if (!local || !isNumber(offset) || offset % 1 || Math.abs(offset) > 64800) return null;
    var iso = local[1] + (local[2] || ':00');
    var stamp = Date.parse(iso + 'Z');
    if (!isNumber(stamp) || new Date(stamp).toISOString().slice(0, 19) !== iso) return null;
    var units = body.current_units;
    if (units && units.temperature_2m !== undefined && units.temperature_2m !== '°C') return null;
    var temperature = current.temperature_2m;
    var code = current.weather_code;
    if (!isNumber(temperature) || temperature < -90 || temperature > 60) return null;
    if (!isNumber(code) || code % 1 !== 0 || !CODES.hasOwnProperty(code)) return null;
    if (current.is_day !== 0 && current.is_day !== 1) return null;
    var apparent = current.apparent_temperature;
    return {
      temperature: temperature,
      apparent: isNumber(apparent) && apparent >= -100 && apparent <= 70 ? apparent : null,
      code: code,
      isDay: current.is_day === 1,
      validAt: stamp - offset * 1000
    };
  }

  function describe(reading) {
    var entry = CODES[reading.code];
    var icon = entry[1];
    if (icon === 'clear' || icon === 'partly') icon += reading.isDay ? '-day' : '-night';
    return { label: entry[0], icon: icon };
  }

  function degrees(value) {
    var rounded = Math.round(value);
    return (rounded === 0 ? 0 : rounded) + '°'; // evita "-0°"
  }

  // GET JSON por XHR con timeout. Llama done(error, body) una sola vez; error.kind clasifica la falla.
  function requestJSON(url, timeoutMs, done) {
    var finished = false;
    function finish(error, body) {
      if (finished) return;
      finished = true;
      done(error, body);
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { finish({ kind: 'offline' }); return; }
    var xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = timeoutMs;
    } catch (error) { finish({ kind: 'network' }); return; }
    xhr.onload = function () {
      if (xhr.status !== 200) { finish({ kind: 'http', status: xhr.status }); return; }
      var body;
      try { body = JSON.parse(xhr.responseText); } catch (error) { finish({ kind: 'invalid' }); return; }
      finish(null, body);
    };
    xhr.onerror = function () { finish({ kind: 'network' }); };
    xhr.onabort = function () { finish({ kind: 'network' }); };
    xhr.ontimeout = function () { finish({ kind: 'timeout' }); };
    try { xhr.send(); } catch (error) { finish({ kind: 'network' }); }
  }

  // Reintenta solo fallas transitorias (red, timeout, 5xx), con espera creciente hasta la cadencia normal.
  function retryDelay(error, failures) {
    var transient = error.kind !== 'http' || !error.status || error.status >= 500 || error.status === 429;
    if (!transient) return REFRESH_MS;
    return Math.min(REFRESH_MS, RETRY_MS * Math.pow(2, Math.max(0, failures - 1)));
  }

  // Controlador sin DOM: decide cuándo pedir datos y qué estado mostrar.
  // options: config, render(view), request(url, timeout, done), now(), storage, isHidden(), setTimer, clearTimer.
  function createWeather(options) {
    var config = validConfig(options.config);
    var now = options.now || function () { return Date.now(); };
    var request = options.request || requestJSON;
    var storage = options.storage || null;
    var isHidden = options.isHidden || function () { return false; };
    var setTimer = options.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = options.clearTimer || function (id) { clearTimeout(id); };
    var cache = null;
    var timer = null;
    var inFlight = false;
    var failures = 0;
    var lastError = null;

    function sameSpot(entry) {
      return entry && entry.latitude === config.latitude && entry.longitude === config.longitude;
    }
    if (config && storage) {
      try {
        var stored = JSON.parse(storage.getItem(CACHE_KEY) || 'null');
        var reading = stored && parseForecast(stored);
        if (reading && sameSpot(stored) && isNumber(stored.fetchedAt) && stored.fetchedAt <= now() &&
            now() - stored.fetchedAt <= MAX_AGE_MS && reading.validAt <= now() + 300000 &&
            now() - reading.validAt <= MAX_AGE_MS) cache = { fetchedAt: stored.fetchedAt, reading: reading };
      } catch (error) { cache = null; }
    }
    function age() {
      if (!cache) return Infinity;
      var fetchedAge = now() - cache.fetchedAt;
      var sourceAge = now() - cache.reading.validAt;
      // Una descarga reciente no rejuvenece un dato viejo; tolera solo 5 min de desfase de reloj.
      return fetchedAge < 0 || sourceAge < -300000 ? Infinity : Math.max(fetchedAge, sourceAge);
    }

    function view() {
      if (!config) return { state: 'unconfigured', reason: REASONS['no-config'] };
      var place = config.name;
      var currentAge = age();
      if (cache && currentAge <= MAX_AGE_MS) {
        return {
          state: currentAge > STALE_MS ? 'stale' : 'ok',
          place: place,
          reading: cache.reading,
          condition: describe(cache.reading),
          fetchedAt: cache.fetchedAt,
          validAt: cache.reading.validAt
        };
      }
      if (lastError) return { state: 'error', place: place, reason: REASONS[lastError] || REASONS.network };
      return { state: 'loading', place: place };
    }
    function publish() { options.render(view()); }

    function schedule(ms) {
      if (timer !== null) clearTimer(timer);
      timer = null;
      if (!config || isHidden()) return;
      timer = setTimer(function () { timer = null; refresh(); }, Math.max(1000, ms));
    }

    function refresh() {
      if (!config || inFlight || isHidden()) return;
      inFlight = true;
      request(buildUrl(config), TIMEOUT_MS, function (error, body) {
        inFlight = false;
        var reading = error ? null : parseForecast(body);
        if (reading && (reading.validAt > now() + 300000 || now() - reading.validAt > MAX_AGE_MS ||
            (cache && reading.validAt < cache.reading.validAt))) reading = null;
        if (reading) {
          cache = { fetchedAt: now(), reading: reading };
          failures = 0;
          lastError = null;
          if (storage) {
            try {
              storage.setItem(CACHE_KEY, JSON.stringify({
                latitude: config.latitude,
                longitude: config.longitude,
                fetchedAt: cache.fetchedAt,
                utc_offset_seconds: body.utc_offset_seconds,
                current: { time: body.current.time, temperature_2m: reading.temperature, apparent_temperature: reading.apparent, weather_code: reading.code, is_day: reading.isDay ? 1 : 0 }
              }));
            } catch (storageError) { /* sin caché persistente: el widget sigue funcionando */ }
          }
          schedule(REFRESH_MS);
        } else {
          var failure = error || { kind: 'invalid' };
          failures += 1;
          lastError = REASONS[failure.kind] ? failure.kind : 'network';
          schedule(retryDelay(failure, failures));
        }
        publish();
      });
    }

    function resume() {
      if (!config) return;
      if (isHidden()) { schedule(0); return; } // schedule() limpia el timer si está oculto
      publish();
      var currentAge = age();
      if (currentAge >= REFRESH_MS) refresh();
      else if (timer === null && !inFlight) schedule(REFRESH_MS - currentAge);
    }

    return {
      start: function () { publish(); resume(); },
      visibilityChanged: resume,
      tick: publish,
      view: view
    };
  }

  // ---------- Presentación ----------
  var XLINK = 'http://www.w3.org/1999/xlink';
  function clock(time) {
    return new Date(time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function renderInto(root, view) {
    var icon = root.querySelector('.weather-icon use');
    var temp = root.querySelector('.weather-temp');
    var condition = root.querySelector('.weather-condition');
    var meta = root.querySelector('.weather-meta');
    root.setAttribute('data-state', view.state);
    var iconName = 'unknown';
    if (view.reading) {
      iconName = view.condition.icon;
      temp.textContent = degrees(view.reading.temperature);
      condition.textContent = view.condition.label;
      meta.textContent = view.state === 'stale' ? view.place + ' · dato anterior' : view.place;
      root.setAttribute('aria-label', 'Clima en ' + view.place + ': ' + view.condition.label + ', ' +
        Math.round(view.reading.temperature) + ' grados' +
        (view.reading.apparent === null ? '' : ', sensación térmica ' + Math.round(view.reading.apparent)) +
        (view.state === 'stale' ? '. Último dato de las ' : '. Dato de las ') + clock(view.validAt));
    } else {
      temp.textContent = '–';
      condition.textContent = view.state === 'loading' ? 'Clima' : 'Clima no disponible';
      meta.textContent = view.state === 'loading' ? 'Consultando…' : view.reason;
      root.setAttribute('aria-label', view.state === 'loading' ? 'Consultando el clima' : 'Clima no disponible: ' + view.reason);
    }
    if (icon) icon.setAttributeNS(XLINK, 'href', '#wx-' + iconName);
  }

  function mount(root, config) {
    if (!root) return null;
    var storage = null;
    try { storage = window.localStorage; } catch (error) { storage = null; }
    var weather = createWeather({
      config: config,
      storage: storage,
      isHidden: function () { return document.hidden === true; },
      render: function (view) { renderInto(root, view); }
    });
    document.addEventListener('visibilitychange', weather.visibilityChanged);
    weather.start();
    return weather;
  }

  window.LauncherWeather = {
    validConfig: validConfig,
    buildUrl: buildUrl,
    parseForecast: parseForecast,
    describe: describe,
    degrees: degrees,
    retryDelay: retryDelay,
    createWeather: createWeather,
    requestJSON: requestJSON,
    mount: mount,
    REFRESH_MS: REFRESH_MS,
    STALE_MS: STALE_MS,
    MAX_AGE_MS: MAX_AGE_MS
  };
}());
