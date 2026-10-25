// The page's data in the artifact's db:
//   messages/<id>        owner lines {from:"owner", item, text, via, at, resentAt?}
//   messages/re-<id>     Claude's one answer to line <id> {from:"claude", replyTo, text, typing?, seenAt, at}
//   live/state           written by the session only {title, itemTitle, hotUntil}
//   threads/<item>       the comment thread the cold wire writes into {threadId}

export const ITEM = "item1";

export function createStore(db) {
  const messages = db.collection("messages");
  return {
    newId: () => messages.doc().id,
    addOwner: (id, text, via, at) => messages.doc(id).set({ from: "owner", item: ITEM, text, via, at }),
    markResent: (id, at) => messages.doc(id).update({ resentAt: at }),
    watchMessages: (next, error) =>
      messages.orderBy("at").onSnapshot(s => next(s.docs.map(d => ({ id: d.id, ...d.data() }))), error),
    watchState: (next, error) => db.doc("live/state").onSnapshot(s => next(s.exists ? s.data() : {}), error),
    getThread: async () => {
      const t = await db.doc("threads/" + ITEM).get();
      return t.exists ? t.data().threadId : null;
    },
    saveThread: threadId => db.doc("threads/" + ITEM).set({ threadId }),
  };
}
