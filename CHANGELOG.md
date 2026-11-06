# Changelog

## 2.3.0 - 2026-11-06

### Added
- Bookmark tags: up to 10 per bookmark, coloured chips on every row, a tag bar with counts, a colour picker, `#tag` search terms (`-#tag` to exclude), click or shift-click a chip to filter, and trailing `#tags` in `/bookmarkset`.

## 2.2.0 - 2026-11-06

### Changed
- This character and All scopes list bookmarks flat under one non-collapsible header per chat (open chat first, then the open owner's other chats, then other owners). Every bookmark is visible without expanding.

## 2.1.0 - 2026-11-06

### Added
- Search query syntax in the popup: space = AND (`&&`), leading `-`/`!` = NOT, uppercase `OR`/`||` = alternatives, `"exact phrase"`. A hint under the search box shows it.

## 2.0.0 - 2026-11-04

First release of the zBookmarks fork (split from STMB / aikohanasaki/SillyTavern-Bookmarks 1.1.0).

### Added
- Cross-chat bookmark browser with scopes **This chat**, **This character** and **All** (last scope is remembered).
- Search by bookmark title, chat name or character/group name.
- Grouping by character/group and chat; the open chat is shown first and expanded.
- Jump to a bookmark in another chat, character or group; blocked with a toast while saving or generating.
- Global bookmark index in the extension settings (stable owner identity by avatar file / group id), with "not found" handling and removal of stale entries.
- Bookmark button in the per-message actions.

### Changed
- Renamed to zBookmarks; new author, homepage and install URL. License unchanged (AGPL-3.0).
- Bookmarks of other chats are navigate-only; create, edit and delete apply to the open chat.

### Notes
- Bookmarks created before this version appear in **All** only after their chat has been opened once.
