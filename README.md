# SillyTavern zBookmarks

A standalone bookmark management system for SillyTavern that allows users to save and quickly navigate to specific messages in chat conversations.

> **Fork notice:** zBookmarks is a fork of [aikohanasaki/SillyTavern-Bookmarks](https://github.com/aikohanasaki/SillyTavern-Bookmarks) (itself split from STMB). Upstream credit goes to aikohanasaki; the license is unchanged (AGPL-3.0). This fork adds a few adjustments, such as a bookmark button in the per-message actions, and more are planned. It can diverge from upstream, so check this README rather than the upstream one.

## Features

- 📍 **Quick Navigation**: Save important messages and jump back to them instantly
- 🔖 **Smart Management**: Create, edit, and delete bookmarks with an intuitive popup interface
- 🎯 **Load Status Indicators**: Visual indicators show if messages are loaded (🟢), need loading (🟡), or require heavy loading (🔴)
- 💾 **Chat Metadata Storage**: Bookmarks are stored in chat metadata (no lorebook required)
- ⚡ **Async Loading**: Large chat navigation uses chunked loading to prevent UI freezing
- 🎨 **Visual Highlighting**: Bookmarked messages are highlighted when navigated to
- 🌐 **Cross-Chat Browser**: Browse the bookmarks of this chat, this character or all chats, search them, and jump to a bookmark in another chat or character
- 🔄 **Auto-Sorting**: Bookmarks are automatically sorted by message number
- 🚀 **Standalone**: No dependencies on other extensions or lorebooks

## Installation

1. Click on "Install extension" 

2. Paste the URL `https://github.com/Zaakh/SillyTavern-zBookmarks` in and click install

3. Restart SillyTavern

4. The 🔖 Bookmarks button will appear in the Extensions menu (the magic wand 🪄 next to the input area)

## Usage

### Basic Operations

**Open Bookmarks Manager:**
- Click the 🔖 Bookmarks button in the Extensions menu
- Or use the slash command: `/bookmarklist`

**Create a Bookmark:**
- Click "Create New Bookmark" in the bookmarks popup
- Enter the message number and a descriptive title
- Or use: `/bookmarkset <message_number> <title>`
- Alternatively, click the bookmark icon to create a new bookmark for that message.
**Navigate to a Bookmark:**
- Click on any bookmark in the list to jump to that message
- Bookmarks of other chats open that character/group and chat first (the popup closes and the chat is opened)
- Or use: `/bookmarkgo <title_or_message_number>`

### Advanced Features

**Load Status Indicators:**
- 🟢 Green: Message is already loaded (instant navigation)
- 🟡 Yellow: Message needs loading (slight wait time)
- 🔴 Red: Heavy loading required (500+ messages to load)

**Scopes and Search:**
- Switch between **This chat** (default), **This character** and **All**; the last choice is remembered
- **This character** lists that character's own chats (a group is its own owner, not part of its members' characters)
- In **This character** and **All**, bookmarks are grouped by character/group, then chat. The open chat is shown first and expanded, others start collapsed with their counts
- The search box filters by bookmark title, chat name or character/group name (case-insensitive substring)
- Search syntax: `dragon fight` (both words, or `dragon && fight`), `dragon -boss` (or `!boss`) excludes, `dragon OR treaty` (or `||`) means either (OR binds looser than AND: `a b OR c` = `(a AND b) OR c`), `"final fight"` is an exact phrase. Only uppercase `OR` is an operator; lowercase `or` is a normal word. No parentheses.
- Bookmarks of other chats are navigate-only (switch icon, no edit/delete); create, edit and delete always apply to the open chat
- Switching chats is refused with a toast while a chat is saving or a generation is running
- If a chat, character or group no longer exists, you get a "not found" message and can remove its entry from the index

**Smart Navigation:**
- For large chats (1000+ messages), the extension uses chunked loading
- Progress indicators show loading status
- UI remains responsive during navigation

**Sorting:**
- Toggle between ascending/descending order with the sort button
- Bookmarks are automatically sorted by message number when created

**Import from STMB:**
- Use `/bookmark-import [{"messageNum":5,"title":"Title"}]` to migrate bookmarks
- Copy the JSON array from your old system and paste it as the command argument

## Slash Commands

- `/bookmarkset <message_number> <title>` - Create a new bookmark
- `/bookmarklist` - Open the bookmarks management popup
- `/bookmarkgo <title_or_message_number>` - Navigate to a bookmark
- `/bookmark-import <json_array>` - Import bookmarks from JSON format

## Storage

A global index of all bookmarks (title and message number per chat) is kept in the extension settings so other chats can be listed without loading them. The chat metadata stays the source of truth. A chat is indexed when it is opened or its bookmarks change, so bookmarks created earlier appear in **All** only after you open their chat once.

Bookmarks are stored directly in each chat's metadata:
- No lorebook required
- Bookmarks are saved per-chat automatically
- Survives chat exports/imports
- Works in both character and group chats
- Maximum 75 bookmarks per chat

## Technical Details

- **Maximum Bookmarks**: 75 per chat
- **Large Chat Threshold**: 1000 messages
- **Chunk Size**: 30 messages per load cycle
- **Storage**: Chat metadata

## Troubleshooting

**Bookmarks not saving:**
- Ensure you have write permissions to SillyTavern directory
- Check browser console for errors

**Bookmark not found:**
- Check if the message still exists (may have been deleted)
- Refresh the bookmarks list with the 🔄 button

**Slow navigation:**
- This is normal for bookmarks pointing far back in large chats
- Consider using "Show More Messages" to pre-load content
- The extension will show progress during heavy loading operations

## Version History

- **v2.0.0**: Standalone release
  - Removed lorebook dependency
  - Added chat metadata storage
  - Added bookmark import functionality
  - Vanilla JavaScript (no jQuery)
  - Complete independence from STMB

- **v1.0.0**: Initial STMB-based release
  - Full bookmark CRUD operations
  - Async navigation with progress indicators
  - Visual highlighting and sorting
  - Slash command support
