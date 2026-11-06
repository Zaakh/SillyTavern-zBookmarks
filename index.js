import { chat, chat_metadata, eventSource, event_types, showMoreMessages } from '../../../../script.js';
import { saveMetadataDebounced } from '../../../extensions.js';
import { Popup, POPUP_TYPE } from '../../../popup.js';
import { DOMPurify, Handlebars } from '../../../../lib.js';
import { executeSlashCommands } from '../../../slash-commands.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';

import {
    getIndexedChats, getOpenChatId, getOpenOwner, getScope, jumpToChatBookmark, refreshIndexEntry, setScope,
} from './bookmark-index.js';
import { matches, parseQuery } from './bookmark-search.js';

const MAX_BOOKMARKS = 75;
const LARGE_CHAT_THRESHOLD = 1000;
const CHUNK_SIZE = 30;
const CHUNK_DELAY = 10;

let currentBookmarkPopup = null;
let sortAscending = true;
let searchText = '';

const MESSAGE_BOOKMARK_BUTTON_CLASS = 'st-message-bookmark-create';

const bookmarksTemplate = Handlebars.compile(`
    <h3>🔖 Bookmarks ({{count}}/{{maxBookmarks}})</h3>
    <div class="popup-content">⚠️ Caution: going back more than 500 messages usually results in a long wait time as the chat messages need to be loaded into memory and the page has to be redrawn. Please be patient if you need to go back that far! Consider scrolling to the top of the chat and helping the extension along by clicking "Show More Messages" to load them manually. Once loaded, the chat will be responsive.</div>

    <div class="flex-container marginTop5" style="justify-content: center;">
        <button id="stmb-sort-toggle" class="menu_button menu_button_icon inline-flex interactable">
            {{#if sortAscending}}<i class="fa-solid fa-sort-asc"></i> Sort bookmarks in ascending order{{else}}<i class="fa-solid fa-sort-desc"></i> Sort bookmarks in descending order{{/if}}
        </button>
    </div>

    <div class="flex-container marginTop5" style="justify-content: center;">
        {{#each scopes}}<button class="menu_button interactable stmb-scope{{#if active}} stmb-scope-active{{/if}}" data-scope="{{id}}">{{label}}</button>{{/each}}
    </div>
    <input id="stmb-search" class="text_pole marginTop5" type="search" placeholder="Search title, chat or character/group" value="{{search}}">
    <small class="stmb-search-hint">Search: space = AND, <code>-word</code> = NOT, <code>a OR b</code>, <code>"exact phrase"</code></small>

    <div class="popup-content marginBot10"><small>Status indicators: 🟢 = Loaded (fast), 🟡 = Loading required (slight wait), 🔴 = Heavy loading (long wait). <i class="fa-solid fa-right-left"></i> = bookmark in another chat (opens that chat).</small></div>

    {{#if emptyText}}
        <div class="info-block warning"><span>{{emptyText}}</span></div>
    {{else}}
        <div class="flex-container flexFlowColumn spaceBetween">{{{list}}}</div>
    {{/if}}
    <div class="flex-container marginTop5" style="justify-content: center;">
        <button id="stmb-create-bookmark" class="menu_button menu_button_icon inline-flex interactable"><i class="fa-solid fa-plus"></i>  Create New Bookmark</button>
    </div>
`);

// Rows of the open chat keep indicator/edit/delete; rows of other chats are navigate-only.
const rowTemplate = Handlebars.compile(`
    <div class="bookmark-item flex-container alignItemsCenter padding8 marginTopBot5 stmb-box stmb-row" data-search="{{search}}" data-message-num="{{messageNum}}" data-title="{{title}}">
        <div title="{{tooltip}}" class="bookmark-content flex1 cursor-pointer marginTopBot5" data-message="{{messageNum}}"{{#unless isOpen}} data-owner="{{ownerKey}}" data-chat="{{chatId}}"{{/unless}}>
            {{#if isOpen}}{{indicator}}{{else}}<i class="fa-solid fa-right-left"></i>{{/if}} #{{messageNum}} - {{title}}
        </div>
        {{#if isOpen}}
        <div class="flex-container">
            <button class="menu_button fa-solid fa-edit interactable edit-bookmark" data-index="{{index}}" title="Edit bookmark"></button>
            <button class="menu_button fa-solid fa-trash interactable red_button delete-bookmark" data-index="{{index}}" title="Delete bookmark"></button>
        </div>
        {{/if}}
    </div>
`);

// One chat: a non-collapsible header (title truncates, count stays visible) followed by its rows.
const chatTemplate = Handlebars.compile(`
    <div class="stmb-chat" style="--stmb-rows: {{count}}">
        <div class="stmb-chat-header" role="heading" aria-level="4"><span class="stmb-chat-title" title="{{title}}">{{title}}</span> <small>({{count}})</small></div>
        {{{body}}}
    </div>
`);

async function navigateToBookmarkAsync(messageNum) {
    const firstDisplayedMesId = $('#chat').children('.mes').first().attr('mesid');
    const firstDisplayedMessageId = Number(firstDisplayedMesId) || chat.length;

    if (messageNum >= firstDisplayedMessageId) {
        scrollToMessage(messageNum);
        return;
    }

    const messagesToLoad = firstDisplayedMessageId - messageNum;

    if (chat.length > LARGE_CHAT_THRESHOLD && messagesToLoad > CHUNK_SIZE) {
        await loadMessagesInChunks(messagesToLoad, messageNum);
    } else {
        await showMoreMessages(messagesToLoad);
        await new Promise(resolve => setTimeout(resolve, 100));
        scrollToMessage(messageNum);
    }
}

async function loadMessagesInChunks(totalToLoad, targetMessageNum) {
    let loaded = 0;
    let progressToast = null;

    try {
        progressToast = toastr.info(`Loading messages... 0/${totalToLoad}`, 'Bookmarks', {
            timeOut: 0,
            preventDuplicates: true,
            progressBar: true
        });

        while (loaded < totalToLoad) {
            const chunkSize = Math.min(CHUNK_SIZE, totalToLoad - loaded);

            await showMoreMessages(chunkSize);
            loaded += chunkSize;

            if (progressToast && progressToast.length > 0) {
                progressToast.find('.toast-message').text(`Loading messages... ${loaded}/${totalToLoad}`);

                const progress = (loaded / totalToLoad) * 100;
                progressToast.find('.toast-progress').css('width', `${progress}%`);
            }

            if (loaded < totalToLoad) {
                await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
            }
        }

        if (progressToast && progressToast.length > 0) {
            progressToast.find('.toast-message').text(`Scrolling to message ${targetMessageNum}...`);
            progressToast.find('.toast-progress').css('width', '100%');
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        scrollToMessage(targetMessageNum);

        await new Promise(resolve => setTimeout(resolve, 1000));

        if (progressToast) {
            toastr.clear(progressToast);
        }

        toastr.success(`Jumped to message ${targetMessageNum}`, 'Bookmarks');

    } catch (error) {
        if (progressToast) {
            toastr.clear(progressToast);
        }
        toastr.error(`Failed to navigate to bookmark: ${error.message}`, 'Bookmarks');
    }
}

function scrollToMessage(messageNum) {
    const chatContainer = document.getElementById('chat');
    const messageElement = document.querySelector(`#chat .mes[mesid="${messageNum}"]`);

    if (messageElement && chatContainer) {
        const containerRect = chatContainer.getBoundingClientRect();
        const elementRect = messageElement.getBoundingClientRect();
        const scrollPosition = elementRect.top - containerRect.top + chatContainer.scrollTop;

        chatContainer.scrollTo({
            top: scrollPosition,
            behavior: 'smooth',
        });

        $(messageElement).addClass('bookmark-highlight');
        setTimeout(() => {
            $(messageElement).removeClass('bookmark-highlight');
        }, 2000);

    } else {
        toastr.warning(`Could not scroll to message ${messageNum}. It may not be rendered yet.`, 'Bookmarks');
    }
}

async function loadBookmarks() {
    try {
        const bookmarks = chat_metadata?.bookmarks || [];
        return { success: true, bookmarks: Array.isArray(bookmarks) ? bookmarks : [] };
    } catch (error) {
        return { success: false, error: error.message, bookmarks: [] };
    }
}

async function saveBookmarks(bookmarks) {
    try {
        chat_metadata.bookmarks = bookmarks;
        saveMetadataDebounced();
        refreshIndexEntry();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function createBookmark(messageNum, title) {
    try {
        if (typeof messageNum !== 'number' || messageNum < 0) {
            return { success: false, error: 'Invalid message number' };
        }

        if (!title || typeof title !== 'string' || !title.trim()) {
            return { success: false, error: 'Title is required' };
        }

        if (messageNum >= chat.length) {
            return { success: false, error: 'Message number does not exist' };
        }

        if (chat.length === 0) {
            return { success: false, error: 'No messages available to bookmark' };
        }

        const loadResult = await loadBookmarks();
        if (!loadResult.success) {
            return { success: false, error: loadResult.error };
        }

        const bookmarks = loadResult.bookmarks;

        if (bookmarks.length >= MAX_BOOKMARKS) {
            return { success: false, error: `Maximum ${MAX_BOOKMARKS} bookmarks reached. Please delete some bookmarks first.` };
        }

        const newBookmark = {
            messageNum: messageNum,
            title: title.trim()
        };

        bookmarks.push(newBookmark);

        bookmarks.sort((a, b) => a.messageNum - b.messageNum);

        const saveResult = await saveBookmarks(bookmarks);
        if (!saveResult.success) {
            return { success: false, error: saveResult.error };
        }

        return { success: true, bookmark: newBookmark };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

function addBookmarkMessageActions(messageId = null) {
    const selector = messageId === null
        ? '#chat .mes'
        : `#chat .mes[mesid="${messageId}"]`;

    document.querySelectorAll(selector).forEach((messageElement) => {
        const extraMesButtons = messageElement.querySelector('.extraMesButtons');
        if (!extraMesButtons || extraMesButtons.querySelector(`.${MESSAGE_BOOKMARK_BUTTON_CLASS}`)) {
            return;
        }

        const bookmarkButton = document.createElement('div');
        bookmarkButton.className = `mes_button ${MESSAGE_BOOKMARK_BUTTON_CLASS} fa-solid fa-book-bookmark`;
        bookmarkButton.title = 'Create bookmark';
        bookmarkButton.dataset.i18n = '[title]Create bookmark';
        extraMesButtons.prepend(bookmarkButton);
    });
}

function getDefaultBookmarkTitle(messageNum) {
    const message = chat[messageNum];
    const rawText = message?.mes || '';
    const plainText = $('<div></div>').html(rawText).text().replace(/\s+/g, ' ').trim();

    return plainText ? plainText.slice(0, 60) : `Message ${messageNum}`;
}

async function handleCreateBookmarkForMessage(messageNum) {
    if (isNaN(messageNum) || messageNum < 0) {
        toastr.error('Invalid message number', 'Bookmarks');
        return;
    }

    const title = prompt('Enter bookmark title:', getDefaultBookmarkTitle(messageNum));
    if (title === null) {
        return;
    }

    if (!title.trim()) {
        toastr.error('Title is required', 'Bookmarks');
        return;
    }

    const result = await createBookmark(messageNum, title.trim());
    if (result.success) {
        refreshBookmarkPopup();
        toastr.success('Bookmark created', 'Bookmarks');
    } else {
        toastr.error(result.error, 'Bookmarks');
    }
}

async function updateBookmark(originalMessageNum, originalTitle, newMessageNum, newTitle) {
    try {
        const loadResult = await loadBookmarks();
        if (!loadResult.success) {
            return { success: false, error: loadResult.error };
        }

        const bookmarks = loadResult.bookmarks;

        const bookmarkIndex = bookmarks.findIndex(b =>
            b.messageNum === originalMessageNum && b.title === originalTitle
        );

        if (bookmarkIndex === -1) {
            return { success: false, error: 'Bookmark not found' };
        }

        if (typeof newMessageNum !== 'number' || newMessageNum < 0) {
            return { success: false, error: 'Invalid message number' };
        }

        if (!newTitle || typeof newTitle !== 'string' || !newTitle.trim()) {
            return { success: false, error: 'Title is required' };
        }

        if (newMessageNum >= chat.length) {
            return { success: false, error: 'Message number does not exist' };
        }

        bookmarks[bookmarkIndex] = {
            messageNum: newMessageNum,
            title: newTitle.trim()
        };

        bookmarks.sort((a, b) => a.messageNum - b.messageNum);

        const saveResult = await saveBookmarks(bookmarks);
        if (!saveResult.success) {
            return { success: false, error: saveResult.error };
        }

        return { success: true };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function deleteBookmark(messageNum, title) {
    try {
        const loadResult = await loadBookmarks();
        if (!loadResult.success) {
            return { success: false, error: loadResult.error };
        }

        const bookmarks = loadResult.bookmarks;

        const bookmarkIndex = bookmarks.findIndex(b =>
            b.messageNum === messageNum && b.title === title
        );

        if (bookmarkIndex === -1) {
            return { success: false, error: 'Bookmark not found' };
        }

        bookmarks.splice(bookmarkIndex, 1);

        const saveResult = await saveBookmarks(bookmarks);
        if (!saveResult.success) {
            return { success: false, error: saveResult.error };
        }

        return { success: true };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

function calculateLoadStatus(messageNum) {
    const firstDisplayedMesId = $('#chat').children('.mes').first().attr('mesid');
    const firstDisplayedMessageId = Number(firstDisplayedMesId) || chat.length;

    if (messageNum >= firstDisplayedMessageId) {
        return {
            indicator: '🟢',
            status: 'loaded',
            tooltip: 'Message is loaded - instant navigation'
        };
    }

    const messagesToLoad = firstDisplayedMessageId - messageNum;

    if (messagesToLoad >= 500) {
        return {
            indicator: '🔴',
            status: 'heavy',
            tooltip: `Requires loading ${messagesToLoad} messages - will be slow`
        };
    }

    return {
        indicator: '🟡',
        status: 'loading',
        tooltip: `Requires loading ${messagesToLoad} messages - may take a moment`
    };
}

const SCOPES = [
    { id: 'chat', label: 'This chat' },
    { id: 'character', label: 'This character' },
    { id: 'all', label: 'All' },
];

/** Builds the popup HTML for the current scope. The open chat always comes from live metadata, other chats from the index. */
function renderPopupContent() {
    const scope = getScope();
    const owner = getOpenOwner();
    const openChatId = getOpenChatId();
    const live = chat_metadata?.bookmarks ?? [];
    sortBookmarks(live, sortAscending); // in place: edit/delete indexes refer to this order

    const liveRows = () => live.map((b, index) => {
        const status = calculateLoadStatus(b.messageNum);
        return rowTemplate({ ...b, isOpen: true, index, indicator: status.indicator, tooltip: status.tooltip,
            search: `${b.title} ${openChatId} ${owner?.name}`.toLowerCase() });
    }).join('');

    const data = { count: live.length, maxBookmarks: MAX_BOOKMARKS, sortAscending, search: searchText,
        scopes: SCOPES.map(sc => ({ ...sc, active: sc.id === scope })) };

    if (scope === 'chat') {
        data.list = liveRows();
        data.emptyText = live.length ? '' : 'No bookmarks found. Create your first bookmark to get started!';
        return bookmarksTemplate(data);
    }

    // other chats from the index, the open chat (pinned first) from live metadata
    let chats = getIndexedChats().filter(c => !(owner && c.ownerKey === owner.key && c.chatId === openChatId));
    if (scope === 'character') {
        chats = owner ? chats.filter(c => c.ownerKey === owner.key) : [];
    }
    if (owner && live.length) chats.unshift({ ownerKey: owner.key, ownerName: owner.name, chatId: openChatId, bookmarks: live, isLive: true });

    const chatBlock = (c) => {
        const rows = c.isLive ? liveRows() : [...c.bookmarks]
            .sort((a, b) => sortAscending ? a.messageNum - b.messageNum : b.messageNum - a.messageNum)
            .map(b => rowTemplate({ ...b, isOpen: false, ownerKey: c.ownerKey, chatId: c.chatId, tooltip: 'Opens this chat',
                search: `${b.title} ${c.chatId} ${c.ownerName}`.toLowerCase() })).join('');
        return chatTemplate({ title: scope === 'all' ? `${c.ownerName} › ${c.chatId}` : c.chatId, count: c.bookmarks.length, body: rows });
    };

    if (scope === 'character') {
        data.list = chats.map(chatBlock).join('');
        data.emptyText = !owner ? 'No character or group is open.'
            : chats.length ? '' : 'No bookmarks found for this character or group yet.';
    } else {
        // order only: open owner first (even when the open chat is empty), each owner's chats adjacent, open chat leading its owner
        const byOwner = new Map();
        chats.forEach(c => byOwner.set(c.ownerKey, [...(byOwner.get(c.ownerKey) ?? []), c]));
        const ordered = [...byOwner].sort(([a], [b]) => (b === owner?.key) - (a === owner?.key)).flatMap(([, list]) => list);
        data.list = ordered.map(chatBlock).join('');
        data.emptyText = chats.length ? '' : 'No bookmarks indexed yet. Open a chat once to index its bookmarks.';
    }
    return bookmarksTemplate(data);
}

/** Applies the search text to the rendered rows and hides chat blocks without a visible row. */
function applySearch() {
    const dlg = currentBookmarkPopup?.dlg;
    if (!dlg) return;
    const query = parseQuery(searchText); // operator-only text such as "OR" has no terms, so everything matches
    dlg.querySelectorAll('.stmb-row').forEach(r => { r.hidden = !matches(query, r.dataset.search); });
    dlg.querySelectorAll('.stmb-chat').forEach(c => { c.hidden = !c.querySelector('.stmb-row:not([hidden])'); });
}

async function showBookmarksPopup() {
    try {
        const customButtons = [
            {
                text: '🔄 Refresh',
                result: null,
                classes: ['menu_button'],
                action: () => {
                    refreshBookmarkPopup();
                }
            }
        ];

        const popupOptions = {
            wide: true,
            large: true,
            allowVerticalScrolling: true,
            customButtons: customButtons,
            okButton: 'Close',
            onClose: handleBookmarkPopupClose
        };

        currentBookmarkPopup = new Popup(DOMPurify.sanitize(renderPopupContent()), POPUP_TYPE.TEXT, '🔖 Bookmarks', popupOptions);
        setupBookmarkEventListeners();
        applySearch();
        const shown = currentBookmarkPopup.show();
        if (matchMedia('(pointer: fine)').matches) currentBookmarkPopup.dlg.querySelector('#stmb-search')?.focus();
        await shown;

    } catch (error) {
        toastr.error(`Failed to show bookmarks: ${error.message}`, 'Bookmarks');
    }
}

function sortBookmarks(bookmarks, ascending = true) {
    bookmarks.sort((a, b) => {
        return ascending ? a.messageNum - b.messageNum : b.messageNum - a.messageNum;
    });
}

function setupBookmarkEventListeners() {
    if (!currentBookmarkPopup) return;

    const popupElement = currentBookmarkPopup.dlg;

    popupElement.addEventListener('click', (e) => {
        if (e.target.matches('#stmb-sort-toggle')) {
            e.preventDefault();
            sortAscending = !sortAscending;
            refreshBookmarkPopup();
            return;
        }

        if (e.target.matches('#stmb-create-bookmark') || e.target.closest('#stmb-create-bookmark')) {
            e.preventDefault();
            handleCreateBookmark();
            return;
        }

        if (e.target.classList.contains('edit-bookmark')) {
            e.stopPropagation();
            const index = parseInt(e.target.dataset.index);
            handleEditBookmark(index);
            return;
        }

        if (e.target.classList.contains('delete-bookmark')) {
            e.stopPropagation();
            const index = parseInt(e.target.dataset.index);
            handleDeleteBookmark(index);
            return;
        }

        const scopeButton = e.target.closest('.stmb-scope');
        if (scopeButton) {
            setScope(scopeButton.dataset.scope);
            refreshBookmarkPopup();
            return;
        }

        const bookmarkContent = e.target.closest('.bookmark-content');
        if (bookmarkContent) {
            const messageNum = parseInt(bookmarkContent.dataset.message);
            const { owner, chat: chatId } = bookmarkContent.dataset;
            if (owner) handleGoToOtherChatBookmark(owner, chatId, messageNum);
            else handleGoToBookmark(messageNum);
        }
    });

    popupElement.addEventListener('input', (e) => {
        if (e.target.matches('#stmb-search')) {
            searchText = e.target.value;
            applySearch();
        }
    });
}

async function refreshBookmarkPopup() {
    if (!currentBookmarkPopup || !currentBookmarkPopup.dlg.hasAttribute('open')) {
        return;
    }

    try {
        currentBookmarkPopup.content.innerHTML = DOMPurify.sanitize(renderPopupContent());
        applySearch();

        const requiredClasses = [
            'wide_dialogue_popup',
            'large_dialogue_popup',
            'vertical_scrolling_dialogue_popup'
        ];
        currentBookmarkPopup.dlg.classList.add(...requiredClasses);
        currentBookmarkPopup.content.style.overflowY = 'auto';

    } catch (error) {
        console.error('Bookmark refresh error:', error);
    }
}

function handleBookmarkPopupClose(popup) {
    currentBookmarkPopup = null;
    searchText = '';
}

async function handleCreateBookmark() {
    const loadResult = await loadBookmarks();
    if (!loadResult.success) {
        toastr.error(loadResult.error, 'Bookmarks');
        return;
    }

    if (loadResult.bookmarks.length >= MAX_BOOKMARKS) {
        toastr.error(`Maximum ${MAX_BOOKMARKS} bookmarks reached`, 'Bookmarks');
        return;
    }

    const messageNumStr = prompt('Enter message number:');
    if (!messageNumStr) return;

    const messageNum = parseInt(messageNumStr);
    if (isNaN(messageNum) || messageNum < 0) {
        toastr.error('Invalid message number', 'Bookmarks');
        return;
    }

    if (messageNum >= chat.length) {
        toastr.error('Message number does not exist', 'Bookmarks');
        return;
    }

    const title = prompt('Enter bookmark title:');
    if (!title || !title.trim()) {
        toastr.error('Title is required', 'Bookmarks');
        return;
    }

    const result = await createBookmark(messageNum, title.trim());
    if (result.success) {
        refreshBookmarkPopup();
        toastr.success('Bookmark created', 'Bookmarks');
    } else {
        toastr.error(result.error, 'Bookmarks');
    }
}

async function handleEditBookmark(index) {
    const loadResult = await loadBookmarks();
    if (!loadResult.success || !loadResult.bookmarks[index]) {
        toastr.error('Bookmark not found', 'Bookmarks');
        return;
    }

    const bookmark = loadResult.bookmarks[index];
    const newTitle = prompt('Enter new title:', bookmark.title);
    if (!newTitle || !newTitle.trim()) return;

    const newMessageNumStr = prompt('Enter new message number:', bookmark.messageNum.toString());
    const newMessageNum = parseInt(newMessageNumStr);

    if (isNaN(newMessageNum) || newMessageNum < 0) {
        toastr.error('Invalid message number', 'Bookmarks');
        return;
    }

    if (newMessageNum >= chat.length) {
        toastr.error('Message number does not exist', 'Bookmarks');
        return;
    }

    const result = await updateBookmark(bookmark.messageNum, bookmark.title, newMessageNum, newTitle.trim());
    if (result.success) {
        refreshBookmarkPopup();
        toastr.success('Bookmark updated', 'Bookmarks');
    } else {
        toastr.error(result.error, 'Bookmarks');
    }
}

async function handleDeleteBookmark(index) {
    const loadResult = await loadBookmarks();
    if (!loadResult.success || !loadResult.bookmarks[index]) {
        toastr.error('Bookmark not found', 'Bookmarks');
        return;
    }

    const bookmark = loadResult.bookmarks[index];
    if (confirm(`Delete bookmark "${bookmark.messageNum} - ${bookmark.title}"?`)) {
        const result = await deleteBookmark(bookmark.messageNum, bookmark.title);
        if (result.success) {
            refreshBookmarkPopup();
            toastr.success('Bookmark deleted', 'Bookmarks');
        } else {
            toastr.error(result.error, 'Bookmarks');
        }
    }
}

async function handleGoToBookmark(messageNum) {
    if (messageNum >= chat.length) {
        toastr.error(`Bookmark points to deleted message ${messageNum}`, 'Bookmarks');
    } else {
        if (currentBookmarkPopup) {
            currentBookmarkPopup.completeCancelled();
        }

        try {
            await navigateToBookmarkAsync(messageNum);
        } catch (error) {
            executeSlashCommands(`/chat-jump ${messageNum}`);
            toastr.info(`Jumped to message ${messageNum}`, 'Bookmarks');
        }
    }
}

function handleGoToOtherChatBookmark(ownerKey, chatId, messageNum) {
    return jumpToChatBookmark({ ownerKey, chatId, messageNum }, {
        onStart: () => currentBookmarkPopup?.completeCancelled(),
        navigate: navigateToBookmarkAsync,
    });
}

function handleBookmarkSetCommand(namedArgs, unnamedArgs) {
    const args = String(unnamedArgs || '').trim().split(/\s+/);

    if (args.length < 2) {
        toastr.error('Usage: /bookmarkset <message_number> <title>', 'Bookmarks');
        return '';
    }

    const messageNum = parseInt(args[0]);
    if (isNaN(messageNum) || messageNum < 0) {
        toastr.error('Invalid message number', 'Bookmarks');
        return '';
    }

    if (messageNum >= chat.length) {
        toastr.error('Message number does not exist', 'Bookmarks');
        return '';
    }

    if (chat.length === 0) {
        toastr.error('No messages available to bookmark', 'Bookmarks');
        return '';
    }

    const title = args.slice(1).join(' ');
    if (!title) {
        toastr.error('Title is required', 'Bookmarks');
        return '';
    }

    createBookmark(messageNum, title).then(result => {
        if (result.success) {
            toastr.success(`Bookmark "${messageNum} - ${title}" created`, 'Bookmarks');
        } else {
            toastr.error(result.error, 'Bookmarks');
        }
    }).catch(error => {
        toastr.error(`Failed to create bookmark: ${error.message}`, 'Bookmarks');
    });

    return '';
}

function handleBookmarkListCommand(namedArgs, unnamedArgs) {
    showBookmarksPopup();
    return '';
}

async function handleBookmarkGoCommand(namedArgs, unnamedArgs) {
    const arg = String(unnamedArgs || '').trim();

    if (!arg) {
        toastr.error('Usage: /bookmarkgo <title_or_message_number>', 'Bookmarks');
        return '';
    }

    try {
        const loadResult = await loadBookmarks();
        if (!loadResult.success) {
            toastr.error(loadResult.error, 'Bookmarks');
            return '';
        }

        const bookmarks = loadResult.bookmarks;
        if (bookmarks.length === 0) {
            toastr.error('No bookmarks found', 'Bookmarks');
            return '';
        }

        let targetBookmark = null;

        const messageNum = parseInt(arg);
        if (!isNaN(messageNum)) {
            targetBookmark = bookmarks.find(b => b.messageNum === messageNum);
        }

        if (!targetBookmark) {
            targetBookmark = bookmarks.find(b => b.title.toLowerCase().includes(arg.toLowerCase()));
        }

        if (!targetBookmark) {
            toastr.error(`Bookmark not found: ${arg}`, 'Bookmarks');
            return '';
        }

        if (targetBookmark.messageNum >= chat.length) {
            toastr.error(`Bookmark points to deleted message ${targetBookmark.messageNum}`, 'Bookmarks');
        } else {
            try {
                await navigateToBookmarkAsync(targetBookmark.messageNum);
                toastr.success(`Jumped to bookmark: ${targetBookmark.messageNum} - ${targetBookmark.title}`, 'Bookmarks');
            } catch (error) {
                executeSlashCommands(`/chat-jump ${targetBookmark.messageNum}`);
                toastr.info(`Jumped to bookmark: ${targetBookmark.messageNum} - ${targetBookmark.title}`, 'Bookmarks');
            }
        }

    } catch (error) {
        toastr.error(`Failed to go to bookmark: ${error.message}`, 'Bookmarks');
    }

    return '';
}

async function handleBookmarkImportCommand(namedArgs, unnamedArgs) {
    const jsonString = String(unnamedArgs || '').trim();

    if (!jsonString) {
        toastr.error('Usage: /bookmark-import [{"messageNum":5,"title":"Title"}]', 'Bookmarks');
        return '';
    }

    try {
        const importedBookmarks = JSON.parse(jsonString);

        if (!Array.isArray(importedBookmarks)) {
            toastr.error('Must be an array of bookmarks', 'Bookmarks');
            return '';
        }

        chat_metadata.bookmarks = importedBookmarks;
        saveMetadataDebounced();
        refreshIndexEntry();
        refreshBookmarkPopup();

        toastr.success(`Imported ${importedBookmarks.length} bookmarks`, 'Bookmarks');

    } catch (error) {
        toastr.error('Invalid JSON format', 'Bookmarks');
    }

    return '';
}

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'bookmarkset',
    callback: handleBookmarkSetCommand,
    helpString: 'Create a bookmark for a specific message',
    unnamedArgumentList: [
        SlashCommandArgument.fromProps({
            description: 'message number and title',
            typeList: [ARGUMENT_TYPE.STRING],
            isRequired: true,
        }),
    ],
}));

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'bookmarklist',
    callback: handleBookmarkListCommand,
    helpString: 'Show bookmarks management popup',
}));

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'bookmarkgo',
    callback: handleBookmarkGoCommand,
    helpString: 'Jump to a bookmark by title or message number',
    unnamedArgumentList: [
        SlashCommandArgument.fromProps({
            description: 'bookmark title or message number',
            typeList: [ARGUMENT_TYPE.STRING],
            isRequired: true,
        }),
    ],
}));

SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'bookmark-import',
    callback: handleBookmarkImportCommand,
    helpString: 'Import bookmarks from JSON array',
    unnamedArgumentList: [
        SlashCommandArgument.fromProps({
            description: 'JSON array of bookmarks',
            typeList: [ARGUMENT_TYPE.STRING],
            isRequired: true,
        }),
    ],
}));

// Add bookmark button to extensions menu
const menuItem = document.createElement('div');
menuItem.id = 'bookmarks-menu-item-container';
menuItem.className = 'extension_container interactable';
menuItem.tabIndex = 0;

menuItem.innerHTML = `
    <div id="bookmarks-menu-item" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
        <div class="fa-fw fa-solid fa-book-bookmark extensionsMenuExtensionButton"></div>
        <span>Bookmarks</span>
    </div>
`;

const extensionsMenu = document.getElementById('extensionsMenu');
if (extensionsMenu) {
    extensionsMenu.appendChild(menuItem);
}

// Add click handler
document.addEventListener('click', function(e) {
    const messageBookmarkButton = e.target.closest(`.${MESSAGE_BOOKMARK_BUTTON_CLASS}`);
    if (messageBookmarkButton) {
        e.preventDefault();
        e.stopPropagation();

        const messageElement = messageBookmarkButton.closest('.mes');
        const messageNum = parseInt(messageElement?.getAttribute('mesid'));
        handleCreateBookmarkForMessage(messageNum);
        return;
    }

    if (e.target.closest('#bookmarks-menu-item')) {
        showBookmarksPopup();
    }
});

eventSource.on(event_types.CHAT_CHANGED, () => {
    refreshIndexEntry();
    setTimeout(() => addBookmarkMessageActions(), 0);
});
eventSource.on(event_types.MORE_MESSAGES_LOADED, () => addBookmarkMessageActions());
eventSource.on(event_types.MESSAGE_UPDATED, (messageId) => addBookmarkMessageActions(messageId));
eventSource.makeLast(event_types.USER_MESSAGE_RENDERED, (messageId) => addBookmarkMessageActions(messageId));
eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => addBookmarkMessageActions(messageId));

addBookmarkMessageActions();

console.log('Bookmarks extension loaded');
