// Автотест страницы тетради: drives skills/notebook/page/wire.js with a fake db, fake comments and
// a fake clock — measure → act → measure, no browser.
//   node tools/test-page.js           run the checks
//   node tools/test-page.js --porcha  порча: break wire.js one line at a time; every break must turn
//                                     at least one check red, or that check is false comfort
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const WIRE = path.join(__dirname, "../skills/notebook/page/wire.js");

function fakes() {
  let t = 1_000_000, seq = 0;
  const timers = [];
  const clock = {
    now: () => t,
    later: (fn, ms) => { const h = { at: t + ms, fn, live: true }; timers.push(h); return h; },
    cancel: h => { if (h) h.live = false; },
  };
  const advance = ms => {
    const end = t + ms;
    for (;;) {
      const due = timers.filter(h => h.live && h.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = due.at; due.live = false; due.fn();
    }
    t = end;
  };
  const rows = new Map();
  let onRows = () => {};
  const push = () => onRows([...rows.values()].sort((a, b) => a.at - b.at));
  const store = {
    newId: () => "L" + ++seq,
    addOwner: async (id, text, via, at) => { rows.set(id, { id, from: "owner", text, via, at }); push(); },
    markResent: async (id, at) => { rows.get(id).resentAt = at; push(); },
    saveThread: async () => {},
  };
  const sent = [];
  const comments = {
    anchorFor: async () => ({ path: "#item1", x: 0, y: 0 }),
    sendToClaude: async target => { sent.push(target); return { threadId: "T1", commentId: "C" + sent.length }; },
  };
  const claudeRow = (row, extra = {}) => { rows.set(row.id, { from: "claude", at: t, ...row, ...extra }); push(); };
  return { clock, advance, store, comments, sent, claudeRow, rows, setOnRows: fn => { onRows = fn; } };
}

const tick = () => new Promise(r => setImmediate(r));

async function setup(createWire, hotFor) {
  const f = fakes();
  let last = null;
  const wire = createWire({ store: f.store, comments: f.comments, anchorEl: {}, clock: f.clock, onChange: v => { last = v; } });
  f.setOnRows(wire.setRows);
  wire.setState({ hotUntil: f.clock.now() + hotFor });
  return { ...f, wire, view: () => last };
}

const checks = [
  ["горячий разговор: строка уходит только в базу, комментария нет", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("раз"); await tick();
    return s.sent.length === 0 && s.rows.get("L1").via === "db";
  }],
  ["остывший разговор: строка уходит в базу и одним комментарием с меткой строки", async W => {
    const s = await setup(W, -1);
    await s.wire.send("два"); await tick();
    return s.sent.length === 1 && s.sent[0].text.startsWith("два") && s.sent[0].text.includes("[tetrad L1]")
      && s.rows.get("L1").via === "comment";
  }],
  ["горячее окно кончилось по часам: следующая строка уже будит комментарием", async W => {
    const s = await setup(W, 10000);
    s.advance(11000);
    await s.wire.send("три"); await tick();
    return s.sent.length === 1 && s.view().hot === false;
  }],
  ["нет ответа 30 с: появляется кнопка «разбудить», но сама страница ничего не шлёт", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("четыре"); await tick();
    s.advance(29000);
    const before = s.view().lines[0].status;
    s.advance(2000); await tick();
    return before === "waiting" && s.view().lines[0].status === "overdue" && s.sent.length === 0;
  }],
  ["кнопка «разбудить» шлёт ровно один повтор, второй раз — ничего", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("пять"); await tick();
    s.advance(31000);
    const first = await s.wire.resend("L1"); await tick();
    const second = await s.wire.resend("L1"); await tick();
    s.advance(31000); await tick();
    return first && !second && s.sent.length === 1 && s.view().lines[0].status === "silent";
  }],
  ["ответ пришёл за 20 с: кнопки нет и потом не появится", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("шесть"); await tick();
    s.advance(20000);
    s.claudeRow({ id: "re-L1", replyTo: "L1", text: "ответ", seenAt: s.clock.now() - 5000 });
    s.advance(40000); await tick();
    const owner = s.view().lines.find(l => l.id === "L1");
    return owner.status === "answered" && owner.answeredIn === 20 && owner.seenIn === 15
      && !(await s.wire.resend("L1"));
  }],
  ["«Claude пишет…» тоже снимает кнопку: сессия строку увидела", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("семь"); await tick();
    s.advance(10000);
    s.claudeRow({ id: "re-L1", replyTo: "L1", typing: true, text: "", seenAt: s.clock.now() });
    s.advance(40000); await tick();
    return s.view().lines[0].status === "seen";
  }],
  ["датчик «один ответ на строку»: ответ не на своём месте поднимает тревогу", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("восемь"); await tick();
    s.claudeRow({ id: "re-L1", replyTo: "L1", text: "ответ" });
    const clean = s.view().alerts.length === 0;
    s.claudeRow({ id: "extra", replyTo: "L1", text: "ещё ответ" });
    return clean && s.view().alerts.length === 1;
  }],
  ["ответ на одну строку не гасит соседнюю", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("первая"); await tick();
    await s.wire.send("вторая"); await tick();
    s.claudeRow({ id: "re-L1", replyTo: "L1", text: "ответ на первую" });
    s.advance(31000); await tick();
    const line = id => s.view().lines.find(l => l.id === id);
    return line("L1").status === "answered" && line("L2").status === "overdue";
  }],
  ["строка без ответа с прошлого визита сразу получает кнопку", async W => {
    const s = await setup(W, -1);
    s.rows.set("OLD", { id: "OLD", from: "owner", text: "давно", via: "comment", at: s.clock.now() - 120000 });
    s.wire.setRows([...s.rows.values()]);
    s.advance(1); await tick();
    return s.view().lines[0].status === "overdue";
  }],
];

async function runAll(wireFile, quiet) {
  const { createWire } = await import(pathToFileURL(wireFile).href + "?" + Math.random());
  const results = [];
  for (const [name, fn] of checks) {
    let ok = false;
    try { ok = await fn(createWire); } catch (e) { ok = false; }
    results.push([name, ok]);
    if (!quiet) console.log((ok ? "  зелёный  " : "  КРАСНЫЙ  ") + name);
  }
  return results;
}

// Each break: [what it simulates, exact text in wire.js, replacement].
const breaks = [
  ["горячее/холодное перепутаны", "(state.hotUntil || 0) > now()", "(state.hotUntil || 0) < now()"],
  ["горячая строка всё равно будит комментарием", "hot || !comments ? null", "!comments ? null"],
  ["повтор можно жать сколько угодно", "if (!w || w.resent ||", "if (!w ||"],
  ["страница сама шлёт повтор по таймеру", "if (w.resent) w.silent = true; else w.overdue = true;",
    "if (w.resent) w.silent = true; else { w.overdue = true; resend(id); }"],
  ["любой ответ гасит все строки", 'r.from === "claude" && r.replyTo === id', 'r.from === "claude"'],
  ["«пишет…» показан как готовый ответ", 'status = "seen"', 'status = "answered"'],
  ["датчик двойного ответа молчит", 'alerts.push("Лишний ответ на строку " + r.replyTo)', "0"],
  ["в комментарии нет метки строки", "text + tail(id)", "text"],
  ["старые строки без ответа забыты", "wait(r.id, ANSWER_WAIT_MS - (now() - (r.at || 0)), !!r.resentAt);", ""],
];

async function porcha() {
  const src = fs.readFileSync(WIRE, "utf8");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tetrad-porcha-"));
  let bad = 0;
  for (const [what, from, to] of breaks) {
    if (!src.includes(from)) { console.log("  НЕТ СТРОКИ  " + what); bad++; continue; }
    const file = path.join(dir, "wire-" + breaks.indexOf(breaks.find(b => b[0] === what)) + ".js");
    fs.writeFileSync(file, src.split(from).join(to));
    let results;
    try { results = await runAll(file, true); }
    catch (e) { console.log("  НЕ ГРУЗИТСЯ " + what + ": " + e.message.split("\n")[0]); bad++; continue; }
    const red = results.filter(([, ok]) => !ok).map(([n]) => n);
    if (red.length) console.log("  поймана   " + what + " → красный: " + red[0] + (red.length > 1 ? " (+" + (red.length - 1) + ")" : ""));
    else { console.log("  ПРОПУЩЕНА " + what); bad++; }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return bad;
}

(async () => {
  if (process.argv.includes("--porcha")) {
    const missed = await porcha();
    console.log(missed ? "\nпорча: пропущено " + missed : "\nпорча: все поломки пойманы");
    process.exit(missed ? 1 : 0);
  }
  const red = (await runAll(WIRE, false)).filter(([, ok]) => !ok).length;
  console.log(red ? "\nпрогон красный: " + red : "\nпрогон зелёный");
  process.exit(red ? 1 : 0);
})();
