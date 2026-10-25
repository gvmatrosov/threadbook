// Draws the wire's view. Built from elements with textContent (line text is never parsed as HTML),
// and the scroll position is kept across re-renders so the page does not jump. Each item card is
// built once and then only its log is redrawn, so a half-typed line and its focus survive an answer.

const $ = id => document.getElementById(id);

const SEND = {
  available: ["good", "сессия слушает"],
  no_session: ["bad", "сессия не слушает — скажи в терминале «тетрадь, проснись»"],
  writers_only: ["bad", "будить сессию может только владелец страницы"],
  off: ["bad", "будить сессию отсюда нельзя"],
};
const STATUS = {
  waiting: "ждёт ответа",
  overdue: "ответа нет 30 с — кнопка «Разбудить сессию» внизу экрана",
  seen: "Claude увидел, пишет…",
  resent: "разбудил ещё раз, жду",
  silent: "сессия молчит — загляни в терминал",
};
const VIA = { db: "через тетрадь", comment: "через комментарий" };
const cards = new Map(); // item id → {section, title, log, note}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function ownerLine(l) {
  const box = el("div", "msg owner");
  const facts = ["ты", VIA[l.via]];
  if (l.seenIn != null) facts.push("увидел за " + l.seenIn + " с");
  if (l.answeredIn != null) facts.push("ответ за " + l.answeredIn + " с");
  box.append(el("span", "who", facts.filter(Boolean).join(" · ")), el("span", "", l.text));
  if (STATUS[l.status]) {
    box.append(el("span", "status " + l.status, STATUS[l.status]));
  }
  return box;
}

function claudeLine(l) {
  const box = el("div", "msg claude");
  box.append(el("span", "who", "Claude"), el("span", "", l.typing ? "пишет…" : l.text));
  return box;
}

// The card's section is also the comment anchor for its thread.
export const sectionOf = item => cards.get(item)?.section;

function card(item) {
  if (cards.has(item)) return cards.get(item);
  const section = el("section", "card");
  const title = el("h2"), log = el("div", "log"), note = el("span", "note");
  const form = el("form", "compose");
  form.dataset.item = item;
  const text = el("textarea");
  text.maxLength = 1800;
  text.placeholder = "Ответ по этому пункту";
  const send = el("button", "", "Отправить");
  send.type = "submit";
  const row = el("div", "row");
  row.append(send, note);
  form.append(text, row);
  section.append(title, log, form);
  const c = { section, title, log, note };
  cards.set(item, c);
  return c;
}

export function render(v) {
  const y = window.scrollY;
  document.title = v.title;
  $("title").textContent = v.title;

  for (const b of $("modes").querySelectorAll("[data-mode]")) {
    b.setAttribute("aria-checked", String(b.dataset.mode === v.mode));
  }

  const [cls, words] = SEND[v.canSend] || ["", "проверяю связь…"];
  const state = $("state");
  state.replaceChildren(
    el("b", v.hot ? "good" : "", v.mode === "econom" ? "econom: каждая строка будит сессию"
      : v.hot ? "разговор горячий" : "разговор остыл"),
    document.createTextNode(" · "),
    el("b", cls, words),
  );

  const box = $("items");
  if (!v.items.length) box.replaceChildren(el("div", "empty", "Пунктов пока нет — сессия их ещё раскладывает."));
  else {
    const keep = new Set(v.items.map(i => i.id));
    for (const [id, c] of cards) if (!keep.has(id)) { c.section.remove(); cards.delete(id); }
    const sections = v.items.map(i => {
      const c = card(i.id);
      c.title.textContent = i.title;
      const opening = i.opening ? [claudeLine({ text: i.opening })] : [];
      c.log.replaceChildren(...opening, ...i.lines.map(l => (l.from === "claude" ? claudeLine(l) : ownerLine(l))));
      c.note.textContent = i.note;
      return c.section;
    });
    // Reorder only when needed: moving a section blurs a textarea inside it.
    const now = [...box.children];
    if (now.length !== sections.length || sections.some((s, k) => now[k] !== s)) box.replaceChildren(...sections);
  }

  // The wake button lives in a bar pinned to the bottom of the screen, so a long log can never
  // scroll it out of sight. It names the oldest line still waiting past 30 s.
  const overdue = v.lines.find(l => l.status === "overdue");
  $("wakebar").hidden = !overdue;
  document.body.classList.toggle("has-wakebar", !!overdue);
  if (overdue) {
    const short = overdue.text.length > 40 ? overdue.text.slice(0, 40) + "…" : overdue.text;
    $("wake-text").textContent = "«" + short + "» — 30 с без ответа";
    $("wake").dataset.resend = overdue.id;
    $("wake").disabled = false;
  }

  $("alerts").replaceChildren(...v.alerts.map(a => el("div", "alert", a)), ...(v.note ? [el("div", "note", v.note)] : []));
  window.scrollTo(0, y);
}

export function renderAbsent(text) {
  $("state").textContent = text;
  for (const b of document.querySelectorAll("form button")) b.disabled = true;
}
