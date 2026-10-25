// Draws the wire's view. Built from elements with textContent (line text is never parsed as HTML),
// and the scroll position is kept across re-renders so the page does not jump.

const $ = id => document.getElementById(id);

const SEND = {
  available: ["good", "сессия слушает"],
  no_session: ["bad", "сессия не слушает — скажи в терминале «тетрадь, проснись»"],
  writers_only: ["bad", "будить сессию может только владелец страницы"],
  off: ["bad", "будить сессию отсюда нельзя"],
};
const STATUS = {
  waiting: "ждёт ответа",
  seen: "Claude увидел, пишет…",
  resent: "разбудил ещё раз, жду",
  silent: "сессия молчит — загляни в терминал",
};
const VIA = { db: "через тетрадь", comment: "через комментарий" };

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
  if (l.status === "overdue") {
    const b = el("button", "alt wake", "Ответа нет 30 с — разбудить сессию");
    b.type = "button";
    b.dataset.resend = l.id;
    box.append(b);
  } else if (STATUS[l.status]) {
    box.append(el("span", "status " + l.status, STATUS[l.status]));
  }
  return box;
}

function claudeLine(l) {
  const box = el("div", "msg claude");
  box.append(el("span", "who", "Claude"), el("span", "", l.typing ? "пишет…" : l.text));
  return box;
}

export function render(v) {
  const y = window.scrollY;
  document.title = v.title;
  $("title").textContent = v.title;
  $("item-title").textContent = v.itemTitle;

  const [cls, words] = SEND[v.canSend] || ["", "проверяю связь…"];
  const state = $("state");
  state.replaceChildren(
    el("b", v.hot ? "good" : "", v.hot ? "разговор горячий" : "разговор остыл"),
    document.createTextNode(" · "),
    el("b", cls, words),
  );

  const log = $("log");
  log.replaceChildren(...(v.lines.length
    ? v.lines.map(l => (l.from === "claude" ? claudeLine(l) : ownerLine(l)))
    : [el("div", "empty", "Здесь появятся твои строки и ответы Claude.")]));

  $("alerts").replaceChildren(...v.alerts.map(a => el("div", "alert", a)));
  $("note").textContent = v.note;
  window.scrollTo(0, y);
}

export function renderAbsent(text) {
  $("state").textContent = text;
  $("send").disabled = true;
}
