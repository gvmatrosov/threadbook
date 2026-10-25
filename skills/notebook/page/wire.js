// Which wire carries an owner line, and the safety net when no answer comes.
//   HOT  — the session set live/state.hotUntil > now and its poller reads db: the line goes to db only.
//   COLD — db plus a comment sent to Claude, which wakes the session (~30 s).
// No answer (not even «Claude пишет…») within ANSWER_WAIT_MS → the line offers a one-tap re-send,
// once. It is a tap, not a timer: the platform takes sendToClaude only from the viewer's own gesture.
// No DOM here, so tools/test-page.js drives it with a fake store, fake comments and a fake clock.

export const ANSWER_WAIT_MS = 30000;

// The memoryless auto-replier reads the comment before the session does and obeys its text: this
// tail keeps it to one word. The marker tells the session which db row the comment carries.
export const tail = id =>
  `\n\n[tetrad ${id}] Строка из тетради: ответ даст живая сессия прямо в пункте. ` +
  "Здесь ответь одним словом «принято», без вопросов.";

const code = e => (e && (e.code || e.message)) || String(e);

export function createWire({ store, comments, anchorEl, clock, onChange }) {
  const { now, later, cancel } = clock;
  let rows = [], state = {}, threadId = null, canSend = "…", note = "", hotTimer = null;
  const waits = new Map(); // owner row id → {timer, overdue, resent, silent}

  const replyOf = id => rows.find(r => r.from === "claude" && r.replyTo === id);
  const isHot = () => (state.hotUntil || 0) > now();
  const changed = () => onChange(view());

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

  async function comment(text) {
    const target = threadId ? { threadId, text } : { anchor: await comments.anchorFor(anchorEl), text };
    const res = await comments.sendToClaude(target);
    if (!threadId) { threadId = res.threadId; store.saveThread(threadId).catch(() => {}); }
  }

  // Call straight from the tap handler: the comment is started before anything is awaited.
  async function send(text) {
    const id = store.newId(), hot = isHot();
    const wake = hot || !comments ? null : comment(text + tail(id));
    if (!waits.has(id)) wait(id, ANSWER_WAIT_MS);
    note = hot ? "Ушло в тетрадь — сессия на связи." : "Ушло и будит сессию, это около 30 секунд.";
    changed();
    try {
      await store.addOwner(id, text, hot ? "db" : "comment", now());
    } catch (e) {
      cancel(waits.get(id).timer); waits.delete(id);
      note = "Строка не записалась (" + code(e) + "), текст оставлен в поле.";
      changed();
      return false;
    }
    if (wake) {
      try { await wake; } catch (e) {
        const w = waits.get(id);
        if (w && !replyOf(id)) w.overdue = true;
        note = "Разбудить сессию не удалось (" + code(e) + "). Строка в тетради.";
      }
    }
    changed();
    return true;
  }

  async function resend(id) {
    const w = waits.get(id), row = rows.find(r => r.id === id);
    if (!w || w.resent || !row || !comments || replyOf(id)) return false;
    cancel(w.timer);
    wait(id, ANSWER_WAIT_MS, true);
    const p = comment(row.text + tail(id));
    note = "Бужу сессию ещё раз.";
    changed();
    try {
      await p;
      await store.markResent(id, now()).catch(() => {});
    } catch (e) {
      note = "Разбудить не удалось (" + code(e) + "). Загляни в терминал.";
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

  function setThread(id) { threadId = threadId || id; }
  function setCanSend(v) { canSend = v; changed(); }

  function view() {
    const alerts = [];
    const lines = rows.map(r => {
      if (r.from === "claude") {
        // Датчик «один ответ на строку»: an answer must live at re-<line id>, or two can pile up.
        if (r.replyTo && r.id !== "re-" + r.replyTo) alerts.push("Лишний ответ на строку " + r.replyTo);
        return { id: r.id, from: "claude", text: r.text || "", typing: !!r.typing };
      }
      const reply = replyOf(r.id), w = waits.get(r.id);
      let status = "answered";
      if (reply && reply.typing) status = "seen";
      else if (!reply) status = !w ? "waiting" : w.silent ? "silent" : w.overdue ? "overdue" : w.resent ? "resent" : "waiting";
      const secs = t => (t && r.at ? Math.round((t - r.at) / 1000) : null);
      return { id: r.id, from: "owner", text: r.text || "", via: r.via, status,
        seenIn: reply ? secs(reply.seenAt) : null, answeredIn: reply && !reply.typing ? secs(reply.at) : null };
    });
    return { title: state.title || "Тетрадь", itemTitle: state.itemTitle || "Пункт 1",
      hot: isHot(), canSend, note, lines, alerts };
  }

  return { send, resend, setRows, setState, setThread, setCanSend, view };
}
