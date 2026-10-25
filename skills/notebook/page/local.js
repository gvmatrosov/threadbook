// Per-viewer conveniences kept in this browser only: which cards are open, half-typed lines, and
// which answers were already seen (the red dot on a closed card). Storage can be missing or throw
// (private window, blocked site data) — then the page works the same, it just forgets on reload.
const KEY = "tetrad.local.v1";

export function createLocal(storage, now) {
  let data = null;
  try { data = JSON.parse(storage.getItem(KEY) || "null"); } catch (e) { data = null; }
  // First visit: everything already in the notebook counts as seen.
  if (!data || typeof data !== "object") data = { open: [], drafts: {}, seen: {}, since: now() };
  data.open = Array.isArray(data.open) ? data.open : [];
  data.drafts = data.drafts || {};
  data.seen = data.seen || {};
  const save = () => { try { storage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* forget on reload */ } };
  save();

  return {
    isOpen: id => data.open.includes(id),
    toggle(id) {
      data.open = data.open.includes(id) ? data.open.filter(x => x !== id) : [...data.open, id];
      save();
      return data.open.includes(id);
    },
    draft: id => data.drafts[id] || "",
    setDraft(id, text) {
      if (text) data.drafts[id] = text; else delete data.drafts[id];
      save();
    },
    // A card shows the dot while it is closed and holds an answer newer than the last look at it.
    unread: card => !data.open.includes(card.id) && card.lastAnswerAt > (data.seen[card.id] || data.since),
    markSeen(card) {
      if (card.lastAnswerAt > (data.seen[card.id] || 0)) { data.seen[card.id] = card.lastAnswerAt; save(); }
    },
  };
}
