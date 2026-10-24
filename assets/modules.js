/* Interactive modules: step cards, guess first, checkout queue, policy dial, assumptions. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pctNum = v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  /* ---------- Step cards drive their section's sticky panel ---------- */
  function initSteps() {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const step = e.target, sec = step.closest("section");
        $$(".step", sec).forEach(s => s.classList.toggle("is-active", s === step));
        if (step.dataset.hl && window.highlightHarvard) window.highlightHarvard(step.dataset.hl);
        if (step.dataset.view) showView(sec, step.dataset.view);
        if (step.dataset.preset) Queue.preset(step.dataset.preset);
      });
    }, { rootMargin: "-40% 0px -45% 0px" });
    $$(".section--steps .step").forEach(s => io.observe(s));
  }
  function showView(sec, name) {
    $$(".panel-view", sec).forEach(v => v.classList.toggle("is-on", v.dataset.view === name));
    if (sec.id === "finance") {
      $("#fin-title").textContent = name === "queue" ? "The checkout queue" : "Businesses using AI, 2024–25";
      $("#fin-src").innerHTML = name === "queue" ? '<span class="tag-play">▶ Drag the sliders</span>' : "ABS";
      Queue.setVisible(name === "queue");
    }
  }

  /* ---------- Guess first ---------- */
  function initGuess() {
    const inp = $("#guess-in"), out = $("#guess-out"), go = $("#guess-go");
    if (!inp) return;
    const upd = () => { out.textContent = `+${inp.value}%`; };
    inp.addEventListener("input", upd); upd();
    go.addEventListener("click", () => {
      const g = +inp.value;
      $("#guess-result").hidden = false;
      go.textContent = "Change my guess";
      $("#gval-you").textContent = `+${g}%`;
      requestAnimationFrame(() => {
        $$("#guess-result .fill[data-w]").forEach(f => { f.style.width = f.dataset.w + "%"; });
        $("#gbar-you").style.width = (g / 30) * 100 + "%";
      });
      $("#guess-msg").textContent = g > 12
        ? `You guessed +${g}%. The evidence says firms shipped at most 12% more, and the central estimate is nearer 6%. Most forecasts make the same assumption you did: that AI's extra work becomes extra output. Mostly, it doesn't.`
        : `You guessed +${g}%. That's inside what the evidence allows: at most 12% more, with a central estimate nearer 6%. You've already spotted the bottleneck that headline forecasts miss.`;
    });
  }

  /* ---------- Checkout queue simulation ---------- */
  const Queue = (() => {
    const cv = document.getElementById("queue-canvas");
    if (!cv) return { preset() {}, setVisible() {} };
    const ctx = cv.getContext("2d");
    const W = 640, H = 250;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);

    const el = id => document.getElementById(id);
    const ctrls = { speed: el("q-speed"), checkers: el("q-checkers"), strict: el("q-strict"), ai: el("q-ai") };
    const outs = {
      speed: v => `+${v}%`, checkers: v => `${v}`, strict: v => `${(v / 100).toFixed(1)}×`, ai: v => `${v}%`,
    };
    const PRESETS = {
      software: { speed: 30, checkers: 2, strict: 100, ai: 0 },
      finance: { speed: 30, checkers: 2, strict: 150, ai: 0 },
      aicheck: { speed: 30, checkers: 2, strict: 150, ai: 30 },
    };
    const BASE_RATE = 1.2, HUMAN_TIME = 1.6, AI_TIME = 0.35, ERR = 0.15, HUMAN_CATCH = 0.9, AI_CATCH = 0.5, SIM_SPEED = 2;
    const BELT_END = 300, QX = 312, BOOTH_X = 520;

    let S, visible = false, last = 0, raf = 0;
    function reset() {
      S = { t: 0, spawnAcc: 0, belt: [], hq: [], aq: [], booths: [], ai: { item: null, left: 0 }, done: 0, slips: [], finT: [], slipTotal: 0, arrivals: 0 };
    }
    reset();
    const val = k => +ctrls[k].value;
    function syncBooths() {
      const n = val("checkers");
      while (S.booths.length < n) S.booths.push({ item: null, left: 0 });
      while (S.booths.length > n) { const b = S.booths.pop(); if (b.item) S.hq.unshift(b.item); }
    }
    function readOuts() { Object.keys(ctrls).forEach(k => { el(`q-${k}-o`).textContent = outs[k](val(k)); }); }
    Object.values(ctrls).forEach(c => c.addEventListener("input", () => { readOuts(); syncBooths(); }));

    el("q-restart").addEventListener("click", () => { reset(); syncBooths(); draw(); });
    function preset(name) {
      const p = PRESETS[name]; if (!p) return;
      Object.entries(p).forEach(([k, v]) => { ctrls[k].value = v; });
      readOuts(); reset(); syncBooths();
    }
    preset("software");

    function step(dt) {
      S.t += dt;
      const rate = BASE_RATE * (1 + val("speed") / 100);
      S.spawnAcc += dt * rate;
      while (S.spawnAcc >= 1) {
        S.spawnAcc -= 1; S.arrivals++;
        S.belt.push({ x: -10, err: Math.random() < ERR, toAI: Math.random() < val("ai") / 100 });
      }
      // belt movement
      S.belt.forEach(it => { it.x += 170 * dt; });
      while (S.belt.length && S.belt[0].x >= BELT_END) {
        const it = S.belt.shift();
        (it.toAI ? S.aq : S.hq).push(it);
      }
      const finish = (it, catchRate) => {
        if (it.err && Math.random() > catchRate) { S.slips.push(S.t); S.slipTotal++; S.done++; S.finT.push(S.t); }
        else if (!it.err) { S.done++; S.finT.push(S.t); }
      };
      // quality channel: more AI drafting means more checking per draft (Chen & Stratton 2026)
      const qual = 1 + 0.6 * val("speed") / 100;
      const htime = HUMAN_TIME * (val("strict") / 100) * qual;
      S.booths.forEach(b => {
        if (b.item) { b.left -= dt; if (b.left <= 0) { finish(b.item, HUMAN_CATCH); b.item = null; } }
        if (!b.item && S.hq.length) { b.item = S.hq.shift(); b.left = htime; b.total = htime; }
      });
      const a = S.ai;
      if (a.item) { a.left -= dt; if (a.left <= 0) { finish(a.item, AI_CATCH + 0.2 - 0.5 * val("ai") / 100); a.item = null; } }
      if (!a.item && S.aq.length) { a.item = S.aq.shift(); a.left = AI_TIME * qual; a.total = AI_TIME * qual; }
      S.slips = S.slips.filter(t => S.t - t < 60);
      S.finT = S.finT.filter(t => S.t - t < 60);
    }

    function sq(x, y, s, it, alpha = 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = it.err ? "#ee406f" : "#05b047";
      ctx.fillRect(x, y, s, s);
      ctx.globalAlpha = 1;
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "#86a891";
      ctx.fillText("AI drafts arrive", 8, 18);
      ctx.fillText("Waiting to be checked", QX, 18);
      ctx.fillText("Checkers", BOOTH_X, 18);
      // belt
      ctx.strokeStyle = "#23603a"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 120); ctx.lineTo(BELT_END, 120); ctx.moveTo(0, 136); ctx.lineTo(BELT_END, 136); ctx.stroke();
      ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(BELT_END, 128); ctx.stroke(); ctx.setLineDash([]);
      S.belt.forEach(it => sq(it.x, 123, 10, it));
      // human queue grid
      const cols = 14, cell = 13, qTop = 32, maxShow = cols * 7;
      S.hq.slice(0, maxShow).forEach((it, i) => sq(QX + (i % cols) * cell, qTop + Math.floor(i / cols) * cell, 10, it));
      if (S.hq.length > maxShow) { ctx.fillStyle = "#ffb000"; ctx.fillText(`+${S.hq.length - maxShow} more`, QX, qTop + 7 * cell + 12); }
      // AI queue
      ctx.fillStyle = "#86a891"; ctx.fillText("AI checker queue", QX, 205);
      S.aq.slice(0, cols).forEach((it, i) => sq(QX + i * cell, 212, 10, it));
      // human booths
      const bh = Math.min(26, 150 / Math.max(1, S.booths.length));
      S.booths.forEach((b, i) => {
        const y = 30 + i * (bh + 4);
        ctx.strokeStyle = "#23603a"; ctx.strokeRect(BOOTH_X, y, 110, bh);
        if (b.item) {
          sq(BOOTH_X + 6, y + bh / 2 - 5, 10, b.item);
          ctx.fillStyle = "#3dff7a"; ctx.fillRect(BOOTH_X + 22, y + bh / 2 - 1, 80 * (1 - b.left / b.total), 2);
        }
      });
      // AI booth
      ctx.strokeStyle = val("ai") > 0 ? "#995c00" : "#173a22"; ctx.strokeRect(BOOTH_X, 205, 110, 22);
      ctx.fillStyle = "#86a891"; ctx.fillText("AI", BOOTH_X + 84, 220);
      if (S.ai.item) sq(BOOTH_X + 6, 211, 10, S.ai.item);
      // counters
      el("q-done").textContent = S.done;
      el("q-wait").textContent = S.hq.length + S.aq.length;
      el("q-rate").textContent = Math.round(BASE_RATE * (1 + val("speed") / 100) * 60);
      el("q-slip").textContent = S.slipTotal;
      // alert when more than 4% of recently finished drafts carry an undetected error
      el("q-alert").classList.toggle("is-on", S.slips.length >= 3 && S.slips.length / Math.max(1, S.finT.length) > 0.04);
      const secs = Math.floor(S.t / SIM_SPEED);
      el("q-clock").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    }
    function loop(ts) {
      const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
      step(dt * SIM_SPEED); draw();
      if (visible) raf = requestAnimationFrame(loop);
    }
    function setVisible(on) {
      if (on === visible) return;
      visible = on;
      if (on) { last = performance.now(); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
    }
    draw();
    return { preset, setVisible };
  })();

  /* ---------- Policy dial (3 credits, starting from the baseline) ---------- */
  const LEVERS = [
    { id: "guidance", name: "Guidance on checking AI output", cost: 1,
      note: "ASIC and APRA set expectations for checking AI output under existing powers. Trade-off: if it demands human sign-off on everything, it deepens the bottleneck. Measure: AI-related breaches and approval times.",
      apply: p => { p.aiShare = p.aiShare.map((v, i) => Math.max(v, [0, 0.04, 0.08, 0.12, 0.15][i])); p.aiCatch = Math.max(p.aiCatch, 0.8); } },
    { id: "capacity", name: "Build checking capacity", cost: 1,
      note: "Firms retrain staff as checkers, backed by training incentives. Fixes the volume problem. Trade-off: costs land before gains. Measure: review times.",
      apply: p => { p.realloc = Math.max(p.realloc, 0.6); } },
    { id: "junior", name: "Protect the junior pipeline", cost: 1,
      note: "Keep graduate roles as apprentice checkers, so today's juniors become 2030's senior reviewers. Trade-off: a short-run cost while juniors look replaceable. Measure: graduate intake.",
      apply: p => { p.realloc += 0.08; } },
    { id: "tools", name: "Fund shared verification tools", cost: 1,
      note: "Shared checking tools mean each AI draft needs less checking: the only lever aimed at the quality problem. Trade-off: public money for private benefit. Measure: error and rework rates.",
      apply: p => { p.finMult = 1.1; } },
    { id: "audit", name: "Require auditable models", cost: 1,
      note: "Prefer open-weight or contractually auditable models, so firms can inspect what checks their work. 30% of the AI use cases ASIC reviewed relied on third-party models (ASIC 2024). Trade-off: less choice of vendor. Measure: share of models open to audit.",
      apply: p => { p.aiCatch = Math.min(0.95, (p.aiCatch || 0.6) + 0.15); p.aiShare = p.aiShare.map(v => v + 0.05); } },
    { id: "measure", name: "Measure finished output, not drafts", cost: 0,
      note: "Free. Changes no outcome, but stops firms and governments misreading volume as productivity. Watch what the readout reports.",
      apply: () => {} },
  ];
  function initPolicy() {
    const host = $("#levers"); if (!host) return;
    const chosen = new Set();
    LEVERS.forEach(l => {
      const b = document.createElement("button");
      b.className = "lever"; b.dataset.id = l.id; b.setAttribute("aria-pressed", "false");
      b.innerHTML = `<span class="box"></span><span>${l.name}${l.cost ? "" : ' <span class="free">free</span>'}<small>${l.note}</small></span>`;
      b.addEventListener("click", () => { chosen.has(l.id) ? chosen.delete(l.id) : chosen.add(l.id); render(); });
      host.appendChild(b);
    });
    function render() {
      const used = LEVERS.filter(l => chosen.has(l.id)).reduce((a, l) => a + l.cost, 0);
      const left = 3 - used;
      $("#credits-left").textContent = left;
      $("#credit-pips").innerHTML = [0, 1, 2].map(i => `<span class="pip${i < used ? " used" : ""}"></span>`).join("");
      $$(".lever", host).forEach(b => {
        const l = LEVERS.find(x => x.id === b.dataset.id), on = chosen.has(l.id);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.disabled = !on && l.cost > left;
      });
      const base = Model.PRESETS.baseline;
      const p = JSON.parse(JSON.stringify(base));
      LEVERS.forEach(l => { if (chosen.has(l.id)) l.apply(p); });
      const mine = Model.run(p), b0 = Model.run(base), up = Model.run(Model.PRESETS.upside);
      Viz.lineChart($("#chart-policy"), {
        years: Model.YEARS, fmt: Viz.pct, yMin: 0.975, yMax: 1.1,
        ariaLabel: "Net output under your policy choices versus the baseline and upside",
        series: [
          { name: "Upside", values: up.map(r => r.net), color: "#5f7d69", dash: "4 4" },
          { name: "Baseline", values: b0.map(r => r.net), color: Viz.SCEN_COLOR.baseline },
          { name: "Your policy", values: mine.map(r => r.net), color: "var(--neon)", width: 3 },
        ],
      });
      const r = mine[4], r0 = b0[4];
      const measured = chosen.has("measure");
      const rows = [
        [measured ? "Reported gain (finished output)" : "Reported gain (counting drafts)", measured ? pctNum((r.finished - 1) * 100) : pctNum((r.drafts - 1) * 100), measured ? "" : "up"],
        ["Net output after error costs", pctNum((r.net - 1) * 100), r.net > r0.net + 0.002 ? "up" : ""],
        ["Pass-through", r.passThrough.toFixed(2), r.passThrough > r0.passThrough + 0.01 ? "up" : ""],
        ["Backlog of unchecked work", `${Math.round(r.backlog * 100)}`, r.backlog > r0.backlog + 0.01 ? "down" : ""],
        ["Errors slipping through, per 1,000", r.slippedPer1000.toFixed(1), r.slippedPer1000 > r0.slippedPer1000 + 0.5 ? "down" : ""],
      ];
      $("#policy-readout").innerHTML = `<div><dt><b style="color:var(--neon);font-weight:500">In 2030</b></dt><dd></dd></div>` +
        rows.map(([k, v, c]) => `<div><dt>${k}</dt><dd class="${c}">${v}</dd></div>`).join("");
    }
    render();
  }

  /* ---------- Assumptions panel ---------- */
  function initAssume() {
    const fin = $("#a-fin"); if (!fin) return;
    const exp = $("#a-exp"), rem = $("#a-rem");
    const set = () => { fin.value = 1.5; exp.value = 0.44; rem.value = 10; };
    set();
    const render = () => {
      $("#a-fin-o").textContent = (+fin.value).toFixed(1) + "×";
      $("#a-exp-o").textContent = Math.round(exp.value * 100) + "%";
      $("#a-rem-o").textContent = rem.value;
      const ov = { finMult: +fin.value, exposure: +exp.value, remediationCost: +rem.value };
      const rows = ["baseline", "upside", "downside"].map(k => {
        const r = Model.run(Model.PRESETS[k], ov)[4];
        return `<tr><td>${k[0].toUpperCase() + k.slice(1)}</td><td>${pctNum((r.drafts - 1) * 100)}</td><td>${pctNum((r.finished - 1) * 100)}</td><td>${r.passThrough.toFixed(2)}</td><td>${pctNum((r.net - 1) * 100)}</td></tr>`;
      });
      $("#assume-table").innerHTML = "<tr><th>2030</th><th>Drafts</th><th>Finished</th><th>Pass-through</th><th>Net</th></tr>" + rows.join("");
    };
    [fin, exp, rem].forEach(i => i.addEventListener("input", render));
    $("#a-reset").addEventListener("click", () => { set(); render(); });
    render();
  }


  /* ---------- Approve-the-drafts game (60 seconds, three phases) ---------- */
  const RULES = {
    pr: "Approve only if tests passed and no security check is removed.",
    loan: "Approve only if repayments are under 35% of monthly income.",
    soa: "Approve only if the advice matches the client's risk profile.",
    aml: "Approve only if transactions were actually screened.",
    hard: "Approve only if the customer is offered real help.",
  };
  const CODE = [
    { k: "pr", t: "Pull request #412", r: [["Change", "Add input check to login form"], ["Tests", "14 passed"]] },
    { k: "pr", t: "Pull request #415", r: [["Change", "Speed up report export"], ["Tests", "31 passed"]] },
    { k: "pr", t: "Pull request #419", r: [["Change", "Fix date format on statements"], ["Tests", "9 passed"]] },
    { k: "pr", t: "Pull request #430", r: [["Change", "Add logging to API"], ["Tests", "17 passed"]] },
    { k: "pr", t: "Pull request #421", r: [["Change", "Refactor payment module"], ["Tests", "0 run"]], bad: "no tests were run" },
    { k: "pr", t: "Pull request #426", r: [["Change", "Update login page"], ["Tests", "22 passed"], ["Note", "Removes password check"]], bad: "it removes a security check" },
  ];
  const FIN = [
    { k: "loan", t: "Loan assessment", r: [["Monthly income", "$7,670"], ["Repayments", "$1,850 / month"]] },
    { k: "loan", t: "Loan assessment", r: [["Monthly income", "$6,500"], ["Repayments", "$2,100 / month"]] },
    { k: "loan", t: "Loan assessment", r: [["Monthly income", "$3,420"], ["Repayments", "$3,900 / month"]], bad: "repayments exceed income" },
    { k: "soa", t: "Statement of advice", r: [["Risk profile", "Conservative"], ["Recommends", "Cash and bonds"]] },
    { k: "soa", t: "Statement of advice", r: [["Risk profile", "Conservative"], ["Recommends", "90% crypto"]], bad: "crypto doesn't suit a conservative client" },
    { k: "aml", t: "AML screening report", r: [["Transactions", "312 screened"], ["Flagged", "2, escalated"]] },
    { k: "aml", t: "AML screening report", r: [["Transactions", "0 screened"], ["Status", "Complete"]], bad: "nothing was screened" },
    { k: "hard", t: "Hardship response", r: [["Customer", "Lost job in May"], ["Offer", "3-month repayment pause"]] },
    { k: "hard", t: "Hardship response", r: [["Customer", "Lost job in May"], ["Offer", "None; $250 late fee added"]], bad: "no help is offered" },
  ];
  // phases by elapsed seconds: 0-20 human speed, 20-40 AI writes code, 40-60 AI moves into finance
  const PHASES = [
    { from: 0, name: "Before AI: drafts at human speed", until: "until AI agents arrive", next: "AI agents arrive in", gap: () => 3200, pool: CODE },
    { from: 20, name: "AI agents writing code: 3x faster", until: "until AI moves into finance", next: "AI moves into finance in", gap: el => 1100 - (el - 20) * 10, pool: CODE, banner: "> AI AGENTS DEPLOYED: DRAFTS NOW ARRIVE 3x FASTER" },
    { from: 40, name: "AI agents in finance: stricter checks", until: "until the game ends", next: null, gap: () => 750, pool: FIN, banner: "> AI AGENTS NOW DEPLOYED IN FINANCE" },
  ];
  function initGame() {
    const root = $("#game"); if (!root) return;
    const st = { on: false };
    const draftEl = $("#g-draft"), pile = $("#g-pile");
    const pick = arr => ({ ...arr[Math.floor(Math.random() * arr.length)] });
    const elapsed = () => 60 - st.left;
    const phaseAt = el => (el >= 40 ? 2 : el >= 20 ? 1 : 0);
    function show() {
      const d = st.queue[0];
      if (!d) { draftEl.innerHTML = '<h4>Queue empty</h4><p style="margin:0;color:var(--ink-dim)">Waiting for the next draft...</p>'; return; }
      draftEl.innerHTML = `<h4>${d.t}${d.ai ? ' <span class="ai-tag">AI draft</span>' : ""}</h4><p class="draft__rule">${RULES[d.k]}</p><dl>${d.r.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
    }
    function hud() {
      const el = elapsed(), ph = phaseAt(el), P = PHASES[ph];
      const endAt = (ph + 1) * 20, toEnd = Math.max(0, Math.ceil(endAt - el));
      $("#g-stage-n").textContent = `Phase ${ph + 1} of 3`;
      $("#g-stage-h").textContent = P.name;
      $("#g-cd").textContent = `0:${String(toEnd).padStart(2, "0")}`;
      $("#g-cd-l").textContent = P.until;
      root.querySelector(".game__cd").classList.toggle("soon", toEnd <= 5 && ph < 2);
      [0, 1, 2].forEach(i => { $(`#g-seg${i}`).style.width = Math.max(0, Math.min(1, (el - i * 20) / 20)) * 100 + "%"; });
      $("#g-time").textContent = Math.max(0, Math.ceil(st.left));
      $("#g-wait").textContent = Math.max(0, st.queue.length - 1);
      $("#g-ok").textContent = st.ok; $("#g-no").textContent = st.no;
      $("#g-bar").style.width = (st.left / 60) * 100 + "%";
      const nWait = Math.max(0, st.queue.length - 1);
      $("#g-pile-n").textContent = nWait;
      pile.parentNode.classList.toggle("full", nWait >= 20);
      if (!nWait) { pile.innerHTML = `<span class="game__pile-empty">Empty: you're keeping up</span>`; return; }
      pile.innerHTML = st.queue.slice(1, 60).map(d => `<i class="${d.fin ? "fin" : d.ai ? "ai" : ""}"></i>`).join("") +
        (st.queue.length > 61 ? `<span style="font-family:var(--mono);font-size:.75rem;color:var(--amber)">+${st.queue.length - 61}</span>` : "");
    }
    function spawn() {
      const el = elapsed(), ph = phaseAt(el), P = PHASES[ph];
      if (ph !== st.phase) {
        st.phase = ph;
        if (ph === 1) st.waitBefore = st.queue.length;
        if (P.banner) { const b = $("#g-banner"); b.textContent = P.banner; b.hidden = false; b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
      }
      st.queue.push({ ...pick(P.pool), fin: ph === 2, ai: ph > 0 });
      if (st.queue.length === 1) show();
      hud();
      st.spawnT = setTimeout(() => st.on && spawn(), Math.max(650, P.gap(el)));
    }
    function decide(approve) {
      if (!st.on || !st.queue.length) return;
      const d = st.queue.shift(), right = approve ? !d.bad : !!d.bad;
      if (approve) { st.ok++; if (d.bad) st.missed++; } else { st.no++; if (d.bad) st.caught++; }
      const fb = $("#g-fb");
      fb.className = "game__fb " + (right ? "ok" : "bad");
      fb.textContent = right ? (d.bad ? `✓ Caught it: ${d.bad}.` : "✓ Correct.") : (d.bad ? `✗ Missed error: ${d.bad}.` : "✗ That draft passed the rule.");
      draftEl.classList.remove("flash-ok", "flash-bad"); void draftEl.offsetWidth;
      draftEl.classList.add(right ? "flash-ok" : "flash-bad");
      show(); hud();
    }
    function end() {
      st.on = false; clearTimeout(st.spawnT); clearInterval(st.tick);
      const waiting = st.queue.length, checked = st.ok + st.no;
      $("#game-play").hidden = true;
      const e = $("#game-end"); e.hidden = false;
      e.innerHTML = `<p class="big">Before AI, ${st.waitBefore ?? waiting} drafts were waiting. By the end, ${waiting} were.</p>
        <p>You checked ${checked} drafts and approved ${st.missed} with an error. The AI never slowed down; you were the bottleneck. That is the review queue Chen and Stratton measured.</p>
        <button class="btn btn--go" id="game-again">Play again</button>`;
      $("#game-again").addEventListener("click", start);
    }
    function start() {
      Object.assign(st, { on: true, left: 60, queue: [], ok: 0, no: 0, missed: 0, caught: 0, phase: 0, waitBefore: null });
      $("#game-start").hidden = true; $("#game-end").hidden = true; $("#game-play").hidden = false; $("#g-banner").hidden = true;
      $("#g-fb").textContent = "";
      show(); hud(); spawn();
      const t0 = performance.now();
      st.tick = setInterval(() => { st.left = 60 - (performance.now() - t0) / 1000; hud(); if (st.left <= 0) end(); }, 200);
    }
    $("#game-go").addEventListener("click", start);
    $("#game-skip").addEventListener("click", end);
    $("#g-approve").addEventListener("click", () => decide(true));
    $("#g-reject").addEventListener("click", () => decide(false));
    document.addEventListener("keydown", e => {
      if (!st.on || e.target.matches("input, textarea")) return;
      if (e.key === "a" || e.key === "A") decide(true);
      if (e.key === "r" || e.key === "R") decide(false);
    });
  }

  /* ---------- You're the regulator (5 decisions) ---------- */
  const DECISIONS = [
    { y: 2026, q: "A major bank wants AI to draft every home-loan assessment.",
      o: [["Allow, with human sign-off", p => p], ["Allow, sign-off optional", p => { p.aiShare = p.aiShare.map(v => v + 0.25); p.aiCatch = 0.5; }]] },
    { y: 2027, q: "Banks propose cutting graduate intake, since AI does junior work.",
      o: [["Fund apprentice checker roles", p => { p.realloc += 0.15; }], ["Let the market decide", p => { p.realloc = Math.max(0.15, p.realloc - 0.12); }]] },
    { y: 2028, q: "ASIC could issue guidance on checking AI output.",
      o: [["Issue guidance now", p => { p.aiShare = p.aiShare.map((v, i) => Math.max(v, [0, 0.04, 0.08, 0.12, 0.15][i])); p.aiCatch = Math.max(p.aiCatch, 0.8); p.realloc += 0.15; }], ["Wait for an incident", p => { p.waited = true; }]] },
    { y: 2029, q: "Closed AI models are cheaper; open-weight ones can be audited.",
      o: [["Require auditable models", p => { p.aiCatch = Math.min(0.95, p.aiCatch + 0.15); }], ["Let firms choose", p => p]] },
    { y: 2030, q: "Treasury asks how to judge AI's success.",
      o: [["Count finished output", p => { p.measure = "finished"; }], ["Count drafts produced", p => { p.measure = "drafts"; }]] },
  ];
  function initRegulator() {
    const root = $("#reg"); if (!root) return;
    let i = 0, picks = [];
    function params() {
      const p = JSON.parse(JSON.stringify(Model.PRESETS.baseline));
      p.aiCatch = 0.6;
      picks.forEach(([d, k]) => DECISIONS[d].o[k][1](p));
      if (p.waited && p.aiShare.some(v => v > 0.2)) p.clampdownYear = 2029;
      return p;
    }
    function render() {
      const done = i >= DECISIONS.length;
      $("#reg-year").textContent = done ? "2030: your result" : `Decision ${i + 1} of 5, ${DECISIONS[i].y}`;
      $("#reg-q").textContent = done ? "" : DECISIONS[i].q;
      $("#reg-opts").innerHTML = done ? '<button class="btn" id="reg-again">Start again</button>'
        : DECISIONS[i].o.map(([t], k) => `<button class="btn" data-k="${k}">${t}</button>`).join("");
      $("#reg-log").innerHTML = picks.map(([d, k]) => `<li>${DECISIONS[d].y}: ${DECISIONS[d].o[k][0]}</li>`).join("");
      $$("#reg-opts [data-k]").forEach(b => b.addEventListener("click", () => { picks.push([i, +b.dataset.k]); i++; render(); }));
      const again = $("#reg-again"); if (again) again.addEventListener("click", () => { i = 0; picks = []; render(); });
      const p = params(), rows = Model.run(p), r = rows[4];
      const out = $("#reg-out");
      const chartHost = document.createElement("div"); chartHost.className = "chart";
      let head = "";
      if (done) {
        const k = r.slippedPer1000 > 9 || r.net < 0.975 ? "downside" : r.passThrough > 0.6 ? "upside" : "baseline";
        const txt = { downside: "You created the downside: unchecked AI, then a reckoning.", upside: "You created the upside: checking kept pace with AI.", baseline: "You created the baseline: a growing review backlog." }[k];
        const shown = p.measure === "drafts" ? `Reported gain: ${pctNum((r.drafts - 1) * 100)}, counting drafts.` : `Reported gain: ${pctNum((r.finished - 1) * 100)}, counting finished output.`;
        head = `<p class="reg__verdict" style="color:${k === "downside" ? "var(--red)" : k === "upside" ? "var(--neon)" : "var(--amber)"}">${txt}</p><p class="panel__note" style="margin:0 0 .5rem">${shown} Net after error costs: ${pctNum((r.net - 1) * 100)}.</p>`;
      }
      out.innerHTML = head; out.appendChild(chartHost);
      Viz.lineChart(chartHost, {
        years: Model.YEARS, fmt: Viz.pct, yMin: 0.95, yMax: 1.1,
        ariaLabel: "Net output under your decisions",
        series: [
          { name: "Upside", values: Model.run(Model.PRESETS.upside).map(x => x.net), color: "#5f7d69", dash: "4 4" },
          { name: "Downside", values: Model.run(Model.PRESETS.downside).map(x => x.net), color: "#5f7d69", dash: "1 4" },
          { name: "Your path", values: rows.map(x => x.net), color: "var(--neon)", width: 3 },
        ],
      });
    }
    render();
  }

  function initAffordances() {
    $$(".panel").forEach(p => {
      if (!p.querySelector(".tag-play, input[type=range], .lever, #game, #reg")) return;
      p.classList.add("is-interactive");
      const touch = () => p.classList.add("touched");
      p.addEventListener("pointerdown", touch, { once: true });
      p.addEventListener("keydown", touch, { once: true });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initAffordances();
    initSteps(); initGuess(); initPolicy(); initAssume(); initGame(); initRegulator();
  });
})();
