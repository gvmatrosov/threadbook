// Boot: reach db and comments, wire the store to the wire and the wire to the screen.
import { createStore } from "./store.js";
import { createWire } from "./wire.js";
import { render, renderAbsent, sectionOf } from "./render.js";

const $ = id => document.getElementById(id);
const CAN_SEND_EVERY_MS = 20000; // a read: posts nothing, never prompts

async function start() {
  const [db, comments] = await Promise.all([claude.use("db"), claude.use("comments")]);
  if (!db) return renderAbsent("Хранилище недоступно: открой страницу на claude.ai, войдя в свой аккаунт.");

  const store = createStore(db);
  const wire = createWire({
    store, comments, anchorOf: sectionOf,
    clock: { now: Date.now, later: setTimeout, cancel: clearTimeout },
    onChange: render,
  });

  const checkCanSend = async () => {
    if (!comments) return wire.setCanSend("off");
    try { wire.setCanSend(await comments.canSendToClaude()); } catch (e) { wire.setCanSend("off"); }
  };

  store.watchMessages(wire.setRows, e => renderAbsent("Связь с хранилищем оборвалась (" + e.code + "), обнови страницу."));
  store.watchItems(wire.setItems, () => {});
  store.watchState(wire.setState, () => {});
  store.watchMode(wire.setMode, () => {});
  store.getThreads().then(wire.setThreads, () => {});
  checkCanSend();
  setInterval(checkCanSend, CAN_SEND_EVERY_MS);

  // Every item card has its own form; one listener on the container serves them all.
  $("items").addEventListener("submit", ev => {
    const form = ev.target.closest("form[data-item]");
    if (!form) return;
    ev.preventDefault();
    const box = form.querySelector("textarea"), text = box.value.trim();
    if (!text) return;
    box.value = "";
    wire.send(form.dataset.item, text).then(ok => { if (!ok && !box.value) box.value = text; checkCanSend(); });
  });
  $("items").addEventListener("keydown", ev => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && ev.target.form) ev.target.form.requestSubmit();
  });
  $("wake").addEventListener("click", ev => {
    const b = ev.currentTarget;
    if (!b.dataset.resend) return;
    b.disabled = true;
    wire.resend(b.dataset.resend).then(checkCanSend);
  });
  $("modes").addEventListener("click", ev => {
    const b = ev.target.closest("[data-mode]");
    if (b) wire.chooseMode(b.dataset.mode);
  });
}

if (window.claude && claude.use) start();
else renderAbsent("Эта страница работает только внутри claude.ai.");
