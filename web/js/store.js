/* BoyGames shared IAP bridge (Get Clocked + Liverpool Rummy).
 *
 * Exposes window.BoyGames.store. The future native wrapper injects
 * window.BoyGamesNative (see STORE.md for the bridge contract).
 *
 * Web fallback (no native bridge):
 *   - getProducts() returns a fixed demo catalog with a fixed price.
 *   - purchase() flips the local entitlement ONLY in ?dev=1 demo mode;
 *     on the real web build it is a no-op (no billing on web).
 *   - restore() returns whatever is cached in localStorage.
 */
"use strict";
(function () {
  var BG = window.BoyGames || (window.BoyGames = {});
  var PRODUCT_REMOVE_ADS = "boygames.getclocked.remove_ads";
  var LS_KEY = "boygames.getclocked.entitlements"; // JSON: {remove_ads: true}
  var DEV = /[?&]dev=1(?:&|$)/.test(location.search);

  function readEnt() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function writeEnt(ent) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(ent)); } catch (e) {}
  }
  function nativeStore() {
    var n = window.BoyGamesNative;
    return (n && n.store) || null;
  }

  var store = {
    PRODUCT_REMOVE_ADS: PRODUCT_REMOVE_ADS,

    /* sync read from the localStorage entitlement cache */
    isOwned: function (productId) {
      var ent = readEnt();
      if (productId === PRODUCT_REMOVE_ADS) return !!ent.remove_ads;
      return !!ent[productId];
    },

    /* -> Promise<[{id, title, price}]>; price is a localized store string */
    getProducts: function () {
      var ns = nativeStore();
      if (ns && typeof ns.getProducts === "function") return ns.getProducts();
      // WEB FALLBACK (demo): fixed catalog, fixed price. No real billing.
      return Promise.resolve([
        { id: PRODUCT_REMOVE_ADS, title: "Remove Ads", price: "$2.99" }
      ]);
    },

    /* -> Promise<{owned: bool}> */
    purchase: function (productId) {
      var ns = nativeStore();
      if (ns && typeof ns.purchase === "function") return ns.purchase(productId);
      // WEB FALLBACK (demo): ?dev=1 flips the entitlement so the flow can be
      // tested end-to-end without a store. Otherwise a no-op.
      if (DEV && productId === PRODUCT_REMOVE_ADS) {
        var ent = readEnt();
        ent.remove_ads = true;
        writeEnt(ent);
        return Promise.resolve({ owned: true });
      }
      return Promise.resolve({ owned: store.isOwned(productId) });
    },

    /* -> Promise<{ownedIds: []}> */
    restore: function () {
      var ns = nativeStore();
      if (ns && typeof ns.restore === "function") return ns.restore();
      // WEB FALLBACK: entitlements are whatever is cached locally.
      var ent = readEnt();
      return Promise.resolve({ ownedIds: ent.remove_ads ? [PRODUCT_REMOVE_ADS] : [] });
    }
  };
  /* live check: the wrapper may inject BoyGamesNative after page load */
  Object.defineProperty(store, "isNative", {
    get: function () { return !!nativeStore(); },
    enumerable: true
  });

  BG.store = store;
})();
