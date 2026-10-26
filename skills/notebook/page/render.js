// Draws the wire's view. Built from elements with textContent (line text is never parsed as HTML;
// Claude's Markdown goes through md.js, which builds nodes too), and the scroll position is kept
// across re-renders so the page does not jump. Each card is built once and then only its parts are
// updated, so a half-typed line, its cursor and its focus survive an answer landing anywhere.
// Every word comes from i18n.js; a change of language rebuilds the cards (drafts live in local.js).
import { md } from "./md.js";
import { tr } from "./i18n.js";

const $ = id => document.getElementById(id);

const SEND_CLASS = { available: "good", no_session: "bad", writers_only: "bad", off: "bad" };
const STATUSES = ["waiting", "overdue", "seen", "resent", "silent"];
const LENGTHS = ["short", "normal", "long"];
const cards = new Map(); // item id → the card's live nodes
let t = tr("en"), shownLang = null;

// The words written into index.html: data-t → text, data-t-ph → placeholder, data-t-aria → aria-label.
export function applyStatic(lang) {
  t = tr(lang);
  for (const e of document.querySelectorAll("[data-t]")) e.textContent = t(e.dataset.t);
  for (const e of document.querySelectorAll("[data-t-ph]")) e.placeholder = t(e.dataset.tPh);
  for (const e of document.querySelectorAll("[data-t-aria]")) e.setAttribute("aria-label", t(e.dataset.tAria));
  document.documentElement.lang = lang;
}

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
  const facts = [t("you") + " · " + when(l.at), t("via." + l.via)];
  if (l.seenIn != null) facts.push(t("seenIn", l.seenIn));
  if (l.answeredIn != null) facts.push(t("answeredIn", l.answeredIn));
  box.append(el("div", "txt", l.text), el("div", "meta", facts.filter(Boolean).join(" · ")));
  if (STATUSES.includes(l.status)) box.append(el("div", "status " + l.status, t("status." + l.status)));
  return box;
}

function claudeLine(l) {
  const box = el("div", "msg claude");
  box.append(l.typing ? el("div", "typing", t("typing")) : md(l.text));
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
  c.spin.title = t("spinTitle");
  c.draftmark = el("span", "draftmark", "✎");
  c.draftmark.title = t("draftTitle");
  c.dot = el("span", "dot");
  c.dot.title = t("dotTitle");
  c.pm = el("span", "pm"); // the open/close sign: a plus in a circle, a minus once open
  c.pm.setAttribute("aria-hidden", "true");
  c.head.append(c.num, c.title, c.badge, c.spin, c.draftmark, c.dot, c.pm);

  c.body = el("div", "body");
  c.renform = el("form", "inline");
  c.renform.dataset.form = "rename";
  c.renform.dataset.id = id;
  c.renInput = el("input");
  c.renInput.maxLength = 200;
  const save = el("button", "", t("save"));
  save.type = "submit";
  c.renform.append(c.renInput, save, button("quiet", t("cancel"), "cancelRename", { id }));
  c.renform.hidden = true;

  c.lengths = el("div", "lengths");
  c.lengths.setAttribute("role", "group");
  c.lengths.setAttribute("aria-label", t("lengthsAria"));
  c.lengths.append(el("span", "lbl", t("lengthsLabel")),
    ...LENGTHS.map(k => button("seg", t("lengths." + k), "length", { id, length: k })));

  c.summary = el("div", "summary");
  c.fold = button("linkbtn", "", "fold", { id });
  c.log = el("div", "log");

  const form = el("form", "compose");
  form.dataset.form = "say";
  form.dataset.id = id;
  c.text = el("textarea");
  c.text.maxLength = 1800;
  c.text.placeholder = t("placeholder");
  c.text.value = draft;
  const send = el("button", "", t("sendBtn"));
  send.type = "submit";
  c.note = el("span", "note");
  const row = el("div", "row");
  row.append(send, c.note);
  form.append(c.text, row);

  c.squeezeBtn = button("linkbtn", "", "squeeze", { id });
  c.renBtn = button("linkbtn", t("rename"), "rename", { id });
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
  c.badge.textContent = i.squeeze === "marked" ? t("marked") : i.squeeze === "done" ? t("squeezed") : "";
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
  if (done) c.summary.replaceChildren(el("div", "lbl", t("summary")), md(i.summary));
  const folded = done && !ui.unfolded.has(i.id);
  c.fold.hidden = !done;
  c.fold.textContent = folded ? t("showThread", i.lines.length + (i.opening ? 1 : 0)) : t("hideThread");
  c.log.hidden = folded;
  if (!folded) {
    const opening = i.opening ? [claudeLine({ text: i.opening })] : [];
    const lines = i.lines.map(l => (l.from === "claude" ? claudeLine(l) : ownerLine(l)));
    c.log.replaceChildren(...(opening.length || lines.length ? [...opening, ...lines]
      : [el("div", "empty", t("emptyThread"))]));
  }
  c.note.textContent = i.note;
  c.squeezeBtn.textContent = t(i.squeeze === "marked" ? "unmark" : i.squeeze === "done" ? "unsqueeze" : "squeeze");
  c.hideBtn.textContent = t(ui.confirmHide.has(i.id) ? "hideSure" : "hide");
}

export function render(v, ui) {
  const y = window.scrollY;
  if (v.lang !== shownLang) {
    applyStatic(v.lang);
    for (const c of cards.values()) c.section.remove();
    cards.clear();
    shownLang = v.lang;
  }
  document.title = v.title;
  $("title").textContent = v.title;
  const renamingSheet = ui.renaming.has("sheet");
  if (renamingSheet && $("renSheetForm").hidden) $("renSheet").value = v.title;
  $("renSheetForm").hidden = !renamingSheet;
  $("titleRow").hidden = renamingSheet;

  for (const b of $("modes").querySelectorAll("[data-mode]")) {
    b.setAttribute("aria-checked", String(b.dataset.mode === v.mode));
  }

  const known = v.canSend in SEND_CLASS;
  $("state").replaceChildren(
    el("b", v.hot ? "good" : "", t(v.mode === "economy" ? "economy" : v.hot ? "hot" : "cold")),
    document.createTextNode(" · "),
    el("b", known ? SEND_CLASS[v.canSend] : "", known ? t("send." + v.canSend) : t("checking")),
  );

  const sq = $("squeeze");
  sq.disabled = v.sheet.squeezing || !v.sheet.marked;
  sq.textContent = v.sheet.squeezing ? t("squeezing") : t("squeezeSheet", v.sheet.marked);
  sq.title = t(v.sheet.marked ? "squeezeTip" : "squeezeTipNone");
  // While a squeeze is on its way, say how it went out; once answered, show Claude's report.
  $("squeezeNote").textContent = v.sheet.squeezing ? v.sheet.note : v.sheet.reply || v.sheet.note;

  const box = $("items");
  if (!v.items.length) {
    box.replaceChildren(el("div", "empty", t("emptyItems")));
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
    $("wake-text").textContent = t("waitedFor", short);
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
