# Kanban: Unblocked

An opinionated, unofficial fork of the [Obsidian Kanban plugin](https://github.com/mgmeyers/obsidian-kanban) by mgmeyers, which is no longer maintained.

Boards stay plain Markdown and remain compatible with the original plugin. On top of it, this fork helps answer one question: **what can I actually work on right now?**

## What's new

- **Blocking relations.** Right-click a card and pick _Add blocker..._ or _Blocks..._. One card can block several cards, and several cards can block one. _Remove relation..._ deletes a link.
  - Blocked cards are dimmed and get a small lock icon. A card stops being blocked once all its blockers are done, cancelled or archived.
  - Hover a card (or start dragging it) to see arrows to every card it depends on or that depends on it, directly or through other cards.
  - The header button (or the pane menu on mobile) shows or hides the _Blocked by / Blocks_ list on each card. The setting is saved per board.
  - Cycles can't happen. If you link two cards the other way round, the relation just flips. A link that would close a longer cycle is refused, and a notice shows the cycle.
- **Effective deadlines.** A card that blocks something due earlier than itself shows _Needed by &lt;date&gt;_. The card's own date isn't changed.
- **Time-blocking.** Add `@>{2026-10-01}` or `@>{2026-10-01 18:00}` to a card, or right-click it and pick _Hide until..._. The card stays dimmed until that moment and becomes normal on its own, no reload needed. This suits recurring tasks that wait in a "reload" list. _Show now_ removes the token. The trigger can be changed in the settings.
- Existing boards keep working as before. Relations and hide-until tokens are the only additions to the file format.

### How relations are stored

Each linked card gets a regular Obsidian block id (`^k3f9a1`) at the end of its first line. The links themselves go in a small block at the end of the board file, next to the settings block:

````md
%% kanban:relations
```
{"blocked-by":{"k3f9a1":["p0x7qd"]}}
```
%%
````

## Installation

> Disable the original **Kanban** plugin first. Both plugins open the same board files, so they can't run at the same time.

### With BRAT (recommended; desktop and mobile, with auto-updates)

1. Install **BRAT** from _Settings → Community plugins → Browse_ and enable it.
2. Run the command _BRAT: Add a beta plugin for testing_ and enter `feytox/obsidian-kanban`.
3. Enable **Kanban: Unblocked** in _Settings → Community plugins_.

Repeat on each device. If you sync your `.obsidian` folder between devices, installing it once is enough.

### Manually

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/feytox/obsidian-kanban/releases/latest). Put them in `<vault>/.obsidian/plugins/kanban-unblocked/`, then enable the plugin.

## Development

```sh
npm install
npm run dev      # watch build
npm test         # unit tests
npm run build    # production build
```

To publish a release, run `npm version <x.y.z> --no-git-tag-version && npm run bump`, commit, then push a tag that matches the version. GitHub Actions attaches the build to the release.

## License

GPL-3.0, same as the original plugin.
