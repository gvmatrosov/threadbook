// Boot: reach db and comments, wire the store to the wire and the wire to the screen. Every tap is
// caught by one listener on the document through data-act / data-form, so redraws never lose handlers.
import { createStore } from "./store.js";
import { createWire } from "./wire.js";
import { createActions } from "./actions.js";
import { createLocal } from "./local.js";
import { render, renderAbsent, sectionOf, applyStatic } from "./render.js";
import { tr, browserLang } from "./i18n.js";

const $ = id => document.getElementById(id);
const CAN_SEND_EVERY_MS = 20000; // a read: posts nothing, never prompts
const CONFIRM_MS = 4000;

let storage = null;
try { storage = window.localStorage; } catch (e) { storage = null; }
const memory = new Map();
const local = createLocal(storage || { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) }, Date.now);
// The sheet's language arrives with live/state; until then the browser's guess (en unless ru).
const guess = browserLang(navigator);
const T = (...a) => tr(last ? last.lang : guess)(...a);
let last = null;
const ui = { local, renaming: new Set(), unfolded: new Set(), confirmHide: new Set(), adding: false };

async function start() {
  const [db, comments] = await Promise.all([claude.use("db"), claude.use("comments")]);
  if (!db) return renderAbsent(T("noDb"));

  const store = createStore(db);
  const draw = v => {
    last = v;
    render(v, ui);
    // An answer landing in an open card is read on the spot.
    for (const c of v.items) if (local.isOpen(c.id)) local.markSeen(c);
  };
  const wire = createWire({
    store, comments, anchorOf: sectionOf,
    clock: { now: Date.now, later: setTimeout, cancel: clearTimeout },
    onChange: draw, lang: guess,
  });
  const actions = createActions({ store, getItems: wire.allItems });
  const redraw = () => last && draw(last);
  const fail = e => { $("alerts").append(Object.assign(document.createElement("div"), { className: "alert", textContent: T("saveFailed", (e && e.code) || e) })); };

  const checkCanSend = async () => {
    if (!comments) return wire.setCanSend("off");
    try { wire.setCanSend(await comments.canSendToClaude()); } catch (e) { wire.setCanSend("off"); }
  };

  store.watchMessages(wire.setRows, e => renderAbsent(T("linkLost", e.code)));
  store.watchItems(wire.setItems, () => {});
  store.watchState(wire.setState, () => {});
  store.watchMode(wire.setMode, () => {});
  store.watchTitle(wire.setTitle, () => {});
  store.getThreads().then(wire.setThreads, () => {});
  checkCanSend();
  setInterval(checkCanSend, CAN_SEND_EVERY_MS);

  const act = {
    toggle(id) { local.toggle(id); redraw(); },
    length(id, b) { actions.setLength(id, b.dataset.length).catch(fail); },
    squeeze(id) {
      const card = last && last.items.find(c => c.id === id);
      if (card) actions.markSqueeze(id, card.squeeze === "none").catch(fail);
    },
    fold(id) { if (ui.unfolded.has(id)) ui.unfolded.delete(id); else ui.unfolded.add(id); redraw(); },
    rename(id) { ui.renaming.add(id); redraw(); (id === "sheet" ? $("renSheet") : document.querySelector(`[data-form="rename"][data-id="${id}"] input`))?.focus(); },
    cancelRename(id) { ui.renaming.delete(id); redraw(); },
    // Two taps: the first arms the button for a few seconds, the second hides the card.
    hide(id) {
      if (!ui.confirmHide.has(id)) {
        ui.confirmHide.add(id); redraw();
        setTimeout(() => { ui.confirmHide.delete(id); redraw(); }, CONFIRM_MS);
        return;
      }
      ui.confirmHide.delete(id);
      actions.hide(id).catch(fail);
    },
    add() { ui.adding = true; redraw(); $("addTitle").focus(); },
    cancelAdd() { ui.adding = false; redraw(); },
    squeezeSheet() { wire.askSqueeze().then(checkCanSend); },
  };

  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-act]");
    if (!b || !act[b.dataset.act]) return;
    ev.preventDefault();
    act[b.dataset.act](b.dataset.id, b);
  });

  document.addEventListener("submit", ev => {
    const form = ev.target.closest("form[data-form]");
    if (!form) return;
    ev.preventDefault();
    const id = form.dataset.id, input = form.querySelector("textarea, input");
    if (form.dataset.form === "say") {
      // wire.send runs inside the tap: the comment must start before anything is awaited.
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      local.setDraft(id, "");
      wire.send(id, text).then(ok => {
        if (!ok && !input.value) { input.value = text; local.setDraft(id, text); }
        checkCanSend();
      });
    } else if (form.dataset.form === "rename") {
      const done = id === "sheet" ? actions.renameSheet(input.value) : actions.rename(id, input.value);
      done.then(ok => { if (ok) { ui.renaming.delete(id); redraw(); } }, fail);
    } else if (form.dataset.form === "add") {
      actions.addItem(input.value).then(newId => {
        if (!newId) return;
        input.value = "";
        ui.adding = false;
        if (!local.isOpen(newId)) local.toggle(newId);
        redraw();
      }, fail);
    }
  });

  document.addEventListener("input", ev => {
    const form = ev.target.closest("form[data-form='say']");
    if (form) local.setDraft(form.dataset.id, ev.target.value);
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && ev.target.form) { ev.preventDefault(); ev.target.form.requestSubmit(); }
    if (ev.key === "Escape" && ev.target.form) {
      const f = ev.target.form;
      if (f.dataset.form === "rename") act.cancelRename(f.dataset.id);
      if (f.dataset.form === "add") act.cancelAdd();
    }
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

applyStatic(guess);
if (window.claude && claude.use) start();
else renderAbsent(T("outside"));
