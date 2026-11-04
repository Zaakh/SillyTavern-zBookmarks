// Global bookmark index (extension_settings) and the cross-chat jump. The per-chat
// chat_metadata.bookmarks stays the source of truth; the index mirrors the open chat
// so other chats can be listed and opened without loading them.
import {
    characters, chat, chat_metadata, eventSource, event_types, getCurrentChatId, getPastCharacterChats,
    isChatSaving, is_send_press, openCharacterChat, saveSettingsDebounced, selectCharacterById, this_chid,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { groups, is_group_generating, openGroupById, openGroupChat, selected_group } from '../../../group-chats.js';

const JUMP_TIMEOUT_MS = 15000;
let jumping = false;

/** Settings namespace: { scope: 'chat'|'character'|'all', index: { [ownerKey]: { name, chats: { [chatId]: [{messageNum,title}] } } } } */
function store() {
    const s = (extension_settings.zBookmarks ??= {});
    s.scope ??= 'chat';
    s.index ??= {};
    return s;
}

export function getScope() {
    return store().scope;
}

export function setScope(scope) {
    store().scope = scope;
    saveSettingsDebounced();
}

/** The open character or group as { key, name }, or null on the welcome screen. Keyed by avatar/group id, never by list position. */
export function getOpenOwner() {
    if (selected_group) {
        const group = groups.find(g => g.id === selected_group);
        return group ? { key: `group:${group.id}`, name: group.name } : null;
    }
    const character = characters[this_chid];
    return character ? { key: `char:${character.avatar}`, name: character.name } : null;
}

export function getOpenChatId() {
    return getCurrentChatId() ?? null;
}

/** The live character or group for an owner key, or undefined when it no longer exists. */
function findOwner(key) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    return kind === 'group' ? groups.find(g => g.id === id) : characters.find(c => c.avatar === id);
}

/** Replaces the open chat's index entry with its current bookmarks; an empty list removes it. */
export function refreshIndexEntry() {
    const owner = getOpenOwner();
    const chatId = getOpenChatId();
    if (!owner || !chatId) return;

    const bookmarks = (chat_metadata?.bookmarks ?? []).map(({ messageNum, title }) => ({ messageNum, title }));
    const index = store().index;
    const before = JSON.stringify(index[owner.key]);

    if (bookmarks.length) {
        index[owner.key] ??= { name: owner.name, chats: {} };
        index[owner.key].name = owner.name;
        index[owner.key].chats[chatId] = bookmarks;
    } else {
        removeIndexEntry(owner.key, chatId, false);
    }

    if (JSON.stringify(index[owner.key]) !== before) saveSettingsDebounced();
}

/** Removes one chat's entry (and its owner when empty). Never touches chat files. */
export function removeIndexEntry(ownerKey, chatId, save = true) {
    const index = store().index;
    delete index[ownerKey]?.chats[chatId];
    if (index[ownerKey] && !Object.keys(index[ownerKey].chats).length) delete index[ownerKey];
    if (save) saveSettingsDebounced();
}

/** Indexed chats whose character/group still exists, as [{ ownerKey, ownerName, chatId, bookmarks }]. The name is the live one, so renames show without reopening chats. */
export function getIndexedChats() {
    return Object.entries(store().index)
        .flatMap(([ownerKey, { chats }]) => {
            const owner = findOwner(ownerKey);
            return owner ? Object.entries(chats).map(([chatId, bookmarks]) => ({ ownerKey, ownerName: owner.name, chatId, bookmarks })) : [];
        });
}

/** Resolves a target to what the open functions need, or null when owner or chat no longer exists. */
async function resolveTarget(ownerKey, chatId) {
    if (ownerKey.startsWith('group:')) {
        const group = groups.find(g => `group:${g.id}` === ownerKey);
        return group?.chats.includes(chatId) ? { group } : null;
    }
    const chid = characters.findIndex(c => `char:${c.avatar}` === ownerKey);
    if (chid === -1) return null;
    const files = await getPastCharacterChats(chid);
    return files.some(f => f.file_name.replace(/\.jsonl$/, '') === chatId) ? { chid } : null;
}

/** Waits for CHAT_CHANGED with the target open (owner + chat id; chat names are not unique across characters). */
function waitForChat(ownerKey, chatId) {
    let cleanup;
    const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for the chat to load')); }, JUMP_TIMEOUT_MS);
        const onChanged = () => {
            if (getOpenOwner()?.key === ownerKey && getOpenChatId() === chatId) { cleanup(); resolve(); }
        };
        cleanup = () => { clearTimeout(timer); eventSource.removeListener(event_types.CHAT_CHANGED, onChanged); };
        eventSource.on(event_types.CHAT_CHANGED, onChanged);
    });
    promise.catch(() => {}); // avoid an unhandled rejection when we bail out before awaiting
    return { promise, cancel: () => cleanup() };
}

/**
 * Opens the target chat (switching character/group only if needed) and then calls navigate(messageNum).
 * onStart runs once the jump is going to happen (used to close the popup).
 */
export async function jumpToChatBookmark({ ownerKey, chatId, messageNum }, { onStart, navigate }) {
    if (jumping) return;
    if (isChatSaving || is_send_press || is_group_generating) {
        toastr.warning('Cannot switch chats while a chat is saving or a generation is running.', 'Bookmarks');
        return;
    }

    jumping = true;
    let waiter;
    try {
        const alreadyOpen = getOpenOwner()?.key === ownerKey && getOpenChatId() === chatId;
        const target = alreadyOpen ? {} : await resolveTarget(ownerKey, chatId);
        if (!target) {
            if (confirm('This chat or its character/group was not found. Remove the bookmarks of this chat from the index?')) {
                removeIndexEntry(ownerKey, chatId);
                toastr.info('Index entry removed', 'Bookmarks');
            }
            return;
        }

        onStart?.();
        if (!alreadyOpen) {
            toastr.info('Opening chat…', 'Bookmarks');
            waiter = waitForChat(ownerKey, chatId); // registered before switching so a fast load cannot emit unheard
            if (getOpenOwner()?.key !== ownerKey) {
                if (target.group) {
                    if (!await openGroupById(target.group.id)) throw new Error('Could not open the group');
                } else {
                    await selectCharacterById(target.chid);
                }
            }
            if (getOpenOwner()?.key !== ownerKey) throw new Error('Could not switch character or group');
            if (getOpenChatId() !== chatId) {
                if (ownerKey.startsWith('group:')) await openGroupChat(selected_group, chatId);
                else await openCharacterChat(chatId);
            }
            await waiter.promise;
        }

        if (messageNum >= chat.length) {
            toastr.error(`Bookmark points to deleted message ${messageNum}`, 'Bookmarks');
            return;
        }
        await navigate(messageNum);
    } catch (error) {
        toastr.error(`Failed to open bookmark: ${error.message}`, 'Bookmarks');
    } finally {
        waiter?.cancel();
        jumping = false;
    }
}
