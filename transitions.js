// Transitions de John Digweed: elige un episodio al azar de transitions-config.js
// (window.LAUNCHER_TRANSITIONS). Solo datos: no abre nada; app.js decide cuándo usar el elegido
// y bridge.js lo envía a YouTube. Nunca se elige al enfocar ni al cargar, solo al pedir next().
(function () {
  'use strict';
  var STORAGE_KEY = 'mi-pantalla-transitions-last-v1';
  var VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  var WATCH_URL = 'https://www.youtube.com/watch?v=';

  function text(value, max) {
    if (typeof value !== 'string') return '';
    var clean = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
  }

  // Acepta solo episodios con ID de YouTube válido, título y URL coherente con ese ID.
  function cleanList(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    var clean = [];
    list.forEach(function (entry) {
      if (!entry || typeof entry.videoId !== 'string' || !VIDEO_ID.test(entry.videoId) || seen[entry.videoId]) return;
      var title = text(entry.title, 90);
      if (!title) return;
      if (entry.url !== undefined && entry.url !== WATCH_URL + entry.videoId) return;
      seen[entry.videoId] = true;
      clean.push({
        videoId: entry.videoId,
        title: title,
        source: text(entry.source, 40),
        duration: /^\d{1,2}(?::\d{2}){1,2}$/.test(entry.duration) ? entry.duration : ''
      });
    });
    return clean;
  }

  // Uniforme entre los episodios distintos del último; con uno solo, ese mismo.
  function pick(list, lastId, random) {
    if (!list.length) return null;
    var pool = list.length > 1 ? list.filter(function (entry) { return entry.videoId !== lastId; }) : list;
    var value = Number(random());
    if (!(value >= 0 && value < 1)) value = 0;
    return pool[Math.floor(value * pool.length)];
  }

  // options: list, storage, random(). La memoria del último episodio es opcional.
  function createPicker(options) {
    var list = cleanList(options.list);
    var storage = options.storage || null;
    var random = options.random || Math.random;
    var last = null;
    function readLast() {
      if (last !== null) return last;
      try {
        var stored = storage ? storage.getItem(STORAGE_KEY) : null;
        if (typeof stored === 'string' && VIDEO_ID.test(stored)) return stored;
      } catch (error) { /* sin almacenamiento: se recuerda solo en memoria */ }
      return last;
    }
    return {
      count: function () { return list.length; },
      next: function () {
        var chosen = pick(list, readLast(), random);
        if (!chosen) return null;
        last = chosen.videoId;
        try { if (storage) storage.setItem(STORAGE_KEY, chosen.videoId); } catch (error) { /* queda en memoria */ }
        return { videoId: chosen.videoId, title: chosen.title, source: chosen.source, duration: chosen.duration };
      }
    };
  }

  function mount(list) {
    var storage = null;
    try { storage = window.localStorage; } catch (error) { storage = null; }
    return createPicker({ list: list, storage: storage });
  }

  window.LauncherTransitions = {
    cleanList: cleanList,
    pick: pick,
    createPicker: createPicker,
    mount: mount,
    STORAGE_KEY: STORAGE_KEY
  };
}());
