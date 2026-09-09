/*
 * db-storage.js — substitui o localStorage do app por um armazenamento em SQLite.
 *
 * Precisa ser carregado ANTES dos scripts do app. O nome do app vem do atributo
 * data-app da própria tag <script>:
 *
 *   <script src="../shared/db-storage.js" data-app="orcafarma"></script>
 *
 * A interface é a mesma do localStorage (getItem/setItem/removeItem/clear/key/length),
 * então o código existente de cada app funciona sem alteração.
 */
(function () {
  'use strict';

  var scriptEl = document.currentScript;
  var APP = (scriptEl && scriptEl.getAttribute('data-app')) || 'desconhecido';

  if (!window.api || typeof window.api.appGet !== 'function') {
    // A ponte com o banco não subiu (corrida na criação do iframe).
    // NUNCA cair de volta no localStorage do navegador em silêncio: o app acharia
    // que salvou, mas o dado ficaria fora do banco e fora do backup.
    // Falha barulhenta — o hub detecta pelo __dbStorageActive e recria o frame.
    console.error('[db-storage] ponte com o banco indisponível — bloqueando gravação para não perder dado.');
    window.__dbStorageActive = false;
    var erro = function () { throw new Error('Armazenamento indisponível: a ponte com o banco de dados não foi carregada.'); };
    try {
      Object.defineProperty(window, 'localStorage', {
        value: { getItem: erro, setItem: erro, removeItem: erro, clear: erro, key: erro, length: 0 },
        configurable: true
      });
    } catch (e) { /* se nem isso der, o hub ainda barra pelo __dbStorageActive */ }
    return;
  }

  // Cache de leitura: evita ida ao processo principal a cada getItem.
  // Toda escrita atualiza o cache junto, então nunca fica defasado.
  var cache = Object.create(null);
  var cacheLoaded = false;

  function primeCache() {
    if (cacheLoaded) return;
    try {
      var keys = window.api.appKeys(APP) || [];
      for (var i = 0; i < keys.length; i++) {
        cache[keys[i]] = window.api.appGet(APP, keys[i]);
      }
    } catch (e) {
      console.error('[db-storage] falha ao carregar estado inicial', e);
    }
    cacheLoaded = true;
  }

  var store = {
    getItem: function (key) {
      primeCache();
      var k = String(key);
      var v = cache[k];
      return v === undefined ? null : v;
    },
    setItem: function (key, value) {
      primeCache();
      var k = String(key);
      var v = String(value);
      var ok = window.api.appSet(APP, k, v);
      if (!ok) throw new Error('Falha ao gravar no banco de dados');
      cache[k] = v;
    },
    removeItem: function (key) {
      primeCache();
      var k = String(key);
      window.api.appRemove(APP, k);
      delete cache[k];
    },
    clear: function () {
      primeCache();
      Object.keys(cache).forEach(function (k) { window.api.appRemove(APP, k); });
      cache = Object.create(null);
    },
    key: function (i) {
      primeCache();
      var keys = Object.keys(cache);
      return i >= 0 && i < keys.length ? keys[i] : null;
    }
  };

  Object.defineProperty(store, 'length', {
    get: function () { primeCache(); return Object.keys(cache).length; }
  });

  try {
    Object.defineProperty(window, 'localStorage', {
      value: store,
      configurable: true,
      writable: false
    });
    window.__dbStorageActive = APP;
  } catch (e) {
    // Se não der para substituir, o app segue no localStorage do navegador.
    // A tela de Dados do hub sinaliza isso para não passar falsa segurança.
    console.error('[db-storage] não foi possível substituir o localStorage', e);
    window.__dbStorageActive = false;
  }
})();
