// A stand-in for claude.ai's page runtime, injected into a headless browser by tools/test-dom.js:
// window.claude.use("db") is an in-memory database with the calls the page makes, and
// use("comments") records what would have been sent to Claude. window.__fake lets the test seed
// rows and write as the session would.
window.__fakeInstall = function () {
  const docs = new Map(); // "coll/id" → data
  const listeners = new Set();
  const sent = [];
  let seq = 0;
  const fire = () => queueMicrotask(() => { for (const l of listeners) l(); });
  const snapDoc = key => ({ id: key.split("/").pop(), exists: docs.has(key), data: () => docs.get(key) && { ...docs.get(key) } });
  const inColl = coll => [...docs.keys()].filter(k => k.slice(0, k.lastIndexOf("/")) === coll);
  const docRef = key => ({
    id: key.split("/").pop(),
    set: async data => { docs.set(key, { ...data }); fire(); },
    update: async patch => { if (!docs.has(key)) throw { code: "not_found" }; docs.set(key, { ...docs.get(key), ...patch }); fire(); },
    get: async () => snapDoc(key),
    onSnapshot: (next) => { const l = () => next(snapDoc(key)); listeners.add(l); l(); return () => listeners.delete(l); },
  });
  const query = (coll, field) => ({
    get: async () => ({ docs: inColl(coll).map(snapDoc) }),
    onSnapshot: (next) => {
      const l = () => {
        const list = inColl(coll).map(snapDoc);
        if (field) list.sort((a, b) => (a.data()[field] ?? 0) - (b.data()[field] ?? 0));
        next({ docs: list });
      };
      listeners.add(l); l(); return () => listeners.delete(l);
    },
  });
  const db = {
    collection: coll => ({
      doc: id => docRef(coll + "/" + (id || "auto" + ++seq)),
      orderBy: field => query(coll, field),
      get: query(coll).get,
    }),
    doc: key => docRef(key),
  };
  const comments = {
    anchorFor: async el => ({ path: el ? (el.dataset.item || el.id) : "none" }),
    sendToClaude: async target => { sent.push(target); return { threadId: target.threadId || "T" + sent.length, commentId: "C" + sent.length }; },
    canSendToClaude: async () => "available",
  };
  window.claude = { use: async name => (name === "db" ? db : name === "comments" ? comments : null) };
  window.__fake = {
    set: (key, data) => { docs.set(key, data); fire(); },
    get: key => docs.get(key) && { ...docs.get(key) },
    all: coll => inColl(coll).map(k => ({ id: k.split("/").pop(), ...docs.get(k) })),
    sent: () => sent.slice(),
  };
};
