// Draws the wire's view. Built from elements with textContent (line text is never parsed as HTML;
// Claude's Markdown goes through md.js, which builds nodes too), and the scroll position is kept
// across re-renders so the page does not jump. Each card is built once and then only its parts are
// updated, so a half-typed line, its cursor and its focus survive an answer landing anywhere.
import { md } from "./md.js";

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
const LENGTH_WORDS = [["short", "коротко"], ["normal", "по делу"], ["long", "развёрнуто"]];
const cards = new Map(); // item id → the card's live nodes

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function button(cls, text, act, extra = {}) {
  const b = el("button", cls, text);
  b.type = "button";
  b.dataset.act = act;
  for (const [k, v] of Object.entries(extra)) b.dataset[k] = v;
  return b;
}

export function when(at) {
  if (!at) return "";
  const d = new Date(at), today = new Date();
  const p = n => String(n).padStart(2, "0");
  const time = p(d.getHours()) + ":" + p(d.getMinutes());
  return d.toDateString() === today.toDateString() ? time : p(d.getDate()) + "." + p(d.getMonth() + 1) + " " + time;
}

function ownerLine(l) {
  const box = el("div", "msg owner");
  const facts = ["ты · " + when(l.at), VIA[l.via]];
  if (l.seenIn != null) facts.push("увидел за " + l.seenIn + " с");
  if (l.answeredIn != null) facts.push("ответ за " + l.answeredIn + " с");
  box.append(el("div", "txt", l.text), el("div", "meta", facts.filter(Boolean).join(" · ")));
  if (STATUS[l.status]) box.append(el("div", "status " + l.status, STATUS[l.status]));
  return box;
}

function claudeLine(l) {
  const box = el("div", "msg claude");
  box.append(l.typing ? el("div", "typing", "пишет…") : md(l.text));
  if (l.at) box.append(el("div", "meta", "Claude · " + when(l.at)));
  return box;
}

// The card's section is also the comment anchor for its thread.
export const sectionOf = item => (item === "sheet" ? $("head") : cards.get(item)?.section);

function build(id, draft) {
  const c = {};
  c.section = el("section", "card");
  c.section.dataset.item = id;
  c.head = el("button", "head");
  c.head.type = "button";
  c.head.dataset.act = "toggle";
  c.head.dataset.id = id;
  c.num = el("span", "num");
  c.title = el("span", "title");
  c.badge = el("span", "badge");
  c.spin = el("span", "spin");
  c.spin.title = "строка в пути или Claude пишет";
  c.draftmark = el("span", "draftmark", "✎");
  c.draftmark.title = "есть неотправленный черновик";
  c.dot = el("span", "dot");
  c.dot.title = "новый ответ";
  c.pm = el("span", "pm"); // the open/close sign: a plus in a circle, a minus once open
  c.pm.setAttribute("aria-hidden", "true");
  c.head.append(c.num, c.title, c.badge, c.spin, c.draftmark, c.dot, c.pm);

  c.body = el("div", "body");
  c.renform = el("form", "inline");
  c.renform.dataset.form = "rename";
  c.renform.dataset.id = id;
  c.renInput = el("input");
  c.renInput.maxLength = 200;
  const save = el("button", "", "Сохранить");
  save.type = "submit";
  c.renform.append(c.renInput, save, button("quiet", "Отмена", "cancelRename", { id }));
  c.renform.hidden = true;

  c.lengths = el("div", "lengths");
  c.lengths.setAttribute("role", "group");
  c.lengths.setAttribute("aria-label", "длина ответов в этом пункте");
  c.lengths.append(el("span", "lbl", "ответы:"),
    ...LENGTH_WORDS.map(([k, w]) => button("seg", w, "length", { id, length: k })));

  c.summary = el("div", "summary");
  c.fold = button("linkbtn", "", "fold", { id });
  c.log = el("div", "log");

  const form = el("form", "compose");
  form.dataset.form = "say";
  form.dataset.id = id;
  c.text = el("textarea");
  c.text.maxLength = 1800;
  c.text.placeholder = "Ответ по этому пункту (Ctrl+Enter — отправить)";
  c.text.value = draft;
  const send = el("button", "", "Отправить");
  send.type = "submit";
  c.note = el("span", "note");
  const row = el("div", "row");
  row.append(send, c.note);
  form.append(c.text, row);

  c.squeezeBtn = button("linkbtn", "", "squeeze", { id });
  c.renBtn = button("linkbtn", "переименовать", "rename", { id });
  c.hideBtn = button("linkbtn danger", "", "hide", { id });
  const tools = el("div", "tools");
  tools.append(c.squeezeBtn, c.renBtn, c.hideBtn);

  c.body.append(c.renform, c.lengths, c.summary, c.fold, c.log, form, tools);
  c.section.append(c.head, c.body);
  cards.set(id, c);
  return c;
}

function fill(c, i, ui) {
  const open = ui.local.isOpen(i.id);
  c.section.classList.toggle("open", open);
  c.head.setAttribute("aria-expanded", String(open));
  c.num.textContent = i.num != null ? String(i.num) : "•";
  c.title.textContent = i.title;
  c.badge.textContent = i.squeeze === "marked" ? "к сжатию" : i.squeeze === "done" ? "сжат" : "";
  c.badge.className = "badge" + (i.squeeze === "done" ? " done" : "");
  c.badge.hidden = i.squeeze === "none";
  c.spin.hidden = !i.pending;
  c.draftmark.hidden = open || !c.text.value.trim();
  c.dot.hidden = !ui.local.unread(i);
  c.body.hidden = !open;
  if (!open) return;

  const renaming = ui.renaming.has(i.id);
  if (renaming && c.renform.hidden !== false) c.renInput.value = i.title;
  c.renform.hidden = !renaming;
  for (const b of c.lengths.querySelectorAll("[data-length]")) b.setAttribute("aria-pressed", String(b.dataset.length === i.length));

  // A squeezed card leads with its conclusions; the full thread stays one tap away.
  const done = i.squeeze === "done" && i.summary;
  c.summary.hidden = !done;
  if (done) c.summary.replaceChildren(el("div", "lbl", "Выводы"), md(i.summary));
  const folded = done && !ui.unfolded.has(i.id);
  c.fold.hidden = !done;
  c.fold.textContent = folded ? "показать переписку (" + (i.lines.length + (i.opening ? 1 : 0)) + ")" : "скрыть переписку";
  c.log.hidden = folded;
  if (!folded) {
    const opening = i.opening ? [claudeLine({ text: i.opening })] : [];
    const lines = i.lines.map(l => (l.from === "claude" ? claudeLine(l) : ownerLine(l)));
    c.log.replaceChildren(...(opening.length || lines.length ? [...opening, ...lines]
      : [el("div", "empty", "Разговора в этом пункте ещё не было.")]));
  }
  c.note.textContent = i.note;
  c.squeezeBtn.textContent = i.squeeze === "marked" ? "не сжимать" : i.squeeze === "done" ? "снять сжатие" : "сжать до выводов";
  c.hideBtn.textContent = ui.confirmHide.has(i.id) ? "точно удалить? нажми ещё раз" : "удалить пункт";
}

export function render(v, ui) {
  const y = window.scrollY;
  document.title = v.title;
  $("title").textContent = v.title;
  const renamingSheet = ui.renaming.has("sheet");
  if (renamingSheet && $("renSheetForm").hidden) $("renSheet").value = v.title;
  $("renSheetForm").hidden = !renamingSheet;
  $("titleRow").hidden = renamingSheet;

  for (const b of $("modes").querySelectorAll("[data-mode]")) {
    b.setAttribute("aria-checked", String(b.dataset.mode === v.mode));
  }

  const [cls, words] = SEND[v.canSend] || ["", "проверяю связь…"];
  $("state").replaceChildren(
    el("b", v.hot ? "good" : "", v.mode === "econom" ? "econom: каждая строка будит сессию"
      : v.hot ? "разговор горячий" : "разговор остыл"),
    document.createTextNode(" · "),
    el("b", cls, words),
  );

  const sq = $("squeeze");
  sq.disabled = v.sheet.squeezing || !v.sheet.marked;
  sq.textContent = v.sheet.squeezing ? "🗜 сжимаю…" : "🗜 сжать лист" + (v.sheet.marked ? " (" + v.sheet.marked + ")" : "");
  sq.title = v.sheet.marked ? "Claude запишет выводы в пункты с пометкой «к сжатию»"
    : "сначала пометь пункты кнопкой «сжать до выводов»";
  // While a squeeze is on its way, say how it went out; once answered, show Claude's report.
  $("squeezeNote").textContent = v.sheet.squeezing ? v.sheet.note : v.sheet.reply || v.sheet.note;

  const box = $("items");
  if (!v.items.length) {
    box.replaceChildren(el("div", "empty", "Пунктов пока нет — сессия их ещё раскладывает, или добавь свой."));
  } else {
    const keep = new Set(v.items.map(i => i.id));
    for (const [id, c] of cards) if (!keep.has(id)) { c.section.remove(); cards.delete(id); }
    const sections = v.items.map(i => {
      const c = cards.get(i.id) || build(i.id, ui.local.draft(i.id));
      fill(c, i, ui);
      return c.section;
    });
    // Reorder only when needed: moving a section blurs a textarea inside it.
    const now = [...box.children];
    if (now.length !== sections.length || sections.some((s, k) => now[k] !== s)) box.replaceChildren(...sections);
  }

  $("addForm").hidden = !ui.adding;
  $("addItem").hidden = ui.adding;

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
  for (const b of document.querySelectorAll("button")) b.disabled = true;
}
