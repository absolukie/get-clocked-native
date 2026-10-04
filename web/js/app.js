/* GET CLOCKED — shell: storage, settings, sfx, confetti, router, ui helpers */
"use strict";
var GC = window.GC || (window.GC = {});

/* ---------- storage ---------- */
GC.store = {
  get: function (k, d) { try { var v = localStorage.getItem("gc:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem("gc:" + k, JSON.stringify(v)); } catch (e) {} },
  del: function (k) { try { localStorage.removeItem("gc:" + k); } catch (e) {} }
};

/* ---------- settings ---------- */
GC.settings = Object.assign(
  { sound: true, anim: true, theme: "system", spicy: false },
  GC.store.get("settings", {})
);
GC.saveSettings = function () { GC.store.set("settings", GC.settings); GC.applyTheme(); };
GC.applyTheme = function () {
  var t = GC.settings.theme;
  if (t === "system") t = (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t === "light" ? "#f6f3ec" : "#16121f");
};

/* ---------- utils ---------- */
GC.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
GC.uid = function () { return Math.random().toString(36).slice(2, 10); };
GC.shuffle = function (a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1)), t = a[i];
    a[i] = a[j]; a[j] = t;
  }
  return a;
};

/* ---------- sound fx ---------- */
GC.sfx = (function () {
  var ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(f, d, type, v) {
    if (!GC.settings.sound) return;
    try {
      var c = ac(), o = c.createOscillator(), g = c.createGain();
      o.type = type || "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(v || 0.12, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + d);
    } catch (e) {}
  }
  function seq(notes, gap, type, v) {
    notes.forEach(function (f, i) { setTimeout(function () { tone(f, 0.16, type, v); }, i * (gap || 100)); });
  }
  /* native haptics: forwarded to the app wrapper when present, no-op on web */
  function hap(kind, arg) {
    try {
      var h = window.BoyGames && window.BoyGames.haptics;
      if (h && typeof h[kind] === "function") h[kind](arg);
    } catch (e) {}
  }
  return {
    tap: function () { hap("impact", "light"); tone(620, 0.06, "sine", 0.07); },
    move: function () { hap("impact", "light"); tone(440, 0.05, "triangle", 0.06); },
    pick: function () { hap("impact", "light"); seq([520, 780], 70); },
    reveal: function () { hap("impact", "medium"); seq([392, 523, 659], 90); },
    win: function () { hap("notification", "success"); seq([523, 659, 784, 1047], 110, "sine", 0.12); },
    bad: function () { hap("notification", "error"); tone(180, 0.3, "sawtooth", 0.07); }
  };
})();

/* ---------- confetti ---------- */
GC.confetti = function (colors) {
  if (!GC.settings.anim) return;
  var c = document.createElement("canvas");
  c.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999";
  document.body.appendChild(c);
  var x = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  colors = colors || ["#ffd23f", "#ff5d8f", "#4cc9f0", "#7bf59b", "#ffffff"];
  var ps = [];
  for (var i = 0; i < 150; i++) ps.push({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.35,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
    vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3,
    r: Math.random() * Math.PI, vr: -0.1 + Math.random() * 0.2,
    col: colors[i % colors.length]
  });
  var t0 = Date.now();
  (function tick() {
    var el = Date.now() - t0;
    x.clearRect(0, 0, c.width, c.height);
    ps.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r);
      x.fillStyle = p.col; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      x.restore();
    });
    if (el < 3200) requestAnimationFrame(tick); else c.remove();
  })();
};

/* ---------- toast ---------- */
GC.toast = function (msg) {
  var t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.classList.add("show"); }, 10);
  setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 1900);
};

/* ---------- router ---------- */
GC.router = (function () {
  var routes = {};
  var main = document.getElementById("screen");
  return {
    on: function (name, fn) { routes[name] = fn; },
    go: function (name, arg) {
      var fn = routes[name];
      if (!fn) return;
      main.innerHTML = "";
      window.scrollTo(0, 0);
      var wrap = document.createElement("div");
      wrap.className = "screen enter" + (GC.settings.anim ? "" : " noanim");
      fn(wrap, arg);
      main.appendChild(wrap);
    }
  };
})();

/* ---------- ui helpers ---------- */
GC.ui = {
  header: function (title, sub) {
    var h = document.createElement("div");
    h.className = "ghead";
    h.innerHTML = '<div class="logo-mini">🕐</div><h1>' + GC.esc(title) + "</h1>" +
      (sub ? '<p class="sub">' + GC.esc(sub) + "</p>" : "");
    return h;
  },
  back: function (label, route) {
    var b = document.createElement("button");
    b.className = "btn ghost small";
    b.innerHTML = "‹ " + GC.esc(label || "Back");
    b.onclick = function () { GC.sfx.tap(); GC.router.go(route || "home"); };
    return b;
  },
  toggle: function (val, cb) {
    var b = document.createElement("button");
    b.className = "toggle" + (val ? " on" : "");
    b.setAttribute("aria-pressed", val ? "true" : "false");
    b.onclick = function () {
      GC.sfx.tap();
      var v = !b.classList.contains("on");
      b.classList.toggle("on", v);
      b.setAttribute("aria-pressed", v ? "true" : "false");
      cb(v);
    };
    return b;
  },
  seg: function (options, val, cb) {
    var s = document.createElement("div");
    s.className = "seg";
    options.forEach(function (o) {
      var b = document.createElement("button");
      b.className = "btn ghost small" + (String(o.v) === String(val) ? " sel" : "");
      b.textContent = o.t;
      b.onclick = function () {
        GC.sfx.tap();
        Array.prototype.forEach.call(s.children, function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        cb(o.v);
      };
      s.appendChild(b);
    });
    return s;
  },
  setrow: function (label, desc, control) {
    var r = document.createElement("div");
    r.className = "setrow";
    var t = document.createElement("div");
    t.className = "grow";
    t.innerHTML = '<div class="setlabel">' + GC.esc(label) + "</div>" +
      (desc ? '<div class="setdesc">' + GC.esc(desc) + "</div>" : "");
    r.appendChild(t); r.appendChild(control);
    return r;
  }
};

GC.applyTheme();
