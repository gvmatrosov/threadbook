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
  overdue: "ответа нет 30 с — кнопка «Разбудить сессию» внизу экрана",
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

  $("alerts").replaceChildren(...v.alerts.map(a => el("div", "alert", a)));
  $("note").textContent = v.note;
  window.scrollTo(0, y);
}

export function renderAbsent(text) {
  $("state").textContent = text;
  $("send").disabled = true;
}
