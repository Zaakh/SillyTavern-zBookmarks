# Changelog

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
