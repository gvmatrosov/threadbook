// Boot: reach db and comments, wire the store to the wire and the wire to the screen.
import { createStore } from "./store.js";
import { createWire } from "./wire.js";
import { render, renderAbsent } from "./render.js";

const $ = id => document.getElementById(id);
const CAN_SEND_EVERY_MS = 20000; // a read: posts nothing, never prompts

async function start() {
  const [db, comments] = await Promise.all([claude.use("db"), claude.use("comments")]);
  if (!db) return renderAbsent("Хранилище недоступно: открой страницу на claude.ai, войдя в свой аккаунт.");

  const store = createStore(db);
  const wire = createWire({
    store, comments, anchorEl: $("item1"),
    clock: { now: Date.now, later: setTimeout, cancel: clearTimeout },
    onChange: render,
  });

  const checkCanSend = async () => {
    if (!comments) return wire.setCanSend("off");
    try { wire.setCanSend(await comments.canSendToClaude()); } catch (e) { wire.setCanSend("off"); }
  };

  store.watchMessages(wire.setRows, e => renderAbsent("Связь с хранилищем оборвалась (" + e.code + "), обнови страницу."));
  store.watchState(wire.setState, () => {});
  store.getThread().then(wire.setThread, () => {});
  checkCanSend();
  setInterval(checkCanSend, CAN_SEND_EVERY_MS);

  $("form").addEventListener("submit", ev => {
    ev.preventDefault();
    const text = $("text").value.trim();
    if (!text) return;
    $("text").value = "";
    wire.send(text).then(ok => { if (!ok && !$("text").value) $("text").value = text; checkCanSend(); });
  });
  $("text").addEventListener("keydown", ev => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) $("form").requestSubmit();
  });
  $("log").addEventListener("click", ev => {
    const b = ev.target.closest("[data-resend]");
    if (b) { b.disabled = true; wire.resend(b.dataset.resend).then(checkCanSend); }
  });
  $("send").disabled = false;
}

if (window.claude && claude.use) start();
else renderAbsent("Эта страница работает только внутри claude.ai.");
