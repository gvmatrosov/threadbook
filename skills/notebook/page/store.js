// The page's data in the artifact's db:
//   items/<item>         one card each {title, text, order, length?, squeeze?, summary?, hidden?, by?}
//                        the session seeds title/text/order and writes summary; the page adds items
//                        (by:"owner") and owns length, squeeze marks, renames and hiding
//   messages/<id>        owner lines {from:"owner", item, text, via, mode, length, at, kind?, resentAt?}
//                        kind "squeeze" = the «сжать лист» request, item "sheet"
//   messages/re-<id>     Claude's one answer to line <id> {from:"claude", replyTo, item, text, typing?, seenAt, at}
//   live/state           written by the session only {title, hotUntil}
//   threads/<item>       the comment thread the cold wire writes into for that card {threadId}
//   settings/mode        flash | economy, seeded by the session, switched by the person on the page
//   settings/title       the person's own name for the sheet {title}; beats live/state.title

export function createStore(db) {
  const messages = db.collection("messages"), items = db.collection("items");
  return {
    newId: () => messages.doc().id,
    addOwner: ({ id, ...row }) => messages.doc(id).set({ from: "owner", ...row }),
    markResent: (id, at) => messages.doc(id).update({ resentAt: at }),
    watchMessages: (next, error) =>
      messages.orderBy("at").onSnapshot(s => next(s.docs.map(d => ({ id: d.id, ...d.data() }))), error),
    watchItems: (next, error) =>
      items.orderBy("order").onSnapshot(s => next(s.docs.map(d => ({ id: d.id, ...d.data() }))), error),
    newItemId: () => items.doc().id,
    addItem: (id, title, order) => items.doc(id).set({ title, text: "", order, by: "owner" }),
    patchItem: (id, patch) => items.doc(id).update(patch),
    watchState: (next, error) => db.doc("live/state").onSnapshot(s => next(s.exists ? s.data() : {}), error),
    watchMode: (next, error) => db.doc("settings/mode").onSnapshot(s => next(s.exists ? s.data().mode : null), error),
    saveMode: mode => db.doc("settings/mode").set({ mode }),
    watchTitle: (next, error) => db.doc("settings/title").onSnapshot(s => next(s.exists ? s.data().title : ""), error),
    saveTitle: title => db.doc("settings/title").set({ title }),
    getThreads: async () => {
      const s = await db.collection("threads").get();
      return Object.fromEntries(s.docs.map(d => [d.id, d.data().threadId]));
    },
    saveThread: (item, threadId) => db.doc("threads/" + item).set({ threadId }),
  };
}
