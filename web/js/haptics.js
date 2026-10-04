/* BoyGames shared haptics bridge (Get Clocked + Liverpool Rummy).
 *
 * Exposes window.BoyGames.haptics. The native app wrapper injects
 * window.BoyGamesNative.haptics (see the -native repo README and the
 * STORE.md "Native haptics" section); calls are forwarded there when it
 * exists. On plain web every method is a safe no-op, so web behavior is
 * unchanged whether or not the bridge is present.
 */
"use strict";
(function () {
  var BG = window.BoyGames || (window.BoyGames = {});

  function nativeHaptics() {
    var n = window.BoyGamesNative;
    return (n && n.haptics) || null;
  }

  BG.haptics = {
    /* style: "light" | "medium" | "heavy" */
    impact: function (style) {
      var h = nativeHaptics();
      if (h && typeof h.impact === "function") {
        try { h.impact(style || "light"); } catch (e) {}
      }
    },
    /* type: "success" | "warning" | "error" */
    notification: function (type) {
      var h = nativeHaptics();
      if (h && typeof h.notification === "function") {
        try { h.notification(type || "success"); } catch (e) {}
      }
    }
  };

  /* live check: the wrapper may inject BoyGamesNative after page load */
  Object.defineProperty(BG.haptics, "isNative", {
    get: function () { return !!nativeHaptics(); },
    enumerable: true
  });
})();
