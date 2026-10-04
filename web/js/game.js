/* GET CLOCKED — game flow: RANK IT → PASS IT → CLOCK IT */
"use strict";
var GC = window.GC || (window.GC = {});

GC.Game = (function () {
  /* assign stable ids to prompts */
  GC.PROMPTS.forEach(function (p, i) { p.id = "p" + i; });
  GC.SPICY.forEach(function (p, i) { p.id = "s" + i; });

  var S = null; // session

  function btn(text, fn, cls) {
    var b = document.createElement("button");
    b.className = cls || "btn primary block";
    b.innerHTML = text;
    b.onclick = function () { fn(); };
    return b;
  }

  /* ---------- prompt pool ---------- */
  function pool() {
    var p = GC.PROMPTS.filter(function (x) { return S.cats.indexOf(x.c) >= 0; });
    if (GC.settings.spicy && S.cats.indexOf("Spicy") >= 0) p = p.concat(GC.SPICY);
    return p;
  }
  function drawPrompt() {
    var avail = pool().filter(function (x) { return S.used.indexOf(x.id) < 0; });
    if (!avail.length) { S.used = []; avail = pool(); }
    if (S.mashup) return drawMashup();
    var p = avail[Math.floor(Math.random() * avail.length)];
    S.used.push(p.id);
    return p;
  }

  /* mashup: the five things to rank are pulled across categories,
     so putting priorities in order is never confined to one category */
  function drawMashup() {
    var bag = [];
    pool().forEach(function (pr) {
      pr.items.forEach(function (it) { bag.push({ t: it, c: pr.c }); });
    });
    bag = GC.shuffle(bag);
    function pick(distinctCats) {
      var items = [], seenCat = {}, seenItem = {};
      for (var i = 0; i < bag.length && items.length < 5; i++) {
        var b = bag[i], key = "m:" + b.c + "|" + b.t;
        if (seenItem[b.t] || S.used.indexOf(key) >= 0) continue;
        if (distinctCats && seenCat[b.c]) continue;
        seenCat[b.c] = 1; seenItem[b.t] = 1; items.push(b);
      }
      return items;
    }
    var items = pick(true);
    if (items.length < 5) items = pick(false);
    if (items.length < 5) {
      /* mashup pool exhausted: forget mashup history and try once more */
      S.used = S.used.filter(function (u) { return u.indexOf("m:") !== 0; });
      items = pick(true);
      if (items.length < 5) items = pick(false);
    }
    items.forEach(function (b) { S.used.push("m:" + b.c + "|" + b.t); });
    return {
      id: "m" + Date.now() + "" + Math.floor(Math.random() * 1e6),
      c: "Mashup", q: "Rank these five things",
      items: items.map(function (b) { return b.t; }),
      cats: items.map(function (b) { return b.c; })
    };
  }

  /* ---------- order widget: drag handle + arrows ---------- */
  function orderList(items, subs) {
    var order = GC.shuffle(items.map(function (it, i) {
      return { t: it, s: subs ? subs[i] : null };
    }));
    var outer = document.createElement("div");
    var wrap = document.createElement("div");
    wrap.className = "olist";
    var hint = document.createElement("div");
    hint.className = "kbd-hint";
    hint.textContent = "Drag ⋮⋮ or tap ▲▼ to reorder";
    outer.appendChild(wrap);
    outer.appendChild(hint);
    var rows = [];
    function render() {
      wrap.innerHTML = "";
      rows = [];
      order.forEach(function (o, i) {
        var row = document.createElement("div");
        row.className = "orow";
        var num = document.createElement("div");
        num.className = "onum"; num.textContent = "#" + (i + 1);
        var grip = document.createElement("div");
        grip.className = "ogrip"; grip.textContent = "⋮⋮";
        grip.setAttribute("aria-label", "drag to reorder");
        var txt = document.createElement("div");
        txt.className = "otxt"; txt.textContent = o.t;
        if (o.s) {
          var sub = document.createElement("div");
          sub.className = "osub"; sub.textContent = o.s;
          txt.appendChild(sub);
        }
        var ctl = document.createElement("div");
        ctl.className = "octl";
        var up = document.createElement("button");
        up.className = "obtn"; up.innerHTML = "▲"; up.setAttribute("aria-label", "move up");
        var dn = document.createElement("button");
        dn.className = "obtn"; dn.innerHTML = "▼"; dn.setAttribute("aria-label", "move down");
        up.disabled = (i === 0); dn.disabled = (i === order.length - 1);
        up.onclick = function () { GC.sfx.move(); var t = order[i - 1]; order[i - 1] = order[i]; order[i] = t; render(); };
        dn.onclick = function () { GC.sfx.move(); var t = order[i + 1]; order[i + 1] = order[i]; order[i] = t; render(); };
        ctl.appendChild(up); ctl.appendChild(dn);
        row.appendChild(num); row.appendChild(grip); row.appendChild(txt); row.appendChild(ctl);
        wrap.appendChild(row);
        rows.push({ el: row, item: o.t });
        attachDrag(row, i);
      });
    }
    function attachDrag(row, index) {
      var drag = null;
      row.addEventListener("pointerdown", function (e) {
        if (e.target && e.target.closest && e.target.closest(".octl")) return;
        e.preventDefault();
        try { row.setPointerCapture(e.pointerId); } catch (err) {}
        drag = { pid: e.pointerId, startY: e.clientY, index: index, active: false, target: index, rowH: 0 };
      });
      row.addEventListener("pointermove", function (e) {
        if (!drag || e.pointerId !== drag.pid) return;
        var dy = e.clientY - drag.startY;
        if (!drag.active) {
          if (Math.abs(dy) < 10) return;
          drag.active = true;
          drag.rowH = row.offsetHeight + 8;
          row.classList.add("dragging");
        }
        var target = Math.max(0, Math.min(order.length - 1, drag.index + Math.round(dy / drag.rowH)));
        drag.target = target;
        row.style.transform = "translateY(" + dy + "px)";
        rows.forEach(function (r, i) {
          if (r.el === row) return;
          var shift = 0;
          if (drag.index < target && i > drag.index && i <= target) shift = -drag.rowH;
          else if (drag.index > target && i < drag.index && i >= target) shift = drag.rowH;
          r.el.style.transform = shift ? "translateY(" + shift + "px)" : "";
        });
      });
      function end(e) {
        if (!drag || (e && e.pointerId !== drag.pid)) return;
        if (drag.active) {
          if (drag.target !== drag.index) {
            var it = order.splice(drag.index, 1)[0];
            order.splice(drag.target, 0, it);
            GC.sfx.move();
          }
          render();
        }
        drag = null;
      }
      row.addEventListener("pointerup", end);
      row.addEventListener("pointercancel", end);
    }
    render();
    return { el: outer, get: function () { return order.map(function (o) { return o.t; }); } };
  }

  function stepBadge(n, label) {
    var d = document.createElement("div");
    d.className = "stepbadge s" + n;
    d.textContent = "STEP " + n + " · " + label;
    return d;
  }

  function qcard(prompt) {
    var d = document.createElement("div");
    d.className = "qcard";
    var tag = prompt.cats ? "🔀 MASHUP MIX" : GC.esc(prompt.c.toUpperCase());
    d.innerHTML = '<div class="qc">' + tag + "</div>" +
      '<div class="qq">' + GC.esc(prompt.q) + "</div>" +
      '<div class="qh">#1 = most · #5 = least</div>';
    return d;
  }

  /* ================= HOME ================= */
  GC.router.on("home", function (el) {
    var hero = document.createElement("div");
    hero.className = "hero";
    hero.innerHTML = '<div class="clock">🕐</div>' +
      '<div class="title">GET<br>CLOCKED</div>' +
      '<div class="tagline">Rank it. Pass it. <b>Clock it.</b></div>';
    el.appendChild(hero);
    var menu = document.createElement("div");
    menu.className = "menu";
    menu.appendChild(btn("▶&nbsp; PLAY", function () { GC.sfx.pick(); GC.router.go("setup"); }, "btn primary big"));
    menu.appendChild(btn("📖 How to play", function () { GC.sfx.tap(); GC.router.go("howto"); }, "btn ghost"));
    menu.appendChild(btn("🏆 History", function () { GC.sfx.tap(); GC.router.go("history"); }, "btn ghost"));
    menu.appendChild(btn("⚙️ Settings", function () { GC.sfx.tap(); GC.router.go("settings"); }, "btn ghost"));
    el.appendChild(menu);
    /* ad banner slot (menu screens only, never during a round) */
    var adslot = document.createElement("div");
    adslot.className = "adslot";
    el.appendChild(adslot);
    if (window.BoyGames && window.BoyGames.ads) window.BoyGames.ads.showBanner(adslot);
    var f = document.createElement("div");
    f.className = "foot";
    f.textContent = "One player ranks. Everyone else clocks.";
    el.appendChild(f);
  });

  /* ================= HOW TO ================= */
  GC.router.on("howto", function (el) {
    el.appendChild(GC.ui.back("Home", "home"));
    el.appendChild(GC.ui.header("How to play", "Three steps. Zero mercy."));
    var steps = [
      ["🥇", "RANK IT", "One player secretly orders 5 items from #1 (most) to #5 (least), then locks it in."],
      ["📲", "PASS IT", "Hand the phone over. Everyone can watch the guesser work."],
      ["🕐", "CLOCK IT", "The next player reconstructs the exact ranking. Every exact position hit scores a point. 5/5? FULLY CLOCKED."]
    ];
    steps.forEach(function (s) {
      var d = document.createElement("div");
      d.className = "howstep";
      d.innerHTML = '<div class="n">' + s[0] + '</div><div><b>' + s[1] + "</b><p>" + s[2] + "</p></div>";
      el.appendChild(d);
    });
    el.appendChild(btn("Got it — let's play", function () { GC.sfx.pick(); GC.router.go("setup"); }));
  });

  /* ================= SETUP (players + rounds) ================= */
  GC.router.on("setup", function (el) {
    el.appendChild(GC.ui.back("Home", "home"));
    el.appendChild(GC.ui.header("Who's playing?", "Add 2–8 players. Pass-and-play, one phone."));
    var players = GC.store.get("players", ["Player 1", "Player 2"]);
    var list = document.createElement("div");
    list.className = "plist";
    function render() {
      list.innerHTML = "";
      players.forEach(function (p, i) {
        var r = document.createElement("div");
        r.className = "prow";
        var nm = document.createElement("div");
        nm.className = "nm"; nm.textContent = (i + 1) + ". " + p;
        nm.title = "Tap to edit";
        nm.onclick = function () { editName(i, nm); };
        var x = document.createElement("button");
        x.className = "xbtn"; x.textContent = "✕"; x.setAttribute("aria-label", "remove player");
        x.onclick = function () {
          if (players.length <= 2) { GC.toast("Need at least 2 players"); return; }
          GC.sfx.tap(); players.splice(i, 1); save(); render();
        };
        r.appendChild(nm); r.appendChild(x);
        list.appendChild(r);
      });
    }
    /* tap a name to edit it inline */
    function editName(i, nm, selectAll) {
      if (nm.querySelector("input")) return;
      var cur = players[i];
      var inp = document.createElement("input");
      inp.type = "text"; inp.value = cur; inp.maxLength = 16;
      inp.className = "nmedit"; inp.setAttribute("aria-label", "edit player name");
      nm.textContent = ""; nm.appendChild(inp);
      /* focus synchronously inside the tap: iOS only opens the keyboard
         (one tap total) when focus runs in the user-gesture task */
      inp.focus();
      /* freshly auto-added placeholders get fully selected so typing replaces
         them; manual edits keep the cursor at the end */
      try {
        if (selectAll) inp.select();
        else inp.setSelectionRange(inp.value.length, inp.value.length);
      } catch (e) {}
      var done = false;
      function commit(ok, chain) {
        if (done) return; done = true;
        var v = inp.value.trim();
        if (ok && v && v !== cur) {
          if (players.indexOf(v) >= 0) GC.toast("Name's taken");
          else { players[i] = v; GC.sfx.tap(); }
        }
        save();
        if (chain) { autoAdd(); return; }
        /* rename-only: restore this row's label without a full re-render,
           so the tap that blurred this editor (another name, + Add, START)
           still lands on a live element instead of a detached one */
        nm.textContent = (i + 1) + ". " + players[i];
      }
      inp.onkeydown = function (e) {
        if (e.key === "Enter") commit(true, true);
        else if (e.key === "Escape") commit(false);
      };
      inp.onblur = function () { commit(true); };
    }
    function save() { GC.store.set("players", players); }
    render();
    el.appendChild(list);
    var nhint = document.createElement("div");
    nhint.className = "kbd-hint";
    nhint.textContent = "Tap a name to edit it · Enter adds the next player · ✕ removes";
    el.appendChild(nhint);

    var add = document.createElement("div");
    add.className = "rowline";
    var inp = document.createElement("input");
    inp.type = "text"; inp.placeholder = "Player name"; inp.maxLength = 16;
    inp.className = "grow";
    var ab = document.createElement("button");
    ab.className = "btn small"; ab.textContent = "＋ Add";
    /* add the next auto-numbered player and pop its name open, fully selected */
    function autoAdd() {
      if (players.length >= 8) { GC.toast("Max 8 players"); return; }
      var n = players.length + 1, v;
      do { v = "Player " + n; n++; } while (players.indexOf(v) >= 0);
      GC.sfx.pick(); players.push(v); save(); render();
      var nms = list.querySelectorAll(".prow .nm");
      var nmEl = nms[players.length - 1];
      if (nmEl) editName(players.length - 1, nmEl, true);
    }
    function doAdd() {
      var v = inp.value.trim();
      if (players.length >= 8) { GC.toast("Max 8 players"); return; }
      if (!v) { inp.value = ""; autoAdd(); return; }
      if (players.indexOf(v) >= 0) { GC.toast("Name's taken"); return; }
      GC.sfx.pick(); players.push(v); inp.value = ""; save(); render(); inp.focus();
    }
    ab.onclick = doAdd;
    inp.onkeydown = function (e) { if (e.key === "Enter") doAdd(); };
    add.appendChild(inp); add.appendChild(ab);
    el.appendChild(add);

    var rounds = GC.store.get("rounds", 5);
    var f = document.createElement("div");
    f.className = "field";
    f.innerHTML = "<label>ROUNDS</label>";
    f.appendChild(GC.ui.seg(
      [{ t: "3", v: 3 }, { t: "5", v: 5 }, { t: "10", v: 10 }],
      rounds,
      function (v) { rounds = v; GC.store.set("rounds", v); }
    ));
    el.appendChild(f);

    el.appendChild(btn("Continue →", function () {
      if (players.length < 2) { GC.toast("Add at least 2 players"); return; }
      GC.sfx.pick();
      S = {
        players: players.slice(), rounds: rounds, cats: null,
        round: 0, scores: {}, used: [], log: []
      };
      players.forEach(function (p) { S.scores[p] = 0; });
      GC.router.go("cats");
    }));
  });

  /* ================= CATEGORIES ================= */
  GC.router.on("cats", function (el) {
    el.appendChild(GC.ui.back("Players", "setup"));
    var h = document.createElement("div");
    h.className = "ghead";
    h.innerHTML = '<div class="logo-mini">🕐</div><h1>SELECT CATEGORIES</h1><p class="sub">Everything\'s on by default. Tap to remove what you don\'t want.</p>';
    el.appendChild(h);

    var cats = GC.CATS.slice();
    if (GC.settings.spicy) cats.push("Spicy");

    var stored = GC.store.get("catsel", null);
    var sel;
    if (stored === null) sel = GC.CATS.slice();
    else sel = stored.filter(function (c) { return cats.indexOf(c) >= 0; });
    if (!GC.settings.spicy) sel = sel.filter(function (c) { return c !== "Spicy"; });

    var grid = document.createElement("div");
    grid.className = "cats";
    var count = document.createElement("div");
    count.className = "catcount";
    function save() { GC.store.set("catsel", sel); }

    var sections = GC.SECTIONS.slice();
    if (GC.settings.spicy) sections = sections.concat([{ name: "Spicy", cats: ["Spicy"] }]);

    var chipEls = {};
    var secWrap = document.createElement("div");
    sections.forEach(function (sec) {
      var box = document.createElement("div");
      box.className = "catsec";
      var head = document.createElement("div");
      head.className = "catsec-head";
      var nm = document.createElement("span");
      nm.className = "catsec-name"; nm.textContent = sec.name;
      var allb = document.createElement("button");
      allb.className = "btn ghost small"; allb.textContent = "All";
      allb.onclick = function () {
        GC.sfx.tap();
        sec.cats.forEach(function (c) { if (sel.indexOf(c) < 0) sel.push(c); });
        save(); refresh();
      };
      var noneb = document.createElement("button");
      noneb.className = "btn ghost small"; noneb.textContent = "None";
      noneb.onclick = function () {
        GC.sfx.tap();
        sel = sel.filter(function (c) { return sec.cats.indexOf(c) < 0; });
        save(); refresh();
      };
      head.appendChild(nm); head.appendChild(allb); head.appendChild(noneb);
      box.appendChild(head);
      var sgrid = document.createElement("div");
      sgrid.className = "cats";
      sec.cats.forEach(function (c) {
        var ch = document.createElement("button");
        ch.className = "chip" + (c === "Spicy" ? " spicy" : "");
        ch.dataset.c = c;
        ch.onclick = function () {
          GC.sfx.tap();
          var i = sel.indexOf(c);
          if (i >= 0) sel.splice(i, 1); else sel.push(c);
          save(); refresh();
        };
        chipEls[c] = ch;
        sgrid.appendChild(ch);
      });
      box.appendChild(sgrid);
      secWrap.appendChild(box);
    });

    function refresh() {
      Object.keys(chipEls).forEach(function (c) {
        var ch = chipEls[c];
        var on = sel.indexOf(c) >= 0;
        ch.classList.toggle("sel", on);
        ch.innerHTML = '<span class="ck">✓</span> ' + GC.esc(c);
      });
      count.textContent = sel.length + " CATEGORIES SELECTED";
    }

    var row = document.createElement("div");
    row.className = "catbtns";
    var all = document.createElement("button");
    all.className = "btn ghost small"; all.textContent = "Select All";
    all.onclick = function () { GC.sfx.tap(); sel = cats.slice(); save(); refresh(); };
    var clear = document.createElement("button");
    clear.className = "btn ghost small"; clear.textContent = "Clear All";
    clear.onclick = function () { GC.sfx.tap(); sel = []; save(); refresh(); };
    var sur = document.createElement("button");
    sur.className = "btn ghost small"; sur.textContent = "🎲 Surprise Me";
    row.appendChild(all); row.appendChild(clear); row.appendChild(sur);
    el.appendChild(row);

    /* surprise stepper: appears after Surprise Me, adjusts how many it picks */
    var surpriseN = 8;
    var surrow = document.createElement("div");
    surrow.className = "surrow";
    surrow.style.display = "none";
    var surlabel = document.createElement("span");
    surlabel.className = "label";
    var minus = document.createElement("button");
    minus.className = "btn ghost small"; minus.textContent = "− Less";
    var plus = document.createElement("button");
    plus.className = "btn ghost small"; plus.textContent = "+ More";
    function doSurprise(n) {
      surpriseN = Math.max(4, Math.min(cats.length, n));
      sel = GC.shuffle(cats).slice(0, surpriseN);
      surlabel.textContent = "🎲 " + surpriseN + " surprise categories";
      surrow.style.display = "flex";
      save(); refresh();
    }
    sur.onclick = function () { GC.sfx.pick(); doSurprise(8); GC.toast(surpriseN + " random categories 🎲"); };
    minus.onclick = function () { GC.sfx.tap(); doSurprise(surpriseN - 4); };
    plus.onclick = function () { GC.sfx.tap(); doSurprise(surpriseN + 4); };
    surrow.appendChild(surlabel); surrow.appendChild(minus); surrow.appendChild(plus);
    el.appendChild(surrow);

    /* mashup: each round mixes its five items across categories */
    var mash = GC.store.get("mashup", true);
    var mrow = document.createElement("div");
    mrow.className = "mashrow";
    var mtog = document.createElement("button");
    mtog.className = "chip big";
    function paintMash() {
      mtog.classList.toggle("sel", mash);
      mtog.innerHTML = '<span class="ck">✓</span> 🔀 Mashup rounds';
    }
    mtog.onclick = function () { GC.sfx.tap(); mash = !mash; GC.store.set("mashup", mash); paintMash(); };
    var msub = document.createElement("div");
    msub.className = "msub";
    msub.textContent = "Each round pulls its five things from across your categories — ranking is never stuck inside one category.";
    mrow.appendChild(mtog); mrow.appendChild(msub);
    el.appendChild(mrow);
    paintMash();

    el.appendChild(secWrap);

    var bar = document.createElement("div");
    bar.className = "stickybar";
    bar.appendChild(count);
    bar.appendChild(btn("START GAME 🕐", function () {
      if (!sel.length) { GC.toast("Pick at least one category"); return; }
      GC.sfx.pick();
      S.cats = sel.slice();
      S.mashup = mash;
      S.ranker = 0;
      GC.router.go("rank");
    }));
    el.appendChild(bar);
    refresh();
  });

  /* ================= RANK IT ================= */
  GC.router.on("rank", function (el) {
    var ranker = S.players[S.ranker % S.players.length];
    var prompt = drawPrompt();
    S.prompt = prompt;
    el.appendChild(stepBadge(1, "RANK IT"));
    var h = document.createElement("div");
    h.innerHTML = '<h1 style="margin-top:2px">' + GC.esc(ranker) + ", put these in <i>your</i> order.</h1>";
    el.appendChild(h);
    el.appendChild(qcard(prompt));
    var ol = orderList(prompt.items, prompt.cats);
    el.appendChild(ol.el);
    el.appendChild(btn("🔒 LOCK MY RANKING", function () {
      GC.sfx.pick();
      S.actual = ol.get();
      GC.router.go("pass");
    }));
  });

  /* ================= PASS IT ================= */
  GC.router.on("pass", function (el) {
    var ranker = S.players[S.ranker % S.players.length];
    el.appendChild(stepBadge(2, "PASS IT"));
    var d = document.createElement("div");
    d.className = "passhero";
    d.innerHTML = '<div class="big">PASS<br>THE PHONE</div>' +
      "<p>Hand it to the guesser — everyone can watch.</p>";
    el.appendChild(d);
    el.appendChild(btn("I'M READY", function () {
      GC.sfx.pick();
      GC.router.go("clock");
    }, "btn primary big block"));
  });

  /* ================= CLOCK IT ================= */
  GC.router.on("clock", function (el) {
    var ranker = S.players[S.ranker % S.players.length];
    var guesser = S.players[(S.ranker + 1) % S.players.length];
    el.appendChild(stepBadge(3, "CLOCK IT"));
    var h = document.createElement("div");
    h.innerHTML = '<h1 style="margin-top:2px">Can you clock ' + GC.esc(ranker) + "?</h1>" +
      '<p class="sub">' + GC.esc(guesser) + ", arrange the five exactly how you think " +
      GC.esc(ranker) + " ranked them.</p>";
    el.appendChild(h);
    el.appendChild(qcard(S.prompt));
    var ol = orderList(S.prompt.items, S.prompt.cats);
    el.appendChild(ol.el);
    el.appendChild(btn("🕐 CLOCK IT IN", function () {
      GC.sfx.reveal();
      S.guess = ol.get();
      S.guesser = guesser;
      S.rankerName = ranker;
      var m = 0;
      for (var i = 0; i < 5; i++) if (S.guess[i] === S.actual[i]) m++;
      S.score = m;
      S.scores[guesser] += m;
      GC.router.go("reveal");
    }));
  });

  /* ================= REVEAL ================= */
  var VERDICTS = [
    "YOU DO NOT KNOW THIS PERSON 💀", "BARELY CLOCKED", "KINDA CLOCKED",
    "PRETTY CLOCKED", "YOU CLOCKED THEM", "FULLY CLOCKED"
  ];
  GC.router.on("reveal", function (el) {
    var last = S.round === S.rounds - 1;
    var sc = document.createElement("div");
    sc.className = "bigscore";
    sc.textContent = "0/5";
    el.appendChild(sc);
    var v = document.createElement("div");
    v.className = "verdict";
    el.appendChild(v);

    var cmp = document.createElement("div");
    cmp.className = "cmp";
    var catOf = {};
    if (S.prompt.cats) S.prompt.items.forEach(function (it, i) { catOf[it] = S.prompt.cats[i]; });
    function col(title, arr, ref) {
      var d = document.createElement("div");
      var html = "<h4>" + GC.esc(title) + "</h4><ul>";
      arr.forEach(function (it, i) {
        var ok = ref ? it === ref[i] : true;
        var cs = catOf[it] ? ' <span class="cs">' + GC.esc(catOf[it]) + "</span>" : "";
        html += '<li class="' + (ok ? "ok" : "no") + '"><span>#' + (i + 1) + "</span><span>" +
          GC.esc(it) + cs + '</span><span class="mk">' + (ok ? "✓" : "✗") + "</span></li>";
      });
      d.innerHTML = html + "</ul>";
      return d;
    }
    cmp.appendChild(col("✅ " + S.rankerName.toUpperCase() + "'S RANKING", S.actual));
    cmp.appendChild(col("🎯 " + S.guesser.toUpperCase() + "'S GUESS", S.guess, S.actual));
    el.appendChild(cmp);

    S.log.push({
      r: S.round + 1, ranker: S.rankerName, guesser: S.guesser,
      q: S.prompt.q, score: S.score
    });

    /* count-up animation */
    function finish() {
      v.innerHTML = VERDICTS[target] + "<small>" + GC.esc(S.guesser) + " scores +" + target + "</small>";
      if (target === 5) { GC.sfx.win(); GC.confetti(); }
      else if (target >= 3) GC.sfx.pick();
      else GC.sfx.bad();
    }
    var target = S.score;
    if (!GC.settings.anim || target === 0) {
      sc.textContent = target + "/5";
      finish();
    } else {
      var n = 0;
      var iv = setInterval(function () {
        n++;
        sc.textContent = n + "/5";
        if (n >= target) { clearInterval(iv); finish(); }
      }, 220);
    }

    el.appendChild(btn(last ? "SEE RESULTS 🏆" : "NEXT ROUND →", function () {
      GC.sfx.pick();
      /* round transition: a firmer native tap (no-op on web) */
      if (window.BoyGames && window.BoyGames.haptics) window.BoyGames.haptics.impact("medium");
      /* between-rounds interstitial (capped, never mid-round, skipped for owners) */
      if (window.BoyGames && window.BoyGames.ads) window.BoyGames.ads.maybeInterstitial("between-rounds");
      S.round++;
      if (last) GC.router.go("results");
      else { S.ranker++; GC.router.go("rank"); }
    }));
  });

  /* ================= RESULTS ================= */
  GC.router.on("results", function (el) {
    el.appendChild(GC.ui.header("Final scores", "Rank it. Pass it. Clock it."));
    var order = S.players.slice().sort(function (a, b) { return S.scores[b] - S.scores[a]; });
    var winner = order[0];
    order.forEach(function (p, i) {
      var r = document.createElement("div");
      r.className = "brow" + (i === 0 ? " win" : "");
      var medal = i === 0 ? "🏆" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : (i + 1)));
      r.innerHTML = '<div class="rk">' + medal + '</div><div class="nm">' + GC.esc(p) +
        "</div>" + '<div class="pt">' + S.scores[p] + " pts</div>";
      el.appendChild(r);
    });

    /* share card */
    var lines = order.map(function (p) { return (p === winner ? "🏆 " : "") + p + ": " + S.scores[p] + " pts"; });
    var card = document.createElement("div");
    card.className = "sharecard";
    card.innerHTML = '<div class="st">🕐 GET CLOCKED</div>' +
      '<div class="ss">' + GC.esc(lines.join("\n")) + "\n\nRank it. Pass it. Clock it.</div>";
    el.appendChild(card);
    el.appendChild(btn("📋 Copy results", function () {
      var txt = "🕐 GET CLOCKED — Rank it. Pass it. Clock it.\n" + lines.join("\n");
      function done() { GC.toast("Copied 📋"); GC.sfx.pick(); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, function () { fallback(); });
      } else fallback();
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = txt; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        ta.remove(); done();
      }
    }, "btn ghost block"));

    /* save history */
    var hist = GC.store.get("history", []);
    hist.unshift({
      d: Date.now(), players: S.players.slice(), scores: Object.assign({}, S.scores),
      winner: winner, rounds: S.rounds, log: S.log.slice()
    });
    GC.store.set("history", hist.slice(0, 50));

    var row = document.createElement("div");
    row.className = "rowline";
    row.style.marginTop = "10px";
    var again = document.createElement("button");
    again.className = "btn primary grow"; again.textContent = "🔁 Play again";
    again.onclick = function () { GC.sfx.pick(); GC.router.go("setup"); };
    var home = document.createElement("button");
    home.className = "btn ghost"; home.textContent = "Home";
    home.onclick = function () { GC.sfx.tap(); GC.router.go("home"); };
    row.appendChild(again); row.appendChild(home);
    el.appendChild(row);
  });

  /* ================= HISTORY ================= */
  GC.router.on("history", function (el) {
    el.appendChild(GC.ui.back("Home", "home"));
    el.appendChild(GC.ui.header("Past games", "Your clocking record."));
    var hist = GC.store.get("history", []);
    if (!hist.length) {
      var e = document.createElement("div");
      e.className = "empty";
      e.innerHTML = "No games yet.<br>Go clock someone. 🕐";
      el.appendChild(e);
      return;
    }
    hist.forEach(function (g) {
      var d = document.createElement("div");
      d.className = "hrow";
      var when = new Date(g.d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      var sc = Object.keys(g.scores).sort(function (a, b) { return g.scores[b] - g.scores[a]; })
        .map(function (p) { return p + " " + g.scores[p]; }).join(" · ");
      d.innerHTML = '<div class="hd">🏆 ' + GC.esc(g.winner) + ' <span style="color:var(--mut);font-weight:400">· ' +
        when + " · " + g.rounds + " rounds</span></div>" +
        '<div class="hs">' + GC.esc(sc) + "</div>";
      /* every round of every player in this game */
      var log = g.log || [];
      if (log.length) {
        var rh = '<div class="hrnds">';
        log.forEach(function (r) {
          rh += '<div class="hrnd"><span class="hrn">R' + r.r + "</span><span>" +
            GC.esc(r.ranker) + " ranked · " + GC.esc(r.guesser) + " guessed" +
            '</span><span class="hrs">' + r.score + "/5</span></div>";
          if (r.q) rh += '<div class="hrq">' + GC.esc(r.q) + "</div>";
        });
        d.innerHTML += rh + "</div>";
      }
      el.appendChild(d);
    });
    el.appendChild(btn("Clear history", function () {
      if (confirm("Clear all past games?")) {
        GC.store.del("history");
        GC.sfx.tap();
        GC.router.go("history");
      }
    }, "btn danger block"));
  });

  /* ================= SETTINGS ================= */
  GC.router.on("settings", function (el) {
    el.appendChild(GC.ui.back("Home", "home"));
    el.appendChild(GC.ui.header("Settings", "Tune the game."));
    el.appendChild(GC.ui.setrow("🌶️ Spicy categories",
      "Adds the Spicy category chip. For grown-up game nights.",
      GC.ui.toggle(GC.settings.spicy, function (v) { GC.settings.spicy = v; GC.saveSettings(); })));
    el.appendChild(GC.ui.setrow("🔊 Sound FX",
      "Tap blips, win fanfares, sad trombones.",
      GC.ui.toggle(GC.settings.sound, function (v) { GC.settings.sound = v; GC.saveSettings(); })));
    el.appendChild(GC.ui.setrow("✨ Animations",
      "Transitions, confetti, score count-ups.",
      GC.ui.toggle(GC.settings.anim, function (v) { GC.settings.anim = v; GC.saveSettings(); })));
    var f = document.createElement("div");
    f.className = "field";
    f.innerHTML = "<label>THEME</label>";
    f.appendChild(GC.ui.seg(
      [{ t: "System", v: "system" }, { t: "Dark", v: "dark" }, { t: "Light", v: "light" }],
      GC.settings.theme,
      function (v) { GC.settings.theme = v; GC.saveSettings(); }
    ));
    el.appendChild(f);

    /* ---------- Privacy Policy ---------- */
    (function () {
      var b = document.createElement("button");
      b.className = "btn ghost small";
      b.textContent = "Open →";
      b.onclick = function () { GC.sfx.tap(); window.open("privacy.html", "_blank", "noopener"); };
      el.appendChild(GC.ui.setrow("🔒 Privacy Policy",
        "What the game stores, on your device and nowhere else.",
        b));
    })();

    /* ---------- Remove Ads (only shown when ads are enabled and not owned) ---------- */
    (function () {
      var BGW = window.BoyGames;
      if (!BGW || !BGW.ads || !BGW.ads.isEnabled()) return;
      var status = document.createElement("div");
      status.className = "setdesc";
      status.textContent = "";
      var buy = document.createElement("button");
      buy.className = "btn primary small";
      buy.textContent = "Remove Ads";
      buy.onclick = function () {
        GC.sfx.tap();
        buy.disabled = true;
        var label = buy.textContent;
        buy.textContent = "…";
        BGW.store.purchase(BGW.store.PRODUCT_REMOVE_ADS).then(function (r) {
          if (r && r.owned) {
            status.textContent = "✓ Ads removed. Thanks for supporting the game!";
            buy.style.display = "none";
            GC.toast("✓ Ads removed");
          } else {
            buy.disabled = false;
            buy.textContent = label;
            GC.toast("Purchase cancelled");
          }
        });
      };
      var ctl = document.createElement("div");
      ctl.style.cssText = "display:flex;flex-direction:column;gap:6px;align-items:flex-end;max-width:46%;";
      ctl.appendChild(buy);
      ctl.appendChild(status);
      el.appendChild(GC.ui.setrow("🚫 Remove Ads",
        "One-time purchase. No banners, no pop-ups, ever.", ctl));
      /* localized price from the store (web fallback: $2.99) */
      BGW.store.getProducts().then(function (ps) {
        (ps || []).forEach(function (p) {
          if (p.id === BGW.store.PRODUCT_REMOVE_ADS && p.price)
            buy.textContent = "Remove Ads — " + p.price;
        });
      });
      var rl = document.createElement("button");
      rl.className = "btn ghost small";
      rl.style.cssText = "align-self:flex-end;margin-top:-6px;";
      rl.textContent = "Restore purchases";
      rl.onclick = function () {
        GC.sfx.tap();
        BGW.store.restore().then(function (r) {
          var ids = (r && r.ownedIds) || [];
          if (ids.indexOf(BGW.store.PRODUCT_REMOVE_ADS) >= 0) {
            GC.router.go("settings"); /* re-render: the row hides itself */
            GC.toast("✓ Purchases restored");
          } else {
            GC.toast("No purchases found");
          }
        });
      };
      el.appendChild(rl);
    })();

    el.appendChild(btn("Reset all data", function () {
      if (confirm("Reset players, categories, history, and settings?")) {
        Object.keys(localStorage).filter(function (k) { return k.indexOf("gc:") === 0; })
          .forEach(function (k) { localStorage.removeItem(k); });
        location.reload();
      }
    }, "btn danger block"));
  });

  /* ads: mark active gameplay (rank/pass/clock) so interstitials never
     fire mid-round; reveal/results/menus are fair game */
  (function () {
    var BGW = window.BoyGames;
    if (!BGW || !BGW.ads) return;
    var ACTIVE = { rank: 1, pass: 1, clock: 1 };
    var go = GC.router.go;
    GC.router.go = function (name, arg) {
      BGW.ads.setGameplayActive(!!ACTIVE[name]);
      return go(name, arg);
    };
  })();

  GC.router.go("home");
})();
