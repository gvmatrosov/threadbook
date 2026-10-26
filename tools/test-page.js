// Автотест страницы тетради: drives the page's DOM-free modules (wire.js — delivery, actions.js —
// what the person does to cards, local.js — this browser's memory) with a fake db, fake comments,
// a fake clock and a fake storage — measure → act → measure, no browser. i18n.js (the words in English
// and Russian) rides along; the checks below speak Russian unless they test the language itself.
//   node tools/test-page.js           run the checks
//   node tools/test-page.js --porcha  порча: break those modules one line at a time; every break must
//                                     turn at least one check red, or that check is false comfort
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const PAGE = path.join(__dirname, "../skills/notebook/page");
const NOW = path.join(__dirname, "../bin/threadbook-now");
const { execFileSync } = require("child_process");
// Runs bin/threadbook-now with a PATH of fakes: a `date` that answers like macOS's (no %3N), and
// optionally no perl or python3 at all.
function nowWith({ macDate, bare }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "threadbook-now-"));
  if (macDate) {
    fs.writeFileSync(path.join(dir, "date"), '#!/bin/sh\ns=$(/bin/date +%s)\ncase "$1" in *%3N*) echo "${s}3N";; *) echo "$s";; esac\n', { mode: 0o755 });
  }
  const PATH = bare ? dir : dir + ":" + process.env.PATH;
  try { return execFileSync("/bin/sh", [NOW], { env: { PATH }, encoding: "utf8" }).trim(); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const closeToNow = (out, slack) => /^\d+$/.test(out) && Math.abs(Number(out) - Date.now()) < slack;
const MODULES = ["wire.js", "actions.js", "local.js", "i18n.js"];

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
    addOwner: async row => { rows.set(row.id, { from: "owner", ...row }); push(); },
    patched: [],
    patchItem: async (id, patch) => { store.patched.push([id, patch]); },
    newItemId: () => "N" + ++seq,
    added: [],
    addItem: async (id, title, order) => { store.added.push({ id, title, order }); },
    titles: [],
    saveTitle: async t => { store.titles.push(t); },
    markResent: async (id, at) => { rows.get(id).resentAt = at; push(); },
    threadsSaved: [],
    saveThread: async (item, id) => { store.threadsSaved.push(item + "=" + id); },
    saved: [],
    saveMode: async m => { store.saved.push(m); },
  };
  const sent = [];
  const comments = {
    refuse: null, // set to an error code to make the next sends reject like claude.ai does
    anchorFor: async el => ({ path: "#" + el, x: 0, y: 0 }),
    sendToClaude: async target => {
      if (comments.refuse) throw { code: comments.refuse, message: comments.refuse };
      sent.push(target); return { threadId: target.threadId || "T" + target.anchor.path.slice(1), commentId: "C" + sent.length };
    },
  };
  const claudeRow = (row, extra = {}) => { rows.set(row.id, { from: "claude", at: t, ...row, ...extra }); push(); };
  return { clock, advance, store, comments, sent, claudeRow, rows, setOnRows: fn => { onRows = fn; } };
}

const tick = () => new Promise(r => setImmediate(r));
const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const note = s => s.view().items[0].note;

async function setup(createWire, hotFor, lang = "ru") {
  const f = fakes();
  let last = null;
  const wire = createWire({ store: f.store, comments: f.comments, anchorOf: item => "card-" + item, clock: f.clock,
    onChange: v => { last = v; }, ...(lang ? { lang } : {}) });
  f.setOnRows(wire.setRows);
  wire.setItems([{ id: "i1", title: "Первый", text: "вступление", order: 1 }, { id: "i2", title: "Второй", text: "", order: 2 }]);
  wire.setState({ hotUntil: f.clock.now() + hotFor });
  return { ...f, wire, view: () => last };
}

const checks = [
  ["горячий разговор: строка уходит только в базу, комментария нет", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "раз"); await tick();
    return s.sent.length === 0 && s.rows.get("L1").via === "db" && s.rows.get("L1").mode === "flash";
  }],
  ["economy: даже в горячем окне строка будит комментарием и несёт метку режима", async W => {
    const s = await setup(W, 60000);
    s.wire.setMode("economy");
    await s.wire.send("i1", "эконом"); await tick();
    return s.sent.length === 1 && s.rows.get("L1").mode === "economy" && s.view().hot === false;
  }],
  ["переключатель режима на странице сохраняет выбор, и следующая строка идёт по нему", async W => {
    const s = await setup(W, 60000);
    await s.wire.chooseMode("economy"); await tick();
    await s.wire.send("i1", "после переключения"); await tick();
    return s.store.saved.join() === "economy" && s.view().mode === "economy" && s.sent.length === 1;
  }],
  ["лимит комментариев: подсказка появляется только после отказа claude.ai", async W => {
    const s = await setup(W, -1);
    await s.wire.send("i1", "до лимита"); await tick();
    const before = note(s).includes("60 раз в час");
    s.comments.refuse = "upstream_error";
    await s.wire.send("i1", "другая ошибка"); await tick();
    const other = note(s).includes("60 раз в час");
    s.comments.refuse = "rate_limited";
    await s.wire.send("i1", "за лимитом"); await tick();
    return !before && !other && note(s).includes("60 раз в час") && s.rows.has("L3");
  }],
  ["остывший разговор: строка уходит в базу и одним комментарием с меткой строки", async W => {
    const s = await setup(W, -1);
    await s.wire.send("i1", "два"); await tick();
    return s.sent.length === 1 && s.sent[0].text.startsWith("два") && s.sent[0].text.includes("[threadbook L1]")
      && s.rows.get("L1").via === "comment";
  }],
  ["горячее окно кончилось по часам: следующая строка уже будит комментарием", async W => {
    const s = await setup(W, 10000);
    s.advance(11000);
    await s.wire.send("i1", "три"); await tick();
    return s.sent.length === 1 && s.view().hot === false;
  }],
  ["нет ответа 30 с: появляется кнопка «разбудить», но сама страница ничего не шлёт", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "четыре"); await tick();
    s.advance(29000);
    const before = s.view().lines[0].status;
    s.advance(2000); await tick();
    return before === "waiting" && s.view().lines[0].status === "overdue" && s.sent.length === 0;
  }],
  ["кнопка «разбудить» шлёт ровно один повтор, второй раз — ничего", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "пять"); await tick();
    s.advance(31000);
    const first = await s.wire.resend("L1"); await tick();
    const second = await s.wire.resend("L1"); await tick();
    s.advance(31000); await tick();
    return first && !second && s.sent.length === 1 && s.view().lines[0].status === "silent";
  }],
  ["ответ пришёл за 20 с: кнопки нет и потом не появится", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "шесть"); await tick();
    s.advance(20000);
    s.claudeRow({ id: "re-L1", replyTo: "L1", text: "ответ", seenAt: s.clock.now() - 5000 });
    s.advance(40000); await tick();
    const owner = s.view().lines.find(l => l.id === "L1");
    return owner.status === "answered" && owner.answeredIn === 20 && owner.seenIn === 15
      && !(await s.wire.resend("L1"));
  }],
  ["«Claude пишет…» тоже снимает кнопку: сессия строку увидела", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "семь"); await tick();
    s.advance(10000);
    s.claudeRow({ id: "re-L1", replyTo: "L1", typing: true, text: "", seenAt: s.clock.now() });
    s.advance(40000); await tick();
    return s.view().lines[0].status === "seen";
  }],
  ["датчик «один ответ на строку»: ответ не на своём месте поднимает тревогу", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "восемь"); await tick();
    s.claudeRow({ id: "re-L1", replyTo: "L1", text: "ответ" });
    const clean = s.view().alerts.length === 0;
    s.claudeRow({ id: "extra", replyTo: "L1", text: "ещё ответ" });
    return clean && s.view().alerts.length === 1;
  }],
  ["ответ на одну строку не гасит соседнюю", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "первая"); await tick();
    await s.wire.send("i1", "вторая"); await tick();
    s.claudeRow({ id: "re-L1", replyTo: "L1", text: "ответ на первую" });
    s.advance(31000); await tick();
    const line = id => s.view().lines.find(l => l.id === id);
    return line("L1").status === "answered" && line("L2").status === "overdue";
  }],
  ["строка без ответа с прошлого визита сразу получает кнопку", async W => {
    const s = await setup(W, -1);
    s.rows.set("OLD", { id: "OLD", from: "owner", item: "i1", text: "давно", via: "comment", at: s.clock.now() - 120000 });
    s.wire.setRows([...s.rows.values()]);
    s.advance(1); await tick();
    return s.view().lines[0].status === "overdue";
  }],
  ["пункты: у каждого своя лента, строка попадает только в свой пункт", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i2", "во второй"); await tick();
    s.claudeRow({ id: "re-L1", replyTo: "L1", text: "ответ во втором" });
    const [a, b] = s.view().items;
    return s.rows.get("L1").item === "i2" && a.lines.length === 0 && b.lines.length === 2
      && a.opening === "вступление" && b.note !== "" && a.note === "";
  }],
  ["у каждого пункта своя ветка комментариев, и она переиспользуется", async W => {
    const s = await setup(W, -1);
    await s.wire.send("i2", "раз во втором"); await tick();
    await s.wire.send("i2", "два во втором"); await tick();
    await s.wire.send("i1", "в первом"); await tick();
    return s.sent.length === 3 && s.sent[0].anchor.path === "#card-i2" && s.sent[1].threadId === "Tcard-i2"
      && s.sent[2].anchor.path === "#card-i1" && s.store.threadsSaved.join() === "i2=Tcard-i2,i1=Tcard-i1";
  }],
  ["ветка с прошлого визита: пункт пишет в неё, а не открывает новую", async W => {
    const s = await setup(W, -1);
    s.wire.setThreads({ i1: "OLDT" });
    await s.wire.send("i1", "снова"); await tick();
    return s.sent.length === 1 && s.sent[0].threadId === "OLDT" && s.store.threadsSaved.length === 0;
  }],
  ["датчик «строка в своём пункте»: строка без пункта поднимает тревогу", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "своя"); await tick();
    const clean = s.view().alerts.length === 0;
    s.rows.set("X", { id: "X", from: "owner", item: "i9", text: "чужая", at: s.clock.now() });
    s.wire.setRows([...s.rows.values()]);
    return clean && s.view().alerts.some(a => a.includes("X"));
  }],
  ["длина ответа: строка несёт длину своего пункта, по умолчанию «по делу»", async W => {
    const s = await setup(W, 60000);
    s.wire.setItems([{ id: "i1", title: "А", order: 1, length: "short" }, { id: "i2", title: "Б", order: 2 }]);
    await s.wire.send("i1", "коротко"); await tick();
    await s.wire.send("i2", "обычно"); await tick();
    return s.rows.get("L1").length === "short" && s.rows.get("L2").length === "normal"
      && s.view().items[0].length === "short";
  }],
  ["«сжать лист»: одна строка-запрос в пункт листа, с именами помеченных пунктов", async W => {
    const s = await setup(W, -1);
    s.wire.setItems([{ id: "i1", title: "Первый", order: 1, squeeze: "marked" }, { id: "i2", title: "Второй", order: 2 }]);
    const ok = await s.wire.askSqueeze(); await tick();
    const row = s.rows.get("L1");
    const busy = s.view().sheet.squeezing;
    const again = await s.wire.askSqueeze(); await tick();
    return ok && !again && row.kind === "squeeze" && row.item === "sheet" && row.text.includes("1. Первый")
      && !row.text.includes("Второй") && s.sent.length === 1 && s.sent[0].anchor.path === "#card-sheet"
      && busy && s.view().alerts.length === 0;
  }],
  ["«сжать лист» без пометок ничего не шлёт", async W => {
    const s = await setup(W, -1);
    const ok = await s.wire.askSqueeze(); await tick();
    return !ok && s.sent.length === 0 && s.rows.size === 0 && s.view().sheet.marked === 0;
  }],
  ["ответ на «сжать лист» снимает «сжимаю» и показывается под шапкой", async W => {
    const s = await setup(W, 60000);
    s.wire.setItems([{ id: "i1", title: "Первый", order: 1, squeeze: "marked" }]);
    await s.wire.askSqueeze(); await tick();
    s.claudeRow({ id: "re-L1", replyTo: "L1", item: "sheet", typing: true, text: "" });
    const typing = s.view().sheet.squeezing;
    s.claudeRow({ id: "re-L1", replyTo: "L1", item: "sheet", text: "Сжал 1 пункт" });
    return typing && !s.view().sheet.squeezing && s.view().sheet.reply === "Сжал 1 пункт";
  }],
  ["датчик «сжатый пункт с выводами»: сжат без выводов — тревога", async W => {
    const s = await setup(W, 60000);
    s.wire.setItems([{ id: "i1", title: "Первый", order: 1, squeeze: "done", summary: "итог" }]);
    const clean = s.view().alerts.length === 0 && s.view().items[0].summary === "итог";
    s.wire.setItems([{ id: "i1", title: "Первый", order: 1, squeeze: "done" }]);
    return clean && s.view().alerts.some(a => a.includes("без выводов"));
  }],
  ["удалённый пункт пропадает со страницы, а его строки не считаются потерянными", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i2", "во второй"); await tick();
    s.wire.setItems([{ id: "i1", title: "Первый", order: 1 }, { id: "i2", title: "Второй", order: 2, hidden: true }]);
    const v = s.view();
    return v.items.length === 1 && v.items[0].id === "i1" && v.alerts.length === 0;
  }],
  ["колёсико на пункте: горит, пока строка ждёт, гаснет с ответом", async W => {
    const s = await setup(W, 60000);
    await s.wire.send("i1", "жду"); await tick();
    const on = s.view().items[0].pending && !s.view().items[1].pending;
    s.claudeRow({ id: "re-L1", replyTo: "L1", text: "ответ", at: 1234 });
    const c = s.view().items[0];
    return on && !c.pending && c.lastAnswerAt === 1234;
  }],
  ["кнопки пункта: длина, пометка, переименование, удаление пишут в базу и проверяют ввод", async (W, A) => {
    const s = await setup(W, 60000);
    const a = A.createActions({ store: s.store, getItems: s.wire.allItems });
    const r = [
      await a.setLength("i1", "long"), await a.setLength("i1", "огромно"), await a.setLength("nope", "short"),
      await a.markSqueeze("i2", true), await a.markSqueeze("i2", false),
      await a.rename("i1", "  Новое   имя "), await a.rename("i1", "   "), await a.rename("i1", "x".repeat(201)),
      await a.hide("i2"),
    ];
    const p = JSON.stringify(s.store.patched);
    return r.join() === "true,false,false,true,true,true,false,false,true" && p === JSON.stringify([
      ["i1", { length: "long" }], ["i2", { squeeze: "marked" }], ["i2", { squeeze: "none" }],
      ["i1", { title: "Новое имя" }], ["i2", { hidden: true }]]);
  }],
  ["удалённый пункт больше не принимает кнопки", async (W, A) => {
    const s = await setup(W, 60000);
    s.wire.setItems([{ id: "i1", title: "А", order: 1, hidden: true }]);
    const a = A.createActions({ store: s.store, getItems: s.wire.allItems });
    const r = [await a.setLength("i1", "short"), await a.rename("i1", "Б"), await a.hide("i1")];
    return r.every(x => x === false) && s.store.patched.length === 0;
  }],
  ["новый пункт берёт следующий номер, даже после удалённого", async (W, A) => {
    const s = await setup(W, 60000);
    s.wire.setItems([{ id: "i1", title: "А", order: 1 }, { id: "i5", title: "Удалён", order: 5, hidden: true }]);
    const a = A.createActions({ store: s.store, getItems: s.wire.allItems });
    const id = await a.addItem("  Свой вопрос ");
    const empty = await a.addItem("  ");
    return id && empty === null && JSON.stringify(s.store.added) === JSON.stringify([{ id, title: "Свой вопрос", order: 6 }]);
  }],
  ["переименование листа: своё имя сохраняется и побеждает имя от сессии", async (W, A) => {
    const s = await setup(W, 60000);
    s.wire.setState({ title: "От сессии", hotUntil: 0 });
    const a = A.createActions({ store: s.store, getItems: s.wire.allItems });
    const ok = await a.renameSheet(" Мой лист ");
    const bad = await a.renameSheet("");
    const before = s.view().title;
    s.wire.setTitle(s.store.titles[0]);
    return ok && !bad && before === "От сессии" && s.view().title === "Мой лист" && s.store.titles.length === 1;
  }],
  ["черновик и раскрытые пункты переживают перезагрузку страницы", async (W, A, L) => {
    const st = memStorage();
    const a = L.createLocal(st, () => 100);
    a.setDraft("i1", "недописано"); a.toggle("i2");
    const b = L.createLocal(st, () => 200);
    const kept = b.draft("i1") === "недописано" && b.isOpen("i2") && !b.isOpen("i1");
    b.setDraft("i1", ""); b.toggle("i2");
    const c = L.createLocal(st, () => 300);
    return kept && c.draft("i1") === "" && !c.isOpen("i2");
  }],
  ["красная точка: новый ответ в закрытом пункте, гаснет, когда пункт открыт", async (W, A, L) => {
    const st = memStorage();
    const loc = L.createLocal(st, () => 1000);
    const old = { id: "i1", lastAnswerAt: 900 }, fresh = { id: "i1", lastAnswerAt: 1500 };
    const r1 = !loc.unread(old) && loc.unread(fresh);
    loc.toggle("i1");
    const r2 = !loc.unread(fresh);
    loc.markSeen(fresh); loc.toggle("i1");
    const r3 = !loc.unread(fresh) && loc.unread({ id: "i1", lastAnswerAt: 1600 });
    return r1 && r2 && r3;
  }],
  ["хранилище браузера запрещено: страница работает, просто не помнит", async (W, A, L) => {
    const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const loc = L.createLocal(boom, () => 1);
    loc.setDraft("i1", "x"); loc.toggle("i1");
    return loc.draft("i1") === "x" && loc.isOpen("i1");
  }],
  ["язык не задан: страница и комментарий по-английски", async W => {
    const s = await setup(W, -1, null);
    await s.wire.send("i1", "hello"); await tick();
    const v = s.view();
    return v.lang === "en" && v.title === "Notebook" && note(s).startsWith("Sent")
      && s.sent[0].text.includes("“received”") && !/[а-я]/i.test(s.sent[0].text);
  }],
  ["язык листа из live/state главнее запасного: всё по-русски, и запрос сжатия тоже", async W => {
    const s = await setup(W, -1, "en");
    s.wire.setState({ hotUntil: 0, lang: "ru" });
    s.wire.setItems([{ id: "i1", title: "Первый", order: 1, squeeze: "marked" }]);
    await s.wire.send("i1", "привет"); await tick();
    const hello = note(s);
    await s.wire.askSqueeze(); await tick();
    return s.view().lang === "ru" && hello.startsWith("Ушло") && s.sent[0].text.includes("«принято»")
      && [...s.rows.values()].some(r => r.kind === "squeeze" && r.text.startsWith("Сожми лист"));
  }],
  ["неизвестный язык — английский; браузер выбирает русский только для ru", async (W, A, L, I) =>
    I.tr("de")("title") === "Notebook" && I.tr("ru")("status.waiting") === "ждёт ответа"
    && I.browserLang({ language: "ru-RU" }) === "ru" && I.browserLang({ language: "en-US" }) === "en"
    && I.browserLang(undefined) === "en"],
  ["датчик словаря: у английского и русского одни и те же слова", async (W, A, L, I) => I.missingKeys().length === 0],
  ["threadbook-now: миллисекунды на Linux", async () => closeToNow(nowWith({}), 3000)],
  // Real milliseconds, not seconds × 1000: three runs all landing on a whole second is ~1 in 10⁹.
  ["threadbook-now: на Mac (date без %3N) — настоящие миллисекунды, а не «…3N»", async () => {
    const outs = [1, 2, 3].map(() => nowWith({ macDate: true }));
    return outs.every(o => closeToNow(o, 3000)) && outs.some(o => Number(o) % 1000 !== 0);
  }],
  ["threadbook-now: без perl и python — секунды × 1000, но число", async () => {
    const out = nowWith({ macDate: true, bare: true });
    return closeToNow(out, 3000) && Number(out) % 1000 === 0;
  }],
  // The gallery names an artifact by the page's own <title> when it has one, ignoring the title the
  // session passes at publish — so the page must carry none (the tab title is set by render.js).
  ["в странице нет своего <title>: тетрадь в галерее зовётся по имени листа", async () =>
    !/<title[\s>]/i.test(fs.readFileSync(path.join(PAGE, "index.html"), "utf8"))],
];

async function runAll(dir, quiet) {
  const q = "?" + Math.random();
  const load = f => import(pathToFileURL(path.join(dir, f)).href + q);
  const [W, A, L, I] = await Promise.all(MODULES.map(load));
  const results = [];
  for (const [name, fn] of checks) {
    let ok = false;
    try { ok = await fn(W.createWire, A, L, I); } catch (e) { ok = false; }
    results.push([name, ok]);
    if (!quiet) console.log((ok ? "  зелёный  " : "  КРАСНЫЙ  ") + name);
  }
  return results;
}

// Each break: [module, what it simulates, exact text in that module, replacement].
const breaks = [
  ["wire.js", "горячее/холодное перепутаны", "(state.hotUntil || 0) > now()", "(state.hotUntil || 0) < now()"],
  ["wire.js", "горячая строка всё равно будит комментарием", "hot || !comments ? null", "!comments ? null"],
  ["wire.js", "повтор можно жать сколько угодно", "if (!w || w.resent ||", "if (!w ||"],
  ["wire.js", "страница сама шлёт повтор по таймеру", "if (w.resent) w.silent = true; else w.overdue = true;",
    "if (w.resent) w.silent = true; else { w.overdue = true; resend(id); }"],
  ["wire.js", "любой ответ гасит все строки", 'r.from === "claude" && r.replyTo === id', 'r.from === "claude"'],
  ["wire.js", "«пишет…» показан как готовый ответ", 'status = "seen"', 'status = "answered"'],
  ["wire.js", "датчик двойного ответа молчит", 'alerts.push(T("extraAnswer", r.replyTo))', "0"],
  ["wire.js", "в комментарии нет метки строки", "text + tail(id, lang())", "text"],
  ["wire.js", "режим не влияет на горячее окно", 'mode === "flash" && (state.hotUntil', '(state.hotUntil'],
  ["wire.js", "строка не несёт метку режима", 'via: hot ? "db" : "comment", mode,', 'via: hot ? "db" : "comment",'],
  ["wire.js", "переключатель не сохраняет выбор", "try { await store.saveMode(m); }", "try { }"],
  ["wire.js", "подсказка о лимите на любую ошибку", 'code(e) === "rate_limited" ? T("limit")', 'true ? T("limit")'],
  ["wire.js", "строка уходит не в свой пункт", "const row = { id, item, text,", 'const row = { id, item: "i1", text,'],
  ["wire.js", "все пункты пишут в одну ветку", "const t = threads[item];", "const t = Object.values(threads)[0];"],
  ["wire.js", "ветка с прошлого визита забыта", "for (const k in map) threads[k] = threads[k] || map[k];", ""],
  ["wire.js", "датчик строки вне пунктов молчит", 'alerts.push(T("strayLine", l.id))', "0"],
  ["wire.js", "лента пункта показывает все строки", "const own = lines.filter(l => l.item === i.id);", "const own = lines;"],
  ["wire.js", "старые строки без ответа забыты", "wait(r.id, ANSWER_WAIT_MS - (now() - (r.at || 0)), !!r.resentAt);", ""],
  ["wire.js", "строка не несёт длину пункта", "length: lengthOf(item), at", 'length: "normal", at'],
  ["wire.js", "«сжать лист» шлёт все пункты, а не помеченные", '!i.hidden && i.squeeze === "marked"', "!i.hidden"],
  ["wire.js", "«сжать лист» можно жать, пока прошлое не сжато", "if (!marked.length || squeezing())", "if (!marked.length)"],
  ["wire.js", "запрос сжатия без метки вида", "if (kind) row.kind = kind;", ""],
  ["wire.js", "«сжимаю» не гаснет после ответа", "!(replyOf(r.id) && !replyOf(r.id).typing)", "true"],
  ["wire.js", "датчик сжатого без выводов молчит", 'alerts.push(T("squeezedBare", i.title || i.id))', "0"],
  ["wire.js", "удалённый пункт виден", "items.filter(i => !i.hidden).map(", "items.map("],
  ["wire.js", "строки удалённого пункта считаются потерянными", "const known = new Set([SHEET, ...items.map(i => i.id)]);",
    "const known = new Set([SHEET, ...items.filter(i => !i.hidden).map(i => i.id)]);"],
  ["wire.js", "колёсико не гаснет", 'own.some(l => l.from === "owner" && PENDING.has(l.status))', 'own.some(l => l.from === "owner")'],
  ["wire.js", "язык листа не читается", "pickLang(state.lang, fallback)", "pickLang(fallback)"],
  ["wire.js", "без языка страница по-русски", 'lang: fallback = "en"', 'lang: fallback = "ru"'],
  ["i18n.js", "неизвестный язык — русский", 'tries.find(l => LANGS.includes(l)) || "en"', 'tries.find(l => LANGS.includes(l)) || "ru"'],
  ["i18n.js", "браузер всегда выбирает русский", '/^ru\\b/i.test(nav.language || "") ? "ru" : "en"', '"ru"'],
  ["i18n.js", "в русском словаре пропало слово", '  hideSure: "точно?",\n', ""],
  ["actions.js", "длина принимает что угодно", "!exists(id) || !LENGTHS.includes(length)", "!exists(id)"],
  ["actions.js", "пометка сжатия перевёрнута", 'squeeze: on ? "marked" : "none"', 'squeeze: on ? "none" : "marked"'],
  ["actions.js", "пустое имя пункта принимается", "if (!exists(id) || !t || t.length > MAX_TITLE) return false;", "if (!exists(id)) return false;"],
  ["actions.js", "имя пункта не чистится от пробелов", 'String(t || "").trim().replace(/\\s+/g, " ")', 'String(t || "")'],
  ["actions.js", "удалённый пункт принимает кнопки", "i.id === id && !i.hidden", "i.id === id"],
  ["actions.js", "удаление стирает, а не прячет", "{ hidden: true }", "{ title: \"\" }"],
  ["actions.js", "новый пункт занимает номер удалённого", "getItems().reduce(", "getItems().filter(i => !i.hidden).reduce("],
  ["actions.js", "имя листа не сохраняется", "await store.saveTitle(t);", ""],
  ["local.js", "черновик не сохраняется в браузер", "const save = () => { try {", "const save = () => { return; try {"],
  ["local.js", "точка горит и в открытом пункте", "!data.open.includes(card.id) && card.lastAnswerAt", "card.lastAnswerAt"],
  ["local.js", "открытие пункта не гасит точку", "data.seen[card.id] = card.lastAnswerAt; save();", "save();"],
  ["local.js", "первый визит: всё старое горит точками", "card.lastAnswerAt > (data.seen[card.id] || data.since)", "card.lastAnswerAt > (data.seen[card.id] || 0)"],
  ["local.js", "запрет хранилища роняет страницу", 'try { storage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* forget on reload */ }', "storage.setItem(KEY, JSON.stringify(data));"],
];

async function porcha() {
  let bad = 0;
  for (const [mod, what, from, to] of breaks) {
    const src = fs.readFileSync(path.join(PAGE, mod), "utf8");
    if (!src.includes(from)) { console.log("  НЕТ СТРОКИ  " + mod + ": " + what); bad++; continue; }
    // A fresh folder per break: the broken module next to intact copies of the others.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "threadbook-porcha-"));
    for (const m of MODULES) fs.copyFileSync(path.join(PAGE, m), path.join(dir, m));
    fs.writeFileSync(path.join(dir, mod), src.split(from).join(to));
    let results;
    try { results = await runAll(dir, true); }
    catch (e) { console.log("  НЕ ГРУЗИТСЯ " + what + ": " + e.message.split("\n")[0]); bad++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.rmSync(dir, { recursive: true, force: true });
    const red = results.filter(([, ok]) => !ok).map(([n]) => n);
    if (red.length) console.log("  поймана   " + what + " → красный: " + red[0] + (red.length > 1 ? " (+" + (red.length - 1) + ")" : ""));
    else { console.log("  ПРОПУЩЕНА " + what); bad++; }
  }
  return bad;
}

(async () => {
  if (process.argv.includes("--porcha")) {
    const missed = await porcha();
    console.log(missed ? "\nпорча: пропущено " + missed : "\nпорча: все " + breaks.length + " поломок пойманы");
    process.exit(missed ? 1 : 0);
  }
  const red = (await runAll(PAGE, false)).filter(([, ok]) => !ok).length;
  console.log(red ? "\nпрогон красный: " + red : "\nпрогон зелёный: " + checks.length + " проверок");
  process.exit(red ? 1 : 0);
})();
