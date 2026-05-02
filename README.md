# SillyTavern Bookmarks Extension

A standalone bookmark management system for SillyTavern that allows users to save and quickly navigate to specific messages in chat conversations.

## Features

- 📍 **Quick Navigation**: Save important messages and jump back to them instantly
- 🔖 **Smart Management**: Create, edit, and delete bookmarks with an intuitive popup interface
- 🎯 **Load Status Indicators**: Visual indicators show if messages are loaded (🟢), need loading (🟡), or require heavy loading (🔴)
- 💾 **Chat Metadata Storage**: Bookmarks are stored in chat metadata (no lorebook required)
- ⚡ **Async Loading**: Large chat navigation uses chunked loading to prevent UI freezing
- 🎨 **Visual Highlighting**: Bookmarked messages are highlighted when navigated to
- 🔄 **Auto-Sorting**: Bookmarks are automatically sorted by message number
- 🚀 **Standalone**: No dependencies on other extensions or lorebooks

## Installation

1. Click on "Install extension" 

2. Paste the URL `https://github.com/aikohanasaki/SillyTavern-Bookmarks` in and click install

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
- Or use: `/bookmarkgo <title_or_message_number>`

### Advanced Features

**Load Status Indicators:**
- 🟢 Green: Message is already loaded (instant navigation)
- 🟡 Yellow: Message needs loading (slight wait time)
- 🔴 Red: Heavy loading required (500+ messages to load)

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
