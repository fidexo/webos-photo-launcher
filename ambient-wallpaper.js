// Solo fotos del launcher: no captura otras apps, video ni entradas HDMI.
(function (root) {
  'use strict';
  var SAMPLE_MS = 150;
  var RETRY_MS = 2000;
  var LOAD_TIMEOUT_MS = 8000;

  function colorFromPixels(data) {
    if (!data || !data.length || data.length % 4) return null;
    var bins = Object.create(null);
    var whites = Object.create(null);
    var useful = false;
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] < 128 || Math.max(r, g, b) <= 16) continue;
      var white = Math.min(r, g, b) >= 244;
      var target = white ? whites : bins;
      var key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
      var bin = target[key] || (target[key] = [0, 0, 0, 0]);
      bin[0] += r; bin[1] += g; bin[2] += b; bin[3]++;
      if (!white) useful = true;
    }
    // El promedio pertenece al grupo más frecuente; nunca se sustituye por una paleta.
    var choices = useful ? bins : whites;
    var best = null;
    Object.keys(choices).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (key) {
      if (!best || choices[key][3] > best[3]) best = choices[key];
    });
    return best ? [Math.round(best[0] / best[3]), Math.round(best[1] / best[3]), Math.round(best[2] / best[3])] : null;
  }

  function allowedSource(src) {
    if (typeof src !== 'string') return false;
    if (/^assets\/wallpapers\/\w[\w.-]*\.(?:jpe?g|png|webp)$/i.test(src)) return true;
    if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) return true;
    if (!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/[\w\/.~%!$*(),;:@'+-]+\.(?:jpe?g|png|webp)$/i.test(src)) return false;
    try { return !/(?:^|\/)\.\.(?:\/|$)|\\/.test(decodeURIComponent(src)); }
    catch (error) { return false; }
  }

  function loadColor(src) {
    var cancel = function () {};
    var pending = new Promise(function (resolve, reject) {
      if (!allowedSource(src)) { reject(new Error('Fuente de fondo no permitida.')); return; }
      var image = null, timer = null, done = false;
      function finish(error, color) {
        if (done) return;
        done = true;
        if (timer !== null) root.clearTimeout(timer);
        if (image) { image.onload = null; image.onerror = null; }
        if (error) reject(error); else resolve(color);
      }
      cancel = function () { finish(null, null); };
      try {
        image = new root.Image();
        if (/^https:/.test(src)) image.crossOrigin = 'anonymous';
        image.onload = function () {
          if (done) return;
          try {
            var canvas = root.document.createElement('canvas');
            canvas.width = 32; canvas.height = 18;
            var context = canvas.getContext('2d');
            if (!context) throw new Error('No se pudo leer el fondo.');
            context.drawImage(image, 0, 0, 32, 18);
            finish(null, colorFromPixels(context.getImageData(0, 0, 32, 18).data));
          } catch (error) { finish(error); } // Incluye SecurityError de CORS; no exporta imágenes.
        };
        image.onerror = function () { finish(new Error('No se pudo cargar el fondo.')); };
        timer = root.setTimeout(function () { finish(new Error('Se agotó el tiempo de carga del fondo.')); }, LOAD_TIMEOUT_MS);
        image.src = src;
      } catch (error) { finish(error); }
    });
    // Cancelación cooperativa de nuestro loader; Promises externos se invalidan lógicamente.
    pending.cancel = function () { cancel(); };
    return pending;
  }

  function validColor(color) {
    return Array.isArray(color) && color.length === 3 && color.every(function (value) {
      return typeof value === 'number' && isFinite(value) && value >= 0 && value <= 255 && Math.floor(value) === value;
    });
  }

  function selectedIds(ids) {
    if (ids === undefined) return undefined;
    if (!Array.isArray(ids)) return [];
    return ids.filter(function (id, index) {
      return typeof id === 'string' && id.trim().length > 0 && ids.indexOf(id) === index;
    });
  }

  function sameIds(a, b) {
    if (a === undefined || b === undefined) return a === b;
    return a.length === b.length && a.every(function (id, index) { return id === b[index]; });
  }

  function create(options) {
    options = options || {};
    var setTimer = options.setTimer || function (fn, ms) { return root.setTimeout(fn, ms); };
    var clearTimer = options.clearTimer || function (timer) { root.clearTimeout(timer); };
    var sample = options.loadColor || loadColor;
    var hidden = options.isHidden || function () { return !!(root.document && root.document.hidden); };
    var active = false, suspended = false, generation = 0, ids;
    var current = null, timer = null, writing = false, queued = null;
    var reported = Object.create(null);

    function report(url, error) {
      var key = url || '';
      if (reported[key]) return;
      reported[key] = true;
      if (typeof options.onError === 'function') {
        try { options.onError(error, url); } catch (ignored) { /* Un aviso no reinicia el modo. */ }
      }
    }
    function source() {
      try {
        var value = options.source && options.source();
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      } catch (error) { report(null, error); return null; }
    }
    function invalidate() {
      generation++;
      if (timer !== null) { clearTimer(timer); timer = null; }
      var old = current;
      current = null; queued = null;
      if (old && old.load && typeof old.load.cancel === 'function') {
        try { old.load.cancel(); } catch (ignored) { /* La generación anterior ya no puede actuar. */ }
      }
    }
    function pause() { suspended = true; invalidate(); }
    function live(job) {
      if (!active || suspended || current !== job || job.generation !== generation) return false;
      if (hidden()) { pause(); return false; }
      if (source() !== job.url) { refresh(); return false; }
      return true;
    }
    function schedule(job, delay) {
      timer = setTimer(function () {
        if (!live(job)) return;
        timer = null; attempt(job);
      }, delay);
    }
    function failed(job, error) {
      if (!live(job)) return;
      report(job.url, error || new Error('No se pudo acompañar el fondo.'));
      if (live(job) && job.attempts < 2) schedule(job, RETRY_MS);
    }
    function drain() {
      if (writing || !queued) return;
      var job = queued;
      queued = null;
      if (!live(job)) return;
      writing = true;
      function finish(error) {
        writing = false;
        if (live(job)) {
          if (error) failed(job, error);
        }
        drain();
      }
      try {
        Promise.resolve(options.send(job.color.slice(), job.ids && job.ids.slice())).then(function () {
          finish(null);
        }, function (error) { finish(error || new Error('No se pudo confirmar el envío de color.')); });
      } catch (error) { finish(error || new Error('No se pudo enviar el color.')); }
    }
    function ready(job, color) {
      if (!live(job)) return;
      job.load = null;
      if (!validColor(color)) { failed(job, new Error('El fondo no tiene un color utilizable.')); return; }
      job.color = color.slice(); queued = job; drain();
    }
    function attempt(job) {
      if (!live(job)) return;
      job.attempts++;
      if (job.color) { queued = job; drain(); return; }
      try {
        job.load = sample(job.url);
        Promise.resolve(job.load).then(function (color) { ready(job, color); }, function (error) {
          if (live(job)) { job.load = null; failed(job, error); }
        });
      } catch (error) { failed(job, error); }
    }
    function refresh() {
      if (!active) return;
      if (hidden()) { if (!suspended) pause(); return; }
      suspended = false;
      var url = source();
      if (current && current.url === url) return;
      invalidate();
      if (!url) return;
      current = { url: url, generation: generation, ids: ids && ids.slice(), color: null, attempts: 0, load: null };
      schedule(current, SAMPLE_MS);
    }
    function start(selection) {
      var next = selectedIds(selection);
      if (next && !next.length) { stop(); return; }
      if (active && sameIds(ids, next)) { refresh(); return; }
      invalidate(); ids = next; active = true; suspended = false; refresh();
    }
    function stop() { active = false; suspended = false; invalidate(); }
    return { start: start, stop: stop, refresh: refresh, visibilityChanged: refresh };
  }

  root.LauncherAmbient = { colorFromPixels: colorFromPixels, loadColor: loadColor, create: create };
}(window));
