/* BoyGames native bridge shim — source of truth: <native-repo>/plugins/native-bridge-shim.js
 *
 * Builds `window.BoyGamesNative` from the Capacitor plugin "BoyGamesNative".
 * Injection paths (both idempotent — re-running just redefines the object):
 *   1. iOS: the Swift plugin injects this file into the WKWebView at
 *      document-start, before any page script runs (see BoyGamesNativePlugin.swift).
 *   2. Both platforms: `sync-web.sh` copies this file to web/js/native-bridge.js
 *      and adds a <script> tag before the app's main script in the snapshot.
 *
 * The web apps (js/store.js, js/ads.js, js/haptics.js) detect
 * window.BoyGamesNative at call time, so even a late injection degrades
 * gracefully. Contract: see STORE.md in the website repo.
 */
(function () {
  "use strict";

  function plugin() {
    var C = window.Capacitor;
    if (!C) return null;
    if (C.Plugins && C.Plugins.BoyGamesNative) return C.Plugins.BoyGamesNative;
    if (typeof C.registerPlugin === "function") {
      try { return C.registerPlugin("BoyGamesNative"); } catch (e) { return null; }
    }
    return null;
  }

  function call(method, data) {
    var p = plugin();
    if (!p || typeof p[method] !== "function") return Promise.resolve(null);
    try { return Promise.resolve(p[method](data || {})); }
    catch (e) { return Promise.resolve(null); }
  }

  window.BoyGamesNative = {
    store: {
      /* -> Promise<[{id, title, price}]> (price = localized store string) */
      getProducts: function () {
        return call("getProducts").then(function (r) { return (r && r.products) || []; });
      },
      /* -> Promise<{owned: bool}> — cancel/pending resolves {owned:false}, never throws */
      purchase: function (productId) {
        return call("purchase", { productId: productId })
          .then(function (r) { return { owned: !!(r && r.owned) }; });
      },
      /* -> Promise<{ownedIds: string[]}> */
      restore: function () {
        return call("restore")
          .then(function (r) { return { ownedIds: (r && r.ownedIds) || [] }; });
      }
    },
    ads: {
      showBanner: function () { call("showBanner"); },
      hideBanner: function () { call("hideBanner"); },
      showInterstitial: function (context) { call("showInterstitial", { context: context || "" }); }
    },
    haptics: {
      /* style: "light" | "medium" | "heavy" */
      impact: function (style) { call("impact", { style: style || "light" }); },
      /* type: "success" | "warning" | "error" */
      notification: function (type) { call("notification", { type: type || "success" }); }
    }
  };
})();
