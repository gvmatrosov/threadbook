// What the person does to the cards themselves: answer length, squeeze marks, rename, hide, add, and
// the sheet's own name. Each is one db write; the page redraws from the snapshot that follows, so
// a refused write simply leaves the screen as it was. No DOM here — tools/test-page.js drives it.
import { LENGTHS } from "./wire.js";

export const MAX_TITLE = 200;
const clean = t => String(t || "").trim().replace(/\s+/g, " ");

export function createActions({ store, getItems }) {
  const exists = id => getItems().some(i => i.id === id && !i.hidden);
  return {
    async setLength(id, length) {
      if (!exists(id) || !LENGTHS.includes(length)) return false;
      await store.patchItem(id, { length });
      return true;
    },
    async markSqueeze(id, on) {
      if (!exists(id)) return false;
      await store.patchItem(id, { squeeze: on ? "marked" : "none" });
      return true;
    },
    async rename(id, title) {
      const t = clean(title);
      if (!exists(id) || !t || t.length > MAX_TITLE) return false;
      await store.patchItem(id, { title: t });
      return true;
    },
    // Hidden, not deleted: the lines stay in db and the session still knows what «пункт N» was.
    async hide(id) {
      if (!exists(id)) return false;
      await store.patchItem(id, { hidden: true });
      return true;
    },
    // A new card takes the next number, never a hidden card's: «пункт N» means one thing for good.
    async addItem(title) {
      const t = clean(title);
      if (!t || t.length > MAX_TITLE) return null;
      const order = getItems().reduce((m, i) => Math.max(m, Number(i.order) || 0), 0) + 1;
      const id = store.newItemId();
      await store.addItem(id, t, order);
      return id;
    },
    async renameSheet(title) {
      const t = clean(title);
      if (!t || t.length > MAX_TITLE) return false;
      await store.saveTitle(t);
      return true;
    },
  };
}
