/* 英文闖關 v1 */
"use strict";
const EXAM = new Date("2026-11-29T09:00:00+08:00");
const XP_GOAL = 3000, DAY_GOAL = 100, ROUND = 10;
const SRS_DAYS = [0, 1, 2, 4, 7, 15, 30];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const today = () => ymd(new Date());
const yesterday = () => { const y = new Date(); y.setDate(y.getDate() - 1); return ymd(y); };
const words = t => (t.match(/[A-Za-z][A-Za-z'-]*/g) || []);
const norm = w => String(w || "").toLowerCase().replace(/[^a-z'-]/g, "");

/* ---------- 存檔 ---------- */
const S = Object.assign({ xp: 0, days: {}, streak: 0, lastDay: "", best: {}, srs: {}, slow: false, cover: true, totals: { listen: 0, fill: 0 } },
  JSON.parse(localStorage.getItem("eg_state") || "{}"));
const save = () => localStorage.setItem("eg_state", JSON.stringify(S));
function touchDay() {
  const t = today();
  if (S.lastDay === t) return;
  S.streak = (S.lastDay === yesterday()) ? S.streak + 1 : 1;
  S.lastDay = t; save();
}
function addXP(n, ev) {
  if (n <= 0) return;
  touchDay();
  S.xp += n; S.days[today()] = (S.days[today()] || 0) + n; save();
  if (G) G.xpGained += n;
  if (ev) { const f = document.createElement("div"); f.className = "xpfly"; f.textContent = "+" + n + " XP";
    f.style.left = (ev.clientX || innerWidth / 2) + "px"; f.style.top = (ev.clientY || innerHeight / 2) + "px";
    document.body.appendChild(f); setTimeout(() => f.remove(), 1000); }
  renderTop();
}
function toast(t) { const e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), 1800); }

/* ---------- 音效 ---------- */
let AC;
function beep(ok) {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const notes = ok ? [660, 880] : [220, 160];
    notes.forEach((f, i) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = ok ? "triangle" : "sawtooth"; o.frequency.value = f;
      g.gain.setValueAtTime(.12, AC.currentTime + i * .12); g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + i * .12 + .2);
      o.connect(g).connect(AC.destination); o.start(AC.currentTime + i * .12); o.stop(AC.currentTime + i * .12 + .22); });
  } catch (e) {}
}
function speak(w) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(w); u.lang = "en-US"; u.rate = S.slow ? .7 : .9; speechSynthesis.speak(u); } catch (e) {} }

/* ---------- 頂部 ---------- */
function renderTop() {
  $("#tXP").textContent = S.xp;
  $("#tLv").textContent = "Lv." + (Math.floor(S.xp / 200) + 1);
  const alive = S.lastDay === today() || S.lastDay === yesterday();
  $("#tStreak").textContent = alive ? S.streak : 0;
  const td = S.days[today()] || 0;
  $("#tToday").textContent = td; $("#tRing").style.setProperty("--p", Math.min(100, td / DAY_GOAL * 100));
}

/* ---------- 資料 ---------- */
let LEVELS = [], CACHE = {};
const STATIC = !!window.EG_STATIC;
async function api(path, body) {
  if (STATIC) {
    if (path === "/api/levels") return (await fetch("levels/index.json")).json();
    const m = path.match(/^\/api\/level\/([\w-]+)$/);
    if (m) return (await fetch("levels/" + m[1] + ".json")).json();
    if (path === "/api/save_vocab") return { ok: true };
    return { ok: false, error: "網路版不能用這個功能" };
  }
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  return r.json();
}
async function getLevel(id) { if (!CACHE[id]) CACHE[id] = await api("/api/level/" + id); return CACHE[id]; }
const srsKey = (lid, w) => lid + "|" + w;
function vocabStats(lv) {
  let mastered = 0, due = 0, now = Date.now();
  (lv.vocab || []).forEach(v => { const c = S.srs[srsKey(lv.id, v.word)]; if (c && c.box >= 3) mastered++; if (c && c.due <= now) due++; });
  return { mastered, due };
}
const starsOf = pct => pct >= .9 ? 3 : pct >= .7 ? 2 : pct >= .5 ? 1 : 0;
const starStr = n => "⭐".repeat(n) + "☆".repeat(3 - n);

/* ---------- 首頁 ---------- */
async function renderHome() {
  renderTop();
  LEVELS = await api("/api/levels");
  const days = Math.max(0, Math.ceil((EXAM - new Date()) / 864e5));
  $("#countdown").textContent = days > 0 ? `⏳ 距離考試 ${days} 天（11/29）` : "📝 考試加油！";
  const p = Math.min(1, S.xp / XP_GOAL);
  $("#gBar").style.width = (p * 100) + "%";
  $("#gNow").textContent = Math.round(600 + 150 * p);
  $("#gNow").parentElement.title = "練習進度：" + S.xp + " / " + XP_GOAL + " XP（不是分數預測）";
  $("#sListen").textContent = S.totals.listen; $("#sFill").textContent = S.totals.fill;
  let mastered = 0, due = 0;
  const grid = $("#levelGrid"); grid.innerHTML = "";
  for (const [i, L] of LEVELS.entries()) {
    const lv = await getLevel(L.id);
    const vs = vocabStats(lv); mastered += vs.mastered; due += vs.due;
    const b = S.best[L.id] || {};
    const st = Math.max(starsOf(b.listen || 0), 0);
    const el = document.createElement("div"); el.className = "lv";
    el.innerHTML = `
      <div class="thumb" style="background-image:url(https://i.ytimg.com/vi/${esc(L.video_id)}/hqdefault.jpg)">
        <div class="num">${esc(L.emoji || "🎬")} 第 ${i + 1} 關</div><div class="lvStars">${starStr(st)}</div></div>
      <div class="lvBody">
        <div class="lvT">${esc(L.title)}</div><div class="lvS">${esc(L.subtitle || "")}</div>
        <div class="meters">
          <div>🎧 ${Math.round((b.listen || 0) * 100)}%<div class="bar"><div class="fill" style="width:${(b.listen || 0) * 100}%"></div></div></div>
          <div>✏️ ${Math.round((b.fill || 0) * 100)}%<div class="bar"><div class="fill" style="width:${(b.fill || 0) * 100}%"></div></div></div>
          <div>🃏 ${vs.mastered}/${L.n_vocab}<div class="bar"><div class="fill" style="width:${L.n_vocab ? vs.mastered / L.n_vocab * 100 : 0}%"></div></div></div>
        </div>
        <div class="modes">
          <button class="btn m1" data-m="listen">🎧 聽力</button>
          <button class="btn m2" data-m="fill">✏️ 填空</button>
          <button class="btn m3" data-m="vocab">🃏 單字${vs.due ? `<span class="badge">${vs.due}</span>` : ""}</button>
        </div></div>`;
    el.querySelectorAll("button").forEach(btn => btn.onclick = () => startGame(L.id, btn.dataset.m));
    grid.appendChild(el);
  }
  $("#sWords").textContent = mastered; $("#sDue").textContent = due;
}

/* ---------- 路由 ---------- */
function go(v) {
  document.querySelectorAll(".view").forEach(e => e.classList.remove("on"));
  $("#v-" + v).classList.add("on");
  if (v !== "game") stopClip();
  if (v === "home") renderHome();
  if (v === "add") renderAdd();
  scrollTo(0, 0);
}

/* ---------- YouTube 播放器 ---------- */
let YTP = null, apiReady = false, ytReady = false, curVid = null, clipTimer = null, curClip = null;
window.onYouTubeIframeAPIReady = () => { apiReady = true; if (curVid && !YTP) makePlayer(curVid); };
function makePlayer(vid) {
  ytReady = false;
  YTP = new YT.Player("player", {
    width: "100%", height: "100%", videoId: vid,
    playerVars: { rel: 0, modestbranding: 1, cc_load_policy: 0, iv_load_policy: 3, playsinline: 1, controls: 1, origin: location.origin },
    events: {
      onReady: () => { ytReady = true; },
      onError: e => { $("#vmsg").innerHTML = `⚠️ 這部影片不能在這裡播放（錯誤 ${e.data}）。<a href="https://www.youtube.com/watch?v=${esc(curVid)}${curClip ? "&t=" + Math.floor(curClip[0]) + "s" : ""}" target="_blank">到 YouTube 開 ↗</a>`; },
      onStateChange: e => { const p = $("#cover .pulse"); if (p) p.classList.toggle("playing", e.data === 1); if (e.data === 1) { $("#vmsg").textContent = ""; try { YTP.unloadModule("captions"); YTP.unloadModule("cc"); } catch (x) {} applyRate(); } }
    }
  });
}
function loadVideo(vid) {
  $("#vmsg").textContent = "";
  if (vid === curVid && YTP) return;
  curVid = vid;
  if (YTP && ytReady) YTP.cueVideoById(vid);
  else if (!YTP && apiReady) makePlayer(vid);
}
function applyRate() { try { YTP.setPlaybackRate(S.slow ? 0.75 : 1); } catch (e) {} }
function playClip(start, end) {
  curClip = [start, end];
  if (!ytReady) { $("#vmsg").textContent = "⏳ 播放器載入中…"; setTimeout(() => playClip(start, end), 600); return; }
  $("#vmsg").textContent = "";
  clearInterval(clipTimer);
  const s = Math.max(0, start - 0.35), e = end + 0.45;
  YTP.seekTo(s, true); YTP.playVideo(); applyRate();
  setTimeout(() => { try { if (YTP.getPlayerState() !== 1 && YTP.getPlayerState() !== 3 && curClip && curClip[0] === start) {
    $("#vmsg").textContent = "📱 沒聲音？先點一下影片畫面，再按 🔊 播放"; $("#cover").classList.add("off"); } } catch (x) {} }, 2500);
  clipTimer = setInterval(() => {
    let t = 0; try { t = YTP.getCurrentTime(); } catch (x) {}
    if (t >= e || t < s - 2) { if (t >= e) YTP.pauseVideo(); clearInterval(clipTimer); }
  }, 100);
}
function replay() { if (curClip) playClip(curClip[0], curClip[1]); }
function stopClip() { clearInterval(clipTimer); try { YTP && YTP.pauseVideo(); } catch (e) {} }
function toggleSlow() { S.slow = !S.slow; save(); $("#bSlow").classList.toggle("on", S.slow); applyRate(); }
function toggleCover() { S.cover = !S.cover; save(); $("#cover").classList.toggle("off", !S.cover); $("#bCover").classList.toggle("on", S.cover); }

/* ---------- 遊戲共用 ---------- */
let G = null;
function setProgress() {
  $("#qBar").style.width = (G.i / G.items.length * 100) + "%";
  $("#combo").textContent = G.combo >= 2 ? "🔥 x" + G.combo : "";
}
function quitGame() { G = null; go("home"); }
async function startGame(lid, mode) {
  const lv = await getLevel(lid);
  G = { lv, mode, i: 0, right: 0, combo: 0, xpGained: 0, items: [] };
  $("#gTitle").textContent = { listen: "🎧 聽力挑戰", fill: "✏️ 填空", vocab: "🃏 單字卡" }[mode] + "｜" + lv.title;
  $("#bSlow").classList.toggle("on", S.slow); $("#cover").classList.toggle("off", !S.cover); $("#bCover").classList.toggle("on", S.cover);
  loadVideo(lv.video_id);
  const sent = id => lv.sentences[id];
  if (mode === "listen") G.items = shuffle(lv.listening).slice(0, ROUND).map(x => sent(x.sid)).filter(Boolean);
  if (mode === "fill") G.items = shuffle(lv.fill).slice(0, ROUND).map(x => ({ s: sent(x.sid), answer: x.answer })).filter(x => x.s);
  if (mode === "vocab") G.items = buildDeck(lv);
  if (!G.items.length) { toast(mode === "vocab" ? "🎉 今天的單字都複習完了！" : "這關沒有題目"); G = null; return; }
  go("game"); setProgress(); nextQ();
}
function nextQ() {
  if (G.i >= G.items.length) return finish();
  setProgress();
  ({ listen: qListen, fill: qFill, vocab: qVocab })[G.mode]();
}
function answer(ok, ev, xp) {
  beep(ok);
  if (ok) { G.right++; G.combo++; addXP((xp || 10) + Math.min(10, (G.combo - 1) * 2), ev); }
  else G.combo = 0;
  setProgress();
}
function finish() {
  stopClip();
  const lv = G.lv, mode = G.mode;
  const pct = G.right / G.items.length;
  if (mode !== "vocab") {
    S.best[lv.id] = S.best[lv.id] || {};
    const first = !(S.best[lv.id][mode] >= pct);
    S.best[lv.id][mode] = Math.max(S.best[lv.id][mode] || 0, pct);
    if (pct === 1) addXP(30);
    save();
    const n = starsOf(pct);
    $("#rStars").innerHTML = [0, 1, 2].map(i => `<span class="s" style="animation-delay:${i * .2}s">${i < n ? "⭐" : "☆"}</span>`).join("");
    $("#rScore").textContent = `${G.right} / ${G.items.length}`;
    $("#rMsg").textContent = pct === 1 ? "💯 全對！+30 XP 獎勵" : n === 3 ? "太強了！" : n === 2 ? "很不錯，再一次拿三星！" : n === 1 ? "有進步，再挑戰一次 💪" : "多聽幾次，打開 🐢 慢速試試";
    if (first && pct > 0) $("#rMsg").textContent += "　🏅 新紀錄";
  } else {
    const vs = vocabStats(lv);
    $("#rStars").innerHTML = `<span class="s">🃏</span>`;
    $("#rScore").textContent = `記得 ${G.right} / ${G.items.length}`;
    $("#rMsg").textContent = `這關已熟記 ${vs.mastered} / ${lv.vocab.length} 個單字`;
  }
  $("#rXP").textContent = "+" + G.xpGained + " XP";
  $("#rAgain").onclick = () => startGame(lv.id, mode);
  go("result");
}

/* ---------- 🎧 聽力 ---------- */
function distractors(lv, correct, n) {
  const len = words(correct.en).length;
  const pool = lv.sentences.filter(s => s.id !== correct.id && s.en !== correct.en && words(s.en).length >= 4 && words(s.en).length <= 18 && !/\d/.test(s.en));
  pool.sort((a, b) => Math.abs(words(a.en).length - len) - Math.abs(words(b.en).length - len) + (Math.random() - .5) * 6);
  const out = [], seen = new Set([correct.en.toLowerCase()]);
  for (const s of pool) { if (seen.has(s.en.toLowerCase())) continue; seen.add(s.en.toLowerCase()); out.push(s); if (out.length >= n) break; }
  return out;
}
function qListen() {
  const s = G.items[G.i];
  const opts = shuffle([s, ...distractors(G.lv, s, 3)]);
  $("#qCol").innerHTML = `<div class="qLabel">第 ${G.i + 1} / ${G.items.length} 題　👂 你聽到的是哪一句？</div>
    <div class="opts">${opts.map((o, k) => `<button class="btn opt" data-id="${o.id}"><span class="k">${"ABCD"[k]}</span>${esc(o.en)}</button>`).join("")}</div><div id="fb"></div>`;
  let done = false;
  $("#qCol").querySelectorAll(".opt").forEach(b => b.onclick = ev => {
    if (done) return; done = true;
    const ok = +b.dataset.id === s.id;
    $("#qCol").querySelectorAll(".opt").forEach(x => { if (+x.dataset.id === s.id) x.classList.add("ok"); });
    if (!ok) b.classList.add("bad");
    answer(ok, ev);
    if (ok) S.totals.listen++; save();
    showFeedback(ok, s);
  });
  playClip(s.start, s.end);
}
function showFeedback(ok, s, extra) {
  $("#fb").innerHTML = `<div class="feedback"><div class="head">${ok ? "✅ 答對！" : "❌ 再聽一次"}</div>
    ${extra || ""}<div>${esc(s.en)}</div>${s.zh ? `<div class="zh">🇹🇼 ${esc(s.zh)}</div>` : ""}</div>
    <button class="btn primary next" id="bNext">下一題 →</button>`;
  $("#bNext").onclick = () => { G.i++; nextQ(); };
  $("#bNext").focus();
  if (!ok) setTimeout(replay, 400);
}

/* ---------- ✏️ 填空 ---------- */
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function qFill() {
  const it = G.items[G.i], s = it.s, ans = it.answer;
  const re = new RegExp("\\b" + ans.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
  const parts = s.en.split(re);
  const blankHTML = `<span class="blank" id="blank">${"_ ".repeat(ans.length).trim()}</span>`;
  const html = parts.length > 1 ? esc(parts[0]) + blankHTML + esc(parts.slice(1).join(ans)) : esc(s.en) + " " + blankHTML;
  $("#qCol").innerHTML = `<div class="qLabel">第 ${G.i + 1} / ${G.items.length} 題　✏️ 聽聽看，空格是哪個字？</div>
    <div class="sentence">${html}</div>
    <div class="hint">💡 ${ans[0]}${"＿".repeat(ans.length - 1)}（${ans.length} 個字母）</div>
    <div class="fillRow"><input id="fIn" autocomplete="off" spellcheck="false" placeholder="打字…"><button class="btn primary" id="fGo">確定</button></div>
    <div class="chips" id="chips"><button class="btn sm ghost" id="fHelp">🆘 給我選項（XP 減半）</button></div><div id="fb"></div>`;
  let done = false, helped = false;
  const submit = (val, ev) => {
    if (done) return;
    const v = norm(val), a = norm(ans);
    if (!v) return;
    done = true;
    const dist = lev(v, a);
    const ok = dist === 0 || (a.length >= 6 && dist === 1);
    $("#blank").textContent = ans; $("#blank").style.color = ok ? "var(--ok)" : "var(--bad)";
    answer(ok, ev, helped ? 5 : 15);
    if (ok) S.totals.fill++; save();
    showFeedback(ok, s, ok && dist === 1 ? `<div>✍️ 小拼錯：正確是 <b>${esc(ans)}</b>（你打 ${esc(val)}）</div>` : !ok ? `<div>正確答案：<b style="color:var(--gold);font-size:22px">${esc(ans)}</b></div>` : "");
  };
  $("#fIn").onkeydown = e => { if (e.key === "Enter") submit(e.target.value, e); };
  $("#fGo").onclick = e => submit($("#fIn").value, e);
  $("#fHelp").onclick = () => {
    helped = true;
    const others = shuffle(G.lv.fill.map(f => f.answer).filter(w => norm(w) !== norm(ans))).slice(0, 3);
    $("#chips").innerHTML = shuffle([ans, ...others]).map(w => `<button class="btn" data-w="${esc(w)}">${esc(w)}</button>`).join("");
    $("#chips").querySelectorAll("button").forEach(b => b.onclick = e => submit(b.dataset.w, e));
  };
  setTimeout(() => $("#fIn") && $("#fIn").focus(), 50);
  playClip(s.start, s.end);
}

/* ---------- 🃏 單字卡（間隔重複） ---------- */
function buildDeck(lv) {
  const now = Date.now(), due = [], fresh = [];
  lv.vocab.forEach(v => { const c = S.srs[srsKey(lv.id, v.word)]; if (!c) fresh.push(v); else if (c.due <= now) due.push(v); });
  due.sort((a, b) => S.srs[srsKey(lv.id, a.word)].box - S.srs[srsKey(lv.id, b.word)].box);
  return [...due, ...fresh.slice(0, Math.max(0, 15 - due.length))].slice(0, 20);
}
function highlight(text, w) {
  const base = w.split(" ")[0].toLowerCase().replace(/e$/, "").slice(0, 5);
  return esc(text).replace(new RegExp("\\b(" + base.replace(/[^a-z]/g, "") + "[a-z'-]*)", "i"), "<mark>$1</mark>");
}
function qVocab() {
  const v = G.items[G.i], lv = G.lv, s = lv.sentences[v.sid] || { en: "", start: 0, end: 0 };
  const key = srsKey(lv.id, v.word), c = S.srs[key] || { box: 0, due: 0, seen: 0 };
  const boxes = [1, 2, 3, 4, 5, 6].map(i => `<i class="${c.box >= i ? "on" : ""}"></i>`).join("");
  $("#qCol").innerHTML = `<div class="qLabel">第 ${G.i + 1} / ${G.items.length} 張　${c.seen ? "🔁 複習" : "🆕 新單字"}　點卡片翻面</div>
    <div class="flash" id="card"><div class="flashIn">
      <div class="face front"><div class="word">${esc(v.word)}</div><div class="pos">${esc(v.pos || "")}</div><div class="boxes">${boxes}</div>
        <div style="margin-top:20px;opacity:.8">🤔 想一下中文意思…</div></div>
      <div class="face back">
        ${v.zh ? `<div class="meaning">${esc(v.zh)}</div>` :
        `<div class="meaning">❓ 還沒有中文</div><div class="edit" onclick="event.stopPropagation()"><input id="zhIn" placeholder="輸入中文意思"><button class="btn sm" id="zhSave">💾</button>
          <a class="btn sm" target="_blank" href="https://dictionary.cambridge.org/zht/詞典/英語-漢語-繁體/${encodeURIComponent(v.word)}">🔎 查</a></div>`}
        <div class="ex">“${highlight(s.en, v.word)}”</div>${s.zh ? `<div class="exzh">${esc(s.zh)}</div>` : ""}
      </div></div></div>
    <div class="ctrl" style="grid-template-columns:1fr 1fr;margin-top:12px">
      <button class="btn" id="vSay">🗣️ 念單字</button><button class="btn" id="vClip">🎬 聽原句</button></div>
    <div class="rate" id="rate" style="visibility:hidden">
      <button class="btn b1" data-r="0">❌ 不記得</button><button class="btn b2" data-r="1">🤔 有點印象</button><button class="btn b3" data-r="2">✅ 記得</button></div>`;
  const card = $("#card");
  card.onclick = () => { card.classList.toggle("flip"); $("#rate").style.visibility = "visible"; };
  $("#vSay").onclick = () => speak(v.word);
  $("#vClip").onclick = () => playClip(s.start, s.end);
  if ($("#zhSave")) $("#zhSave").onclick = async () => {
    const zh = $("#zhIn").value.trim(); if (!zh) return;
    v.zh = zh; await api("/api/save_vocab", { level: lv.id, word: v.word, zh }); toast("💾 已存");
    card.querySelector(".back .meaning").textContent = zh; card.querySelector(".edit").remove();
  };
  $("#rate").querySelectorAll("button").forEach(b => b.onclick = ev => {
    const r = +b.dataset.r, now = Date.now();
    c.seen = (c.seen || 0) + 1;
    if (r === 0) { c.box = 0; c.due = now; G.items.splice(Math.min(G.items.length, G.i + 4), 0, v); beep(false); G.combo = 0; }
    else if (r === 1) { c.box = Math.max(1, c.box - 1); c.due = now + 10 * 60e3; addXP(3, ev); }
    else { c.box = Math.min(6, c.box + 1); c.due = now + SRS_DAYS[c.box] * 864e5 - 3600e3; answer(true, ev, 5); }
    S.srs[key] = c; save();
    G.i++; nextQ();
  });
  speak(v.word);
}

/* ---------- ➕ 新增關卡 ---------- */
async function renderAdd() {
  const ls = await api("/api/levels");
  const auto = ls.filter(l => l.auto);
  $("#autoList").innerHTML = auto.length ? auto.map(l => `<div class="autoItem"><img src="https://i.ytimg.com/vi/${esc(l.video_id)}/mqdefault.jpg">
    <div class="t"><b>${esc(l.title)}</b><br><small>🎧 ${l.n_listen}　✏️ ${l.n_fill}　🃏 ${l.n_vocab}</small></div>
    <button class="btn sm ghost" data-del="${esc(l.id)}">🗑️</button></div>`).join("") : `<div class="sub">還沒有，貼一個連結試試 👆</div>`;
  $("#autoList").querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("刪除這個關卡？")) return;
    await api("/api/delete_level", { level: b.dataset.del }); delete CACHE[b.dataset.del]; renderAdd();
  });
}
async function addLevel() {
  const url = $("#addUrl").value.trim(); if (!url) return;
  const out = $("#addOut"), btn = $("#addBtn");
  btn.disabled = true;
  out.innerHTML = `<div class="loading"><span class="dot">⏳</span> 抓字幕、出題中…（約 5–20 秒）</div>`;
  try {
    const r = await api("/api/add_level", { url });
    if (r.ok) {
      delete CACHE[r.id];
      out.innerHTML = `<div class="okbox">${r.exists ? "📦 這關已經有了" : "🎉 新關卡完成！"}<br><b>${esc(r.title)}</b><br>
        ${r.exists ? "" : `🎧 ${r.n_listen} 題　✏️ ${r.n_fill} 題　🃏 ${r.n_vocab} 個單字（中文可在卡片背面填）<br><small>字幕：${esc(r.source && r.source.used)}</small><br>`}
        <button class="btn primary" style="margin-top:10px" onclick="startGame('${esc(r.id)}','listen')">🎧 馬上玩</button></div>`;
      $("#addUrl").value = ""; renderAdd();
    } else out.innerHTML = `<div class="errbox">😵 ${esc(r.error || "失敗")}</div>`;
  } catch (e) { out.innerHTML = `<div class="errbox">😵 伺服器沒有回應，請重開「英文遊戲」</div>`; }
  btn.disabled = false;
}

document.addEventListener("keydown", e => {
  if (!$("#v-game").classList.contains("on") || e.target.tagName === "INPUT") return;
  if (e.key === " ") { e.preventDefault(); replay(); }
  const k = "1234abcd".indexOf(e.key.toLowerCase());
  if (k >= 0 && G && G.mode === "listen") { const b = $("#qCol").querySelectorAll(".opt")[k % 4]; if (b) b.click(); }
});
if (STATIC) document.querySelectorAll(".onlyLocal").forEach(e => e.remove());
go("home");
{ const m = location.hash.match(/^#play=([\w-]+):(listen|fill|vocab)$/); if (m) startGame(m[1], m[2]); }
