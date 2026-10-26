// Автотест экрана тетради в настоящем браузере (headless Chromium): the page from
// skills/notebook/page runs against tools/fake-claude.js — measure → tap → measure on the DOM, plus
// screenshots to look at. Needs Playwright:
//   node tools/test-dom.js [--shots <dir>]   (Playwright must resolve: `npm i -g playwright` and NODE_PATH,
//   or any local install; Chromium via `npx playwright install chromium`)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const PAGE = path.join(__dirname, "../skills/notebook/page");
const shotsAt = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8" };

// The artifact host wraps index.html in a document skeleton; this does the same.
function serve() {
  const server = http.createServer((req, res) => {
    const name = req.url.split("?")[0] === "/" ? "index.html" : path.basename(req.url.split("?")[0]);
    const file = path.join(PAGE, name);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(file);
    if (name === "index.html") {
      body = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1">'
        + "</head><body>" + body + "</body></html>";
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(name)] });
    res.end(body);
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r(server)));
}

const T0 = Date.now() - 600000;
const seed = {
  "live/state": { title: "Самые успешные вайбкодеры", hotUntil: 0, lang: "ru" },
  "settings/mode": { mode: "flash" },
  "items/i1": { title: "Андрей Карпаты — автор слова", order: 1,
    text: "Бывший директор по ИИ в Tesla. Пост от 2 февраля 2025:\n\n- говоришь ИИ, что хочешь;\n- принимаешь правки **не читая**;\n- ошибку вставляешь обратно.\n\nСловарь Collins назвал `vibe coding` словом года." },
  "items/i2": { title: "Питер Левелс — самолётик за $1 млн", order: 2, text: "Голландский одиночка-предприниматель." },
  "items/i3": { title: "Антипример: Лео и взломанный SaaS", order: 3, text: "Март 2025: сделал платный сервис, не написав ни строчки кода." },
  "messages/m1": { from: "owner", item: "i2", text: "А он сам не программист?", via: "db", mode: "flash", length: "normal", at: T0 },
  "messages/re-m1": { from: "claude", replyTo: "m1", item: "i2", text: "Программист, пишет на PHP.\n\n1. Nomad List\n2. Photo AI", seenAt: T0 + 9000, at: T0 + 20000 },
};

const results = [];
const check = (name, ok) => { results.push([name, ok]); console.log((ok ? "  зелёный  " : "  КРАСНЫЙ  ") + name); };

(async () => {
  const server = await serve();
  const url = "http://127.0.0.1:" + server.address().port + "/";
  const browser = await chromium.launch();
  const fake = fs.readFileSync(path.join(__dirname, "fake-claude.js"), "utf8");
  const errors = [];

  // The browser's own language is en-US unless a test says otherwise; the sheet's comes from live/state.
  async function open(width, height, scheme = "light", { locale = "en-US", data = seed } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale });
    await ctx.addInitScript(`${fake}\nwindow.__fakeInstall();\nfor (const [k, v] of Object.entries(${JSON.stringify(data)})) window.__fake.set(k, v);`);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    await page.waitForSelector(".items > .card");
    return page;
  }
  const db = (page, fn, ...a) => page.evaluate(([f, args]) => window.__fake[f](...args), [fn, a]);
  const card = n => `.card[data-item="i${n}"]`;
  const shot = async (page, name) => { if (shotsAt) await page.screenshot({ path: path.join(shotsAt, name + ".png"), fullPage: true }); };

  const page = await open(390, 844);
  await shot(page, "1-phone-closed");

  check("пункты закрыты при первом входе: видны номер и название, лента спрятана",
    await page.$$eval(".items > .card", cs => cs.length === 3 && cs.every(c => c.querySelector(".body").hidden))
    && (await page.textContent(card(1) + " .num")) === "1");

  check("вкладка браузера называется по имени листа", (await page.title()) === "Самые успешные вайбкодеры");

  check("старый ответ при первом входе не горит красной точкой",
    await page.$eval(card(2) + " .dot", d => d.hidden));

  // The sign is a plus while closed: its vertical bar (::after) stands at 90°, and lies flat once open.
  const bar = n => page.$eval(card(n) + " .pm", p => getComputedStyle(p, "::after").transform);
  const closedBar = await bar(1);
  await page.click(card(1) + " .head");
  await page.waitForTimeout(250);
  check("знак в кружке: плюс у закрытого пункта, минус у открытого",
    closedBar !== "none" && closedBar !== "matrix(1, 0, 0, 1, 0, 0)" && (await bar(1)) === "matrix(1, 0, 0, 1, 0, 0)"
    && (await bar(2)) === closedBar);
  check("тап по заголовку открывает пункт: вступление нарисовано списком, жирный — жирным",
    await page.$eval(card(1), c => !c.querySelector(".body").hidden && c.querySelectorAll(".md li").length === 3
      && c.querySelector(".md b")?.textContent === "не читая"));
  await shot(page, "2-phone-open");

  const oneRow = n => page.$$eval(card(n) + " .tools button", bs => bs.length === 3 && bs.every(b => b.offsetTop === bs[0].offsetTop));
  check("кнопки внизу пункта: в рамках, «сжать · переименовать · удалить» в одну строку на телефоне",
    await page.$$eval(card(1) + " .tools button", bs => bs.map(b => b.textContent).join("|") === "сжать|переименовать|удалить"
      && bs.every(b => parseFloat(getComputedStyle(b).borderTopWidth) > 0)) && await oneRow(1));

  check("рамка одна: у листа и у сообщений рамок нет",
    await page.evaluate(() => {
      const bw = el => parseFloat(getComputedStyle(el).borderTopWidth) || 0;
      return bw(document.querySelector(".sheet")) === 0 && [...document.querySelectorAll(".msg")].every(m => bw(m) === 0);
    }));

  await page.fill(card(1) + " textarea", "недописанная мысль");
  await page.focus(card(1) + " textarea");
  await db(page, "set", "messages/re-m1", { from: "claude", replyTo: "m1", item: "i2", text: "Новый ответ во втором пункте", seenAt: Date.now(), at: Date.now() });
  await page.waitForTimeout(100);
  check("ответ в другом пункте не стирает набранное и не уводит фокус",
    (await page.inputValue(card(1) + " textarea")) === "недописанная мысль"
    && await page.evaluate(sel => document.activeElement === document.querySelector(sel + " textarea"), card(1)));
  check("новый ответ в закрытом пункте зажигает точку",
    await page.$eval(card(2) + " .dot", d => !d.hidden));
  await page.click(card(2) + " .head");
  check("открыл пункт — точка погасла", await page.$eval(card(2) + " .dot", d => d.hidden));
  await page.click(card(2) + " .head");

  await page.click(card(1) + ' [data-length="short"]');
  await page.waitForTimeout(50);
  check("кнопка «коротко» пишет длину в пункт и подсвечивается",
    (await db(page, "get", "items/i1")).length === "short"
    && (await page.getAttribute(card(1) + ' [data-length="short"]', "aria-pressed")) === "true");

  await page.click(card(1) + " .compose button[type=submit]");
  await page.waitForTimeout(50);
  const sentRow = (await db(page, "all", "messages")).find(m => m.text === "недописанная мысль");
  check("отправка: строка в базе со своим пунктом и длиной, комментарий привязан к карточке, поле пустое",
    sentRow && sentRow.item === "i1" && sentRow.length === "short"
    && (await db(page, "sent"))[0]?.anchor?.path === "i1" && (await page.inputValue(card(1) + " textarea")) === "");
  check("пока ответа нет, на пункте крутится колёсико", await page.$eval(card(1) + " .spin", s => !s.hidden));

  check("«сжать лист» неактивна, пока нет пометок", await page.$eval("#squeeze", b => b.disabled));
  await page.click(card(1) + ' [data-act="squeeze"]');
  await page.waitForTimeout(50);
  check("«сжать до выводов» ставит пометку, и «сжать лист» оживает со счётчиком",
    (await db(page, "get", "items/i1")).squeeze === "marked"
    && await page.$eval("#squeeze", b => !b.disabled && b.textContent.includes("(1)"))
    && (await page.textContent(card(1) + " .badge")) === "к сжатию");
  await page.click("#squeeze");
  await page.waitForTimeout(50);
  const ask = (await db(page, "all", "messages")).find(m => m.kind === "squeeze");
  check("«сжать лист» шлёт один запрос с именем помеченного пункта и показывает «сжимаю…»",
    ask && ask.item === "sheet" && ask.text.includes("Андрей Карпаты") && (await page.textContent("#squeeze")).includes("сжимаю"));

  await db(page, "set", "items/i1", { ...(await db(page, "get", "items/i1")), squeeze: "done", summary: "**Главное:** термин придумал Карпаты." });
  await db(page, "set", "messages/re-" + ask.id, { from: "claude", replyTo: ask.id, item: "sheet", text: "Сжал 1 пункт.", seenAt: Date.now(), at: Date.now() });
  await page.waitForTimeout(100);
  check("сжатый пункт: впереди выводы, переписка свёрнута под кнопкой",
    await page.$eval(card(1), c => !c.querySelector(".summary").hidden && c.querySelector(".log").hidden
      && c.querySelector('[data-act="fold"]').textContent.startsWith("показать переписку")));
  check("ответ на «сжать лист» виден возле кнопки, кнопка снова «сжать лист»",
    (await page.textContent("#squeezeNote")) === "Сжал 1 пункт." && !(await page.textContent("#squeeze")).includes("сжимаю"));
  await shot(page, "3-phone-squeezed");
  await page.click(card(1) + ' [data-act="fold"]');
  check("«показать переписку» разворачивает ленту", await page.$eval(card(1) + " .log", l => !l.hidden));

  await page.click(card(3) + " .head");
  await page.click(card(3) + ' [data-act="hide"]');
  const armed = await page.textContent(card(3) + ' [data-act="hide"]');
  const armedRow = await oneRow(3);
  const stillThere = !(await db(page, "get", "items/i3")).hidden;
  await page.click(card(3) + ' [data-act="hide"]');
  await page.waitForTimeout(50);
  check("удаление в два тапа: первый спрашивает, второй прячет пункт",
    armed === "точно?" && armedRow && stillThere && (await db(page, "get", "items/i3")).hidden === true && !(await page.$(card(3))));

  await page.click("#addItem");
  await page.fill("#addTitle", "Мой вопрос");
  await page.press("#addTitle", "Enter");
  await page.waitForTimeout(100);
  const added = (await db(page, "all", "items")).find(i => i.title === "Мой вопрос");
  check("«＋ Пункт» заводит пункт со следующим номером и сразу открывает его",
    added && added.order === 4 && added.by === "owner"
    && await page.$eval(`.card[data-item="${added.id}"]`, c => c.classList.contains("open")));

  await page.click(card(2) + " .head");
  await page.click(card(2) + ' [data-act="rename"]');
  await page.fill(card(2) + ' form[data-form="rename"] input', "Левелс");
  await page.press(card(2) + ' form[data-form="rename"] input', "Enter");
  await page.waitForTimeout(50);
  check("переименование пункта сохраняется и форма закрывается",
    (await db(page, "get", "items/i2")).title === "Левелс" && (await page.textContent(card(2) + " .title")) === "Левелс"
    && await page.$eval(card(2) + ' form[data-form="rename"]', f => f.hidden));

  await page.click('#titleRow [data-act="rename"]');
  await page.fill("#renSheet", "Вайбкодеры");
  await page.press("#renSheet", "Enter");
  await page.waitForTimeout(50);
  check("переименование листа сохраняется отдельно от имени сессии",
    (await db(page, "get", "settings/title")).title === "Вайбкодеры" && (await page.textContent("#title")) === "Вайбкодеры"
    && (await db(page, "get", "live/state")).title === "Самые успешные вайбкодеры");

  await page.fill(card(2) + " textarea", "черновик на потом");
  await page.reload();
  await page.waitForSelector(".items > .card");
  check("после перезагрузки: черновик на месте, открытые пункты открыты",
    (await page.inputValue(card(2) + " textarea")) === "черновик на потом"
    && await page.$eval(card(2), c => c.classList.contains("open")));

  check("нет горизонтальной прокрутки на телефоне",
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot(page, "4-phone-after");

  // More than 15 items is the person's call (the skill asks first); the page must hold them all.
  const many = { ...seed };
  for (let n = 4; n <= 20; n++) many["items/i" + n] = { title: "Пункт номер " + n, order: n, text: "текст " + n };
  const big = await open(390, 844, "light", { data: many });
  check("лист из 20 пунктов: все на месте, по порядку, без горизонтальной прокрутки",
    await big.$$eval(".items > .card .num", ns => ns.length === 20 && ns.every((n, k) => n.textContent === String(k + 1)))
    && await big.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // A sheet seeded without a language: English for an English browser, Russian for a Russian one.
  const bare = { ...seed, "live/state": { title: "Vibe coders", hotUntil: 0 } };
  const en = await open(390, 844, "light", { data: bare });
  await en.click(card(1) + " .head");
  check("лист без языка в английском браузере — английский: кнопки, режимы, поле, одна строка кнопок",
    await en.evaluate(() => document.documentElement.lang === "en"
      && [...document.querySelectorAll('.card[data-item="i1"] .tools button')].map(b => b.textContent).join("|") === "summarize|rename|delete"
      && document.querySelector('[data-mode="economy"] b').textContent === "economy"
      && document.querySelector('[data-mode="economy"] span').textContent === "answer in ~40 s, no extra cost"
      && document.querySelector('.card[data-item="i1"] textarea').placeholder.startsWith("Reply")
      && document.querySelector("#addItem").textContent === "＋ Item")
    && await en.$$eval(card(1) + " .tools button", bs => bs.every(b => b.offsetTop === bs[0].offsetTop)));
  await shot(en, "7-phone-english");
  const ruBrowser = await open(390, 844, "light", { data: bare, locale: "ru-RU" });
  await ruBrowser.click(card(1) + " .head");
  check("лист без языка в русском браузере — русский",
    (await ruBrowser.textContent(card(1) + ' [data-act="rename"]')) === "переименовать"
    && (await ruBrowser.textContent("#addItem")) === "＋ Пункт");

  if (shotsAt) {
    const wide = await open(1200, 900);
    await wide.click(card(1) + " .head");
    await shot(wide, "5-desktop");
    const dark = await open(390, 844, "dark");
    await dark.click(card(1) + " .head");
    await dark.waitForTimeout(250);
    await shot(dark, "6-phone-dark");
  }

  check("на странице не было ошибок JavaScript", errors.length === 0);
  if (errors.length) console.log(errors.join("\n"));
  await browser.close();
  server.close();
  const red = results.filter(([, ok]) => !ok).length;
  console.log(red ? "\nпрогон красный: " + red : "\nпрогон зелёный: " + results.length + " проверок");
  process.exit(red ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
