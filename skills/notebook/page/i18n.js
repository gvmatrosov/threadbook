// Every word the page shows or sends, in English (the base) and Russian. The session seeds the
// sheet's language in live/state.lang; until it does, the browser's language picks ru or en.
// No DOM here: wire.js uses it too, and tools/test-page.js loads it in node.

export const LANGS = ["en", "ru"];
export const pickLang = (...tries) => tries.find(l => LANGS.includes(l)) || "en";
export const browserLang = nav => (nav && /^ru\b/i.test(nav.language || "") ? "ru" : "en");

const en = {
  title: "Notebook",
  // the comment wire: the memoryless auto-replier obeys this tail, so it keeps it to one word
  tail: id => `\n\n[threadbook ${id}] A line from the notebook: the live session will answer right in the item. ` +
    "Here reply with one word, “received”, and ask nothing.",
  limit: "claude.ai lets a comment wake the session at most 60 times an hour — the limit is used up. " +
    "The line is saved; the session will read it when it next wakes.",
  sentHot: "Sent to the notebook — the session is on the line.",
  sentCold: "Sent; waking the session, about 30 seconds.",
  notSaved: c => `The line was not saved (${c}); the text is left in the field.`,
  wakeFailed: "Could not wake the session; the line is in the notebook",
  wakeAgain: "Waking the session again.",
  resendFailed: "Could not wake it; check the terminal",
  modeFailed: c => `The mode did not switch (${c}).`,
  squeezeAsk: list => `Summarize the sheet: write the conclusions into items ${list}.`,
  extraAnswer: id => "Extra answer to line " + id,
  strayLine: id => "Line outside the items: " + id,
  squeezedBare: t => "Item summarized without conclusions: " + t,

  send: { available: "session listening", no_session: "session not listening — say “notebook, wake up” in the terminal",
    writers_only: "only the page owner can wake the session", off: "the session cannot be woken from here" },
  checking: "checking the link…",
  status: { waiting: "waiting for an answer", overdue: "no answer for 30 s — the “Wake the session” button is at the bottom",
    seen: "Claude saw it, writing…", resent: "woke it again, waiting", silent: "the session is silent — check the terminal" },
  via: { db: "via the notebook", comment: "via a comment" },
  lengths: { short: "short", normal: "to the point", long: "detailed" },
  lengthsLabel: "answers:",
  lengthsAria: "answer length in this item",
  you: "you",
  seenIn: s => `seen in ${s} s`,
  answeredIn: s => `answered in ${s} s`,
  typing: "writing…",
  spinTitle: "a line on its way, or Claude is writing",
  draftTitle: "an unsent draft",
  dotTitle: "new answer",
  save: "Save",
  cancel: "Cancel",
  placeholder: "Reply on this item (Ctrl+Enter sends)",
  sendBtn: "Send",
  squeeze: "summarize",
  unmark: "don’t summarize",
  unsqueeze: "expand",
  rename: "rename",
  hide: "delete",
  hideSure: "sure?",
  marked: "to summarize",
  squeezed: "summarized",
  summary: "Conclusions",
  showThread: n => `show the thread (${n})`,
  hideThread: "hide the thread",
  emptyThread: "No conversation in this item yet.",
  emptyItems: "No items yet — the session is still laying them out, or add your own.",
  economy: "economy: every line wakes the session",
  hot: "conversation hot",
  cold: "conversation cooled",
  squeezing: "🗜 summarizing…",
  squeezeSheet: n => "🗜 summarize the sheet" + (n ? ` (${n})` : ""),
  squeezeTip: "Claude writes the conclusions into the items marked “to summarize”",
  squeezeTipNone: "first mark items with “summarize”",
  waitedFor: s => `“${s}” — 30 s without an answer`,

  // the static page
  renameSheet: "rename",
  sheetName: "Sheet name",
  connecting: "Connecting…",
  modesAria: "Notebook mode",
  flashTip: "answer in ~10 s, spends a little Haiku",
  economyTip: "answer in ~40 s, no extra cost",
  addItem: "＋ Item",
  itemName: "Item name",
  create: "Add",
  wake: "Wake the session",
  noDb: "Storage unavailable: open the page at claude.ai, signed in to your account.",
  saveFailed: c => `Not saved (${c}).`,
  linkLost: c => `The link to the storage broke (${c}); reload the page.`,
  outside: "This page works only inside claude.ai.",
};

const ru = {
  title: "Тетрадь",
  tail: id => `\n\n[threadbook ${id}] Строка из тетради: ответ даст живая сессия прямо в пункте. ` +
    "Здесь ответь одним словом «принято», без вопросов.",
  limit: "claude.ai даёт будить сессию комментарием не чаще 60 раз в час — лимит исчерпан. " +
    "Строка записана, сессия прочтёт её при следующем пробуждении.",
  sentHot: "Ушло в тетрадь — сессия на связи.",
  sentCold: "Ушло и будит сессию, это около 30 секунд.",
  notSaved: c => `Строка не записалась (${c}), текст оставлен в поле.`,
  wakeFailed: "Разбудить сессию не удалось, строка в тетради",
  wakeAgain: "Бужу сессию ещё раз.",
  resendFailed: "Разбудить не удалось, загляни в терминал",
  modeFailed: c => `Режим не переключился (${c}).`,
  squeezeAsk: list => `Сожми лист: запиши выводы в пункты ${list}.`,
  extraAnswer: id => "Лишний ответ на строку " + id,
  strayLine: id => "Строка вне пунктов: " + id,
  squeezedBare: t => "Пункт сжат без выводов: " + t,

  send: { available: "сессия слушает", no_session: "сессия не слушает — скажи в терминале «тетрадь, проснись»",
    writers_only: "будить сессию может только владелец страницы", off: "будить сессию отсюда нельзя" },
  checking: "проверяю связь…",
  status: { waiting: "ждёт ответа", overdue: "ответа нет 30 с — кнопка «Разбудить сессию» внизу экрана",
    seen: "Claude увидел, пишет…", resent: "разбудил ещё раз, жду", silent: "сессия молчит — загляни в терминал" },
  via: { db: "через тетрадь", comment: "через комментарий" },
  lengths: { short: "коротко", normal: "по делу", long: "развёрнуто" },
  lengthsLabel: "ответы:",
  lengthsAria: "длина ответов в этом пункте",
  you: "ты",
  seenIn: s => `увидел за ${s} с`,
  answeredIn: s => `ответ за ${s} с`,
  typing: "пишет…",
  spinTitle: "строка в пути или Claude пишет",
  draftTitle: "есть неотправленный черновик",
  dotTitle: "новый ответ",
  save: "Сохранить",
  cancel: "Отмена",
  placeholder: "Ответ по этому пункту (Ctrl+Enter — отправить)",
  sendBtn: "Отправить",
  squeeze: "сжать",
  unmark: "не сжимать",
  unsqueeze: "разжать",
  rename: "переименовать",
  hide: "удалить",
  hideSure: "точно?",
  marked: "к сжатию",
  squeezed: "сжат",
  summary: "Выводы",
  showThread: n => `показать переписку (${n})`,
  hideThread: "скрыть переписку",
  emptyThread: "Разговора в этом пункте ещё не было.",
  emptyItems: "Пунктов пока нет — сессия их ещё раскладывает, или добавь свой.",
  economy: "economy: каждая строка будит сессию",
  hot: "разговор горячий",
  cold: "разговор остыл",
  squeezing: "🗜 сжимаю…",
  squeezeSheet: n => "🗜 сжать лист" + (n ? ` (${n})` : ""),
  squeezeTip: "Claude запишет выводы в пункты с пометкой «к сжатию»",
  squeezeTipNone: "сначала пометь пункты кнопкой «сжать»",
  waitedFor: s => `«${s}» — 30 с без ответа`,

  renameSheet: "переименовать",
  sheetName: "Название листа",
  connecting: "Подключаюсь…",
  modesAria: "Режим тетради",
  flashTip: "ответ за ~10 с, тратит немного Haiku",
  economyTip: "ответ за ~40 с, без доп. расходов",
  addItem: "＋ Пункт",
  itemName: "Название пункта",
  create: "Завести",
  wake: "Разбудить сессию",
  noDb: "Хранилище недоступно: открой страницу на claude.ai, войдя в свой аккаунт.",
  saveFailed: c => `Не сохранилось (${c}).`,
  linkLost: c => `Связь с хранилищем оборвалась (${c}), обнови страницу.`,
  outside: "Эта страница работает только внутри claude.ai.",
};

const DICT = { en, ru };

// tr(lang)("key", ...args) → the text; a dotted key reaches a group ("status.waiting").
export function tr(lang) {
  const d = DICT[pickLang(lang)];
  return (key, ...args) => {
    const v = key.split(".").reduce((o, k) => (o == null ? o : o[k]), d);
    return typeof v === "function" ? v(...args) : v == null ? "" : v;
  };
}

// The dictionaries must carry the same keys, or one language shows blanks.
export function missingKeys() {
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, p + k + ".") : [p + k]);
  const a = new Set(keys(en)), b = new Set(keys(ru));
  return [...a].filter(k => !b.has(k)).concat([...b].filter(k => !a.has(k)));
}
