// The page's data in the artifact's db:
//   items/<item>         one card each, written by the session {title, text, order}; text = its opening
//   messages/<id>        owner lines {from:"owner", item, text, via, mode, at, resentAt?}
//   messages/re-<id>     Claude's one answer to line <id> {from:"claude", replyTo, item, text, typing?, seenAt, at}
//   live/state           written by the session only {title, hotUntil}
//   threads/<item>       the comment thread the cold wire writes into for that card {threadId}
//   settings/mode        flash | econom, seeded by the session, switched by the person on the page

export function createStore(db) {
  const messages = db.collection("messages");
  return {
    newId: () => messages.doc().id,
    addOwner: (id, item, text, via, mode, at) => messages.doc(id).set({ from: "owner", item, text, via, mode, at }),
    markResent: (id, at) => messages.doc(id).update({ resentAt: at }),
    watchMessages: (next, error) =>
      messages.orderBy("at").onSnapshot(s => next(s.docs.map(d => ({ id: d.id, ...d.data() }))), error),
    watchItems: (next, error) =>
      db.collection("items").orderBy("order").onSnapshot(s => next(s.docs.map(d => ({ id: d.id, ...d.data() }))), error),
    watchState: (next, error) => db.doc("live/state").onSnapshot(s => next(s.exists ? s.data() : {}), error),
    watchMode: (next, error) => db.doc("settings/mode").onSnapshot(s => next(s.exists ? s.data().mode : null), error),
    saveMode: mode => db.doc("settings/mode").set({ mode }),
    getThreads: async () => {
      const s = await db.collection("threads").get();
      return Object.fromEntries(s.docs.map(d => [d.id, d.data().threadId]));
    },
    saveThread: (item, threadId) => db.doc("threads/" + item).set({ threadId }),
  };
}
