// Fotos del día: destinos de viaje de Wikimedia Commons, sin backend, cuenta ni clave.
// Config en daily-photos-config.js (window.LAUNCHER_DAILY_PHOTOS = { endpoint, count }).
// Una consulta por día local de la TV (máximo dos lotes si el primero no deja ninguna foto útil).
// Se guarda en localStorage solo la metadata validada, el día y el token de continuación que
// devolvió la API para recorrer otra página al día siguiente; nunca imágenes.
// La metadata de Commons es HTML de terceros: se convierte a texto plano y nunca se inserta como HTML.
// APIs: https://www.mediawiki.org/wiki/API:Categorymembers y https://www.mediawiki.org/wiki/API:Imageinfo
(function () {
  'use strict';
  var STORAGE_KEY = 'mi-pantalla-daily-photos-v5';
  var MAX_COUNT = 50; // tope de la API de Commons para pageids
  var MAX_REQUESTS = 2;
  var TIMEOUT_MS = 10000;
  var RETRY_MS = 60 * 60 * 1000; // tras una falla: como mucho un pedido por hora
  var MIDNIGHT_PAD_MS = 60 * 1000;
  var ENDPOINT = /^https:\/\/commons\.wikimedia\.org\/w\/api\.php\?[\w%.~=&+*-]+$/;
  var THUMB = /^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/[\w\/.~%!$*(),;:@'+-]+\.jpe?g$/i;
  var PAGE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:[\w\/.~%!$*(),;:@'+-]+$/;
  var TOKEN = /^[\w|.:+-]{1,200}$/;
  // El catálogo curado a veces trae pueblos, templos, trenes o remadores: se prefieren paisajes.
  var UNWANTED = /\b(?:trains?|railways?|railroad|ferrocarril|locomotives?|boxcars?|trams?|tractors?|rowers?|rowing|regatta|pirogues?|villages?|towns?|city|cityscape|streets?|construction|church|kirche|kerk|chapel|cathedral|temples?|wat|monastery|people|farmers?|tourists?|turistas|couple|casal|fisherman|montage)\b/i;
  var NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

  function plain(value, max) {
    if (typeof value !== 'string') return '';
    var clean = value
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(?:\s*;\s*)+/g, '; ')
      .replace(/^[\s;]+|[\s;]+$/g, '');
    return clean.length > max ? clean.slice(0, max - 1).replace(/\s+$/, '') + '…' : clean;
  }

  function decodeEntity(match, name) {
    if (name.charAt(0) !== '#') return NAMED.hasOwnProperty(name.toLowerCase()) ? NAMED[name.toLowerCase()] : ' ';
    var code = name.charAt(1).toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (!(code > 31 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) return ' ';
    if (code <= 0xffff) return String.fromCharCode(code);
    code -= 0x10000;
    return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
  }

  // HTML de extmetadata a texto: quita comentarios, scripts, estilos y etiquetas; decodifica entidades.
  function htmlToText(value, max) {
    if (typeof value !== 'string') return '';
    var text = value.slice(0, 6000)
      .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
      .replace(/<(script|style)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
      .replace(/<\/?(?:li|br|p|div|tr|dd|dt)\b[^>]*>/gi, '; ')
      .replace(/<[^>]*>?/g, ' ')
      .replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, decodeEntity);
    return plain(text, max);
  }

  function metaValue(meta, key) {
    return meta && meta[key] && typeof meta[key].value === 'string' ? meta[key].value : '';
  }

  // Autor legible: el texto de Artist; si es una ficha larga, el primer enlace a un usuario.
  function authorOf(meta) {
    var raw = metaValue(meta, 'Artist');
    var author = htmlToText(raw, 400);
    if (author.length > 80) {
      var user = /<a\b[^>]*href="[^"]*User:[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(raw);
      if (user) author = htmlToText(user[1], 400);
    }
    if (!author) {
      var credit = htmlToText(metaValue(meta, 'Credit'), 400);
      if (!/^own work$/i.test(credit)) author = credit;
    }
    // Sin el punto final que algunos autores agregan ("Nombre Apellido."); las iniciales quedan.
    return plain(author, 80).replace(/([^\s.]{2})\.$/, '$1');
  }

  // Solo CC0, dominio público, CC BY y CC BY-SA, con URL de licencia coherente en creativecommons.org.
  function checkLicense(name, url) {
    name = plain(name, 60);
    url = plain(url, 200).replace(/^http:\/\//i, 'https://');
    if (/\b(?:NC|ND)\b|GFDL|FAL|Free Art|Art Libre/i.test(name)) return null;
    var cc = /^CC BY(-SA)? (\d\.\d)(?: [a-z]{2,3})?$/i.exec(name);
    if (cc) {
      var path = /^https:\/\/creativecommons\.org\/licenses\/(by(?:-sa)?)\/(\d\.\d)(?:\/[a-z]{2,3})?\/?(?:deed\.[\w-]+)?$/i.exec(url);
      if (!path || path[1].toLowerCase() !== (cc[1] ? 'by-sa' : 'by') || path[2] !== cc[2]) return null;
      return { license: name, licenseUrl: url };
    }
    if (/^CC0(?: 1\.0)?$/i.test(name)) {
      if (!/^https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?(?:deed\.[\w-]+)?$/i.test(url)) return null;
      return { license: 'CC0', licenseUrl: url };
    }
    if (/^(?:Public domain|Dominio público|PD(?:[ -][\w .-]*)?)$/i.test(name)) {
      var mark = /^https:\/\/creativecommons\.org\/publicdomain\/mark\/1\.0\/?(?:deed\.[\w-]+)?$/i.test(url);
      return { license: 'Dominio público', licenseUrl: mark ? url : '' };
    }
    return null;
  }

  function number(value) { return typeof value === 'number' && isFinite(value) ? value : 0; }

  // Una página de la respuesta → foto validada, o null.
  // curated: la lista de destinos la eligió una persona (pageids=), así que no se filtra por palabras.
  function parsePage(page, curated) {
    if (!page || typeof page !== 'object' || typeof page.title !== 'string') return null;
    var id = number(page.pageid);
    var info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!(id > 0) || !info || typeof info !== 'object' || info.mime !== 'image/jpeg') return null;
    var width = number(info.thumbwidth);
    var height = number(info.thumbheight);
    if (width < 960 || width > 1920 || height <= 0) return null;
    var ratio = width / height;
    if (ratio < 1.3 || ratio > 2.4) return null;
    var src = typeof info.thumburl === 'string' ? info.thumburl.split(/[?#]/)[0] : '';
    var pageUrl = typeof info.descriptionurl === 'string' ? info.descriptionurl : '';
    if (!THUMB.test(src) || src.length > 400 || !PAGE.test(pageUrl) || pageUrl.length > 400) return null;
    var meta = info.extmetadata;
    var license = checkLicense(htmlToText(metaValue(meta, 'LicenseShortName'), 60), metaValue(meta, 'LicenseUrl'));
    var author = authorOf(meta);
    if (!license || !author) return null;
    var title = plain(page.title.replace(/^File:/i, '').replace(/\.jpe?g$/i, ''), 90);
    var description = htmlToText(metaValue(meta, 'ImageDescription'), 160);
    if (!curated && UNWANTED.test(title + ' ' + description)) return null;
    return {
      id: id, src: src, width: width, height: height, title: title, author: author,
      license: license.license, licenseUrl: license.licenseUrl, page: pageUrl, description: description
    };
  }

  function validToken(token) {
    if (!token || typeof token.gcmcontinue !== 'string' || typeof token['continue'] !== 'string') return null;
    if (!TOKEN.test(token.gcmcontinue) || !TOKEN.test(token['continue'])) return null;
    return { gcmcontinue: token.gcmcontinue, 'continue': token['continue'] };
  }

  // Respuesta → { photos, next } o null si no es una respuesta válida (incluye error/maxlag).
  function parseResponse(body, curated, places) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.error) return null;
    var pages = body.query === undefined ? [] : body.query && body.query.pages;
    if (!Array.isArray(pages)) return null;
    var seen = {};
    var photos = [];
    pages.slice(0, 500).forEach(function (page) {
      var photo = parsePage(page, curated);
      if (!photo || seen[photo.id] || seen[photo.src]) return;
      seen[photo.id] = seen[photo.src] = true;
      if (places && typeof places[photo.id] === 'string') photo.place = plain(places[photo.id], 60);
      photos.push(photo);
    });
    return { photos: photos, next: validToken(body['continue']) };
  }

  function validConfig(config) {
    if (!config || typeof config.endpoint !== 'string' || config.endpoint.length > 2000) return null;
    if (!ENDPOINT.test(config.endpoint) || /[?&](?:gcmcontinue|continue)=/.test(config.endpoint)) return null;
    var count = Math.floor(Number(config.count));
    return { endpoint: config.endpoint, curated: /[?&]pageids=/.test(config.endpoint), places: config.places && typeof config.places === 'object' ? config.places : null, count: count >= 1 ? Math.min(count, MAX_COUNT) : MAX_COUNT };
  }

  // Solo agrega el token que la API devolvió; sin token, la primera página de la categoría.
  function buildUrl(endpoint, next) {
    next = validToken(next);
    if (!next) return endpoint;
    return endpoint + '&continue=' + encodeURIComponent(next['continue']) + '&gcmcontinue=' + encodeURIComponent(next.gcmcontinue);
  }

  function pad(value) { return (value < 10 ? '0' : '') + value; }
  // Día según la zona horaria de la TV (nunca toISOString, que es UTC).
  function localDay(ms) {
    var date = new Date(ms);
    if (isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }
  function msUntilNextDay(ms) {
    var date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - ms;
  }

  function spread(list, count) {
    if (list.length <= count) return list.slice();
    var out = [];
    for (var i = 0; i < count; i += 1) out.push(list[Math.floor(i * list.length / count)]);
    return out;
  }

  // Prefiere ≥ 1280 px y fotos que no estaban en la selección anterior; reparte entre autores y fechas.
  function choose(photos, count, previousIds) {
    var wide = photos.filter(function (photo) { return photo.width >= 1280; });
    var pool = wide.length >= count ? wide : photos;
    var fresh = pool.filter(function (photo) { return previousIds.indexOf(photo.id) === -1; });
    if (fresh.length >= count) return spread(fresh, count);
    return fresh.concat(pool.filter(function (photo) { return previousIds.indexOf(photo.id) !== -1; })).slice(0, count);
  }

  function copy(photo) {
    return {
      id: photo.id, src: photo.src, width: photo.width, height: photo.height, title: photo.title,
      author: photo.author, license: photo.license, licenseUrl: photo.licenseUrl, page: photo.page,
      description: photo.description, place: photo.place || ''
    };
  }

  // Metadata guardada: se vuelve a validar como si viniera de afuera.
  function cleanStored(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    var clean = [];
    list.slice(0, MAX_COUNT).forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      var id = number(entry.id);
      var license = checkLicense(entry.license, entry.licenseUrl);
      var author = plain(entry.author, 80);
      var width = number(entry.width);
      var height = number(entry.height);
      if (!(id > 0) || seen[id] || !license || !author || typeof entry.src !== 'string' || !THUMB.test(entry.src)) return;
      if (typeof entry.page !== 'string' || !PAGE.test(entry.page) || !(width > 0 && width <= 1920 && height > 0)) return;
      seen[id] = true;
      clean.push({
        id: id, src: entry.src, width: width, height: height, title: plain(entry.title, 90), author: author,
        license: license.license, licenseUrl: license.licenseUrl, page: entry.page, description: plain(entry.description, 160),
        place: plain(entry.place, 60)
      });
    });
    return clean;
  }

  // GET JSON por XHR con timeout. Llama done(error, body) una sola vez.
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

  // Controlador sin DOM. options: config, storage, onPhotos(list), request(url, timeout, done),
  // now(), isHidden(), setTimer, clearTimer.
  function createDailyPhotos(options) {
    var config = validConfig(options.config);
    var storage = options.storage || null;
    var now = options.now || function () { return Date.now(); };
    var isHidden = options.isHidden || function () { return false; };
    var request = options.request || requestJSON;
    var setTimer = options.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = options.clearTimer || function (id) { clearTimeout(id); };
    var state = readCache();
    var timer = null;
    var inFlight = false;
    var pendingBatch = null;

    function readCache() {
      var empty = { day: '', photos: [], next: null, failedAt: 0 };
      if (!config || !storage) return empty;
      try {
        var data = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
        if (!data || data.v !== 1) return empty;
        var photos = cleanStored(data.photos);
        // Si se descartó algo guardado, el día no cuenta como resuelto: se vuelve a consultar.
        var intact = Array.isArray(data.photos) && photos.length === Math.min(data.photos.length, MAX_COUNT);
        return {
          day: intact && typeof data.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : '',
          photos: photos,
          next: validToken(data.next),
          failedAt: number(data.failedAt)
        };
      } catch (error) { return empty; }
    }
    function writeCache() {
      if (!storage) return;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, day: state.day, photos: state.photos, next: state.next, failedAt: state.failedAt }));
      } catch (error) { /* sin persistencia: se vuelve a consultar en la próxima apertura */ }
    }
    function selection() { return state.photos.map(copy); }

    function schedule(ms) {
      if (timer !== null) clearTimer(timer);
      timer = null;
      if (isHidden()) return;
      timer = setTimer(function () { timer = null; refresh(); }, Math.max(1000, ms));
    }

    function refresh() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      if (!config || inFlight || isHidden()) return;
      var time = now();
      var today = localDay(time);
      if (state.day === today) { schedule(msUntilNextDay(time) + MIDNIGHT_PAD_MS); return; }
      var sinceFailure = time - state.failedAt;
      if (state.failedAt && sinceFailure >= 0 && sinceFailure < RETRY_MS) { schedule(RETRY_MS - sinceFailure); return; }
      fetchDay(today);
    }

    function fetchDay(today) {
      var used = 0;
      inFlight = true;
      function batch(token) {
        if (isHidden()) { pendingBatch = function () { batch(token); }; return; }
        var answered = false;
        used += 1;
        request(buildUrl(config.endpoint, token), TIMEOUT_MS, function (error, body) {
          if (answered) return;
          answered = true;
          var parsed = error ? null : parseResponse(body, config.curated, config.places);
          if (!parsed) { fail(); return; }
          if (!parsed.photos.length && parsed.next && used < MAX_REQUESTS) { batch(parsed.next); return; }
          succeed(today, parsed);
        });
      }
      batch(state.next);
    }

    function succeed(today, parsed) {
      inFlight = false;
      var chosen = choose(parsed.photos, config.count, state.photos.map(function (photo) { return photo.id; }));
      if (chosen.length) state.photos = chosen.map(copy);
      state.day = today;
      state.next = parsed.next; // sin continuación: mañana se vuelve a la primera página
      state.failedAt = 0;
      writeCache();
      if (chosen.length) options.onPhotos(selection());
      refresh();
    }

    // Red, API o maxlag: se conserva la selección y el token; un único reintento más tarde.
    function fail() {
      inFlight = false;
      state.failedAt = now();
      writeCache();
      schedule(RETRY_MS);
    }

    return {
      start: function () {
        if (!config) return;
        if (state.photos.length) options.onPhotos(selection());
        refresh();
      },
      visibilityChanged: function () {
        if (!config) return;
        if (isHidden()) {
          if (timer !== null) clearTimer(timer);
          timer = null;
          return;
        }
        if (pendingBatch) {
          var resume = pendingBatch;
          pendingBatch = null;
          resume();
          return;
        }
        refresh();
      },
      selection: selection,
      day: function () { return state.day; }
    };
  }

  function mount(config, onPhotos) {
    var storage = null;
    try { storage = window.localStorage; } catch (error) { storage = null; }
    var daily = createDailyPhotos({
      config: config,
      storage: storage,
      onPhotos: onPhotos,
      isHidden: function () { return document.hidden === true; }
    });
    document.addEventListener('visibilitychange', daily.visibilityChanged);
    daily.start();
    return daily;
  }

  window.LauncherDailyPhotos = {
    validConfig: validConfig,
    buildUrl: buildUrl,
    htmlToText: htmlToText,
    checkLicense: checkLicense,
    parsePage: parsePage,
    parseResponse: parseResponse,
    choose: choose,
    localDay: localDay,
    msUntilNextDay: msUntilNextDay,
    createDailyPhotos: createDailyPhotos,
    requestJSON: requestJSON,
    mount: mount,
    STORAGE_KEY: STORAGE_KEY,
    RETRY_MS: RETRY_MS
  };
}());
