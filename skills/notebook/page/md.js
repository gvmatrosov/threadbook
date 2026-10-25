// Claude's answers come in Markdown. A small part of it is drawn — code blocks, headings, lists,
// **bold**, `code` — and only through DOM nodes, never innerHTML: an answer cannot become markup.
const node = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    const t = m[0];
    out.push(t.startsWith("**") ? node("b", "", t.slice(2, -2)) : node("code", "", t.slice(1, -1)));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

export function md(src) {
  const box = node("div", "md");
  String(src).split(/^```[^\n]*\n?/m).forEach((part, i) => {
    if (i % 2 === 1) { const pre = node("pre"); pre.append(node("code", "", part.replace(/\n$/, ""))); box.append(pre); return; }
    let para = [], list = null;
    const flush = () => {
      if (para.length) { const p = node("p"); p.append(...inline(para.join("\n"))); box.append(p); }
      para = [];
    };
    for (const line of part.split("\n")) {
      const h = line.match(/^#{1,6}\s+(.*)$/);
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (h) { flush(); list = null; const p = node("p", "h"); p.append(...inline(h[1])); box.append(p); }
      else if (li) {
        flush();
        if (!list) {
          const n = line.match(/^\s*(\d+)/);
          list = node(n ? "ol" : "ul");
          if (n) list.start = Number(n[1]);
          box.append(list);
        }
        const item = node("li"); item.append(...inline(li[1])); list.append(item);
      } else if (!line.trim()) { flush(); list = null; }
      else { list = null; para.push(line); }
    }
    flush();
  });
  return box;
}
