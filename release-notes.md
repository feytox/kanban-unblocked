First release of Kanban: Unblocked, a fork of Obsidian Kanban 2.0.51.

- Blocking relations between cards, with cycle protection, dimmed blocked cards and arrows on hover or drag
- Draw a relation by dragging the handle on a card's edge onto another card
- Lists can be marked so their cards don't block others
- Import of global settings from the original Kanban plugin
- Optional "Blocked by / Blocks" list on cards, toggled from the header or the pane menu
- Effective deadlines: a blocker shows the earliest deadline of the cards it blocks
- Time-blocking with `@>{date}` or `@>{date time}` and a "Hide until..." menu item
- Fixed: duplicated cards and lanes no longer share block ids
- Fixed: removing dates or other metadata from a board file outside Kanban is now picked up
- Fixed: turning on "Mark cards in this list as complete" now completes the cards already in the list; the toggle is also in the list's menu
- Fixed: moving a card into a complete list with the Tasks plugin enabled no longer drops its block id
