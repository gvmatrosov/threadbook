// Which wire carries an owner line, and the safety net when no answer comes.
//   HOT  — flash mode, and the session set live/state.hotUntil > now (its poller reads db): db only.
//   COLD — db plus a comment sent to Claude, which wakes the session (~30 s). Economy mode is always
//          cold: no poller at all. Each line carries the mode, so the session knows whether to start one.
// No answer (not even «Claude пишет…») within ANSWER_WAIT_MS → the line offers a one-tap re-send,
// once. It is a tap, not a timer: the platform takes sendToClaude only from the viewer's own gesture.
// The sheet holds several items (cards); each owner line belongs to one, and each card keeps its own
// comment thread. The hot window and the mode are per sheet. The «сжать лист» request is a line of
// its own (kind "squeeze") in the pseudo-item "sheet", so it rides the same wires and safety net.
// The words come from i18n.js in the sheet's language: live/state.lang, else the `lang` given here.
// No DOM here, so tools/test-page.js drives it with a fake store, fake comments and a fake clock.
import { tr, pickLang } from "./i18n.js";

export const ANSWER_WAIT_MS = 30000;
export const SHEET = "sheet";

// The memoryless auto-replier reads the comment before the session does and obeys its text: the
// tail keeps it to one word. The marker [threadbook <id>] tells the session which db row the comment carries.
export const tail = (id, lang) => tr(lang)("tail", id);

export const MODES = ["flash", "economy"];
export const LENGTHS = ["short", "normal", "long"];
const code = e => (e && (e.code || e.message)) || String(e);
const PENDING = new Set(["waiting", "seen", "overdue", "resent"]);

export function createWire({ store, comments, anchorOf, clock, onChange, lang: fallback = "en" }) {
  const { now, later, cancel } = clock;
  let rows = [], items = [], state = {}, title = "", mode = "flash", canSend = "…", hotTimer = null;
  let note = { item: null, text: "" };
  const threads = {}; // item → comment thread id
  const waits = new Map(); // owner row id → {timer, overdue, resent, silent}

  const replyOf = id => rows.find(r => r.from === "claude" && r.replyTo === id);
  const lang = () => pickLang(state.lang, fallback);
  const T = (...a) => tr(lang())(...a);
  // The limit note shows only once claude.ai has actually refused a wake-up — never in advance.
  const failNote = (what, e) => (code(e) === "rate_limited" ? T("limit") : what + " (" + code(e) + ").");
  const isHot = () => mode === "flash" && (state.hotUntil || 0) > now();
  const changed = () => onChange(view());
  const say = (item, text) => { note = { item, text }; };
  const lengthOf = item => {
    const i = items.find(x => x.id === item);
    return i && LENGTHS.includes(i.length) ? i.length : "normal";
  };

  function wait(id, ms, resent = false) {
    const w = { timer: null, overdue: false, resent, silent: false };
    w.timer = later(() => expire(id), Math.max(0, ms));
    waits.set(id, w);
  }

  function expire(id) {
    const w = waits.get(id);
    if (!w || replyOf(id)) return;
    if (w.resent) w.silent = true; else w.overdue = true;
    changed();
  }

  async function comment(item, text) {
    const t = threads[item];
    const target = t ? { threadId: t, text } : { anchor: await comments.anchorFor(anchorOf(item)), text };
    const res = await comments.sendToClaude(target);
    if (!t) { threads[item] = res.threadId; store.saveThread(item, res.threadId).catch(() => {}); }
  }

  // Call straight from the tap handler: the comment is started before anything is awaited.
  async function send(item, text, kind) {
    const id = store.newId(), hot = isHot();
    const wake = hot || !comments ? null : comment(item, text + tail(id, lang()));
    if (!waits.has(id)) wait(id, ANSWER_WAIT_MS);
    say(item, T(hot ? "sentHot" : "sentCold"));
    changed();
    const row = { id, item, text, via: hot ? "db" : "comment", mode, length: lengthOf(item), at: now() };
    if (kind) row.kind = kind;
    try {
      await store.addOwner(row);
    } catch (e) {
      cancel(waits.get(id).timer); waits.delete(id);
      say(item, T("notSaved", code(e)));
      changed();
      return false;
    }
    if (wake) {
      try { await wake; } catch (e) {
        const w = waits.get(id);
        if (w && !replyOf(id)) w.overdue = true;
        say(item, failNote(T("wakeFailed"), e));
      }
    }
    changed();
    return true;
  }

  // «Сжать лист»: one request naming the marked cards; the session writes their conclusions.
  function askSqueeze() {
    const marked = items.filter(i => !i.hidden && i.squeeze === "marked");
    if (!marked.length || squeezing()) return Promise.resolve(false);
    const list = marked.map(i => (i.order != null ? i.order + ". " : "") + (i.title || i.id)).join("; ");
    return send(SHEET, T("squeezeAsk", list), "squeeze");
  }

  // A squeeze request is still on its way: asked, and no finished answer yet.
  function squeezing() {
    return rows.some(r => r.from === "owner" && r.kind === "squeeze" && !(replyOf(r.id) && !replyOf(r.id).typing));
  }

  async function resend(id) {
    const w = waits.get(id), row = rows.find(r => r.id === id);
    if (!w || w.resent || !row || !comments || replyOf(id)) return false;
    cancel(w.timer);
    wait(id, ANSWER_WAIT_MS, true);
    const p = comment(row.item, row.text + tail(id, lang()));
    say(row.item, T("wakeAgain"));
    changed();
    try {
      await p;
      await store.markResent(id, now()).catch(() => {});
    } catch (e) {
      say(row.item, failNote(T("resendFailed"), e));
    }
    changed();
    return true;
  }

  function setRows(next) {
    rows = next;
    for (const r of rows) {
      if (r.from !== "owner") continue;
      if (replyOf(r.id)) {
        const w = waits.get(r.id);
        if (w) { cancel(w.timer); waits.delete(r.id); }
      } else if (!waits.has(r.id)) {
        // A line left unanswered by an earlier visit gets the same safety net.
        wait(r.id, ANSWER_WAIT_MS - (now() - (r.at || 0)), !!r.resentAt);
      }
    }
    changed();
  }

  function setState(next) {
    state = next || {};
    if (hotTimer) cancel(hotTimer);
    hotTimer = isHot() ? later(changed, state.hotUntil - now() + 50) : null;
    changed();
  }

  function setMode(m) { mode = MODES.includes(m) ? m : "flash"; changed(); }

  // From the person's tap on the mode switch.
  async function chooseMode(m) {
    if (!MODES.includes(m) || m === mode) return;
    const was = mode;
    setMode(m);
    try { await store.saveMode(m); } catch (e) {
      mode = was;
      say(null, T("modeFailed", code(e)));
      changed();
    }
  }

  function setItems(next) { items = next; changed(); }
  function setTitle(t) { title = t || ""; changed(); }
  function setThreads(map) { for (const k in map) threads[k] = threads[k] || map[k]; }
  function setCanSend(v) { canSend = v; changed(); }

  function view() {
    const alerts = [];
    const known = new Set([SHEET, ...items.map(i => i.id)]);
    const lines = rows.map(r => {
      if (r.from === "claude") {
        // Датчик «один ответ на строку»: an answer must live at re-<line id>, or two can pile up.
        if (r.replyTo && r.id !== "re-" + r.replyTo) alerts.push(T("extraAnswer", r.replyTo));
        const q = r.replyTo && rows.find(o => o.id === r.replyTo);
        return { id: r.id, from: "claude", item: q ? q.item : r.item, text: r.text || "", typing: !!r.typing, at: r.at };
      }
      const reply = replyOf(r.id), w = waits.get(r.id);
      let status = "answered";
      if (reply && reply.typing) status = "seen";
      else if (!reply) status = !w ? "waiting" : w.silent ? "silent" : w.overdue ? "overdue" : w.resent ? "resent" : "waiting";
      const secs = t => (t && r.at ? Math.round((t - r.at) / 1000) : null);
      return { id: r.id, from: "owner", item: r.item, kind: r.kind, text: r.text || "", via: r.via, at: r.at, status,
        seenIn: reply ? secs(reply.seenAt) : null, answeredIn: reply && !reply.typing ? secs(reply.at) : null };
    });
    // Датчик «строка в своём пункте»: a line whose card is missing would be invisible on the page.
    if (items.length) {
      for (const l of lines) if (!known.has(l.item)) alerts.push(T("strayLine", l.id));
    }
    // Датчик «сжатый пункт с выводами»: a card marked squeezed must carry its conclusions.
    for (const i of items) if (!i.hidden && i.squeeze === "done" && !i.summary) alerts.push(T("squeezedBare", i.title || i.id));
    const noteFor = item => (note.item === item ? note.text : "");
    const cards = items.filter(i => !i.hidden).map(i => {
      const own = lines.filter(l => l.item === i.id);
      const answers = own.filter(l => l.from === "claude" && !l.typing);
      return { id: i.id, num: i.order, title: i.title || "•", opening: i.text || "",
        length: LENGTHS.includes(i.length) ? i.length : "normal",
        squeeze: i.squeeze === "marked" || i.squeeze === "done" ? i.squeeze : "none",
        summary: i.summary || "", lines: own, note: noteFor(i.id),
        pending: own.some(l => l.from === "owner" && PENDING.has(l.status)),
        lastAnswerAt: answers.length ? answers[answers.length - 1].at || 0 : 0 };
    });
    const sheetLines = lines.filter(l => l.item === SHEET);
    const lastAnswer = sheetLines.filter(l => l.from === "claude" && !l.typing).pop();
    return { lang: lang(), title: title || state.title || T("title"), mode, hot: isHot(), canSend,
      note: noteFor(null), items: cards, lines, alerts,
      sheet: { marked: cards.filter(c => c.squeeze === "marked").length, squeezing: squeezing(),
        reply: lastAnswer ? lastAnswer.text : "", note: noteFor(SHEET) } };
  }

  const allItems = () => items;
  return { send, askSqueeze, resend, setRows, setItems, setTitle, setState, setMode, chooseMode, setThreads,
    setCanSend, allItems, view };
}
