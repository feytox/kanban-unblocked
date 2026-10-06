# AGENTS.md

Kanban: Unblocked is an Obsidian plugin (id `kanban-unblocked`) that renders Markdown files as Kanban boards. It's a fork of the unmaintained `mgmeyers/obsidian-kanban`. On top of the original it adds blocking relations between cards, effective deadlines and time-blocking. Board files stay compatible with the original plugin.

## Commands

```sh
npm install        # installs deps; package.json `overrides` avoid git-hosted transitive deps
npm run dev        # esbuild watch build -> main.js + styles.css in the repo root
npm run build      # production build
npm test           # vitest, pure modules only (src/**/*.test.ts)
npm run typecheck  # tsc --noemit over all of src
npm run lint       # eslint over all of src
npm run prettier   # format src
```

Before committing, run `npm run typecheck && npm run lint && npm test && npm run build`. All four must pass.

To try a build, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/kanban-unblocked/`, then reload the plugin. Disable the original Kanban plugin in that vault first.

## Architecture

- `src/main.ts`: plugin entry. Registers the `kanban` view, commands, and one `StateManager` per open board file.
- `src/StateManager.ts`: owns the board state (`Board`), settings resolution (global → board → defaults), saving, and the per-board `RelationStore`.
- `src/parsers/`: Markdown ↔ `Board`.
  - `parseMarkdown.ts` handles frontmatter, the settings footer and the micromark extensions (dates `@{}`, times `@@{}`, hide-until `@>{}`, block ids `^id`, tags, wikilinks).
  - `formats/list.ts` turns the AST into lanes and items and serializes back (`boardToMd`).
  - `List.ts` re-parses changed files by diffing against the current state (`helpers/patch.ts`). Keys that only exist in memory must be listed in `generatedKeys` there.
- `src/relations/`: all relation and availability logic.
  - Pure and unit-tested (these files must not import `obsidian` or Preact): `types.ts`, `graph.ts` (immutable add/flip/cycle-check/prune), `serialize.ts` (the `%% kanban:relations` block), `RelationIndex.ts` (adjacency, connected graph, effective deadlines), `availability.ts` (pluggable "can I do this now?" rules), `insights.ts` (per-card derived data).
  - Integration with the app: `RelationStore.ts` (recomputes insights once per board change, notifies only the cards that changed, schedules a timer for the next unlock), `cardAdapter.ts`, `actions.ts`, `menu.ts`, `CardSuggestModal.ts`.
- `src/progress/`: checklist progress of linked notes. `checklist.ts` is pure and tested (parses a note once, then counts any section; `%% kanban:progress %%` marks a heading). `ChecklistStore.ts` is one plugin-wide cache: reads notes with `cachedRead`, refreshes them from `metadataCache` `changed`, and notifies only the cards that show a changed note (`useChecklist`).
- `src/helpers/cardText.ts`: pure split of a card line into text and metadata tokens, used by _New note from card_.
- `src/components/`: Preact UI. `Kanban.tsx` is the board root, `Item/` holds cards, `Relations/` holds the arrow overlay, relation chips, the inherited deadline and the hidden-until chip.
- `src/dnd/`: custom drag and drop. `dragManager.emitter` emits `dragStart`, `dragMove` and `dragEnd`.
- `src/Settings.ts`: the `KanbanSettings` type, `settingKeyLookup` (keys allowed in board frontmatter/footer) and the settings UI. Add every new setting to all three places, plus defaults in `StateManager.compileSettings`.
- `src/lang/locale/`: UI strings. Add new keys to `en.ts` (the source of truth) and `ru.ts`. Other locales fall back to English.

### Relations storage

Cards that take part in a relation get a native Obsidian block id (`^abc123`) on their first line (`ItemData.blockId`, kept out of `titleRaw`). Relations live in `BoardData.relations` and are written as JSON in a `%% kanban:relations` block right before the settings footer, only when non-empty. Ids of deleted cards are pruned on save. Duplicated or moved cards must not keep a block id that already exists on the target board: see `withoutBlockId`, `ensureUniqueBlockIds` and `generateUniqueBlockId`.

### Adding a new "unavailable" reason

Add an `AvailabilityRule` to `availabilityRules` in `src/relations/availability.ts`, add the reason to `UnavailableReason`, and style `.is-<reason>` in `src/components/Relations/relations.less`. Cards get `is-unavailable` and `is-<reason>` classes automatically.

## Conventions

- TypeScript with Preact (`preact/compat` is aliased as `react`). Immutable state updates with `immutability-helper` (`update`).
- CSS classes go through `c('name')`, which gives `kanban-plugin__name`. Styles are Less in `src/styles.less` and imported partials.
- Use only Obsidian CSS variables (`--text-muted`, `--interactive-accent`, `--background-modifier-*`, `--size-*`) so every theme works in light and dark mode. Don't hard-code colors.
- Performance: don't subscribe every card to board-wide state. Use `useCardInsight` for per-card derived data. Draw hover and drag visuals imperatively (see `RelationOverlay.tsx`) instead of re-rendering the board.
- Keep new pure logic in `src/relations/` (or a similar pure module) with tests next to it.
- Formatting: Prettier (single quotes, 100 cols, sorted imports). Match the surrounding code's style and comment density.
- Don't edit the vendored `src/components/Editor/flatpickr/plugins`. It's excluded from typecheck and lint.

## Commits and releases

- Commit messages: short, imperative, English, with no body (e.g. `Add time-blocking`).
- Releases: bump with `npm version <x.y.z> --no-git-tag-version && npm run bump`, commit, then tag `<x.y.z>` (no `v` prefix; it must equal `manifest.json` version). Pushing the tag runs `.github/workflows/release.yml`, which builds and attaches `main.js`, `manifest.json` and `styles.css`. Users install through BRAT from these releases.
