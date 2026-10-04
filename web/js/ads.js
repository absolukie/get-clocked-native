/* BoyGames AdManager (Get Clocked + Liverpool Rummy).
 *
 * Exposes window.BoyGames.ads.
 *
 * Kill switch (OFF by default): ads render only when
 * BoyGames.config.adsEnabled is true. Resolution order (first hit wins):
 *   1. ?ads=1 forces on, ?ads=0 forces off (URL wins)
 *   2. localStorage "boygames.getclocked.adsOverride" = "on"/"off"
 *   3. Remote flag service:
 *      GET https://boygames-flags.absolukie.workers.dev/api/flags?app=get-clocked
 *      (cached 5 min in localStorage, stale-while-revalidate; fail closed)
 *   4. /config.json {"adsEnabled": bool} — local fallback
 *   5. default false
 *
 * Remove Ads (window.BoyGames.store) always wins: when the remove_ads
 * entitlement is owned, ALL ad rendering is skipped silently, even with
 * the kill switch on.
 *
 * Backends: when window.BoyGamesNative.ads exists, delegate to the native
 * SDK (see STORE.md). Otherwise render house ads: cross-promo cards for
 * his other apps. House ads are styled to look intentional.
 */
"use strict";
(function () {
  var BG = window.BoyGames || (window.BoyGames = {});
  var OVERRIDE_KEY = "boygames.getclocked.adsOverride"; // "on" | "off"
  var INTERSTITIAL_MIN_MS = 3 * 60 * 1000; // at most 1 per 3 minutes

  /* ---------- config: the kill switch ---------- */
  var cfg = { adsEnabled: false, loaded: false };
  var FLAGS_URL = "https://boygames-flags.absolukie.workers.dev/api/flags?app=get-clocked";
  var FLAGS_CACHE_KEY = "boygames.getclocked.flagsCache"; // {v: bool, at: ms}
  var FLAGS_TTL_MS = 5 * 60 * 1000;
  function readFlagsCache() {
    try {
      var c = JSON.parse(localStorage.getItem(FLAGS_CACHE_KEY) || "null");
      if (c && typeof c.v === "boolean" && (Date.now() - c.at) < FLAGS_TTL_MS) return c.v;
    } catch (e) {}
    return null;
  }
  function writeFlagsCache(v) {
    try { localStorage.setItem(FLAGS_CACHE_KEY, JSON.stringify({ v: !!v, at: Date.now() })); } catch (e) {}
  }
  function fetchRemoteFlags() {
    /* null = unreachable/absent -> caller falls through to config.json */
    return fetch(FLAGS_URL, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var v = (d && d.flags && typeof d.flags.adsEnabled === "boolean") ? d.flags.adsEnabled : null;
        if (v !== null) writeFlagsCache(v);
        return v;
      })
      .catch(function () { return null; });
  }
  (function loadConfig() {
    var cached = readFlagsCache();
    if (cached !== null) {
      cfg.adsEnabled = cached; cfg.loaded = true;
      if (typeof fetch === "function") {
        fetchRemoteFlags().then(function (v) { if (v !== null) cfg.adsEnabled = v; });
      }
      return;
    }
    if (typeof fetch !== "function") return;
    fetchRemoteFlags().then(function (v) {
      if (v !== null) { cfg.adsEnabled = v; cfg.loaded = true; return; }
      fetch("/config.json", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (j) {
          if (j && typeof j.adsEnabled === "boolean") cfg.adsEnabled = j.adsEnabled;
          cfg.loaded = true;
        })
        .catch(function () { cfg.loaded = true; /* fail closed: stays false */ });
    });
  })();
  BG.config = cfg; // BoyGames.config.adsEnabled

  function killSwitchOn() {
    if (/[?&]ads=1(?:&|$)/.test(location.search)) return true;
    if (/[?&]ads=0(?:&|$)/.test(location.search)) return false;
    try {
      var ov = localStorage.getItem(OVERRIDE_KEY);
      if (ov === "on") return true;
      if (ov === "off") return false;
    } catch (e) {}
    return !!cfg.adsEnabled;
  }

  /* ---------- helpers ---------- */
  function isRemoved() {
    return !!(BG.store && BG.store.isOwned(BG.store.PRODUCT_REMOVE_ADS));
  }
  function nativeAds() {
    var n = window.BoyGamesNative;
    return (n && n.ads) || null;
  }

  /* ---------- house ads (web fallback) ---------- */
  var HOUSE = [
    { emoji: "🃏", name: "Liverpool Rummy", tag: "The 7-deal card classic — pass-and-play or online rooms.", url: "https://liverpool-rummy.pages.dev" },
    { emoji: "🐱", name: "BoyGames HQ", tag: "Every game in one place. New drops weekly.", url: "https://my-hq-ct5.pages.dev" }
  ];
  var houseIdx = 0;
  function nextHouse() { var h = HOUSE[houseIdx % HOUSE.length]; houseIdx++; return h; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function houseCardHTML(h) {
    return '<a class="housead" href="' + esc(h.url) + '" target="_blank" rel="noopener">' +
      '<span class="housead-e">' + esc(h.emoji) + "</span>" +
      '<span class="housead-t"><b>' + esc(h.name) + "</b><i>" + esc(h.tag) + "</i></span>" +
      '<span class="housead-go">Open →</span>' +
      '<span class="housead-lab">Ad · BoyGames</span></a>';
  }

  /* ---------- state ---------- */
  var bannerEl = null;
  var lastInterstitialAt = 0;
  var gameplayActive = false;

  function showHouseInterstitial(h) {
    var ov = document.createElement("div");
    ov.className = "admodal";
    ov.innerHTML = '<div class="admodal-card">' + houseCardHTML(h) +
      '<button class="btn primary block">Continue →</button></div>';
    var card = ov.firstChild;
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    card.querySelector("button").onclick = close;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  var ads = {
    /* true when the remove_ads entitlement is owned */
    isRemoved: isRemoved,

    /* true when ads should render: kill switch on AND not removed.
       The settings UI uses this to decide whether to show the
       "Remove Ads" purchase row. */
    isEnabled: function () { return !isRemoved() && killSwitchOn(); },

    /* the app sets this so interstitials never fire mid-round */
    setGameplayActive: function (v) { gameplayActive = !!v; },

    /* render a banner into the provided container element */
    showBanner: function (el) {
      if (!ads.isEnabled() || !el) return false;
      var na = nativeAds();
      if (na && typeof na.showBanner === "function") { na.showBanner(); return true; }
      bannerEl = el;
      el.innerHTML = houseCardHTML(nextHouse());
      return true;
    },
    hideBanner: function () {
      var na = nativeAds();
      if (na && typeof na.hideBanner === "function") na.hideBanner();
      if (bannerEl) { bannerEl.innerHTML = ""; bannerEl = null; }
    },

    /* Between-rounds interstitial. Frequency-capped (1 per 3 min), never
       during active gameplay, never for remove-ads owners.
       Returns true when an ad was shown. */
    maybeInterstitial: function (context) {
      if (!ads.isEnabled()) return false;
      if (gameplayActive) return false;
      var now = Date.now();
      if (now - lastInterstitialAt < INTERSTITIAL_MIN_MS) return false;
      var na = nativeAds();
      if (na && typeof na.showInterstitial === "function") na.showInterstitial(context || "");
      else showHouseInterstitial(nextHouse());
      lastInterstitialAt = now;
      return true;
    }
  };

  BG.ads = ads;
})();
