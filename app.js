(function () {
  'use strict';
  var defaults = window.LAUNCHER_CONFIG;
  var onTV = !!window.PalmSystem;
  document.documentElement.classList.toggle('is-tv', onTV);
  var bridge = window.createTVBridge(window.webOS, onTV);
  var storageKey = 'mi-pantalla-layout-v1';
  var items = defaults.map(function (item) { return Object.assign({}, item, { visible: true }); });
  var installed = {};
  var editing = false;
  var busy = false;
  var status = document.getElementById('status');
  var panel = document.getElementById('manage-panel');
  var editButton = document.getElementById('edit-button');
  var auras = Array.prototype.slice.call(document.querySelectorAll('.aura'));
  var activeAura = -1;
  var lastFocus = null;
  var lastFocusKey = null;
  var current = null;
  var focusMessage = '';
  var sayTimer = null;
  var weather = null;
  var backgrounds = null;
  var transitions = window.LauncherTransitions ? window.LauncherTransitions.mount(window.LAUNCHER_TRANSITIONS) : null;
  var sourcesOpen = false;

  // Mensajes breves: el inicio queda limpio salvo errores o acciones en curso.
  function say(message, lingerMs) {
    clearTimeout(sayTimer);
    status.textContent = message || '';
    if (message && lingerMs) sayTimer = setTimeout(function () { status.textContent = ''; }, lingerMs);
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items.map(function (item) {
        return { key: item.key, visible: item.visible };
      })));
    } catch (error) { say('La selección funciona, pero no se pudo guardar en este dispositivo.'); }
  }
  try {
    var stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(stored)) {
      var ordered = [];
      stored.forEach(function (entry) {
        var item = items.filter(function (candidate) { return candidate.key === entry.key; })[0];
        if (item && !ordered.some(function (candidate) { return candidate.key === item.key; })) {
          item.visible = entry.visible !== false;
          ordered.push(item);
        }
      });
      // Accesos nuevos (Transitions en 0.4): visibles, después del último de su tipo.
      items.forEach(function (item) {
        if (ordered.indexOf(item) !== -1) return;
        var at = -1;
        ordered.forEach(function (candidate, index) { if (candidate.kind === item.kind) at = index; });
        ordered.splice(at + 1, 0, item);
      });
      items = ordered;
    }
  } catch (error) { say('Se cargó tu selección inicial porque los ajustes guardados no son legibles.'); }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    node.className = className || '';
    if (text) node.textContent = text;
    return node;
  }
  function logo(item, className) {
    var image = element('img', className);
    image.src = item.logo;
    image.alt = '';
    image.setAttribute('draggable', 'false');
    return image;
  }
  function itemByKey(key) {
    return items.filter(function (item) { return item.key === key; })[0] || null;
  }

  // Estado de disponibilidad: true/false confirmados por la TV; cualquier otro valor sigue siendo desconocido.
  // En el inicio solo se señala el caso confirmado como ausente; nada se marca "disponible" sin verificar.
  function availabilityState(item) {
    if (!onTV) return 'preview';
    return installed[item.key] === true ? 'ok' : installed[item.key] === false ? 'missing' : 'unknown';
  }
  function missingMessage(item) {
    if (item.action === 'transitions') return 'Transitions necesita YouTube, que no está instalada con el identificador configurado.';
    return item.title + ' no está instalada con el identificador configurado.';
  }
  function labelFor(item) { return item.title + (availabilityState(item) === 'missing' ? ', no encontrada' : ''); }

  // Transitions: el episodio se elige recién al pulsar OK (nunca al enfocar) y se abre en YouTube.
  function openTransitions(item) {
    if (onTV && installed[item.key] === false) { say(missingMessage(item)); return; }
    var episode = transitions ? transitions.next() : null;
    if (!episode) { say('No hay episodios de Transitions configurados para elegir.', 6000); return; }
    var name = episode.title + (episode.duration ? ' (' + episode.duration + ')' : '');
    if (!onTV) {
      say('Vista previa: se abriría ' + name + ' en YouTube cuando se pruebe en la TV.', 8000);
      return;
    }
    busy = true;
    say('Abriendo ' + name + ' en YouTube…', 8000);
    bridge.launchYouTubeVideo(episode.videoId).then(function () {
      busy = false;
      say('');
    }, function (error) { busy = false; say('No se pudo abrir ' + episode.title + ' en YouTube: ' + error.message); });
  }

  function openItem(item) {
    if (busy) return;
    if (item.action === 'transitions') { openTransitions(item); return; }
    if (!onTV) {
      say('Vista previa: este acceso abrirá ' + item.title + ' cuando se pruebe en la TV.', 6000);
      return;
    }
    if (installed[item.key] === false) {
      say(missingMessage(item));
      return;
    }
    busy = true;
    say('Abriendo ' + item.title + '…', 8000);
    bridge.launch(item.appId).then(function () {
      busy = false;
      say('');
    }, function (error) { busy = false; say('No se pudo abrir ' + item.title + ': ' + error.message); });
  }

  // ---------- Presentación: halo de color del foco ----------
  function setAura(color) {
    if (onTV || !auras.length) return;
    var next = activeAura === 0 ? 1 : 0;
    if (!auras[next]) next = 0;
    auras[next].style.background =
      'radial-gradient(ellipse 58% 62% at 30% 88%, ' + color + ', transparent 70%),' +
      'radial-gradient(ellipse 40% 45% at 88% 100%, ' + color + ', transparent 70%)';
    auras.forEach(function (layer, index) { layer.classList.toggle('is-on', index === next); });
    activeAura = next;
  }
  // Al enfocar una app confirmada como ausente se explica el error; al salir de ella se limpia.
  function explainFocus(item) {
    if (focusMessage && status.textContent === focusMessage) say('');
    focusMessage = '';
    if (item && availabilityState(item) === 'missing') {
      focusMessage = missingMessage(item);
      say(focusMessage);
    }
  }
  function showFocus(target) {
    if (!target || target === current) return;
    if (current) current.classList.remove('is-current');
    current = target;
    current.classList.add('is-current');
    if (editing) return;
    var item = target.dataset && target.dataset.id ? itemByKey(target.dataset.id) : null;
    explainFocus(item);
    setAura(item ? item.color : '#5d7dff');
  }
  document.addEventListener('focusin', function (event) {
    if (event.target && event.target.tagName === 'BUTTON') showFocus(event.target);
  });

  // ---------- Inicio: solo íconos; el nombre queda en aria-label ----------
  function tileFor(item) {
    var tile = element('button', 'tile');
    tile.type = 'button';
    tile.dataset.id = item.key;
    tile.setAttribute('data-state', availabilityState(item));
    tile.setAttribute('aria-label', labelFor(item));
    tile.style.setProperty('--tile-color', item.color);
    tile.appendChild(element('span', 'tile-glow'));
    var glass = element('span', 'tile-glass');
    glass.appendChild(element('span', 'tile-tint'));
    glass.appendChild(logo(item, 'tile-logo'));
    glass.appendChild(element('span', 'tile-ring'));
    tile.appendChild(glass);
    var note = element('span', 'tile-note', 'No encontrada');
    note.setAttribute('aria-hidden', 'true');
    tile.appendChild(note);
    tile.addEventListener('click', function () { openItem(item); });
    return tile;
  }

  function render() {
    var grids = { app: document.getElementById('apps-grid'), input: document.getElementById('inputs-grid') };
    grids.app.textContent = '';
    grids.input.textContent = '';
    items.filter(function (item) { return item.visible; }).forEach(function (item) {
      grids[item.kind].appendChild(tileFor(item));
    });
    var hasInputs = grids.input.children.length > 0;
    document.getElementById('empty-state').hidden = grids.app.children.length > 0;
    document.querySelector('.dock-inputs').hidden = !hasInputs;
    document.querySelector('.dock-divider').hidden = !hasInputs;
    if (editing) renderManager();
    if (backgrounds) backgrounds.layout(); // el dock cambió de tamaño: realinear el vidrio
  }

  function updateAvailability(item) {
    var tile = document.querySelector('.tile[data-id="' + item.key + '"]');
    if (!tile) return;
    tile.setAttribute('data-state', availabilityState(item));
    tile.setAttribute('aria-label', labelFor(item));
    if (tile === current && !editing) explainFocus(item);
  }

  // ---------- Personalizar ----------
  function managerButton(className, label, action) {
    var button = element('button', className);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.addEventListener('click', action);
    return button;
  }

  function renderManager(focusKey) {
    var list = document.getElementById('manage-list');
    list.textContent = '';
    items.forEach(function (item, index) {
      var row = element('div', 'manage-row' + (item.visible ? '' : ' is-hidden'));
      var badge = element('span', 'manage-logo');
      badge.style.setProperty('--tile-color', item.color);
      badge.appendChild(logo(item, ''));
      row.appendChild(badge);
      var name = element('span', 'manage-name', item.title);
      name.appendChild(element('small', '', (item.kind === 'input' ? 'Entrada' : 'Aplicación') + ' · ' + (item.visible ? 'En el inicio' : 'Oculta')));
      row.appendChild(name);

      var toggle = managerButton('switch-button', (item.visible ? 'Ocultar ' : 'Mostrar ') + item.title, function () {
        item.visible = !item.visible;
        save(); render(); renderManager(item.key);
      });
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', item.visible ? 'true' : 'false');
      toggle.dataset.toggle = item.key;
      var track = element('span', 'switch');
      track.appendChild(element('span', 'switch-knob'));
      toggle.appendChild(track);
      toggle.appendChild(element('span', 'switch-label', item.visible ? 'Visible' : 'Oculta'));
      row.appendChild(toggle);

      var earlier = items.slice(0, index).filter(function (candidate) { return candidate.kind === item.kind; }).pop();
      var move = managerButton('move-button', 'Mover ' + item.title + ' antes', function () {
        var other = items.indexOf(earlier);
        items[other] = item; items[index] = earlier;
        save(); render(); renderManager(item.key);
      });
      move.appendChild(element('span', 'chevron'));
      move.disabled = !earlier;
      row.appendChild(move);
      list.appendChild(row);
    });
    if (focusKey) list.querySelector('[data-toggle="' + focusKey + '"]').focus();
  }

  // Fuentes: créditos completos de la foto a la vista y servicios del inicio, como texto plano.
  function renderSources() {
    var view = document.getElementById('sources-view');
    view.textContent = '';
    var entry = backgrounds ? backgrounds.current() : null;
    var rows = entry ? window.LauncherBackgrounds.sourceDetails(entry) : [];
    rows.concat([
      ['Fotos', 'Cada día, una selección de paisajes destacados de Wikimedia Commons; sin conexión, las fotos incluidas.'],
      ['Clima', 'Open-Meteo'],
      ['Transitions', 'Episodios de la lista oficial de John Digweed en YouTube · Ícono: Bedrock Records (bedrock.org.uk).'],
      ['Luces', 'Lámparas WiZ por la red local, mediante el servicio de luces de la tele.']
    ]).forEach(function (pair) {
      var row = element('p', 'source-row');
      row.appendChild(element('span', 'source-label', pair[0]));
      row.appendChild(element('span', 'source-value', pair[1]));
      view.appendChild(row);
    });
  }
  function showSources(value) {
    sourcesOpen = value;
    document.getElementById('manage-list').hidden = value;
    document.getElementById('sources-view').hidden = !value;
    document.getElementById('reset-button').hidden = value;
    document.getElementById('manage-title').textContent = value ? 'Fuentes' : 'Tu fila de apps';
    document.querySelector('.manage-description').textContent = value
      ? 'Créditos de la foto a la vista y servicios que usa el inicio.'
      : 'Ocultar una app acá no la desinstala de la tele.';
    var button = document.getElementById('sources-button');
    button.textContent = value ? 'Apps' : 'Fuentes';
    if (value) renderSources();
  }
  document.getElementById('sources-button').addEventListener('click', function () {
    showSources(!sourcesOpen);
    document.getElementById('sources-button').focus();
  });

  function setEditing(value) {
    editing = value;
    if (!value) showSources(false);
    panel.hidden = !value;
    document.body.classList.toggle('is-editing', value);
    if (value) {
      lastFocus = document.activeElement;
      lastFocusKey = lastFocus && lastFocus.dataset ? lastFocus.dataset.id || null : null;
      renderManager();
      panel.querySelector('button').focus();
      panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      // Las tarjetas se regeneran al editar: volver a la misma app aunque su botón sea nuevo.
      var target = lastFocusKey ? document.querySelector('.tile[data-id="' + lastFocusKey + '"]') : null;
      if (!target && lastFocus && document.body.contains(lastFocus)) target = lastFocus;
      if (!target) target = document.querySelector('.tile') || editButton;
      current = null;
      target.focus();
      showFocus(target);
    }
  }
  editButton.addEventListener('click', function () { setEditing(true); });
  document.getElementById('done-button').addEventListener('click', function () { setEditing(false); });
  document.getElementById('reset-button').addEventListener('click', function () {
    items = defaults.map(function (item) { return Object.assign({}, item, { visible: true }); });
    save(); render(); document.getElementById('reset-button').focus();
    say('Se restauraron los accesos y el orden inicial.', 5000);
  });

  // ---------- Control remoto ----------
  function moveFocus(key) {
    var active = document.activeElement;
    // En TV el dock es una sola fila y render() sólo monta los íconos visibles.
    // Izquierda/derecha no necesitan medir el vidrio mientras se está animando.
    if (onTV && !editing && active && active.classList.contains('tile') && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      var row = Array.prototype.slice.call(document.querySelectorAll('.dock button:not([disabled])'));
      var at = row.indexOf(active);
      var next = at + (key === 'ArrowRight' ? 1 : -1);
      if (at !== -1 && row[next]) row[next].focus();
      return;
    }
    var scope = editing ? panel : document;
    var selector = editing ? 'button:not([disabled])' : '.dock button:not([disabled]), .top-actions button:not([disabled])';
    var buttons = Array.prototype.slice.call(scope.querySelectorAll(selector)).filter(function (button) {
      return button.getClientRects().length > 0;
    });
    if (buttons.indexOf(active) === -1) { if (buttons[0]) buttons[0].focus(); return; }
    var origin = active.getBoundingClientRect();
    var x = origin.left + origin.width / 2;
    var y = origin.top + origin.height / 2;
    var best = null;
    var score = Infinity;
    buttons.forEach(function (button) {
      if (button === active) return;
      var rect = button.getBoundingClientRect();
      var dx = rect.left + rect.width / 2 - x;
      var dy = rect.top + rect.height / 2 - y;
      var forward = key === 'ArrowRight' ? dx : key === 'ArrowLeft' ? -dx : key === 'ArrowDown' ? dy : -dy;
      var cross = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
      if (forward > 3 && forward + cross * 4 < score) { best = button; score = forward + cross * 4; }
    });
    if (best) {
      best.focus();
      // El dock de TV ya entra completo: desplazarlo tras focus fuerza otro layout.
      if (!onTV || editing || !best.classList.contains('tile')) best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  document.addEventListener('keydown', function (event) {
    var key = event.key;
    if (editing && key === 'Tab') {
      var controls = Array.prototype.slice.call(panel.querySelectorAll('button:not([disabled])'));
      var index = controls.indexOf(document.activeElement);
      if (event.shiftKey && index === 0) { event.preventDefault(); controls[controls.length - 1].focus(); }
      else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
    }
    if (/^Arrow(Left|Right|Up|Down)$/.test(key)) { event.preventDefault(); moveFocus(key); }
    if (key === 'Escape' || event.keyCode === 461) {
      if (editing) { event.preventDefault(); setEditing(false); }
      else if (onTV && window.webOS && window.webOS.platformBack) window.webOS.platformBack();
    }
  });

  function updateClock() {
    var now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('date').textContent = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  document.querySelector('.preview-label').hidden = onTV;
  render(); updateClock();
  // Fondos y clima son módulos opcionales: si faltan, el inicio sigue funcionando.
  if (window.LauncherBackgrounds) {
    // La metadata cacheada se entrega sincrónicamente: usarla en la primera carga.
    // Las novedades de Commons llegan después y reemplazan la galería en segundo plano.
    var initialPhotos = [];
    if (window.LauncherDailyPhotos) {
      window.LauncherDailyPhotos.mount(window.LAUNCHER_DAILY_PHOTOS, function (photos) {
        if (backgrounds) backgrounds.replace(photos);
        else initialPhotos = photos;
      });
    }
    backgrounds = window.LauncherBackgrounds.mount({
      stage: document.querySelector('.stage'),
      images: Array.prototype.slice.call(document.querySelectorAll('.wallpaper-layer')),
      frosts: Array.prototype.slice.call(document.querySelectorAll('.frost-layer')),
      frostHost: document.querySelector('.dock-frost'),
      credit: document.getElementById('photo-credit'),
      fallback: 'assets/wallpaper.svg',
      initialList: initialPhotos,
      onShow: function () {
        if (sourcesOpen) renderSources();
        if (window.LAUNCHER_LIGHTS_CLIENT && window.LAUNCHER_LIGHTS_CLIENT.refreshAmbient) window.LAUNCHER_LIGHTS_CLIENT.refreshAmbient();
      }
    });
  }
  if (window.LauncherWeather) weather = window.LauncherWeather.mount(document.getElementById('weather'), window.LAUNCHER_WEATHER);
  // Luces WiZ: el cliente del servicio (window.LAUNCHER_LIGHTS_CLIENT) se busca al abrir el panel;
  // sin cliente, el panel explica que el control no está instalado. Sin módulo, el botón sigue oculto.
  if (window.createLightsClient) {
    window.LAUNCHER_LIGHTS_CLIENT = window.createLightsClient(window.webOS, onTV, {
      source: function () { var entry = backgrounds ? backgrounds.current() : null; return entry && entry.src || null; },
      onAmbientError: function (error) { say('Luces: ' + error.message,8000); }
    });
    document.addEventListener('visibilitychange',function () {
      if (window.LAUNCHER_LIGHTS_CLIENT.visibilityChanged) window.LAUNCHER_LIGHTS_CLIENT.visibilityChanged();
    });
  }
  if (window.LauncherLights) {
    window.LauncherLights.mount({
      host: document.getElementById('lights-panel'),
      button: document.getElementById('lights-button'),
      client: function () { return window.LAUNCHER_LIGHTS_CLIENT || null; },
      initialIds: window.LAUNCHER_LIGHTS && window.LAUNCHER_LIGHTS.selectedIds,
      say: say
    });
  }
  setInterval(function () {
    updateClock();
    if (weather) weather.tick(); // reetiqueta un dato que envejece aunque no haya red
  }, 30000);
  var firstTile = document.querySelector('.tile') || editButton;
  firstTile.focus();
  showFocus(firstTile);
  if (!onTV) say('Vista previa: probá las flechas, OK (Enter) y Atrás (Escape).', 8000);
  if (onTV) items.forEach(function (item) {
    bridge.isInstalled(item.appId).then(function (result) {
      installed[item.key] = result;
      updateAvailability(item);
    });
  });
}());
