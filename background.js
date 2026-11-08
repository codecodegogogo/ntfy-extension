// Background service worker for context menu integration
// Compatible with Chrome, Edge, and Firefox 142+

// Import shared utilities (only in Service Worker context)
if (typeof importScripts === 'function') {
    importScripts('ntfy.js', 'markdown.js', 'emojis.js');
}

// WebSocket & Background Sync State
// One socket per subscription server: server URL -> { ws, url, reconnectTimer, keepaliveTimer,
// reconnectDelay, lastActivity }
const sockets = new Map();
// Failed WebSocket attempts (before it opened), and whether the one-time read-access check after
// repeated failures has been done. Both reset when the socket opens or the subscription changes.
const wsFailures = new Map();
const authCheckedServers = new Set();
const MAX_RECONNECT_DELAY = 60000;
// Chrome stops an idle extension service worker after 30 s. Since Chrome 116, WebSocket traffic resets
// that timer, but ntfy only sends a keepalive every 45 s by default, so send a small frame of our own.
// ntfy reads and discards client frames of up to 64 bytes.
const WS_KEEPALIVE_INTERVAL = 20000;
// A socket can stay open after the connection died (e.g. after sleep or a network change) until TCP
// gives up, many minutes later. ntfy sends a keepalive event every 45 s by default, so a socket that
// has been silent much longer than that is replaced. Generous, for servers with a longer interval.
const WS_SILENCE_TIMEOUT = 3 * 60 * 1000;
const MAX_HISTORY_ITEMS = 50;
const MAX_SEEN_IDS_PER_TOPIC = 200;
// How long the read-access check of the topics is reused
const READABLE_TOPICS_TTL = 60 * 60 * 1000;
// Window fetched silently the first time a topic is synced
const INITIAL_SYNC_SINCE = '24h';
// ntfy limits the requests of each visitor (by default a burst of 60, then one every 5 s). After an
// HTTP 429, the background makes no requests for this long, so the limit can recover for sending
// and downloads instead of being used up again by reconnects and catch-up polls.
const RATE_LIMIT_PAUSE = 2 * 60 * 1000;
// Messages missed while offline: up to this many get their own desktop notification, more get one summary
const MAX_CATCH_UP_NOTIFICATIONS = 3;
const SUMMARY_NOTIFICATION_ID = 'ntfy-summary';
const ALARM_NAME = 'ws-keepalive';


const PARENT_MENU_ID = 'ntfy-parent';
const SEND_SELECTION_ID = 'ntfy-send-selection';
const SEND_IMAGE_ID = 'ntfy-send-image';
const SEND_LINK_ID = 'ntfy-send-link'; // Replaced SEND_PAGE_ID
const SEND_TAB_ID = 'ntfy-send-tab';

// Initialize context menu, WebSocket (which also sets up the alarm), and unread badge on install and startup
chrome.runtime.onInstalled.addListener(() => {
    // Replaced by the per-topic topicSyncState
    chrome.storage.local.remove('lastNotificationId');
    // The "Include current tab's URL" setting was removed
    chrome.storage.sync.remove('includeUrl');
    updateContextMenu();
    initWebSocket();
    updateUnreadBadge();
    listPreviousImageSites().then(removeUnusedImageSitePermissions);
});

chrome.runtime.onStartup.addListener(() => {
    clearPreviousSessionDrafts();
    updateContextMenu();
    initWebSocket();
    // The badge isn't kept over a browser restart; don't wait for the connection to show it again
    updateUnreadBadge();
    // Also when the browser was closed at the time of the daily alarm
    removeUnusedImageSitePermissions();
});

// Files attached in the popup are stored, with the unsent draft, until sent; a new browser session
// starts without them. Done here at startup rather than when the popup next opens, so they don't
// stay on disk until then. The popup checks the same flag, for a session the extension joined later.
async function clearPreviousSessionDrafts() {
    try {
        await chrome.storage.local.remove(['storedFiles', 'storedFile', 'draftState']);
        await chrome.storage.session.set({ sessionActive: true });
    } catch (error) {
        console.error('Failed to clear the previous session\'s attachments:', error.message);
    }
}

// Listen for storage changes to update context menu, WebSocket config, and unread badge
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.topics || changes.apiUrl || changes.sendServers
            || changes.accessToken || changes.sendEnabled) {
            updateContextMenu();
            scheduleWebSocketInit();
        }
        // Subscriptions only affect receiving
        if (changes.subscriptions || changes.receiveApiUrl || changes.receiveTopics) {
            scheduleWebSocketInit();
        }
        // Messages and sync state of a removed server or topic leave with it
        if (changes.topics || changes.apiUrl || changes.subscriptions || changes.receiveTopics) {
            NtfyAPI.getConfig().then(config => forgetRemovedTopics(config));
            updateUnreadBadge();
        }
        if (changes.receiveEnabled) {
            scheduleWebSocketInit();
            updateUnreadBadge();
        }
    }
    if (area === 'local') {
        if (changes.accessToken || changes.serverUsername || changes.serverPassword
            || changes.subscriptionCredentials || changes.sendServerCredentials) {
            scheduleWebSocketInit();
        }
        if (changes.receivedNotifications || changes.readMessageIds || changes.deletedMessageIds) {
            updateUnreadBadge();
        }
        if (changes.receivedNotifications || changes.notificationsMuted || changes.mutedTopics) {
            markMutedMessagesRead();
        }
    }
});

// One entry per server: its topics from all subscriptions, without duplicates
function receiveGroups(config) {
    const groups = new Map();
    (config.subscriptions || []).forEach(subscription => {
        if (!subscription.apiUrl || subscription.topics.length === 0) {
            return;
        }
        if (!groups.has(subscription.apiUrl)) {
            // The readable-topic check, the WebSocket URL and the catch-up poll all need the
            // credentials; getConfig resolved each subscription's own, or the shared ones.
            groups.set(subscription.apiUrl, {
                ...config,
                apiUrl: subscription.apiUrl,
                topics: [],
                accessToken: subscription.accessToken,
                username: subscription.username,
                password: subscription.password
            });
        }
        const group = groups.get(subscription.apiUrl);
        // One token per server: if the first subscription to it has none, take the next one's
        const groupHasCredentials = Boolean(group.accessToken || group.username || group.password);
        const subscriptionHasCredentials = Boolean(
            subscription.accessToken || subscription.username || subscription.password);
        if (!groupHasCredentials && subscriptionHasCredentials) {
            Object.assign(group, {
                accessToken: subscription.accessToken,
                username: subscription.username,
                password: subscription.password
            });
        }
        subscription.topics.forEach(topic => {
            if (!group.topics.includes(topic)) {
                group.topics.push(topic);
            }
        });
    });
    return [...groups.values()];
}

// One save in the settings changes storage.sync and storage.local (the credentials) one after the other,
// and typing the server or token saves repeatedly. Reconnect once, after the changes settle.
const CONFIG_CHANGE_DELAY = 1000;
let configChangeTimer = null;
function scheduleWebSocketInit() {
    clearTimeout(configChangeTimer);
    configChangeTimer = setTimeout(() => {
        configChangeTimer = null;
        initWebSocket();
    }, CONFIG_CHANGE_DELAY);
}

// Menu ids of a topic's items: the topic name rather than its position, so a click on a menu built
// from an older topic list can't send to another topic. The id is split at the first "|".
const TOPIC_SEPARATOR = '|';

// Rebuilds run one at a time: overlapping ones would create the same ids twice
let contextMenuUpdate = Promise.resolve();
function updateContextMenu() {
    contextMenuUpdate = contextMenuUpdate
        .then(buildContextMenu)
        .catch(error => console.error('Failed to update the context menu:', error));
    return contextMenuUpdate;
}

// All sending topics of servers with a URL, without duplicates. A topic on several servers is
// sent to the first one.
function sendTopics(config) {
    const topics = [];
    (config.sendServers || []).forEach(server => {
        if (!NtfyAPI.normalizeServerUrl(server.apiUrl)) return;
        server.topics.forEach(topic => {
            if (!topics.includes(topic)) {
                topics.push(topic);
            }
        });
    });
    return topics;
}

// The send server a topic belongs to; null when no server has both a URL and the topic
function sendServerForTopic(config, topic) {
    return (config.sendServers || []).find(server =>
        NtfyAPI.normalizeServerUrl(server.apiUrl) && server.topics.includes(topic)) || null;
}

// Build or rebuild the context menu based on current topics
async function buildContextMenu() {
    // Remove all existing menus first
    await chrome.contextMenus.removeAll();

    const config = await NtfyAPI.getConfig();
    const topics = sendTopics(config);

    if (!config.sendEnabled || topics.length === 0) {
        // Sending is off, or not configured: don't create menu
        return;
    }

    // Create a single parent menu dynamically from manifest name
    const manifest = chrome.runtime.getManifest();
    chrome.contextMenus.create({
        id: PARENT_MENU_ID,
        title: manifest.name,
        contexts: ['all']
    });

    if (topics.length === 1) {
        // Single topic: Text/Image/Link are direct clickable items under the parent
        const topic = topics[0];

        // 1. Page (Tab) - Always visible
        chrome.contextMenus.create({
            id: `${SEND_TAB_ID}${TOPIC_SEPARATOR}${topic}`,
            parentId: PARENT_MENU_ID,
            title: `页面（${topic}）`,
            contexts: ['all']
        });

        // 2. Text - Selection only
        chrome.contextMenus.create({
            id: `${SEND_SELECTION_ID}${TOPIC_SEPARATOR}${topic}`,
            parentId: PARENT_MENU_ID,
            title: `文本（${topic}）`,
            contexts: ['selection']
        });

        // 3. Image - Image only
        chrome.contextMenus.create({
            id: `${SEND_IMAGE_ID}${TOPIC_SEPARATOR}${topic}`,
            parentId: PARENT_MENU_ID,
            title: `图片（${topic}）`,
            contexts: ['image']
        });

        // 4. Link - Link only
        chrome.contextMenus.create({
            id: `${SEND_LINK_ID}${TOPIC_SEPARATOR}${topic}`,
            parentId: PARENT_MENU_ID,
            title: `链接（${topic}）`,
            contexts: ['link']
        });
    } else {
        // Multiple topics: Text/Image/Link are submenus containing topics

        // 1. Page (Tab) Submenu
        chrome.contextMenus.create({
            id: `${PARENT_MENU_ID}-tab`,
            parentId: PARENT_MENU_ID,
            title: '页面',
            contexts: ['all']
        });

        topics.forEach(topic => {
            chrome.contextMenus.create({
                id: `${SEND_TAB_ID}${TOPIC_SEPARATOR}${topic}`,
                parentId: `${PARENT_MENU_ID}-tab`,
                title: topic,
                contexts: ['all']
            });
        });

        // 2. Text Submenu
        chrome.contextMenus.create({
            id: `${PARENT_MENU_ID}-selection`,
            parentId: PARENT_MENU_ID,
            title: '文本',
            contexts: ['selection']
        });

        topics.forEach(topic => {
            chrome.contextMenus.create({
                id: `${SEND_SELECTION_ID}${TOPIC_SEPARATOR}${topic}`,
                parentId: `${PARENT_MENU_ID}-selection`,
                title: topic,
                contexts: ['selection']
            });
        });

        // 3. Image Submenu
        chrome.contextMenus.create({
            id: `${PARENT_MENU_ID}-image`,
            parentId: PARENT_MENU_ID,
            title: '图片',
            contexts: ['image']
        });

        topics.forEach(topic => {
            chrome.contextMenus.create({
                id: `${SEND_IMAGE_ID}${TOPIC_SEPARATOR}${topic}`,
                parentId: `${PARENT_MENU_ID}-image`,
                title: topic,
                contexts: ['image']
            });
        });

        // 4. Link Submenu
        chrome.contextMenus.create({
            id: `${PARENT_MENU_ID}-link`,
            parentId: PARENT_MENU_ID,
            title: '链接',
            contexts: ['link']
        });

        topics.forEach(topic => {
            chrome.contextMenus.create({
                id: `${SEND_LINK_ID}${TOPIC_SEPARATOR}${topic}`,
                parentId: `${PARENT_MENU_ID}-link`,
                title: topic,
                contexts: ['link']
            });
        });
    }
}

// Image sites the extension got a permission for to send an image, by the time of their last use
// (storage.local, as { origin pattern: ms }). A permission it got otherwise ("Allow access to this
// server") isn't listed and stays. Older versions kept every image site's permission: those found on
// updating are listed once, as used then (see listPreviousImageSites).
const IMAGE_SITES_KEY = 'imageSitePermissions';
const IMAGE_SITES_LISTED_KEY = 'imageSitePermissionsListed';
// Unused for this long, a listed site's permission is removed, so sending images doesn't leave a
// lasting permission for every site sent from
const IMAGE_SITE_MAX_UNUSED = 30 * 24 * 60 * 60 * 1000;
const IMAGE_SITE_ALARM = 'image-site-cleanup';

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const menuId = String(info.menuItemId);
    const separator = menuId.indexOf(TOPIC_SEPARATOR);
    const action = separator === -1 ? menuId : menuId.slice(0, separator);
    const topic = separator === -1 ? null : menuId.slice(separator + 1);

    // An image is fetched from its site, which needs a permission for that site
    const origin = action === SEND_IMAGE_ID && info.srcUrl ? NtfyAPI.serverOriginPattern(info.srcUrl) : null;
    if (origin) {
        try {
            // Request permission immediately while we have the user gesture: nothing may be awaited
            // before it. Whether the permission was there already is asked at the same time.
            const hadPermission = chrome.permissions.contains({ origins: [origin] }).catch(() => true);
            const granted = await new Promise(resolve => {
                chrome.permissions.request({ origins: [origin] }, resolve);
            });

            if (!granted) {
                console.error('Permission denied to access image origin');
                showBadge('✗', '#f44336');
                return;
            }
            await noteImageSiteUse(origin, !(await hadPermission));
        } catch (e) {
            console.error('Failed to request permission:', e);
            // Continue anyway, it might fail later in fetch but we tried
        }
    }

    await handleMenuAction(action, topic, info, tab);
});

// Lists a site whose permission was just granted, and renews the time of a listed one
function noteImageSiteUse(origin, newlyGranted) {
    return serialized(async () => {
        const { [IMAGE_SITES_KEY]: sites = {} } = await chrome.storage.local.get([IMAGE_SITES_KEY]);
        if (!newlyGranted && !(origin in sites)) {
            return; // The extension had the permission before
        }
        sites[origin] = Date.now();
        await chrome.storage.local.set({ [IMAGE_SITES_KEY]: sites });
        await updateImageSiteAlarm(sites);
    });
}

// Origins of the sending and subscription servers, which the extension needs for its own requests
async function serverOriginPatterns() {
    const config = await NtfyAPI.getConfig();
    return [
        ...(config.sendServers || []).map(server => server.apiUrl),
        ...config.subscriptions.map(subscription => subscription.apiUrl)
    ]
        .map(apiUrl => NtfyAPI.serverOriginPattern(apiUrl))
        .filter(Boolean);
}

// Once: lists the site permissions the extension has, which older versions left from sending images,
// so their 30 days start now. Not the server's site, which the extension needs for its own requests,
// nor a permission for all sites, which the user gave on purpose.
function listPreviousImageSites() {
    return serialized(async () => {
        const stored = await chrome.storage.local.get([IMAGE_SITES_KEY, IMAGE_SITES_LISTED_KEY]);
        if (stored[IMAGE_SITES_LISTED_KEY]) {
            return;
        }
        const { origins = [] } = await chrome.permissions.getAll();
        const serverOrigins = await serverOriginPatterns();
        const sites = stored[IMAGE_SITES_KEY] || {};
        origins
            .filter(origin => /^https?:\/\/[^*/]+\/\*$/.test(origin) && !serverOrigins.includes(origin) && !(origin in sites))
            .forEach(origin => {
                sites[origin] = Date.now();
            });
        await chrome.storage.local.set({ [IMAGE_SITES_KEY]: sites, [IMAGE_SITES_LISTED_KEY]: true });
        await updateImageSiteAlarm(sites);
    }).catch(error => console.error('Failed to list the image site permissions:', error.message));
}

// Removes the permissions of listed sites unused for IMAGE_SITE_MAX_UNUSED
function removeUnusedImageSitePermissions() {
    return serialized(async () => {
        const { [IMAGE_SITES_KEY]: sites = {} } = await chrome.storage.local.get([IMAGE_SITES_KEY]);
        const unused = Object.keys(sites).filter(origin => Date.now() - sites[origin] >= IMAGE_SITE_MAX_UNUSED);
        if (unused.length > 0) {
            // The servers' sites stay: the extension may need them for its own requests
            const serverOrigins = await serverOriginPatterns();
            for (const origin of unused) {
                if (!serverOrigins.includes(origin)) {
                    await chrome.permissions.remove({ origins: [origin] }).catch(error => {
                        console.error('Failed to remove the image site permission:', error.message);
                    });
                }
                delete sites[origin];
            }
            await chrome.storage.local.set({ [IMAGE_SITES_KEY]: sites });
        }
        await updateImageSiteAlarm(sites);
    }).catch(error => console.error('Failed to remove unused image site permissions:', error.message));
}

// A daily check while sites are listed; none listed, nothing wakes the extension for it
async function updateImageSiteAlarm(sites) {
    const listed = Object.keys(sites).length > 0;
    const alarm = await chrome.alarms.get(IMAGE_SITE_ALARM);
    if (listed && !alarm) {
        await chrome.alarms.create(IMAGE_SITE_ALARM, { periodInMinutes: 24 * 60 });
    } else if (!listed && alarm) {
        await chrome.alarms.clear(IMAGE_SITE_ALARM);
    }
}

async function handleMenuAction(action, topic, info, tab) {
    const config = await NtfyAPI.getConfig();
    const sendServer = sendServerForTopic(config, topic);

    if (!config.sendEnabled) {
        console.error('Sending is disabled');
        showBadge('✗', '#f44336');
        return;
    }

    // The topic must still be configured on a server with a URL
    if (!topic || !sendServer) {
        console.error('Could not determine topic');
        showBadge('✗', '#f44336');
        return;
    }

    try {
        if (action === SEND_SELECTION_ID) {
            // Send selected text
            await NtfyAPI.sendNotification(sendServer, topic, {
                message: info.selectionText
            });
            showBadge('✓', '#4CAF50');
        } else if (action === SEND_IMAGE_ID) {
            // Send image
            await NtfyAPI.sendImageFromUrl(sendServer, topic, info.srcUrl);
            showBadge('✓', '#4CAF50');
        } else if (action === SEND_LINK_ID) {
            // Send link URL
            const urlToSend = info.linkUrl;
            let linkText = '';

            // Try to get link text from the page
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (targetUrl) => {
                        // Find the link element that matches the URL
                        // We use .href because it returns the absolute URL, matching targetUrl
                        const links = document.querySelectorAll('a');
                        for (const link of links) {
                            if (link.href === targetUrl) {
                                return link.innerText || link.textContent || '';
                            }
                        }
                        return '';
                    },
                    args: [info.linkUrl]
                });

                if (results && results[0] && results[0].result) {
                    // One line: the text of a card-style link spans several (heading, teaser, ...)
                    linkText = results[0].result.replace(/\s+/g, ' ').trim();
                }
            } catch (e) {
                console.error('Failed to retrieve link text:', e);
            }

            // The link text is the title
            await NtfyAPI.sendNotification(sendServer, topic, {
                message: urlToSend,
                title: linkText
            });
            showBadge('✓', '#4CAF50');
        } else if (action === SEND_TAB_ID) {
            // Send current page (tab) URL
            await NtfyAPI.sendNotification(sendServer, topic, {
                message: tab.url,
                title: tab.title
            });
            showBadge('✓', '#4CAF50');
        }
    } catch (error) {
        console.error('Failed to send notification:', error);
        showBadge('✗', '#f44336');
    }
}

// Show a temporary badge on the extension icon (restores unread count after 2s)
function showBadge(text, color) {
    chrome.action.setBadgeText({ text: text });
    chrome.action.setBadgeBackgroundColor({ color: color });

    setTimeout(() => {
        updateUnreadBadge();
    }, 2000);
}

// ========================================
// WebSocket & Background Sync Logic
// ========================================

// Runs one at a time. A call while one runs makes it run again once done, with the configuration
// as it is then, so an older run finishing last can't connect with outdated settings.
let webSocketInit = null;
let webSocketInitAgain = false;
function initWebSocket() {
    if (webSocketInit) {
        webSocketInitAgain = true;
        return webSocketInit;
    }
    webSocketInit = (async () => {
        do {
            webSocketInitAgain = false;
            try {
                await refreshWebSocket();
            } catch (error) {
                console.error('Failed to set up the WebSocket:', error.message);
            }
        } while (webSocketInitAgain);
    })().finally(() => {
        webSocketInit = null;
    });
    return webSocketInit;
}

async function refreshWebSocket() {
    const config = await NtfyAPI.getConfig();
    const groups = receiveGroups(config);
    const configured = groups.length > 0;
    await updateAlarm(configured && config.receiveEnabled);
    if (!configured) {
        console.log('ntfy is not configured, skipping WebSocket connection.');
        closeWebSocket();
        return;
    }

    if (!config.receiveEnabled) {
        console.log('Receiving is disabled, skipping WebSocket connection.');
        closeWebSocket();
        // Turned back on, each topic starts again with a silent sync instead of notifying the
        // whole backlog of the time it was off
        await serialized(async () => {
            const { topicSyncState } = await chrome.storage.local.get(['topicSyncState']);
            if (topicSyncState) {
                await chrome.storage.local.remove('topicSyncState');
            }
        });
        return;
    }

    await migrateTopicSyncState(config);

    const activeServers = new Set();
    for (const group of groups) {
        // A paused server is skipped on its own; the others still connect and receive
        if (await waitForRateLimit(group.apiUrl)) {
            if (group.topics.length > 0) {
                activeServers.add(group.apiUrl);
            }
            continue;
        }
        const existing = sockets.get(group.apiUrl);
        const baseTopics = await subscriptionTopics(group);
        let expectedUrl = null;
        try {
            expectedUrl = buildWsUrl({ ...group, topics: baseTopics }).keyUrl;
        } catch (e) {}
        // A different server, topic list or token starts the failure count over
        if (existing && existing.url && expectedUrl && existing.url !== expectedUrl) {
            wsFailures.delete(group.apiUrl);
            authCheckedServers.delete(group.apiUrl);
        }

        // After repeated failures the subscription may contain a topic the credentials can't read,
        // which makes ntfy refuse the whole socket: ask /auth once, then reconnect without it
        const checkAccess = (wsFailures.get(group.apiUrl) || 0) >= 2
            && !authCheckedServers.has(group.apiUrl);
        if (checkAccess) {
            authCheckedServers.add(group.apiUrl);
        }
        const topics = checkAccess ? await getReadableTopics(group) : baseTopics;
        if (await waitForRateLimit(group.apiUrl)) {
            if (topics.length > 0) {
                activeServers.add(group.apiUrl);
            }
            continue;
        }
        if (topics.length === 0) {
            console.log(`No configured topic is readable on ${group.apiUrl}, skipping its WebSocket.`);
            continue;
        }
        const subscription = { ...group, topics, since: await wsSinceFor(group, topics) };
        activeServers.add(group.apiUrl);

        try {
            expectedUrl = buildWsUrl(subscription).keyUrl;
        } catch (e) {}
        if (existing && existing.ws
            && (existing.ws.readyState === WebSocket.OPEN || existing.ws.readyState === WebSocket.CONNECTING)) {
            if (existing.url === expectedUrl) {
                continue;
            }
            console.log(`Configuration changed, reconnecting WebSocket to ${group.apiUrl}...`);
        }
        connectWebSocket(subscription);
    }

    // Servers that are no longer subscribed
    for (const server of [...sockets.keys()]) {
        if (!activeServers.has(server)) {
            closeSocket(server);
        }
    }
}

// Older versions keyed the sync state by topic only. Move those keys to the server|topic form of
// the subscription that receives the topic, so a poll doesn't start over or mix servers.
async function migrateTopicSyncState(config) {
    await serialized(async () => {
        const { topicSyncState = {}, receivedNotifications = [] } =
            await chrome.storage.local.get(['topicSyncState', 'receivedNotifications']);
        const groups = receiveGroups(config);
        const update = {};

        let stateChanged = false;
        Object.keys(topicSyncState).forEach(key => {
            if (key.includes(TOPIC_SEPARATOR)) {
                return;
            }
            const group = groups.find(candidate => candidate.topics.includes(key));
            if (!group) {
                return;
            }
            const newKey = `${group.apiUrl}${TOPIC_SEPARATOR}${key}`;
            if (!topicSyncState[newKey]) {
                topicSyncState[newKey] = topicSyncState[key];
            }
            delete topicSyncState[key];
            stateChanged = true;
        });
        if (stateChanged) {
            update.topicSyncState = topicSyncState;
        }

        // Messages stored by older versions have no server; give them the one that receives the topic
        let historyChanged = false;
        const history = receivedNotifications.map(notification => {
            if (notification.server) {
                return notification;
            }
            const group = groups.find(candidate => candidate.topics.includes(notification.topic));
            if (!group) {
                return notification;
            }
            historyChanged = true;
            return { ...notification, server: group.apiUrl };
        });
        if (historyChanged) {
            update.receivedNotifications = history;
        }

        if (Object.keys(update).length > 0) {
            await chrome.storage.local.set(update);
        }
    });
}

// ntfy rejects a subscription to several topics if any one of them isn't readable, and a topic the
// token can only send to is a normal setup. So subscribe to, and poll, the readable topics only.
// The result is also kept in storage.session (memory only), so a restarted service worker doesn't ask again.
let readableTopicsCache = { key: null, topics: [], time: 0 };
async function getReadableTopics(config) {
    const key = await readableTopicsKey(config);
    if (readableTopicsCache.key !== key && chrome.storage.session) {
        try {
            const stored = (await chrome.storage.session.get(['readableTopicsCache'])).readableTopicsCache;
            if (stored) {
                readableTopicsCache = stored;
            }
        } catch (e) {}
    }
    if (readableTopicsCache.key === key && Date.now() - readableTopicsCache.time < READABLE_TOPICS_TTL) {
        return readableTopicsCache.topics;
    }

    let access;
    try {
        access = await Promise.all(config.topics.map(topic => NtfyAPI.canReadTopic(config, topic)));
    } catch (error) {
        if (error.status !== 429) {
            throw error;
        }
        await noteRateLimited(config.apiUrl, error.retryAfter);
        // Keep the last known result (even if outdated), or try all topics
        return readableTopicsCache.key === key ? readableTopicsCache.topics : config.topics;
    }
    // A topic the server couldn't be asked about (null) is kept, and the result isn't cached
    const topics = config.topics.filter((topic, i) => access[i] !== false);
    const skipped = config.topics.filter((topic, i) => access[i] === false);
    if (skipped.length > 0) {
        console.log(`Not receiving from topics without read access: ${skipped.join(', ')}`);
    }
    await recordReadAccess(config.apiUrl, skipped, key);
    if (!access.includes(null)) {
        readableTopicsCache = { key, topics, time: Date.now() };
        if (chrome.storage.session) {
            chrome.storage.session.set({ readableTopicsCache }).catch(() => {});
        }
    }
    return topics;
}

// Topics to subscribe to without asking /auth: a fresh check result if there is one, otherwise the
// configured topics minus the ones already known to be unreadable. The pre-check costs one request
// per topic, which a server with a small request limit can't afford on every connect; the
// one-time check after repeated WebSocket failures still catches a newly unreadable topic.
async function subscriptionTopics(group) {
    const key = await readableTopicsKey(group);
    if (readableTopicsCache.key === key && Date.now() - readableTopicsCache.time < READABLE_TOPICS_TTL) {
        return readableTopicsCache.topics;
    }
    const { readAccessDenied = {}, readAccessKeys = {} } =
        await chrome.storage.local.get(['readAccessDenied', 'readAccessKeys']);
    if (readAccessDenied[group.apiUrl] && readAccessKeys[group.apiUrl] !== key) {
        // Credentials or topics changed: the old denial no longer applies
        forgetStaleReadAccess(group.apiUrl, key);
        return group.topics;
    }
    const denied = new Set(readAccessDenied[group.apiUrl] || []);
    return group.topics.filter(topic => !denied.has(topic));
}

// The denied list is only trusted for the server/credentials/topics it was recorded for
async function forgetStaleReadAccess(server, key) {
    await serialized(async () => {
        const { readAccessDenied = {}, readAccessKeys = {} } =
            await chrome.storage.local.get(['readAccessDenied', 'readAccessKeys']);
        if (readAccessDenied[server] && readAccessKeys[server] !== key) {
            delete readAccessDenied[server];
            delete readAccessKeys[server];
            await chrome.storage.local.set({ readAccessDenied, readAccessKeys });
        }
    });
}

// Topics the server refused to the configured credentials (HTTP 401/403), per server, so the popup
// can say why nothing arrives instead of only showing an empty list. The key records which
// credentials and topics the list belongs to (see subscriptionTopics).
async function recordReadAccess(server, deniedTopics, key) {
    await serialized(async () => {
        const { readAccessDenied = {}, readAccessKeys = {} } =
            await chrome.storage.local.get(['readAccessDenied', 'readAccessKeys']);
        const previous = readAccessDenied[server];
        if (deniedTopics.length === 0) {
            if (!previous && !readAccessKeys[server]) return;
            delete readAccessDenied[server];
            delete readAccessKeys[server];
        } else {
            if (previous && readAccessKeys[server] === key
                && previous.length === deniedTopics.length
                && previous.every(topic => deniedTopics.includes(topic))) {
                return;
            }
            readAccessDenied[server] = deniedTopics;
            if (key) {
                readAccessKeys[server] = key;
            } else {
                delete readAccessKeys[server];
            }
        }
        await chrome.storage.local.set({ readAccessDenied, readAccessKeys });
    });
}

// The alarm reconnects and catches up while receiving. Without receiving there is nothing for it to
// do, so it is removed and doesn't wake the service worker every minute.
async function updateAlarm(receiving) {
    try {
        const alarm = await chrome.alarms.get(ALARM_NAME);
        if (receiving && !alarm) {
            await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
        } else if (!receiving && alarm) {
            await chrome.alarms.clear(ALARM_NAME);
        }
    } catch (error) {
        console.error('Failed to update the alarm:', error.message);
    }
}

// The access check depends on the server, credentials and topics. Hashed, so the cache in
// storage.session doesn't hold the credentials.
async function readableTopicsKey(config) {
    const data = new TextEncoder().encode(JSON.stringify([config.apiUrl, NtfyAPI.buildAuthHeaderValue(config), config.topics]));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function startKeepalive(server, socket) {
    stopKeepalive(server);
    const entry = sockets.get(server);
    if (!entry) return;
    entry.keepaliveTimer = setInterval(() => {
        const current = sockets.get(server);
        if (!current || current.ws !== socket || socket.readyState !== WebSocket.OPEN
            || replaceSilentWebSocket(server)) {
            return;
        }
        socket.send('keepalive');
    }, WS_KEEPALIVE_INTERVAL);
}

// Replaces an open socket that has been silent for too long (see WS_SILENCE_TIMEOUT).
// Returns true if it did.
function replaceSilentWebSocket(server) {
    const entry = sockets.get(server);
    if (!entry || !entry.ws || entry.ws.readyState !== WebSocket.OPEN
        || Date.now() - entry.lastActivity < WS_SILENCE_TIMEOUT) {
        return false;
    }
    console.log(`No data from ${server} for a while, reconnecting WebSocket...`);
    closeSocket(server);
    initWebSocket();
    return true;
}

// Returns true if a silent socket was replaced
function replaceSilentWebSockets() {
    let replaced = false;
    for (const server of [...sockets.keys()]) {
        if (replaceSilentWebSocket(server)) {
            replaced = true;
        }
    }
    return replaced;
}

function stopKeepalive(server) {
    const entry = sockets.get(server);
    if (entry && entry.keepaliveTimer) {
        clearInterval(entry.keepaliveTimer);
        entry.keepaliveTimer = null;
    }
}

function closeSocket(server) {
    const entry = sockets.get(server);
    if (!entry) return;
    stopKeepalive(server);
    if (entry.reconnectTimer) {
        clearTimeout(entry.reconnectTimer);
    }
    if (entry.ws) {
        entry.ws.onclose = null;
        entry.ws.close();
    }
    sockets.delete(server);
}

function closeWebSocket() {
    for (const server of [...sockets.keys()]) {
        closeSocket(server);
    }
}

// Returns { url, keyUrl, logUrl }: url may carry ?auth= and ?since=, keyUrl carries only the
// credentials (to tell whether the subscription changed), and logUrl never carries either
function buildWsUrl(config) {
    // Host only, like the HTTP calls: credentials embedded in the URL must not end up in the WebSocket URL
    const urlObj = new URL(NtfyAPI.normalizeServerUrl(config.apiUrl));
    const scheme = urlObj.protocol === 'http:' ? 'ws:' : 'wss:';
    const logUrl = `${scheme}//${urlObj.host}/${config.topics.map(encodeURIComponent).join(',')}/ws`;

    // The server replays what was missed since then, so a reconnect doesn't need a poll per topic
    const params = new URLSearchParams();
    if (config.since !== undefined && config.since !== null) {
        params.set('since', config.since);
    }
    // Browsers can't set headers on a WebSocket, so ntfy accepts the Authorization header value in ?auth=
    const auth = NtfyAPI.buildAuthHeaderValue(config);
    if (auth) {
        params.set('auth', NtfyAPI.base64UrlEncode(auth));
    }
    const query = params.toString();

    return {
        url: query ? `${logUrl}?${query}` : logUrl,
        keyUrl: auth ? `${logUrl}?auth=${NtfyAPI.base64UrlEncode(auth)}` : logUrl,
        logUrl
    };
}

// The topics that had a sync state when the socket connected: their replay is a catch-up worth a
// notification, while a topic without one is doing its initial (silent) sync
async function initializedTopicsFor(server, topics) {
    const { topicSyncState = {} } = await chrome.storage.local.get(['topicSyncState']);
    const initialized = new Set();
    for (const topic of topics) {
        if (topicSyncState[`${server}${TOPIC_SEPARATOR}${topic}`]) {
            initialized.add(topic);
        }
    }
    return initialized;
}

// What the WebSocket replays on connect: the oldest sync point of its topics, so none is missed,
// or the initial window when a topic was never synced
async function wsSinceFor(group, topics) {
    const { topicSyncState = {} } = await chrome.storage.local.get(['topicSyncState']);
    let since = null;
    for (const topic of topics) {
        const state = topicSyncState[`${group.apiUrl}${TOPIC_SEPARATOR}${topic}`];
        if (!state || state.since === null) {
            return INITIAL_SYNC_SINCE;
        }
        since = since === null ? state.since : Math.min(since, state.since);
    }
    return since === null ? INITIAL_SYNC_SINCE : since;
}

async function connectWebSocket(config) {
    const server = NtfyAPI.normalizeServerUrl(config.apiUrl);
    closeSocket(server);

    const entry = {
        ws: null,
        url: null,
        reconnectTimer: null,
        keepaliveTimer: null,
        reconnectDelay: 5000,
        lastActivity: Date.now(),
        opened: false,
        connectedAt: Math.floor(Date.now() / 1000)
    };
    sockets.set(server, entry);

    try {
        const { url, keyUrl, logUrl } = buildWsUrl(config);
        console.log('Connecting WebSocket to:', logUrl);
        const initialized = await initializedTopicsFor(server, config.topics);
        const socket = new WebSocket(url);
        entry.ws = socket;
        // The reconnect check compares this: ?since= moves with every message and must not count
        entry.url = keyUrl;

        socket.onopen = () => {
            console.log(`WebSocket connected to ${server}.`);
            entry.opened = true;
            entry.lastActivity = Date.now();
            entry.reconnectDelay = 5000;
            wsFailures.delete(server);
            authCheckedServers.delete(server);
            startKeepalive(server, socket);
            updateUnreadBadge(); // Initial badge sync
        };

        socket.onmessage = async (event) => {
            entry.lastActivity = Date.now();
            try {
                const message = JSON.parse(event.data);
                if (message.event === 'message') {
                    message.server = server;
                    // The server replays the missed messages on connect; they are catch-up, not live
                    await handleIncomingMessage(message, message.time < entry.connectedAt - 2, initialized);
                }
            } catch (e) {
                console.error('Error processing WebSocket message:', e);
            }
        };

        socket.onclose = (event) => {
            stopKeepalive(server);
            if (sockets.get(server) !== entry) {
                return; // Replaced or closed on purpose
            }
            if (!entry.opened) {
                wsFailures.set(server, (wsFailures.get(server) || 0) + 1);
            }
            console.log(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}. Reconnecting...`);
            scheduleReconnect(server);
        };

        // Don't log the event or the exception: they contain the URL, and with it the ?auth= credentials
        socket.onerror = () => {
            console.error('WebSocket error');
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error.name);
        scheduleReconnect(server);
    }
}

// delay: wait this long instead of the next backoff step (used while rate limited)
function scheduleReconnect(server, delay) {
    const entry = sockets.get(server);
    if (!entry || entry.reconnectTimer) return;

    const wait = delay || entry.reconnectDelay;
    console.log(`Scheduling WebSocket reconnect to ${server} in ${Math.ceil(wait / 1000)}s...`);
    entry.reconnectTimer = setTimeout(() => {
        entry.reconnectTimer = null;
        if (!delay) {
            entry.reconnectDelay = Math.min(entry.reconnectDelay * 2, MAX_RECONNECT_DELAY);
        }
        initWebSocket();
    }, wait);
}

// ntfy limits requests per visitor, so a pause belongs to one server: a server with wrong
// credentials answers 429 ("too many auth failures"), and it must not stop receiving from the
// others. The pauses are kept in storage.session, so a restarted service worker keeps to them.
const rateLimitedUntil = new Map(); // server -> timestamp
const ATTACHMENT_RATE_LIMIT = ''; // attachment fetches aren't tied to a subscription server
let rateLimitsLoading = null;

function loadRateLimits() {
    if (!rateLimitsLoading) {
        rateLimitsLoading = (async () => {
            if (!chrome.storage.session) {
                return;
            }
            try {
                const { rateLimitedUntilByServer = {} } =
                    await chrome.storage.session.get(['rateLimitedUntilByServer']);
                Object.entries(rateLimitedUntilByServer).forEach(([server, until]) => {
                    if (until > Date.now()) {
                        rateLimitedUntil.set(server, until);
                    }
                });
            } catch (e) {}
        })();
    }
    return rateLimitsLoading;
}

async function saveRateLimits() {
    if (!chrome.storage.session) {
        return;
    }
    const now = Date.now();
    const stored = {};
    for (const [server, until] of rateLimitedUntil) {
        if (until > now) {
            stored[server] = until;
        } else {
            rateLimitedUntil.delete(server);
        }
    }
    await chrome.storage.session.set({ rateLimitedUntilByServer: stored }).catch(() => {});
}

// ntfy sends Retry-After when it knows the wait; without it, the longer default pause applies.
// An empty server means an attachment fetch, which isn't tied to a subscription.
async function noteRateLimited(server, retryAfterSeconds = 0) {
    await loadRateLimits();
    const pause = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : RATE_LIMIT_PAUSE;
    const key = server ? NtfyAPI.normalizeServerUrl(server) : ATTACHMENT_RATE_LIMIT;
    rateLimitedUntil.set(key, Math.max(rateLimitedUntil.get(key) || 0, Date.now() + pause));
    console.log(`Server ${key || 'attachment fetch'} request limit reached (HTTP 429), pausing it for ${Math.ceil(pause / 1000)}s.`);
    await saveRateLimits();
}

// Without a server, the longest pause of any of them (used before an attachment fetch)
async function rateLimitRemaining(server) {
    await loadRateLimits();
    if (!server) {
        let longest = 0;
        for (const until of rateLimitedUntil.values()) {
            longest = Math.max(longest, until - Date.now());
        }
        return Math.max(0, longest);
    }
    const until = rateLimitedUntil.get(NtfyAPI.normalizeServerUrl(server)) || 0;
    return Math.max(0, until - Date.now());
}

// While a server is rate limited, leave its open socket alone and schedule a reconnect for after
// the pause. Resolves to true if that server is rate limited.
async function waitForRateLimit(server) {
    const pause = await rateLimitRemaining(server);
    if (pause === 0) {
        return false;
    }
    const key = NtfyAPI.normalizeServerUrl(server);
    const entry = sockets.get(key);
    if (entry && (!entry.ws || entry.ws.readyState === WebSocket.CLOSED || entry.ws.readyState === WebSocket.CLOSING)) {
        console.log(`Server request limit reached, connecting again in ${Math.ceil(pause / 1000)}s.`);
        scheduleReconnect(key, pause);
    } else if (!entry) {
        // After a service worker restart there is no socket entry to reschedule, so reconnect afterwards
        console.log(`Server request limit reached, connecting again in ${Math.ceil(pause / 1000)}s.`);
        setTimeout(() => initWebSocket(), pause + 1000);
    }
    return true;
}

// Replayed messages (the server's since= backlog) are catch-up, not live: collect them briefly and
// show one summary, as a polling catch-up does, instead of a notification per message
let catchUpBuffer = [];
let catchUpTimer = null;
function queueCatchUpNotification(notification) {
    catchUpBuffer.push(notification);
    clearTimeout(catchUpTimer);
    catchUpTimer = setTimeout(async () => {
        const notifications = catchUpBuffer;
        catchUpBuffer = [];
        catchUpTimer = null;
        const isMuted = await mutedTopicFilter();
        showCatchUpNotifications(notifications.filter(item => !isMuted(item.topic)));
    }, 1000);
}

// A topic that had no state when the socket connected was never synced: its replay is the initial
// sync, which stays silent like the first poll (initialized is null for live messages)
async function handleIncomingMessage(notification, replayed = false, initialized = null) {
    console.log('Received notification:', notification.id, notification.title);
    const notify = !replayed || !initialized || initialized.has(notification.topic);
    if (await processMessage(notification) && notify && !(await mutedTopicFilter())(notification.topic)) {
        if (replayed) {
            queueCatchUpNotification(notification);
        } else {
            showDesktopNotification(notification);
        }
    }
}

// Notifications can be switched off for all topics (notificationsMuted) or for single ones
// (mutedTopics), in the popup's topic header. The messages are still received and listed, but show
// no desktop notification and are marked as read. Resolves to a function that tells whether a topic is muted.
async function mutedTopicFilter() {
    const { notificationsMuted = false, mutedTopics = [] } =
        await chrome.storage.local.get(['notificationsMuted', 'mutedTopics']);
    return topic => notificationsMuted || mutedTopics.includes(topic);
}

// Marks the unread messages of muted topics as read: new ones as they arrive, and those already
// there when a topic is muted
async function markMutedMessagesRead() {
    try {
        const isMuted = await mutedTopicFilter();
        const { receivedNotifications = [], readMessageIds = [] } =
            await chrome.storage.local.get(['receivedNotifications', 'readMessageIds']);
        const ids = receivedNotifications
            .filter(notification => isMuted(notification.topic) && !readMessageIds.includes(notification.id))
            .map(notification => notification.id);
        if (ids.length > 0) {
            await chrome.storage.local.set({ readMessageIds: NtfyAPI.appendIds(readMessageIds, ids) });
        }
    } catch (error) {
        console.error('Failed to mark the messages of muted topics as read:', error.message);
    }
}

// The live socket and the catch-up poll both read-modify-write the history and the sync state.
// Run those updates one at a time so neither overwrites the other's.
let storageQueue = Promise.resolve();
function serialized(task) {
    const run = storageQueue.then(task);
    storageQueue = run.catch(() => {});
    return run;
}

// Per topic, topicSyncState holds the server time of the newest message seen (the next poll's
// since=, inclusive) and the ids of the latest messages, to skip the ones a poll returns again.
// since is null until the topic's first message.
// Resolves to true if the message is new, and not one this extension sent itself (NtfyAPI.markAsSent):
// worth a desktop notification.
function processMessage(notification) {
    return serialized(async () => {
        const { topicSyncState = {}, sentMessageIds = [] } =
            await chrome.storage.local.get(['topicSyncState', 'sentMessageIds']);
        // The same topic can exist on several subscription servers, so the state is per server too
        const syncKey = `${notification.server || ''}${TOPIC_SEPARATOR}${notification.topic}`;
        const state = topicSyncState[syncKey] || { since: null, ids: [] };
        if (state.ids.includes(notification.id)) {
            return false;
        }

        state.ids = [...state.ids, notification.id].slice(-MAX_SEEN_IDS_PER_TOPIC);
        if (state.since === null || notification.time > state.since) {
            state.since = notification.time;
        }
        topicSyncState[syncKey] = state;
        await chrome.storage.local.set({ topicSyncState });

        const added = await saveNotificationToHistory(notification);
        return added && !sentMessageIds.includes(notification.id);
    });
}

// Resolves to true if the notification was added, false if it was already there, deleted, or older
// than all of a full history
async function saveNotificationToHistory(notification) {
    const result = await chrome.storage.local.get(['receivedNotifications', 'deletedMessageIds']);
    const deletedIds = new Set(result.deletedMessageIds || []);
    const history = result.receivedNotifications || [];

    if (deletedIds.has(notification.id) || history.some(n => n.id === notification.id)) {
        return false;
    }

    // Deleted messages give up their place (their ids stay in deletedMessageIds, so they don't come
    // back), and the oldest messages by server time are the ones dropped, not the first to arrive:
    // a catch-up goes topic by topic
    const updated = [notification, ...history.filter(n => !deletedIds.has(n.id))]
        .sort((a, b) => b.time - a.time)
        .slice(0, MAX_HISTORY_ITEMS);
    await chrome.storage.local.set({ receivedNotifications: updated });
    return updated.includes(notification);
}

async function showDesktopNotification(notification) {
    const priorityLabels = {
        1: '⇊ 最低',
        2: '↓ 低',
        4: '↑ 高',
        5: '⇈ 紧急'
    };
    const priorityLabel = priorityLabels[notification.priority] ? ` [${priorityLabels[notification.priority]}]` : '';

    // Whoever sends the message chooses the pages a click and the button open: name their sites, so
    // a link to a lookalike site doesn't pass unnoticed
    const buttons = [];
    if (notification.attachment && NtfyAPI.isHttpUrl(notification.attachment.url)) {
        buttons.push({ title: `🔗 打开附件（${new URL(notification.attachment.url).host}）` });
    }
    let message = Emojis.formatMessage({ ...notification, message: notificationText(notification) });
    // Tags that are emojis already show in front of the title or message, like in the popup
    const otherTags = Emojis.unmatchedTags(notification.tags);
    if (otherTags.length > 0) {
        message += `\n标签：${otherTags.join(', ')}`;
    }
    if (NtfyAPI.isHttpUrl(notification.click)) {
        message += `\n↗ ${new URL(notification.click).host}`;
    }

    const options = {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        // Without a title, the topic takes its place, like in the ntfy web app
        title: (notification.title ? Emojis.formatTitle(notification) : notification.topic) + priorityLabel,
        message,
        contextMessage: notification.title ? `主题：${notification.topic}` : '',
        buttons: buttons,
        requireInteraction: notification.priority >= 4
    };

    // An image attachment shows as in the popup: Chrome shows it large below the message, Firefox
    // (which has only basic notifications) in place of the icon
    const image = await notificationImage(notification);
    if (image && IS_FIREFOX) {
        options.iconUrl = image;
    } else if (image) {
        options.type = 'image';
        options.imageUrl = image;
    }

    return createNotification(notification.id, options);
}

const IS_FIREFOX = typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';
const NOTIFICATION_IMAGE_TIMEOUT = 5000; // ms; after that, the notification shows without the image

// Resolves to the thumbnail's data URL, or null if the message has no image to show (or it takes too long)
async function notificationImage(notification) {
    const attachment = notification.attachment;
    if (!NtfyAPI.isImageAttachment(attachment) || NtfyAPI.isAttachmentExpired(attachment)) {
        return null;
    }
    try {
        const stored = (await chrome.storage.local.get([NtfyAPI.THUMBNAIL_CACHE_KEY]))[NtfyAPI.THUMBNAIL_CACHE_KEY] || {};
        if (stored[notification.id]) {
            return stored[notification.id];
        }
        if (await rateLimitRemaining() > 0) {
            return null;
        }

        let timer;
        const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), NOTIFICATION_IMAGE_TIMEOUT); });
        const thumbnail = NtfyAPI.createThumbnail(attachment).then(async dataUrl => {
            await storeThumbnail(notification.id, dataUrl); // The popup's list uses it too
            return dataUrl;
        });
        thumbnail.catch(() => {}); // Handled below, unless the timeout won
        try {
            return await Promise.race([thumbnail, timeout]);
        } finally {
            clearTimeout(timer);
        }
    } catch (e) {
        if (e.status === 429) {
            await noteRateLimited(ATTACHMENT_RATE_LIMIT, e.retryAfter);
        }
        console.warn(`Notification image: could not load ${attachment.name || 'the attachment'}:`, e.message);
        return null;
    }
}

// Stored one write at a time, so thumbnails made at the same time don't overwrite each other
let thumbnailQueue = Promise.resolve();
function storeThumbnail(id, dataUrl) {
    thumbnailQueue = thumbnailQueue.then(async () => {
        const key = NtfyAPI.THUMBNAIL_CACHE_KEY;
        const { receivedNotifications = [], [key]: stored = {} } =
            await chrome.storage.local.get(['receivedNotifications', key]);
        // Not for a message deleted meanwhile, which the popup would no longer prune
        if (receivedNotifications.some(notification => notification.id === id)) {
            stored[id] = dataUrl;
            await chrome.storage.local.set({ [key]: stored });
        }
    }).catch(error => console.error('Error saving image thumbnail:', error));
    return thumbnailQueue;
}

// Messages of priority 4 and 5 stay on screen until dismissed. Anyone who can publish to a topic can
// send those, so only a few stay at a time; further ones go away like the others.
const MAX_STICKY_NOTIFICATIONS = 3;
let stickyNotificationIds = null; // Kept in storage.session, so a restarted service worker knows them

// Created one at a time, so the sticky notifications are counted correctly
let notificationQueue = Promise.resolve();
function createNotification(id, options) {
    notificationQueue = notificationQueue
        .then(async () => {
            const requireInteraction = Boolean(options.requireInteraction) && await claimStickySlot(id);
            chrome.notifications.create(id, { ...options, requireInteraction });
        })
        .catch(error => console.error('Failed to show a notification:', error));
    return notificationQueue;
}

// Resolves to true if notification id may stay on screen
async function claimStickySlot(id) {
    if (stickyNotificationIds === null) {
        try {
            stickyNotificationIds = (await chrome.storage.session.get(['stickyNotificationIds'])).stickyNotificationIds || [];
        } catch (e) {
            stickyNotificationIds = [];
        }
    }
    // Those still showing; the one being replaced (same id) counts as gone
    const open = await new Promise(resolve => chrome.notifications.getAll(resolve)) || {};
    stickyNotificationIds = stickyNotificationIds.filter(stickyId => stickyId in open && stickyId !== id);

    const claimed = stickyNotificationIds.length < MAX_STICKY_NOTIFICATIONS;
    if (claimed) {
        stickyNotificationIds.push(id);
    }
    chrome.storage.session.set({ stickyNotificationIds }).catch(() => {});
    return claimed;
}

// Notifications show plain text, so Markdown messages lose their formatting characters
function notificationText(notification) {
    const text = notification.message || '';
    if (notification.content_type !== 'text/markdown') {
        return text;
    }
    try {
        return Markdown.toPlainText(text);
    } catch (e) {
        console.warn('Could not convert Markdown for the notification:', e);
        return text; // Better the raw text than no notification
    }
}

// Messages missed while offline: each gets its own desktop notification if there are only a few,
// otherwise one summary, so starting the browser doesn't bring up a pile of them
function showCatchUpNotifications(notifications) {
    if (notifications.length <= MAX_CATCH_UP_NOTIFICATIONS) {
        notifications.forEach(showDesktopNotification);
        return;
    }

    const newest = [...notifications].sort((a, b) => b.time - a.time);
    const lines = newest.slice(0, MAX_CATCH_UP_NOTIFICATIONS)
        .map(notification => notification.title
            ? Emojis.formatTitle(notification)
            : Emojis.formatMessage({ ...notification, message: notificationText(notification) }).split('\n')[0]);
    lines.push(`… 还有 ${newest.length - lines.length} 条`);
    const topics = [...new Set(newest.map(notification => notification.topic))];

    createNotification(SUMMARY_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: `${notifications.length} 条新消息`,
        message: lines.join('\n'),
        contextMessage: `主题：${topics.join(', ')}`,
        requireInteraction: notifications.some(notification => notification.priority >= 4)
    });
}

// A click on a desktop notification marks its message as read and opens the message's click URL
// (ntfy's X-Click) or else the popup
chrome.notifications.onClicked.addListener(async (notificationId) => {
    chrome.notifications.clear(notificationId);
    if (notificationId !== SUMMARY_NOTIFICATION_ID) {
        const { receivedNotifications = [], readMessageIds = [] } =
            await chrome.storage.local.get(['receivedNotifications', 'readMessageIds']);
        const notification = receivedNotifications.find(n => n.id === notificationId);
        if (notification) {
            await chrome.storage.local.set({ readMessageIds: NtfyAPI.appendIds(readMessageIds, [notificationId]) });
            if (NtfyAPI.isHttpUrl(notification.click)) {
                chrome.tabs.create({ url: notification.click });
                return;
            }
        }
    }
    // Not available, or not allowed without a click on the extension, in every browser
    try {
        await chrome.action.openPopup();
    } catch (e) {
        console.log('Could not open the popup:', e.message);
    }
});

// Handle desktop notification button clicks (Open attachment URL in new tab).
// Firefox has no notification buttons; there the event may be missing.
if (chrome.notifications.onButtonClicked) {
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
        if (buttonIndex === 0) {
            chrome.storage.local.get(['receivedNotifications'], (result) => {
                const history = result.receivedNotifications || [];
                const notification = history.find(n => n.id === notificationId);
                if (notification && notification.attachment && NtfyAPI.isHttpUrl(notification.attachment.url)) {
                    chrome.tabs.create({ url: notification.attachment.url });
                }
            });
        }
    });
}

// Concurrent callers (socket open, alarm, popup) share the sync already running. A socket's sync
// only polls its own server; the alarm and popup sync every subscription.
const syncInFlight = new Map();
function syncMissedMessages(server) {
    const key = server || '*';
    if (!syncInFlight.has(key)) {
        syncInFlight.set(key, runSync(server).finally(() => {
            syncInFlight.delete(key);
        }));
    }
    return syncInFlight.get(key);
}

async function runSync(server) {
    const config = await NtfyAPI.getConfig();
    if (!config.receiveEnabled) return;
    const groups = receiveGroups(config).filter(group => !server || group.apiUrl === server);
    if (groups.length === 0) return;

    await migrateTopicSyncState(config);

    const { readAccessDenied = {}, readAccessKeys = {} } =
        await chrome.storage.local.get(['readAccessDenied', 'readAccessKeys']);
    const toNotify = [];
    for (const group of groups) {
        if (await waitForRateLimit(group.apiUrl)) {
            continue;
        }
        // Poll the configured topics directly: a 401/403 tells the same as an /auth pre-check,
        // without one request per topic
        const topics = await subscriptionTopics(group);
        if (await waitForRateLimit(group.apiUrl)) {
            continue;
        }

        const accessKey = await readableTopicsKey(group);
        const denied = new Set(readAccessKeys[group.apiUrl] === accessKey
            ? (readAccessDenied[group.apiUrl] || [])
            : []);
        const newlyDenied = [];
        for (const topic of topics) {
            // A topic synced for the first time gets its recent history without desktop notifications
            const syncKey = `${group.apiUrl}${TOPIC_SEPARATOR}${topic}`;
            const { topicSyncState = {} } = await chrome.storage.local.get(['topicSyncState']);
            const state = topicSyncState[syncKey];
            const since = state && state.since !== null ? state.since : INITIAL_SYNC_SINCE;

            try {
                const messages = await NtfyAPI.getNotifications(group, topic, since);
                messages.sort((a, b) => a.time - b.time);
                for (const notification of messages) {
                    notification.server = group.apiUrl;
                    if (await processMessage(notification) && state) {
                        toNotify.push(notification);
                    }
                }
                if (!state) {
                    await serialized(async () => {
                        const current = await chrome.storage.local.get(['topicSyncState']);
                        const states = current.topicSyncState || {};
                        if (!states[syncKey]) {
                            states[syncKey] = { since: null, ids: [] };
                            await chrome.storage.local.set({ topicSyncState: states });
                        }
                    });
                }
            } catch (error) {
                if (error.status === 429) {
                    await noteRateLimited(group.apiUrl, error.retryAfter);
                    break;
                }
                if (error.status === 401 || error.status === 403) {
                    denied.add(topic);
                    newlyDenied.push(topic);
                    continue;
                }
                console.error(`Failed to sync missed messages for topic ${topic} on ${group.apiUrl}:`, error.message);
            }
        }
        if (newlyDenied.length > 0) {
            await recordReadAccess(group.apiUrl, [...denied], accessKey);
        }
    }

    const isMuted = await mutedTopicFilter();
    showCatchUpNotifications(toNotify.filter(notification => !isMuted(notification.topic)));
    await forgetRemovedTopics(config);
}

// Forget removed topics: their messages leave the history, and adding one back starts with a
// silent sync again, with notifications on
function forgetRemovedTopics(config) {
    const groups = receiveGroups(config);
    const pairs = new Set();
    const topics = new Set();
    groups.forEach(group => group.topics.forEach(topic => {
        pairs.add(`${group.apiUrl}${TOPIC_SEPARATOR}${topic}`);
        topics.add(topic);
    }));

    return serialized(async () => {
        const { topicSyncState = {}, receivedNotifications = [], mutedTopics = [], readAccessDenied = {} } =
            await chrome.storage.local.get(['topicSyncState', 'receivedNotifications', 'mutedTopics', 'readAccessDenied']);
        const update = {};

        const stale = Object.keys(topicSyncState).filter(key => {
            // Older versions keyed the state by topic only; migration moves those keys
            if (!key.includes(TOPIC_SEPARATOR)) {
                return !topics.has(key);
            }
            return !pairs.has(key);
        });
        if (stale.length > 0) {
            stale.forEach(key => delete topicSyncState[key]);
            update.topicSyncState = topicSyncState;
        }
        const history = receivedNotifications.filter(notification => {
            if (!topics.has(notification.topic)) {
                return false;
            }
            // Messages stored by older versions have no server
            if (!notification.server) {
                return true;
            }
            return groups.some(group =>
                group.apiUrl === notification.server && group.topics.includes(notification.topic));
        });
        if (history.length !== receivedNotifications.length) {
            update.receivedNotifications = history;
        }
        const stillMuted = mutedTopics.filter(topic => topics.has(topic));
        if (stillMuted.length !== mutedTopics.length) {
            update.mutedTopics = stillMuted;
        }
        const servers = new Set(groups.map(group => group.apiUrl));
        let deniedChanged = false;
        Object.keys(readAccessDenied).forEach(server => {
            if (!servers.has(server)) {
                delete readAccessDenied[server];
                deniedChanged = true;
            }
        });
        if (deniedChanged) {
            update.readAccessDenied = readAccessDenied;
        }

        if (Object.keys(update).length > 0) {
            await chrome.storage.local.set(update);
        }
    });
}

// Manual pull from the popup: fetches everything the servers still cache for every subscribed
// topic, not just what arrived since the last sync. Silent, without desktop notifications, as the
// user is looking at the list. Resolves to a summary for the popup.
let pullInFlight = null;
function pullAllMessages() {
    if (!pullInFlight) {
        pullInFlight = runPull().finally(() => {
            pullInFlight = null;
        });
    }
    return pullInFlight;
}

async function runPull() {
    const config = await NtfyAPI.getConfig();
    if (!config.receiveEnabled) {
        return { success: false, reason: 'disabled' };
    }
    const groups = receiveGroups(config);
    if (groups.length === 0) {
        return { success: false, reason: 'empty' };
    }

    await migrateTopicSyncState(config);

    const { readAccessDenied = {}, readAccessKeys = {}, receivedNotifications: before = [] } =
        await chrome.storage.local.get(['readAccessDenied', 'readAccessKeys', 'receivedNotifications']);
    const beforeIds = new Set(before.map(notification => notification.id));
    let failed = 0;
    let rateLimited = false;
    let waitMs = 0;
    let attempted = 0;
    // One request per topic: the /auth pre-check getReadableTopics does would double them, and a
    // topic the credentials can't read answers 401/403 here just as well
    for (const group of groups) {
        // A paused server is skipped; the others are still pulled
        const paused = await rateLimitRemaining(group.apiUrl);
        if (paused > 0) {
            rateLimited = true;
            waitMs = waitMs === 0 ? paused : Math.min(waitMs, paused);
            continue;
        }
        attempted++;
        const accessKey = await readableTopicsKey(group);
        const denied = new Set(readAccessKeys[group.apiUrl] === accessKey
            ? (readAccessDenied[group.apiUrl] || [])
            : []);
        const newlyDenied = [];
        for (const topic of group.topics) {
            if (denied.has(topic)) {
                continue;
            }
            try {
                const messages = await NtfyAPI.getNotifications(group, topic, 'all');
                await mergePulledMessages(group.apiUrl, topic, messages);
            } catch (error) {
                if (error.status === 429) {
                    await noteRateLimited(group.apiUrl, error.retryAfter);
                    rateLimited = true;
                    const remaining = await rateLimitRemaining(group.apiUrl);
                    waitMs = waitMs === 0 ? remaining : Math.min(waitMs, remaining);
                    break;
                }
                if (error.status === 401 || error.status === 403) {
                    denied.add(topic);
                    newlyDenied.push(topic);
                    failed++;
                    continue;
                }
                failed++;
                console.error(`Manual pull failed for topic ${topic} on ${group.apiUrl}:`, error.message);
            }
        }
        if (newlyDenied.length > 0) {
            await recordReadAccess(group.apiUrl, [...denied], accessKey);
        }
    }

    // Every server was paused before the pull could do anything
    if (attempted === 0) {
        return { success: false, reason: 'rate-limited', retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) };
    }

    // What the pull actually brought into the list (the history keeps the newest 50)
    const { receivedNotifications: after = [] } = await chrome.storage.local.get(['receivedNotifications']);
    const added = after.filter(notification => !beforeIds.has(notification.id)).length;
    return { success: true, added, failed, rateLimited, retryAfter: Math.ceil(waitMs / 1000) };
}

// Merges a pull's backlog into the history and the sync state in one write. A topic with a long
// server cache would otherwise take two storage writes per message, keeping the list from updating
// and the service worker busy for a long time.
function mergePulledMessages(server, topic, messages) {
    return serialized(async () => {
        const { topicSyncState = {}, receivedNotifications = [], deletedMessageIds = [] } =
            await chrome.storage.local.get(['topicSyncState', 'receivedNotifications', 'deletedMessageIds']);
        const syncKey = `${server}${TOPIC_SEPARATOR}${topic}`;
        const state = topicSyncState[syncKey] || { since: null, ids: [] };
        const seen = new Set(state.ids);
        const deletedIds = new Set(deletedMessageIds);
        const inHistory = new Set(receivedNotifications.map(notification => notification.id));

        const newOnes = [];
        for (const notification of [...messages].sort((a, b) => a.time - b.time)) {
            if (seen.has(notification.id)) {
                continue;
            }
            seen.add(notification.id);
            state.ids.push(notification.id);
            if (state.since === null || notification.time > state.since) {
                state.since = notification.time;
            }
            notification.server = server;
            if (!deletedIds.has(notification.id) && !inHistory.has(notification.id)) {
                newOnes.push(notification);
            }
        }
        state.ids = state.ids.slice(-MAX_SEEN_IDS_PER_TOPIC);
        topicSyncState[syncKey] = state;

        const updated = [...newOnes, ...receivedNotifications.filter(notification => !deletedIds.has(notification.id))]
            .sort((a, b) => b.time - a.time)
            .slice(0, MAX_HISTORY_ITEMS);
        await chrome.storage.local.set({ topicSyncState, receivedNotifications: updated });
    });
}

function isWebSocketOpen() {
    return [...sockets.values()].some(entry =>
        entry.ws && entry.ws.readyState === WebSocket.OPEN);
}

// Alarm Listener for keep-alive and missed sync (set up while receiving, see updateAlarm)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('Keep-alive alarm fired, ensuring WebSocket is connected...');
        replaceSilentWebSockets();
        initWebSocket();
        // While the sockets are open, messages arrive live, and each (re)connect catches up on missed ones.
        // Polling every topic each minute on top of that runs into ntfy's request limit (HTTP 429).
        if (!isWebSocketOpen()) {
            syncMissedMessages();
        }
    } else if (alarm.name === IMAGE_SITE_ALARM) {
        removeUnusedImageSitePermissions();
    }
});

async function updateUnreadBadge() {
    const config = await NtfyAPI.getConfig();
    if (!config.receiveEnabled) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }
    const groups = receiveGroups(config);
    chrome.storage.local.get(['receivedNotifications', 'readMessageIds', 'deletedMessageIds'], (result) => {
        const history = result.receivedNotifications || [];
        const readIds = new Set(result.readMessageIds || []);
        const deletedIds = new Set(result.deletedMessageIds || []);

        // Unread count = history items of the subscription topics that are NOT deleted AND NOT read
        const unreadCount = history
            .filter(n => !deletedIds.has(n.id) && !readIds.has(n.id)
                && groups.some(group => group.topics.includes(n.topic)
                    && (!n.server || group.apiUrl === n.server)))
            .length;

        if (unreadCount > 0) {
            chrome.action.setBadgeText({ text: unreadCount.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    });
}

// Every subscription server's socket has to be open before a sync request can be skipped
async function allWebSocketsOpen() {
    const config = await NtfyAPI.getConfig();
    if (!config.receiveEnabled) {
        return false;
    }
    const groups = receiveGroups(config);
    if (groups.length === 0) {
        return false;
    }
    return groups.every(group => {
        const entry = sockets.get(group.apiUrl);
        return entry && entry.ws && entry.ws.readyState === WebSocket.OPEN;
    });
}

// Listen for manual sync requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reconnect') {
        // Access to this server was just granted: forget its failures and connect again now
        const server = NtfyAPI.normalizeServerUrl(request.server || '');
        if (!server) {
            sendResponse({ success: false });
            return false;
        }
        wsFailures.delete(server);
        authCheckedServers.delete(server);
        closeSocket(server);
        initWebSocket()
            .then(() => sendResponse({ success: true }))
            .catch(() => sendResponse({ success: false }));
        return true;
    }
    if (request.action === 'sync') {
        allWebSocketsOpen().then(open => {
            if (open) {
                sendResponse({ success: true });
                return;
            }
            console.log('Sync request received from popup, forcing sync...');
            syncMissedMessages()
                .then(() => sendResponse({ success: true }))
                .catch(() => sendResponse({ success: false }));
        });
        return true;
    }
    if (request.action === 'pull') {
        console.log('Manual pull requested from popup...');
        pullAllMessages()
            .then(result => sendResponse(result))
            .catch(error => {
                console.error('Manual pull failed:', error.message);
                sendResponse({ success: false });
            });
        return true;
    }
});
