# Threadbook

Keep talking to your live Claude Code session from your phone — in a notebook page with one thread
per point. Break your session into points, walk away from the terminal, and answer point by point
from any device; the same session, with its full memory, replies right under each one.

<img src="assets/phone.png" alt="A Threadbook page on a phone: numbered items, each with its own thread and answer field" width="320">

## Install

In Claude Code:

```
/plugin install threadbook --marketplace gvmatrosov/threadbook
```

or add the catalog once and install from it:

```
/plugin marketplace add gvmatrosov/tashi-solo
/plugin install threadbook@tashi-solo
```

It needs Claude Code signed in to a claude.ai account with Artifacts available. The page is a
private claude.ai Artifact: it works opened at claude.ai (phone browser included), not elsewhere.

## Use

After a long answer, say **"put this in a notebook"** (or «разложи в тетрадь»), or run
`/threadbook:notebook`. Claude splits the material into items — one per point or question —
publishes the page and hands you the link. Open it anywhere and write under any item.

- **Each item is its own thread** with its own answer field. Items fold to a numbered list; a red
  dot marks a new answer, ✎ an unsent draft, a spinner a line still on its way.
- **Answer length per item**: short, to the point, or detailed.
- **Summarize**: mark items and press "summarize the sheet" — Claude writes two to five lines of
  conclusions into each, and the thread folds under them.
- **Add, rename, delete** items; rename the sheet. Drafts survive a reload.
- Claude's answers render Markdown. The page speaks English or Russian, following the language
  you talk to Claude in.

## How a line reaches the session

The session in your terminal must stay running — it is the one answering.

- **flash** (the default): right after each answer the conversation is "hot" for about 2.5
  minutes and a small background agent on Haiku watches the page. A line written then is picked
  up in ~10–20 s. Once it cools, a line wakes the session through a claude.ai comment (~30–45 s).
- **economy**: comment wake-ups only — every line ~30–45 s, nothing extra spent.

Switch on the page at any time. If a line gets no reaction in 30 s, the page offers one tap to
wake the session again.

**What it costs:** every answered line is a turn of your main session and uses your plan like
any message. The Haiku watcher in flash adds about 1% on top (measured: a fraction of a cent per
line). claude.ai allows 60 comment wake-ups per page per hour; hot lines spend none.

## Limits, honestly

- **Discussion only.** A line from the page is something to answer, never a command to run: the
  session does not edit files, run anything that changes state, or send anything outward because
  the page asked. It says what it would do; you confirm in the terminal.
- **Summarize does not shrink the session's memory** — only `/compact` in the terminal does.
- One page = one session. Drafts are kept in the browser they were typed in.
- If the comment watch ends after hours of silence, the page says "session not listening"; tell
  the session "notebook, wake up" in the terminal.

## What it touches

Nothing on your machine but Claude's own tools. The page and its data (items, lines, answers)
live in that private Artifact on claude.ai; the page talks to nothing else. No telemetry.

## Development

Plain ES modules, no build step. Guards:

- `node tools/test-page.js` — the delivery logic against a fake db, comments and clock;
  `--porcha` breaks the code line by line and requires every break to turn a check red;
- `node tools/test-dom.js [--shots <dir>]` — the page in headless Chromium (needs Playwright).

## License

MIT
