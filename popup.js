document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elements = {
    // Views
    mainView: document.getElementById('main-view'),
    settingsView: document.getElementById('settings-view'),

    // Header
    backBtn: document.getElementById('back-btn'),
    headerText: document.getElementById('header-text'),
    openUrlBtn: document.getElementById('open-url-btn'),
    settingsBtn: document.getElementById('settings-btn'),

    // Composer
    composer: document.getElementById('composer'),
    composerToggle: document.getElementById('composer-toggle'),
    composerOptions: document.getElementById('composer-options'),
    messageSlot: document.getElementById('message-slot'),
    titleInput: document.getElementById('title-input'),
    messageInput: document.getElementById('message-input'),
    tagsContainer: document.getElementById('tags-container'),
    newTagInput: document.getElementById('new-tag-input'),
    tagInputHint: document.getElementById('tag-input-hint'),
    emojiBtn: document.getElementById('emoji-btn'),
    emojiPicker: document.getElementById('emoji-picker'),
    emojiSearch: document.getElementById('emoji-search'),
    emojiList: document.getElementById('emoji-list'),


    // File handling
    fileBtn: document.getElementById('file-btn'),
    filePreview: document.getElementById('file-preview'),
    zipToggle: document.getElementById('zip-toggle'),
    zipCheckbox: document.getElementById('zip-checkbox'),

    // Priority & Theme chips
    priorityChips: document.getElementById('priority-chips'),
    themeChips: document.getElementById('theme-chips'),
    sizeChips: document.getElementById('size-chips'),

    // Actions
    sendBtn: document.getElementById('send-btn'),
    insertUrlBtn: document.getElementById('insert-url-btn'),
    composerField: document.getElementById('composer-field'),
    sendAnotherCheckbox: document.getElementById('send-another-checkbox'),
    markdownCheckbox: document.getElementById('markdown-checkbox'),

    // Status
    status: document.getElementById('status'),
    settingsStatus: document.getElementById('settings-status'),

    // Settings inputs
    sendServersList: document.getElementById('send-servers-list'),
    addSendServerBtn: document.getElementById('add-send-server-btn'),
    insecureHint: document.getElementById('insecure-hint'),
    receiveInsecureHint: document.getElementById('receive-insecure-hint'),
    sendCheckbox: document.getElementById('send-checkbox'),
    receiveCheckbox: document.getElementById('receive-checkbox'),

    // Receive hint
    receiveHint: document.getElementById('receive-hint'),
    receiveHintMessage: document.getElementById('receive-hint-message'),
    receiveHintDismiss: document.getElementById('receive-hint-dismiss'),
    subscriptionsList: document.getElementById('subscriptions-list'),
    addSubscriptionBtn: document.getElementById('add-subscription-btn'),
    sendSectionBody: document.getElementById('send-section-body'),
    receiveSectionBody: document.getElementById('receive-section-body'),
    sendSection: document.getElementById('settings-send-section'),
    receiveSection: document.getElementById('settings-receiving-section'),
    accessDeniedHint: document.getElementById('access-denied-hint'),

    // WebDAV backup
    backupCheckbox: document.getElementById('backup-checkbox'),
    backupSectionBody: document.getElementById('backup-section-body'),
    backupUrlInput: document.getElementById('backup-url-input'),
    backupDirectoryInput: document.getElementById('backup-directory-input'),
    backupUsernameInput: document.getElementById('backup-username-input'),
    backupPasswordInput: document.getElementById('backup-password-input'),
    backupEncryptInput: document.getElementById('backup-encrypt-password-input'),
    backupTestBtn: document.getElementById('backup-test-btn'),
    backupUploadBtn: document.getElementById('backup-upload-btn'),
    backupRestoreBtn: document.getElementById('backup-restore-btn'),
    backupExportBtn: document.getElementById('backup-export-btn'),
    backupImportBtn: document.getElementById('backup-import-btn'),
    backupImportFile: document.getElementById('backup-import-file'),
    backupLastHint: document.getElementById('backup-last-hint'),
    backupWarningHint: document.getElementById('backup-warning-hint'),
    backupSection: document.getElementById('settings-backup-section'),

    // Recent Notifications
    notificationsTitle: document.getElementById('notifications-title'),
    notifyToggle: document.getElementById('notify-toggle'),
    notifyCheckbox: document.getElementById('notify-checkbox'),
    pullBtn: document.getElementById('pull-btn'),
    notificationsSection: document.getElementById('notifications-section'),
    notificationsList: document.getElementById('notifications-list'),
    topicColumn: document.getElementById('topic-column'),
    topicSidebar: document.getElementById('topic-sidebar'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),

    // Bulk Actions Control Bar
    notificationsControlBar: document.getElementById('notifications-control-bar'),
    markAllReadBtn: document.getElementById('mark-all-read-btn'),
    deleteAllBtn: document.getElementById('delete-all-btn'),
  };

  // State
  let config = {
    // The first send server's topics and URL, kept for the parts that use one server
    topics: [],
    apiUrl: '',
    // Each send server has its own URL, topics and credentials
    sendServers: [],
    // Per-send-server credentials from storage.local, by send server id
    sendServerCredentials: {},
    // Sending and receiving are switched on separately in the settings
    sendEnabled: false,
    // Each subscription has its own server and topics; empty values use the sending ones
    subscriptions: [],
    // Per-subscription credentials from storage.local, by subscription id; empty fields use the send server's
    subscriptionCredentials: {},
    accessToken: '',
    username: '',
    password: '',

    theme: 'auto',
    popupSize: 'medium',
    pageUrl: '',
    sendAsZipEnabled: false,
    receiveEnabled: false,
    // WebDAV backup settings, kept on this device: they hold the server's password
    webdav: {
      enabled: false,
      url: '',
      directory: '',
      username: '',
      password: '',
      encryptPassword: '',
      lastBackupAt: 0
    }
  };

  let tags = []; // State for tags
  let readMessageIds = []; // State for read notifications
  let deletedMessageIds = []; // State for deleted notifications (client-side only)
  let pendingDeleteId = null; // Message whose delete button waits for the confirming click
  let pendingDeleteTimer = null;
  let deleteAllArmed = false;
  let deleteAllTimer = null;
  let listPointerDown = false; // A press on the Receive list, during which it must not be rebuilt
  let listRefreshPending = false;
  let listRefreshTimer = null;
  // Key of the topic entry shown and sent to, or 'all' (nothing to send to)
  let receiveFilter = 'all';
  let receiveHintDismissed = false; // The hint about the Receive messages setting is shown only once
  let currentNotifications = []; // Currently displayed notifications for the active topic
  let notificationsMuted = false; // Notifications off for all topics
  let mutedTopics = []; // Topics with notifications off
  // Remarks shown instead of the topic names in the sidebar, by entry key
  let topicRemarks = {};
  // The topic list is collapsed to its toggle button
  let sidebarHidden = false;
  let readAccessDenied = {}; // Topics the server refused to read (401/403), by server, from the background
  let attachments = [];

  // Drag and drop state
  let dragSrcIndex = null;
  let dragType = null;
  let dragGroupId = null;

  let selectedPriority = 3;
  let isSettingsView = false;
  let serverAccessMissing = false;
  let sendServerAccessMissing = false;
  let receiveServerAccessMissing = false;
  let rightCtrlDown = false;
  let isSending = false;
  let draftSaveTimer = null;

  const SEND_AS_ZIP_SETTING_KEY = 'sendAsZipEnabled';
  // Synced settings; the access token is in storage.local (NtfyAPI.getAccessToken)
  const STORAGE_KEYS = ['topics', 'apiUrl', 'sendServers', 'sendEnabled', 'subscriptions', 'receiveApiUrl', 'receiveTopics', 'theme', 'priority', 'lastTags', 'sendAnotherEnabled', 'markdownEnabled', 'receiveEnabled', 'popupSize', SEND_AS_ZIP_SETTING_KEY];
  const POPUP_SIZES = ['small', 'medium', 'large'];
  // The size is also kept in localStorage, so it applies before the first paint
  // instead of after the asynchronous settings load
  const POPUP_SIZE_CACHE_KEY = 'popupSize';
  const SIDEBAR_HIDDEN_KEY = 'sidebarHidden';
  // WebDAV backup settings; kept on this device only, as they hold the server's password
  const WEBDAV_KEY = 'webdavBackup';

  try {
    applyPopupSize(localStorage.getItem(POPUP_SIZE_CACHE_KEY));
    sidebarHidden = localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1';
  } catch (e) {}
  const STORED_FILES_KEY = 'storedFiles';
  const LEGACY_STORED_FILE_KEY = 'storedFile';

  // The popup opens on the view it was closed on. Kept in localStorage like the size, so the
  // settings show from the first paint; init fills them in once the config is loaded.
  const LAST_VIEW_KEY = 'lastView';
  let reopenSettings = false;
  try {
    reopenSettings = localStorage.getItem(LAST_VIEW_KEY) === 'settings';
  } catch (e) {}
  if (reopenSettings) {
    setViewChrome(true);
  }

  // Initialize
  init();

  async function init() {
    applySidebarVisibility();
    await loadConfig();
    await loadLocalState();
    await checkSessionAndCleanup(); // Check session and cleanup old files if needed
    await restoreDraftState();
    await loadStoredFiles();
    setupEventListeners();
    await updateServerAccessUI();
    updateUI();
    // Ensure priority UI is updated after config load
    updatePriorityUI();
    applyTheme();
    // The synced setting wins, e.g. when changed in another browser
    applyPopupSize(config.popupSize);
    try {
      localStorage.setItem(POPUP_SIZE_CACHE_KEY, config.popupSize);
    } catch (e) {}
    // Render initial empty tags or restored ones
    renderTags();
    if (reopenSettings) {
      showSettingsView();
    } else {
      // Set header title dynamically from manifest
      elements.headerText.textContent = chrome.runtime.getManifest().name;
    }

    updateInsertUrlButton();
    autoSizeMessageInput();
    // Back from the file picker: show the attached files
    setComposerOptionsOpen(attachments.length > 0 || !config.receiveEnabled);
    await loadNotifications();
    if (!isSettingsView && !elements.composer.hidden) {
      elements.messageInput.focus();
    }

    // Trigger initial sync in background
    chrome.runtime.sendMessage({ action: 'sync' });
  }

  // ==================
  // Configuration
  // ==================

  async function loadConfig() {
    try {
      // Before reading apiUrl: moves credentials out of it
      const credentials = await NtfyAPI.getServerCredentials();
      const items = await getFromStorage(STORAGE_KEYS);
      const localSettings = await getFromStorageLocal(['subscriptionCredentials', 'sendServerCredentials', WEBDAV_KEY]);
      const accessToken = await NtfyAPI.getAccessToken();
      config.pageUrl = await getPageUrl();
      const apiUrl = NtfyAPI.normalizeServerUrl(items.apiUrl);
      const topics = NtfyAPI.parseTopics(items.topics);

      // Send servers: older versions had one server and one topic list
      let sendServers = NtfyAPI.parseSendServers(items.sendServers);
      if (!sendServers) {
        sendServers = [{ id: 'default', apiUrl, topics }];
      }
      if (sendServers.length === 0) {
        sendServers = [createSendServer()];
      }
      // Before the per-server credentials existed, the shared fields held the first server's
      let sendServerCredentials = localSettings.sendServerCredentials;
      if (!sendServerCredentials || typeof sendServerCredentials !== 'object') {
        sendServerCredentials = {
          [sendServers[0].id]: {
            accessToken: accessToken,
            username: credentials.username,
            password: credentials.password
          }
        };
      }
      const firstSendServer = sendServers[0];
      const firstSendCredentials = sendServerCredentials[firstSendServer.id] || {};

      let subscriptions = NtfyAPI.parseSubscriptions(items.subscriptions);
      if (!subscriptions) {
        // Older versions had one subscription server and topic list
        subscriptions = [{
          id: 'default',
          apiUrl: NtfyAPI.normalizeServerUrl(items.receiveApiUrl),
          topics: NtfyAPI.parseTopics(items.receiveTopics)
        }];
      }
      if (subscriptions.length === 0) {
        subscriptions = [createSubscription()];
      }
      config = {
        ...config,
        // The first server's values, for the code that still works with one server
        topics: firstSendServer.topics,
        apiUrl: NtfyAPI.normalizeServerUrl(firstSendServer.apiUrl),
        sendServers,
        sendServerCredentials,
        // Before the switches existed, a configured server and topics meant sending was on
        sendEnabled: items.sendEnabled === undefined
          ? sendServers.some(server => server.apiUrl && server.topics.length > 0)
          : items.sendEnabled === true,
        subscriptions,
        subscriptionCredentials: localSettings.subscriptionCredentials || {},
        accessToken: firstSendCredentials.accessToken || '',
        username: firstSendCredentials.username || '',
        password: firstSendCredentials.password || '',

        theme: items.theme || 'auto',
        popupSize: POPUP_SIZES.includes(items.popupSize) ? items.popupSize : 'medium',
        sendAnotherEnabled: items.sendAnotherEnabled === true,
        markdownEnabled: items.markdownEnabled === true,
        receiveEnabled: items.receiveEnabled === true,
        sendAsZipEnabled: items[SEND_AS_ZIP_SETTING_KEY] === true,
        webdav: { ...config.webdav, ...(localSettings[WEBDAV_KEY] || {}) }
      };

      // Restore 'Send another' checkbox state
      elements.sendAnotherCheckbox.checked = config.sendAnotherEnabled;
      elements.markdownCheckbox.checked = config.markdownEnabled;
      elements.sendCheckbox.checked = config.sendEnabled;
      elements.receiveCheckbox.checked = config.receiveEnabled;
      elements.zipCheckbox.checked = config.sendAsZipEnabled;
      fillBackupInputs();
      updateSettingsBodies();

      if (items.priority) {
        selectedPriority = items.priority;
      }

      if (items.lastTags) {
        // Only set tags if they weren't already set by draft restore?
        // Actually loadConfig runs before restoreDraftState, so draft state will overwrite if exists. Correct.
        tags = Array.isArray(items.lastTags) ? items.lastTags : [];
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  async function saveConfig() {
    // Read what is typed in the cards before saving
    captureSendServerInputs();
    captureSubscriptionInputs();

    // Each send server card's URL. Credentials typed into it (https://user:password@host)
    // move to that server's own fields: the URL is synced to other browsers, the credentials are
    // kept on this device only.
    const sendServers = config.sendServers.map(server => {
      const input = sendServerUrlInput(server.id);
      const split = input
        ? NtfyAPI.splitServerUrl(input.value)
        : { url: server.apiUrl, username: '', password: '' };
      if (split.username || split.password) {
        input.value = split.url;
        const own = config.sendServerCredentials[server.id]
          || (config.sendServerCredentials[server.id] = {
            accessToken: '', username: '', password: ''
          });
        if (!own.username) own.username = split.username;
        if (!own.password) own.password = split.password;
        const usernameInput = sendServerCredentialInput(server.id, 'username');
        const passwordInput = sendServerCredentialInput(server.id, 'password');
        if (usernameInput && !usernameInput.value) usernameInput.value = split.username;
        if (passwordInput && !passwordInput.value) passwordInput.value = split.password;
      }
      return { ...server, apiUrl: split.url };
    });

    // Each subscription card's server field. Credentials in a subscription URL move to that
    // subscription's own fields, unless those already hold values.
    const subscriptions = config.subscriptions.map(subscription => {
      const input = subscriptionUrlInput(subscription.id);
      const split = input
        ? NtfyAPI.splitServerUrl(input.value)
        : { url: subscription.apiUrl, username: '', password: '' };
      if (split.username || split.password) {
        input.value = split.url;
        const own = config.subscriptionCredentials[subscription.id]
          || (config.subscriptionCredentials[subscription.id] = {
            accessToken: '', username: '', password: ''
          });
        if (!own.username) own.username = split.username;
        if (!own.password) own.password = split.password;
        const usernameInput = subscriptionCredentialInput(subscription.id, 'username');
        const passwordInput = subscriptionCredentialInput(subscription.id, 'password');
        if (usernameInput && !usernameInput.value) usernameInput.value = split.username;
        if (passwordInput && !passwordInput.value) passwordInput.value = split.password;
      }
      return { ...subscription, apiUrl: split.url };
    });

    const firstSendServer = sendServers[0] || { apiUrl: '', topics: [] };
    const firstSendCredentials = config.sendServerCredentials[firstSendServer.id] || {};
    const first = subscriptions[0] || { apiUrl: '', topics: [] };
    // Per-server credentials stay on this device
    const subscriptionCredentials = config.subscriptionCredentials;
    const sendServerCredentials = config.sendServerCredentials;
    const newConfig = {
      // "ntfy.sh" is saved as "https://ntfy.sh"; the field keeps what was typed until the settings reopen
      apiUrl: NtfyAPI.normalizeServerUrl(firstSendServer.apiUrl),
      accessToken: firstSendCredentials.accessToken || '',
      username: firstSendCredentials.username || '',
      password: firstSendCredentials.password || '',
      topics: firstSendServer.topics.join(','),
      sendServers,
      sendEnabled: elements.sendCheckbox.checked,
      receiveEnabled: elements.receiveCheckbox.checked,
      subscriptions,
      // Kept for older versions, which know only one send server and one subscription
      receiveApiUrl: first.apiUrl,
      receiveTopics: first.topics.join(','),

      theme: config.theme,
      popupSize: config.popupSize,
      sendAsZipEnabled: config.sendAsZipEnabled
    };

    try {
      const { accessToken, username, password, ...syncedSettings } = newConfig;
      // The writes start right away, so they also complete when the popup is closing
      await Promise.all([
        saveToStorage(syncedSettings),
        saveToStorageLocal({ subscriptionCredentials, sendServerCredentials }),
        NtfyAPI.setAccessToken(accessToken),
        NtfyAPI.setServerCredentials(username, password)
      ]);
      config = {
        ...config,
        ...newConfig,
        // The first send server's values, for the code that still works with one server
        apiUrl: NtfyAPI.normalizeServerUrl(firstSendServer.apiUrl),
        topics: firstSendServer.topics,
        accessToken: firstSendCredentials.accessToken || '',
        username: firstSendCredentials.username || '',
        password: firstSendCredentials.password || '',
        sendServers,
        sendServerCredentials,
        subscriptions,
        subscriptionCredentials
      };

      // We don't want to full updateUI here because it might disrupt typing
      updateSettingsBodies();
      updateThemeChipsUI(); // Ensure UI reflects state
      updateSizeChipsUI();
      updateInsecureHint();
      updateMissingSettings();
      updateServerAccessUI();

    } catch (error) {
      showSettingsStatus('保存设置失败', 'error');
    }
  }

  // flush() runs a pending call right away, cancel() drops it
  function debounce(func, wait) {
    let timeout = null;
    const debounced = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = null;
        func();
      }, wait);
    };
    debounced.cancel = () => {
      clearTimeout(timeout);
      timeout = null;
    };
    debounced.flush = () => {
      if (timeout !== null) {
        debounced.cancel();
        func();
      }
    };
    return debounced;
  }

  // Settings typed in the server and token fields
  const debouncedSave = debounce(saveConfig, 1000);

  // ==================
  // WebDAV backup
  // ==================

  function fillBackupInputs() {
    const webdav = config.webdav;
    elements.backupCheckbox.checked = webdav.enabled;
    elements.backupUrlInput.value = webdav.url || '';
    elements.backupDirectoryInput.value = webdav.directory || '';
    elements.backupUsernameInput.value = webdav.username || '';
    elements.backupPasswordInput.value = webdav.password || '';
    elements.backupEncryptInput.value = webdav.encryptPassword || '';
    updateBackupLastHint();
  }

  // Reads what is typed in the backup section; called before the settings are saved
  function captureBackupInputs() {
    config.webdav = {
      ...config.webdav,
      enabled: elements.backupCheckbox.checked,
      url: elements.backupUrlInput.value.trim(),
      directory: elements.backupDirectoryInput.value.trim(),
      username: elements.backupUsernameInput.value,
      password: elements.backupPasswordInput.value,
      encryptPassword: elements.backupEncryptInput.value
    };
  }

  // The backup server's address and credentials stay on this device
  async function saveWebdavSettings() {
    captureBackupInputs();
    try {
      await saveToStorageLocal({ [WEBDAV_KEY]: config.webdav });
    } catch (error) {
      showSettingsStatus(`保存备份设置失败：${error.message}`, 'error');
    }
  }

  function updateBackupLastHint() {
    const at = config.webdav.lastBackupAt;
    elements.backupLastHint.hidden = !at;
    if (at) {
      elements.backupLastHint.textContent = `上次备份：${new Date(at).toLocaleString('zh-CN')}`;
    }
    // The warning belongs next to the buttons once there is a server to restore from
    elements.backupWarningHint.hidden = !elements.backupUrlInput.value.trim();
  }

  function setBackupBusy(busy, message) {
    [elements.backupTestBtn, elements.backupUploadBtn, elements.backupRestoreBtn,
      elements.backupExportBtn, elements.backupImportBtn].forEach(btn => {
      btn.disabled = busy;
    });
    if (message) {
      showSettingsStatus(message, 'info');
    }
  }

  // The WebDAV settings as the backup module expects them
  function webdavOptions() {
    captureBackupInputs();
    return {
      url: config.webdav.url,
      directory: config.webdav.directory,
      username: config.webdav.username,
      password: config.webdav.password
    };
  }

  // WebDAV servers usually don't allow cross-origin requests, so the extension needs access to
  // the server's site. Asked for directly from the click, where the browser allows the prompt.
  function requestWebdavAccess(url) {
    return new Promise(resolve => {
      const pattern = NtfyAPI.serverOriginPattern(url);
      if (!pattern) {
        resolve(false);
        return;
      }
      chrome.permissions.request({ origins: [pattern] }, granted => resolve(Boolean(granted)));
    });
  }

  async function handleBackupTest() {
    const options = webdavOptions();
    if (!options.url) {
      showSettingsStatus('请先填写 WebDAV 服务器地址', 'warning');
      elements.backupUrlInput.focus();
      return;
    }
    if (!(await requestWebdavAccess(options.url))) {
      showSettingsStatus('未获得该 WebDAV 服务器的访问权限', 'error');
      return;
    }
    setBackupBusy(true, '正在测试连接…');
    try {
      await NtfyBackup.test(options);
      await saveWebdavSettings();
      showSettingsStatus('连接成功', 'success');
    } catch (error) {
      showSettingsStatus(error.message, 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  // Runs right away what is still pending in the settings, so the backup holds what is on screen
  async function commitSettingsBeforeBackup() {
    addAllSendServerTopicsFromInputs();
    addAllSubscriptionTopicsFromInputs();
    debouncedSave.cancel();
    await saveConfig();
  }

  async function handleBackupUpload() {
    const options = webdavOptions();
    if (!options.url) {
      showSettingsStatus('请先填写 WebDAV 服务器地址', 'warning');
      elements.backupUrlInput.focus();
      return;
    }
    if (!(await requestWebdavAccess(options.url))) {
      showSettingsStatus('未获得该 WebDAV 服务器的访问权限', 'error');
      return;
    }
    setBackupBusy(true, '正在备份…');
    try {
      await commitSettingsBeforeBackup();
      const backup = await NtfyBackup.collect();
      const { text, encrypted } = await NtfyBackup.serialize(backup, config.webdav.encryptPassword);
      const fileUrl = await NtfyBackup.upload({ ...options, text });
      config.webdav.lastBackupAt = Date.now();
      await saveWebdavSettings();
      updateBackupLastHint();
      const host = new URL(fileUrl).host;
      showSettingsStatus(`备份成功：${host}${new URL(fileUrl).pathname}${encrypted ? '（已加密）' : ''}`, 'success');
    } catch (error) {
      showSettingsStatus(`备份失败：${error.message}`, 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackupText(text) {
    const backup = await NtfyBackup.parse(text, config.webdav.encryptPassword);
    await NtfyBackup.apply(backup);
  }

  async function handleBackupRestore() {
    const options = webdavOptions();
    if (!options.url) {
      showSettingsStatus('请先填写 WebDAV 服务器地址', 'warning');
      elements.backupUrlInput.focus();
      return;
    }
    if (!(await requestWebdavAccess(options.url))) {
      showSettingsStatus('未获得该 WebDAV 服务器的访问权限', 'error');
      return;
    }
    if (!window.confirm('从服务器还原会覆盖当前的所有设置（发送服务器、订阅、凭据），确定继续吗？')) {
      return;
    }
    setBackupBusy(true, '正在还原…');
    try {
      const text = await NtfyBackup.download(options);
      await restoreBackupText(text);
      showSettingsStatus('还原成功，正在重新载入设置…', 'success');
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setBackupBusy(false);
      showSettingsStatus(`还原失败：${error.message}`, 'error');
    }
  }

  async function handleBackupExport() {
    setBackupBusy(true);
    try {
      await commitSettingsBeforeBackup();
      const backup = await NtfyBackup.collect();
      const { text } = await NtfyBackup.serialize(backup, config.webdav.encryptPassword);
      const blobUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      const date = new Date().toISOString().slice(0, 10);
      link.download = `ntfy-extension-backup-${date}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      showSettingsStatus('备份文件已导出', 'success');
    } catch (error) {
      showSettingsStatus(`导出失败：${error.message}`, 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  function handleBackupImportClick() {
    elements.backupImportFile.value = '';
    elements.backupImportFile.click();
  }

  async function handleBackupImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!window.confirm('从文件还原会覆盖当前的所有设置（发送服务器、订阅、凭据），确定继续吗？')) {
      return;
    }
    setBackupBusy(true, '正在还原…');
    try {
      const text = await file.text();
      await restoreBackupText(text);
      showSettingsStatus('还原成功，正在重新载入设置…', 'success');
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setBackupBusy(false);
      showSettingsStatus(`还原失败：${error.message}`, 'error');
    }
  }

  // The popup closes on any click outside it, often right after typing, and its timers end with it.
  // Save what is still pending: chrome.storage writes started now still complete.
  function savePendingChanges() {
    if (isSettingsView) {
      addAllSendServerTopicsFromInputs(); // Topics typed without Enter
      addAllSubscriptionTopicsFromInputs();
      saveWebdavSettings();
    }
    debouncedSave.flush();
    if (draftSaveTimer !== null) {
      flushDraftSave().catch(error => console.error('Error saving draft:', error));
    }
  }

  // ==================
  // Server Access
  // ==================

  // Asked for only once the server's CORS headers blocked a request (NtfyAPI.checkServerAccessBlocked):
  // most servers, ntfy itself included, let the extension through. Covers both the sending and the
  // subscription server.
  async function updateServerAccessUI() {
    const sendPatterns = config.sendServers
      .map(server => NtfyAPI.serverOriginPattern(server.apiUrl))
      .filter(Boolean);
    const subscriptionPatterns = resolvedSubscriptions()
      .map(subscription => NtfyAPI.serverOriginPattern(subscription.apiUrl))
      .filter(pattern => pattern && !sendPatterns.includes(pattern));
    const patterns = [...new Set([...sendPatterns, ...subscriptionPatterns])];
    let missingPattern = null;
    try {
      const { serverAccessBlocked } = await chrome.storage.local.get('serverAccessBlocked');
      if (serverAccessBlocked && patterns.includes(serverAccessBlocked)
        && !(await chrome.permissions.contains({ origins: [serverAccessBlocked] }))) {
        missingPattern = serverAccessBlocked;
      }
    } catch (e) {
      missingPattern = null;
    }

    serverAccessMissing = Boolean(missingPattern);

    // Each send server card gets its own button when its server was blocked
    let sendMissing = false;
    elements.sendServersList.querySelectorAll('.send-server-card').forEach(card => {
      const server = findSendServer(card.dataset.sendServerId);
      const pattern = server ? NtfyAPI.serverOriginPattern(server.apiUrl) : null;
      const show = Boolean(missingPattern && pattern === missingPattern);
      const btn = card.querySelector('.send-server-access-btn');
      const hint = card.querySelector('.send-server-access-hint');
      if (btn) btn.style.display = show ? '' : 'none';
      if (hint) hint.style.display = show ? '' : 'none';
      if (show) sendMissing = true;
    });
    sendServerAccessMissing = sendMissing;

    // Each subscription card gets its own button when its server was blocked. A subscription that
    // uses a sending server is covered by that server's card while the sending section is open.
    let receiveMissing = false;
    elements.subscriptionsList.querySelectorAll('.subscription-card').forEach(card => {
      const subscription = findSubscription(card.dataset.subscriptionId);
      const pattern = subscription
        ? NtfyAPI.serverOriginPattern(resolvedSubscription(subscription).apiUrl)
        : null;
      const coveredBySend = Boolean(sendPatterns.includes(pattern) && elements.sendCheckbox.checked);
      const show = Boolean(missingPattern && pattern === missingPattern && !coveredBySend);
      const btn = card.querySelector('.subscription-access-btn');
      const hint = card.querySelector('.subscription-access-hint');
      if (btn) btn.style.display = show ? '' : 'none';
      if (hint) hint.style.display = show ? '' : 'none';
      if (show) receiveMissing = true;
    });
    receiveServerAccessMissing = receiveMissing;
    elements.settingsBtn.classList.toggle('highlight', !isConfigured() || serverAccessMissing);
    updateMissingSettings();
  }

  function requestServerAccess(pattern, apiUrl) {
    if (!pattern) {
      return;
    }

    // Called directly from the click: permissions.request needs a user gesture
    chrome.permissions.request({ origins: [pattern] }, (granted) => {
      showSettingsStatus(granted ? '已获得服务器访问权限' : '未获得服务器访问权限', granted ? 'success' : 'error');
      updateServerAccessUI();
      if (granted) {
        // Reconnect this server right away: its socket may be stuck from before the permission
        chrome.runtime.sendMessage({ action: 'reconnect', server: apiUrl });
      }
    });
  }

  // ==================
  // Theme Management
  // ==================

  function applyTheme() {
    document.body.setAttribute('data-theme', config.theme);
    updateThemeChipsUI();
  }

  function updateThemeChipsUI() {
    document.querySelectorAll('#theme-chips .chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.theme === config.theme);
    });
  }

  function applyPopupSize(size) {
    document.body.setAttribute('data-size', POPUP_SIZES.includes(size) ? size : 'medium');
  }

  function updateSizeChipsUI() {
    elements.sizeChips.querySelectorAll('.chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.size === config.popupSize);
    });
  }

  function handleSizeChange(e) {
    const chip = e.target.closest('.chip');
    if (!chip || !chip.dataset.size) return;

    config.popupSize = chip.dataset.size;
    applyPopupSize(config.popupSize);
    updateSizeChipsUI();
    try {
      localStorage.setItem(POPUP_SIZE_CACHE_KEY, config.popupSize);
    } catch (e) {}
    saveConfig();
  }

  function handleThemeChange(e) {
    const chip = e.target.closest('.chip');
    if (!chip || !chip.dataset.theme) return;

    config.theme = chip.dataset.theme;
    applyTheme();
  }

  // ==================
  // File Handling
  // ==================

  function getLocalStorage(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, items => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(items);
        }
      });
    });
  }

  function setLocalStorage(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  function removeLocalStorage(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async function readStoredFiles() {
    const result = await getLocalStorage([STORED_FILES_KEY, LEGACY_STORED_FILE_KEY]);
    let files = Array.isArray(result[STORED_FILES_KEY]) ? result[STORED_FILES_KEY] : [];

    // Keep a pending attachment created by an older extension version.
    if (files.length === 0 && result[LEGACY_STORED_FILE_KEY]) {
      files = [result[LEGACY_STORED_FILE_KEY]];
      await setLocalStorage({ [STORED_FILES_KEY]: files });
      await removeLocalStorage([LEGACY_STORED_FILE_KEY]);
    } else if (result[LEGACY_STORED_FILE_KEY]) {
      await removeLocalStorage([LEGACY_STORED_FILE_KEY]);
    }

    return files;
  }

  async function persistStoredFiles(files) {
    if (files.length > 0) {
      await setLocalStorage({ [STORED_FILES_KEY]: files });
      await removeLocalStorage([LEGACY_STORED_FILE_KEY]);
    } else {
      await removeLocalStorage([STORED_FILES_KEY, LEGACY_STORED_FILE_KEY]);
    }
  }

  async function loadStoredFiles() {
    try {
      attachments = await readStoredFiles();
      renderAttachments();
    } catch (error) {
      console.error('Error loading stored files:', error);
      attachments = [];
      renderAttachments();
    }
  }

  function renderAttachments() {
    elements.filePreview.innerHTML = '';
    elements.filePreview.classList.toggle('visible', attachments.length > 0);
    updateComposerToggleUI();
    elements.fileBtn.textContent = attachments.length > 0
      ? `📎 附加文件（${attachments.length}）`
      : '📎 附加文件';

    attachments.forEach((file, index) => {
      const preview = document.createElement('div');
      preview.className = 'file-preview-item';

      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = '📄';

      const info = document.createElement('div');
      info.className = 'file-info';

      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = file.name;

      const size = document.createElement('div');
      size.className = 'file-size';
      size.textContent = formatFileSize(file.size);

      info.appendChild(name);
      info.appendChild(size);

      const removeButton = document.createElement('button');
      removeButton.className = 'file-remove';
      removeButton.dataset.index = index;
      removeButton.title = `移除 ${file.name}`;
      removeButton.setAttribute('aria-label', `移除 ${file.name}`);
      removeButton.textContent = '×';
      removeButton.disabled = isSending;

      preview.appendChild(icon);
      preview.appendChild(info);
      preview.appendChild(removeButton);
      elements.filePreview.appendChild(preview);
    });

    elements.fileBtn.disabled = isSending;
    updateZipToggleUI();
  }

  function updateZipToggleUI() {
    const canSendAsZip = attachments.length > 1;

    elements.zipToggle.classList.toggle('visible', canSendAsZip);
    elements.zipToggle.classList.toggle('disabled', isSending);
    elements.zipCheckbox.disabled = isSending || !canSendAsZip;
    elements.zipCheckbox.checked = canSendAsZip && config.sendAsZipEnabled;
  }

  function handleZipToggleChange() {
    if (attachments.length < 2) {
      elements.zipCheckbox.checked = false;
      return;
    }

    config.sendAsZipEnabled = elements.zipCheckbox.checked;
    saveToStorage({ [SEND_AS_ZIP_SETTING_KEY]: config.sendAsZipEnabled }).catch(error => {
      console.error('Error saving ZIP preference:', error);
    });
  }

  async function checkSessionAndCleanup() {
    // Hybrid storage approach:
    // Files are stored in 'local' (large quota).
    // Session state is tracked in 'session'.
    // If 'sessionActive' is missing from 'session' storage, it means the browser restarted.
    // In that case, clear the files and draft from 'local' storage.

    try {
      const session = await new Promise(resolve => chrome.storage.session.get(['sessionActive'], resolve));

      if (!session.sessionActive) {
        console.log('New session detected, cleaning up stored files and draft');
        await removeLocalStorage([STORED_FILES_KEY, LEGACY_STORED_FILE_KEY, 'draftState']);
        await new Promise(resolve => chrome.storage.session.set({ sessionActive: true }, resolve));
      }
    } catch (error) {
      console.error('Error checking session state:', error);
    }
  }

  async function handleFileButtonClick() {
    if (isSending) return;

    // Save state first because popup will close
    await flushDraftSave();

    // Open file picker in a popup window to avoid main popup closing
    const filePickerUrl = chrome.runtime.getURL(`filepicker.html?theme=${config.theme}`);
    const width = 450;
    const height = 340;

    // Get current window to center the popup
    chrome.windows.getCurrent((currentWindow) => {
      let left = undefined;
      let top = undefined;

      if (currentWindow && currentWindow.left !== undefined && currentWindow.top !== undefined) {
        left = Math.round(currentWindow.left + (currentWindow.width - width) / 2);
        top = Math.round(currentWindow.top + (currentWindow.height - height) / 2);
      }

      chrome.windows.create({
        url: filePickerUrl,
        type: 'popup',
        width: width,
        height: height,
        left: left,
        top: top,
        focused: true
      }, (window) => {
        if (chrome.runtime.lastError) {
          console.log('Windows API error, trying tabs:', chrome.runtime.lastError);
          // Fallback to tab
          chrome.tabs.create({ url: filePickerUrl, active: true });
        }
      });
    });
  }

  async function handleAttachmentRemove(e) {
    const removeButton = e.target.closest('.file-remove');
    if (!removeButton || isSending) return;

    const index = parseInt(removeButton.dataset.index, 10);
    if (Number.isNaN(index) || index < 0 || index >= attachments.length) return;

    try {
      const updatedFiles = attachments.filter((_, fileIndex) => fileIndex !== index);
      await persistStoredFiles(updatedFiles);
      attachments = updatedFiles;
      renderAttachments();
    } catch (error) {
      console.error('Error removing file:', error);
      showStatus(`移除文件失败：${error.message}`, 'error');
    }
  }

  async function clearStoredFiles() {
    await persistStoredFiles([]);
    attachments = [];
    renderAttachments();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function saveDraftState() {
    const draft = {
      title: elements.titleInput.value,
      message: elements.messageInput.value,
      tags: tags, // Save tags array
      priority: selectedPriority
    };
    await new Promise(resolve => chrome.storage.local.set({ draftState: draft }, resolve));
  }

  function scheduleDraftSave() {
    if (draftSaveTimer !== null) {
      clearTimeout(draftSaveTimer);
    }

    draftSaveTimer = setTimeout(() => {
      draftSaveTimer = null;
      saveDraftState().catch(error => console.error('Error saving draft:', error));
    }, 250);
  }

  function cancelScheduledDraftSave() {
    if (draftSaveTimer !== null) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
  }

  async function flushDraftSave() {
    cancelScheduledDraftSave();
    await saveDraftState();
  }

  async function restoreDraftState() {
    return new Promise(resolve => {
      chrome.storage.local.get(['draftState'], (result) => {
        if (result.draftState) {
          const draft = result.draftState;
          if (typeof draft.title === 'string') elements.titleInput.value = draft.title;
          if (typeof draft.message === 'string') elements.messageInput.value = draft.message;
          if (draft.tags) {
            tags = Array.isArray(draft.tags) ? draft.tags : draft.tags.split(',').filter(Boolean);
            renderTags();
          }
          if (draft.priority) {
            selectedPriority = draft.priority;
            updatePriorityUI();
          }
          // Keep the draft until a message is sent successfully.
        }
        resolve();
      });
    });
  }

  // ==================
  // Storage Helpers
  // ==================

  function getFromStorage(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(keys, items => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(items);
        }
      });
    });
  }

  function saveToStorage(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  function getFromStorageLocal(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, items => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(items);
        }
      });
    });
  }

  function saveToStorageLocal(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  // Callback-style sendMessage, like the storage helpers: Firefox's chrome.* namespace has no promises
  function sendMessageAsync(message) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  // The link button in the message bar inserts the tab's URL. Always there, so it can say why when the
  // tab's address isn't available; then it is dimmed further.
  function updateInsertUrlButton() {
    const available = NtfyAPI.isHttpUrl(config.pageUrl);
    elements.insertUrlBtn.classList.toggle('unavailable', !available);
    elements.insertUrlBtn.setAttribute('aria-disabled', String(!available));
  }

  // Inserts the tab's URL at the cursor (replacing a selection), with a space on either side where
  // it would otherwise run into the text around it
  async function insertPageUrl() {
    const input = elements.messageInput;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    // Asked again: the popup may have opened before the browser let the extension see the tab
    if (!NtfyAPI.isHttpUrl(config.pageUrl)) {
      config.pageUrl = await getPageUrl().catch(() => '');
      updateInsertUrlButton();
    }
    const url = config.pageUrl;
    if (!NtfyAPI.isHttpUrl(url)) {
      showStatus(url
        ? '只能插入网页地址（http 或 https）'
        : '浏览器未向扩展提供此标签页的地址（例如在浏览器或扩展商店页面上）', 'warning');
      return;
    }

    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const text = (before && !/\s$/.test(before) ? ' ' : '') + url + (after && !/^\s/.test(after) ? ' ' : '');
    input.focus();
    input.setRangeText(text, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true })); // Resizes the field, saves the draft
  }

  async function getPageUrl() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tabs[0]?.url || '');
        }
      });
    });
  }

  // ==================
  // Event Listeners
  // ==================

  function setupEventListeners() {
    // View switching
    elements.settingsBtn.addEventListener('click', showSettingsView);
    elements.backBtn.addEventListener('click', leaveSettings);

    window.addEventListener('pagehide', savePendingChanges);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        savePendingChanges();
      }
    });

    elements.sendCheckbox.addEventListener('change', () => {
      updateSettingsBodies();
      updateMissingSettings();
      saveConfig();
      const firstSendServer = config.sendServers[0];
      const firstSendUrl = firstSendServer ? sendServerUrlInput(firstSendServer.id) : null;
      if (elements.sendCheckbox.checked && firstSendUrl && !firstSendUrl.value.trim()) {
        firstSendUrl.focus();
      }
    });

    elements.receiveCheckbox.addEventListener('change', () => {
      dismissReceiveHint(); // Found the setting
      updateSettingsBodies();
      updateMissingSettings();
      saveConfig();
    });

    elements.receiveHintDismiss.addEventListener('click', dismissReceiveHint);

    elements.addSendServerBtn.addEventListener('click', addSendServer);
    elements.addSubscriptionBtn.addEventListener('click', addSubscription);
    elements.sidebarToggleBtn.addEventListener('click', toggleSidebar);

    // WebDAV backup
    elements.backupCheckbox.addEventListener('change', () => {
      updateSettingsBodies();
      saveWebdavSettings();
    });
    [elements.backupUrlInput, elements.backupDirectoryInput, elements.backupUsernameInput,
      elements.backupPasswordInput, elements.backupEncryptInput].forEach(input => {
      input.addEventListener('change', saveWebdavSettings);
      input.addEventListener('input', updateBackupLastHint);
    });
    elements.backupTestBtn.addEventListener('click', handleBackupTest);
    elements.backupUploadBtn.addEventListener('click', handleBackupUpload);
    elements.backupRestoreBtn.addEventListener('click', handleBackupRestore);
    elements.backupExportBtn.addEventListener('click', handleBackupExport);
    elements.backupImportBtn.addEventListener('click', handleBackupImportClick);
    elements.backupImportFile.addEventListener('change', handleBackupImport);

    // Keep the composer text available if the popup closes before sending.
    elements.titleInput.addEventListener('input', () => {
      updateComposerToggleUI();
      scheduleDraftSave();
    });
    elements.messageInput.addEventListener('input', () => {
      autoSizeMessageInput();
      scheduleDraftSave();
    });
    // In the message bar Enter sends, like in the ntfy web app, and Shift+Enter starts a new line.
    // Below the title (options open) Enter starts a new line and Ctrl+Enter sends.
    elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const optionsOpen = elements.composer.classList.contains('options-open');
      if (optionsOpen ? e.ctrlKey : !e.shiftKey) {
        e.preventDefault();
        sendNotification();
      }
    });


    // Theme chips
    elements.sizeChips.addEventListener('click', handleSizeChange);

    elements.themeChips.addEventListener('click', (e) => {
      handleThemeChange(e);
      saveConfig();
    });

    // Open ntfy URL
    elements.openUrlBtn.addEventListener('click', openNtfyUrl);

    // Send message
    elements.sendBtn.addEventListener('click', sendNotification);
    elements.insertUrlBtn.addEventListener('click', insertPageUrl);

    // Send another checkbox - save state on change
    elements.sendAnotherCheckbox.addEventListener('change', () => {
      config.sendAnotherEnabled = elements.sendAnotherCheckbox.checked;
      saveToStorage({ sendAnotherEnabled: config.sendAnotherEnabled });
    });

    // Format as Markdown: remembered like Send another
    elements.markdownCheckbox.addEventListener('change', () => {
      config.markdownEnabled = elements.markdownCheckbox.checked;
      saveToStorage({ markdownEnabled: config.markdownEnabled });
      updateComposerToggleUI();
    });

    // Send multiple attachments either individually or as one ZIP.
    elements.zipCheckbox.addEventListener('change', handleZipToggleChange);

    // File handling
    elements.fileBtn.addEventListener('click', handleFileButtonClick);
    elements.filePreview.addEventListener('click', handleAttachmentRemove);

    // Priority chips
    elements.priorityChips.addEventListener('click', handlePriorityClick);

    // Tags handling (badges)
    elements.newTagInput.addEventListener('keydown', handleTagKeydown);
    elements.newTagInput.addEventListener('input', updateTagInputHint);
    elements.tagsContainer.addEventListener('click', handleTagRemove);
    elements.emojiBtn.addEventListener('click', () => setEmojiPickerOpen(elements.emojiPicker.hidden));
    elements.emojiSearch.addEventListener('input', filterEmojis);
    elements.emojiList.addEventListener('click', handleEmojiPick);
    // Follows the field when the options scroll or the popup changes size
    elements.composerOptions.addEventListener('scroll', positionEmojiPicker);
    window.addEventListener('resize', positionEmojiPicker);

    // Further send options above the message bar
    elements.composerToggle.addEventListener('click', () => {
      if (!config.receiveEnabled) return; // Always open without receiving
      setComposerOptionsOpen(!elements.composer.classList.contains('options-open'));
    });


    elements.notifyCheckbox.addEventListener('change', handleNotifyToggle);
    elements.pullBtn.addEventListener('click', handlePullAll);

    // Bulk actions
    elements.markAllReadBtn.addEventListener('click', handleMarkAllRead);
    elements.deleteAllBtn.addEventListener('click', handleDeleteAll);

    // Listen for storage changes for live UI updates and external picker
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes[STORED_FILES_KEY] || changes[LEGACY_STORED_FILE_KEY]) {
          loadStoredFiles();
        }
        if (changes.receivedNotifications || changes.readMessageIds || changes.deletedMessageIds
          || changes.notificationsMuted || changes.mutedTopics) {
          scheduleNotificationsRefresh();
        }
        if (changes.serverAccessBlocked) {
          updateServerAccessUI();
        }
        if (changes.readAccessDenied) {
          readAccessDenied = changes.readAccessDenied.newValue || {};
          updateAccessDeniedHint();
          scheduleNotificationsRefresh();
        }
      }
    });

    // Rebuilding the list between press and release swallows the click on its buttons, so hold
    // refreshes back while a press is on it
    elements.notificationsList.addEventListener('pointerdown', () => {
      listPointerDown = true;
    });
    document.addEventListener('pointerup', releaseListPointer);
    document.addEventListener('pointercancel', releaseListPointer);

    // An armed delete button disarms on a click anywhere else or on Escape. Bubbling, so the click
    // that armed it has already been handled and is let through.
    document.addEventListener('click', (e) => {
      if (pendingDeleteId && !e.target.closest('.delete-btn.confirming')) {
        clearPendingDelete();
      }
      if (deleteAllArmed && !e.target.closest('#delete-all-btn')) {
        setDeleteAllArmed(false);
      }
      if (!elements.emojiPicker.hidden && !e.target.closest('#emoji-picker, #emoji-btn')) {
        setEmojiPickerOpen(false);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.emojiPicker.hidden) {
        e.preventDefault(); // Keeps the popup open
        setEmojiPickerOpen(false);
        elements.emojiBtn.focus();
        return;
      }
      if (e.key === 'Escape' && (pendingDeleteId || deleteAllArmed)) {
        e.preventDefault(); // Keeps the popup open
        clearPendingDelete();
        setDeleteAllArmed(false);
      }
    });

    setupTooltips();

    // Global keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);
    document.addEventListener('keyup', handleGlobalKeyup);
    window.addEventListener('blur', () => {
      rightCtrlDown = false;
    });
  }

  // ==================
  // View Switching
  // ==================

  // Shows the main view or the settings with their header, and remembers which for the next open
  function setViewChrome(settings) {
    elements.mainView.classList.toggle('active', !settings);
    elements.settingsView.classList.toggle('active', settings);
    elements.backBtn.classList.toggle('visible', settings);
    elements.settingsBtn.style.display = settings ? 'none' : '';
    elements.openUrlBtn.style.display = settings ? 'none' : '';
    elements.headerText.textContent = settings ? '设置' : chrome.runtime.getManifest().name;
    isSettingsView = settings;
    try {
      localStorage.setItem(LAST_VIEW_KEY, settings ? 'settings' : 'main');
    } catch (e) {}
  }

  function showSettingsView() {
    elements.sendCheckbox.checked = config.sendEnabled;
    elements.receiveCheckbox.checked = config.receiveEnabled;
    fillBackupInputs();
    updateSettingsBodies();
    renderSendServers(); // Render send server cards
    renderSubscriptions();
    updateInsecureHint();
    updateServerAccessUI();

    updateThemeChipsUI();
    updateSizeChipsUI();

    setViewChrome(true);

    // During setup, start in the first setting still missing
    updateMissingSettings();
    const firstSendServer = config.sendServers[0];
    const firstSendUrl = firstSendServer ? sendServerUrlInput(firstSendServer.id) : null;
    if (config.sendEnabled && firstSendUrl && !firstSendUrl.value.trim()) {
      firstSendUrl.focus();
    } else if (config.sendEnabled && allSendTopics().length === 0) {
      const server = config.sendServers.find(candidate => candidate.apiUrl) || firstSendServer;
      const topicInput = server ? sendServerTopicInput(server.id) : null;
      if (topicInput) topicInput.focus();
    } else if (serverAccessMissing) {
      const accessButton = [...elements.settingsView.querySelectorAll('.send-server-access-btn, .subscription-access-btn')]
        .find(button => button.style.display !== 'none');
      if (accessButton) accessButton.focus();
    } else if (config.receiveEnabled && effectiveSubscriptions().length === 0) {
      elements.addSubscriptionBtn.focus();
    }
  }

  // Credentials over http are readable by anyone on the way to the server
  function updateInsecureHint() {
    const credentialInputs = [
      ...elements.sendServersList.querySelectorAll('.send-server-credential-input'),
      ...elements.subscriptionsList.querySelectorAll('.subscription-credential-input')
    ];
    const hasCredentials = credentialInputs.some(input => input.value !== '');
    const urls = [
      ...[...elements.sendServersList.querySelectorAll('.send-server-url-input')].map(input => input.value),
      ...subscriptionUrlValues()
    ].map(url => NtfyAPI.normalizeServerUrl(url)).filter(Boolean);
    const show = hasCredentials && urls.some(url => /^http:\/\//i.test(url));
    elements.insecureHint.hidden = !show;
    elements.receiveInsecureHint.hidden = !show;
  }

  // Marks the settings needed to send and receive while they are empty, and the server while
  // its access token can't be used yet (same conditions as the settings button highlight)
  function updateMissingSettings() {
    const sendReady = config.sendServers.some(server =>
      server.apiUrl.trim() && server.topics.length > 0);
    const sendIncomplete = config.sendServers.some(server =>
      (server.apiUrl.trim() || server.topics.length > 0)
      && !(server.apiUrl.trim() && server.topics.length > 0));
    elements.sendSection.classList.toggle('missing',
      elements.sendCheckbox.checked
        && (!sendReady || sendIncomplete || sendServerAccessMissing));
    elements.receiveSection.classList.toggle('missing',
      elements.receiveCheckbox.checked
        && (effectiveSubscriptions().length === 0 || receiveServerAccessMissing));
  }

  // The settings sections open only while their feature is switched on
  function updateSettingsBodies() {
    elements.sendSectionBody.hidden = !elements.sendCheckbox.checked;
    elements.receiveSectionBody.hidden = !elements.receiveCheckbox.checked;
    elements.backupSectionBody.hidden = !elements.backupCheckbox.checked;
    updateAccessDeniedHint();
  }

  // Saves right away what is still pending (typed topic, debounced URL or token), so the main
  // view shows the settings as entered
  async function leaveSettings() {
    if (!addAllSendServerTopicsFromInputs()) {
      return;
    }
    if (!addAllSubscriptionTopicsFromInputs()) {
      return;
    }
    debouncedSave.cancel();
    await saveConfig();
    showMainView();
  }

  function showMainView() {
    setViewChrome(false);

    // Refresh UI to reflect any changes made in settings
    updateUI();
    loadNotifications();
  }

  // Hides the topic list with the button in the heading's control bar. The selected topic stays
  // selected, so its messages stay visible.
  function toggleSidebar() {
    sidebarHidden = !sidebarHidden;
    applySidebarVisibility();
    try {
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, sidebarHidden ? '1' : '0');
    } catch (e) {}
  }

  function applySidebarVisibility() {
    elements.mainView.classList.toggle('sidebar-hidden', sidebarHidden);
    elements.sidebarToggleBtn.classList.toggle('collapsed', sidebarHidden);
    const label = sidebarHidden ? '显示主题列表' : '隐藏主题列表';
    elements.sidebarToggleBtn.title = label;
    elements.sidebarToggleBtn.setAttribute('aria-label', label);
    elements.sidebarToggleBtn.setAttribute('aria-expanded', String(!sidebarHidden));
  }

  // ==================
  // UI Updates
  // ==================

  // Sending or receiving is set up: at least one of the two has a server and a topic
  function isConfigured() {
    const sendConfigured = Boolean(config.sendEnabled && config.sendServers.some(server =>
      NtfyAPI.normalizeServerUrl(server.apiUrl) && server.topics.length > 0));
    const receiveConfigured = Boolean(config.receiveEnabled && effectiveSubscriptions().length > 0);
    return sendConfigured || receiveConfigured;
  }

  function updateUI() {
    // Highlight the settings button until the extension is set up
    elements.settingsBtn.classList.toggle('highlight', !isConfigured() || serverAccessMissing);

    // Enable/disable the open URL button based on the features that are switched on
    const canOpen = (config.sendEnabled
      && config.sendServers.some(server => NtfyAPI.normalizeServerUrl(server.apiUrl)))
      || (config.receiveEnabled && effectiveSubscriptions().length > 0);
    elements.openUrlBtn.disabled = !canOpen;

    updatePriorityUI();
  }

  // The composer sends to the selected topic, so it is there only while one is: a topic configured
  // for sending. Without receiving there are no messages to show, so its options are always open.
  function updateComposer() {
    const entry = currentTopicEntry();
    const topic = entry && entry.kind !== 'all' ? entry.topic : null;
    const canSend = Boolean(config.sendEnabled && topic && sendServerForTopic(topic));
    elements.composer.hidden = !canSend;
    elements.composerToggle.hidden = !config.receiveEnabled;
    elements.notificationsTitle.textContent = entry ? topicEntryLabel(entry) : '全部主题';
    const optionsOpen = elements.composer.classList.contains('options-open');
    if (!config.receiveEnabled) {
      if (!optionsOpen) {
        setComposerOptionsOpen(true);
      }
    } else if (!canSend && optionsOpen) {
      setComposerOptionsOpen(false);
    }
    if (canSend) {
      autoSizeMessageInput();
    }
  }

  // Open options take the message field below the title, closed ones give it back to the bar
  function setComposerOptionsOpen(open) {
    const input = elements.messageInput;
    const hadFocus = document.activeElement === input;
    if (open) {
      elements.messageSlot.appendChild(elements.composerField);
    } else {
      elements.composerToggle.after(elements.composerField);
    }
    input.rows = open ? 3 : 1;
    if (hadFocus) {
      input.focus();
    }

    elements.composer.classList.toggle('options-open', open);
    elements.composerToggle.setAttribute('aria-expanded', String(open));
    elements.composerToggle.title = open ? '收起选项' : '更多选项';
    autoSizeMessageInput();
  }

  // A dot on the arrow button while the closed options hold a title, files, or Markdown formatting
  function updateComposerToggleUI() {
    const hasExtras = attachments.length > 0 || elements.titleInput.value.trim() !== ''
      || elements.markdownCheckbox.checked;
    elements.composerToggle.classList.toggle('has-extras', hasExtras);
  }

  // The message field grows with its text, up to a few lines (more below the title)
  function autoSizeMessageInput() {
    const input = elements.messageInput;
    input.style.height = 'auto';
    if (!input.scrollHeight) {
      return; // Hidden: sized when the composer shows
    }
    const border = input.offsetHeight - input.clientHeight;
    const maxHeight = elements.composer.classList.contains('options-open') ? 200 : 120;
    input.style.height = `${Math.min(input.scrollHeight + border, maxHeight)}px`;
  }

  function updatePriorityUI() {
    document.querySelectorAll('#priority-chips .chip').forEach(chip => {
      const priority = parseInt(chip.dataset.priority, 10);
      chip.classList.toggle('active', priority === selectedPriority);
    });
  }



  function showStatus(message, type) {
    showStatusIn(elements.status, message, type);
  }

  function showSettingsStatus(message, type) {
    showStatusIn(elements.settingsStatus, message, type);
  }

  // Each message shows for 3 s; a new one restarts the time, so an older timer can't hide it early
  const statusTimers = new Map();
  function showStatusIn(element, message, type) {
    element.textContent = message;
    element.className = `status visible ${type}`;

    clearTimeout(statusTimers.get(element));
    statusTimers.set(element, setTimeout(() => {
      element.classList.remove('visible');
    }, 3000));
  }

  // ==================
  // Drag and Drop
  // ==================

  function setupDragAndDrop(element, index, type, groupId = null) {
    element.draggable = true;

    element.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      dragType = type;
      dragGroupId = groupId;
      element.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
    });

    element.addEventListener('dragend', () => {
      element.classList.remove('dragging');
      element.classList.remove('drag-over');
      dragSrcIndex = null;
      dragType = null;
      dragGroupId = null;
    });

    element.addEventListener('dragover', (e) => {
      e.preventDefault(); // Necessary to allow dropping
      e.dataTransfer.dropEffect = 'move';
      return false;
    });

    element.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (dragType === type && dragSrcIndex !== index
        && (!['subscriptionTopic', 'sendTopic'].includes(type) || dragGroupId === groupId)) {
        element.classList.add('drag-over');
      }
    });

    element.addEventListener('dragleave', (e) => {
      element.classList.remove('drag-over');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      element.classList.remove('drag-over');

      if (dragType !== type) return;
      if ((type === 'subscriptionTopic' || type === 'sendTopic') && dragGroupId !== groupId) return;
      if (dragSrcIndex === null) return;
      if (dragSrcIndex === index) return;

      // Adjust index if moving item from earlier position to later position
      // because removal shifts indices
      // Note: Splice logic actually handles "insert at index" naturally,
      // but interpretation of "drop on" varies.
      // Current implementation: Remove then Insert.

      // We will perform the move in the data model and re-render.
      // Since we re-render, the dragend might not fire on the original element,
      // so we reset state here too.

      const srcIdx = dragSrcIndex;
      dragSrcIndex = null;
      dragType = null;
      dragGroupId = null;

      if (type === 'tag') {
        const item = tags[srcIdx];
        tags.splice(srcIdx, 1);
        tags.splice(index, 0, item);
        renderTags();
        saveToStorage({ lastTags: [...tags] });
      } else if (type === 'sendTopic') {
        const server = findSendServer(groupId);
        if (!server) return;
        const item = server.topics[srcIdx];
        server.topics.splice(srcIdx, 1);
        server.topics.splice(index, 0, item);
        renderSendServers();
        saveConfig();
        updateServerAccessUI();
      } else if (type === 'subscriptionTopic') {
        const subscription = findSubscription(groupId);
        if (!subscription) return;
        const item = subscription.topics[srcIdx];
        subscription.topics.splice(srcIdx, 1);
        subscription.topics.splice(index, 0, item);
        renderSubscriptions();
        saveConfig();
        updateServerAccessUI();
      }
    });
  }

  // ==================
  // Tags Handling
  // ==================

  function renderTags() {
    // Clear current badges but keep input
    const badges = elements.tagsContainer.querySelectorAll('.tag-badge');
    badges.forEach(b => b.remove());

    // Insert badges before input
    tags.forEach((tag, index) => {
      const badge = document.createElement('div');
      badge.className = 'tag-badge';
      badge.textContent = tag;

      setupDragAndDrop(badge, index, 'tag');

      const removeSpan = document.createElement('span');
      removeSpan.className = 'tag-remove';
      removeSpan.dataset.index = index;
      removeSpan.textContent = '×';
      badge.appendChild(removeSpan);
      elements.tagsContainer.insertBefore(badge, elements.newTagInput);
    });
    elements.newTagInput.placeholder = tags.length ? '' : '输入标签或表情名称，例如 warning';
    positionEmojiPicker(); // The field may have got another line
  }

  function handleTagKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = elements.newTagInput.value.trim();

      if (value) {
        addTag(value);
        elements.newTagInput.value = '';
        updateTagInputHint(); // Hide hint after clearing
      }
    } else if (e.key === 'Backspace' && !elements.newTagInput.value) {
      // Remove last tag if input is empty
      if (tags.length > 0) {
        tags.pop();
        renderTags();
        saveToStorage({ lastTags: [...tags] });
      }
    }
  }

  function addTag(value) {
    if (!tags.includes(value)) {
      tags.push(value);
      renderTags();
      saveToStorage({ lastTags: [...tags] });
    }
  }

  // Emoji picker: built on first use; stays open for picking several, like ntfy's
  function setEmojiPickerOpen(open) {
    if (open && !elements.emojiList.hasChildNodes()) {
      buildEmojiList();
    }
    elements.emojiPicker.hidden = !open;
    elements.emojiBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      positionEmojiPicker();
      elements.emojiSearch.focus();
    }
  }

  // Above the tags field, its right edge at the field's. Fixed, so the scrolling options don't
  // cut it off. Lengths set on it are zoomed with the page, measured ones are not: divide by the zoom.
  function positionEmojiPicker() {
    if (elements.emojiPicker.hidden) return;
    const picker = elements.emojiPicker;
    const field = elements.tagsContainer.getBoundingClientRect();
    const zoom = field.height / elements.tagsContainer.offsetHeight || 1;
    const margin = 8;
    const viewportWidth = window.innerWidth / zoom;

    // Gets smaller if there isn't enough room above the field
    picker.style.maxHeight = `${Math.max(field.top / zoom - 4 - margin, 120)}px`;
    picker.style.maxWidth = `${viewportWidth - 2 * margin}px`;
    const left = Math.min(field.right / zoom, viewportWidth - margin) - picker.offsetWidth;
    picker.style.left = `${Math.max(left, margin)}px`;
    picker.style.top = `${Math.max(field.top / zoom - 4 - picker.offsetHeight, margin)}px`;
  }

  function buildEmojiList() {
    Emojis.pickerCategories().forEach(category => {
      const heading = document.createElement('div');
      heading.className = 'emoji-category';
      heading.textContent = category.name;
      elements.emojiList.appendChild(heading);

      category.emojis.forEach(emoji => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'emoji-option';
        option.textContent = emoji.emoji;
        option.title = emoji.title;
        option.setAttribute('aria-label', emoji.title);
        option.dataset.tag = emoji.tag;
        option.emoji = emoji; // For the search
        elements.emojiList.appendChild(option);
      });
    });
  }

  // Like ntfy: any of the words may match, and the category names hide while searching
  function filterEmojis() {
    const words = elements.emojiSearch.value.toLowerCase().split(' ').filter(Boolean);
    elements.emojiList.classList.toggle('searching', words.length > 0);
    elements.emojiList.querySelectorAll('.emoji-option').forEach(option => {
      option.hidden = !Emojis.matches(option.emoji, words);
    });
  }

  function handleEmojiPick(e) {
    const option = e.target.closest('.emoji-option');
    if (option) {
      addTag(option.dataset.tag);
    }
  }

  function updateTagInputHint() {
    elements.tagInputHint.classList.toggle('visible', elements.newTagInput.value.length > 0);
  }

  function handleTagRemove(e) {
    if (e.target.classList.contains('tag-remove')) {
      const index = parseInt(e.target.dataset.index, 10);
      tags.splice(index, 1);
      renderTags();
      saveToStorage({ lastTags: [...tags] });
    }

    // Focus input if clicking on container
    if (e.target === elements.tagsContainer) {
      elements.newTagInput.focus();
    }
  }

  // ==================
  // Priority Handling
  // ==================

  function handlePriorityClick(e) {
    const chip = e.target.closest('.chip');
    if (!chip || !chip.dataset.priority) return;

    selectedPriority = parseInt(chip.dataset.priority, 10);
    updatePriorityUI();

    // Persist priority
    saveToStorage({ priority: selectedPriority });
  }

  // ==================
  // Topics Handling
  // ==================

  // A subscription as it is used: its server falls back to the first send server, its topics to
  // that server's sending topics
  function resolvedSubscription(subscription) {
    const apiUrl = NtfyAPI.normalizeServerUrl(subscription.apiUrl) || config.apiUrl;
    const sendServer = config.sendServers.find(server =>
      NtfyAPI.normalizeServerUrl(server.apiUrl) === apiUrl);
    return {
      id: subscription.id,
      apiUrl,
      topics: subscription.topics.length > 0
        ? subscription.topics
        : (sendServer ? sendServer.topics : config.topics)
    };
  }

  function resolvedSubscriptions() {
    return config.subscriptions.map(resolvedSubscription);
  }

  // Subscriptions that can actually receive: a server and at least one topic
  function effectiveSubscriptions() {
    return resolvedSubscriptions().filter(subscription =>
      subscription.apiUrl && subscription.topics.length > 0);
  }

  // Whether a received message belongs to one of the subscriptions. Messages stored by older
  // versions have no server, so their topic alone decides.
  function isReceivedNotification(notification, subscriptions = effectiveSubscriptions()) {
    return subscriptions.some(subscription =>
      subscription.topics.includes(notification.topic)
      && (!notification.server || notification.server === subscription.apiUrl));
  }

  // All topics received from the subscriptions, without duplicates
  function effectiveReceiveTopics() {
    const topics = [];
    effectiveSubscriptions().forEach(subscription => {
      subscription.topics.forEach(topic => {
        if (!topics.includes(topic)) {
          topics.push(topic);
        }
      });
    });
    return topics;
  }

  // The topic list of the main view: All topics (when receiving), one entry per subscription topic,
  // then the sending topics that no subscription receives. Topics of different subscriptions stay
  // apart even when they have the same name; a remark can tell them apart.
  function topicEntries() {
    const entries = [];
    if (config.receiveEnabled) {
      entries.push({ key: 'all', kind: 'all', topic: 'all' });
      effectiveSubscriptions().forEach(subscription => {
        subscription.topics.forEach(topic => {
          entries.push({
            key: `sub:${subscription.id}:${topic}`,
            kind: 'subscription',
            topic,
            apiUrl: subscription.apiUrl
          });
        });
      });
    }
    if (config.sendEnabled) {
      allSendTopics().forEach(topic => {
        if (!entries.some(entry => entry.kind !== 'all' && entry.topic === topic)) {
          entries.push({ key: `send:${topic}`, kind: 'send', topic });
        }
      });
    }
    return entries;
  }

  function findTopicEntry(key) {
    return topicEntries().find(entry => entry.key === key) || null;
  }

  function currentTopicEntry() {
    return findTopicEntry(receiveFilter);
  }

  // What the sidebar shows for an entry: its remark, or the topic name
  function topicEntryLabel(entry) {
    if (entry.kind === 'all') {
      return '全部主题';
    }
    return topicRemarks[entry.key] || entry.topic;
  }

  // Whether a received message belongs to a sidebar entry. Two subscriptions may receive the same
  // topic name from different servers, so their messages stay apart.
  function matchesTopicEntry(notification, entry) {
    if (!entry) return false;
    if (entry.kind === 'all') return true;
    if (notification.topic !== entry.topic) return false;
    return entry.kind !== 'subscription'
      || !notification.server
      || notification.server === entry.apiUrl;
  }

  function newSubscriptionId() {
    return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createSubscription(apiUrl = '', topics = []) {
    return { id: newSubscriptionId(), apiUrl, topics: [...topics] };
  }

  function findSubscription(id) {
    return config.subscriptions.find(subscription => subscription.id === id) || null;
  }

  function subscriptionUrlInput(id) {
    return [...elements.subscriptionsList.querySelectorAll('.subscription-url-input')]
      .find(input => input.dataset.subscriptionId === id) || null;
  }

  function subscriptionCard(id) {
    return [...elements.subscriptionsList.querySelectorAll('.subscription-card')]
      .find(card => card.dataset.subscriptionId === id) || null;
  }

  function subscriptionUrlValues() {
    return [...elements.subscriptionsList.querySelectorAll('.subscription-url-input')]
      .map(input => input.value);
  }

  function subscriptionCredentialInput(id, field) {
    return [...elements.subscriptionsList.querySelectorAll(`.subscription-credential-${field}`)]
      .find(input => input.dataset.subscriptionId === id) || null;
  }

  // Keeps what was typed in the subscription cards before they are rebuilt, so adding a topic or
  // removing another subscription doesn't reset a server URL or credentials that weren't saved yet.
  // Does nothing while the settings (and with them the cards) aren't rendered.
  function captureSubscriptionInputs() {
    const cards = [...elements.subscriptionsList.querySelectorAll('.subscription-card')];
    if (cards.length === 0) return;

    const credentials = {};
    cards.forEach(card => {
      const id = card.dataset.subscriptionId;
      const subscription = findSubscription(id);
      if (!subscription) return;
      const serverInput = card.querySelector('.subscription-url-input');
      if (serverInput) subscription.apiUrl = serverInput.value;

      const own = {
        accessToken: subscriptionCredentialInput(id, 'token')?.value || '',
        username: subscriptionCredentialInput(id, 'username')?.value || '',
        password: subscriptionCredentialInput(id, 'password')?.value || ''
      };
      if (own.accessToken || own.username || own.password) {
        credentials[id] = own;
      }
    });
    config.subscriptionCredentials = credentials;
  }

  // ==================
  // Send servers
  // ==================

  function newSendServerId() {
    return `send_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createSendServer(apiUrl = '', topics = []) {
    return { id: newSendServerId(), apiUrl, topics: [...topics] };
  }

  function findSendServer(id) {
    return config.sendServers.find(server => server.id === id) || null;
  }

  function sendServerUrlInput(id) {
    return [...elements.sendServersList.querySelectorAll('.send-server-url-input')]
      .find(input => input.dataset.sendServerId === id) || null;
  }

  function sendServerTopicInput(id) {
    return [...elements.sendServersList.querySelectorAll('.send-server-topic-input')]
      .find(input => input.dataset.sendServerId === id) || null;
  }

  function sendServerCredentialInput(id, field) {
    return [...elements.sendServersList.querySelectorAll(`.send-server-credential-${field}`)]
      .find(input => input.dataset.sendServerId === id) || null;
  }

  // All sending topics, without duplicates. A topic on several servers is sent to the first one.
  function allSendTopics() {
    const topics = [];
    config.sendServers.forEach(server => {
      server.topics.forEach(topic => {
        if (!topics.includes(topic)) {
          topics.push(topic);
        }
      });
    });
    return topics;
  }

  // The send server a topic belongs to; null when no server has both a URL and the topic
  function sendServerForTopic(topic) {
    return config.sendServers.find(server =>
      NtfyAPI.normalizeServerUrl(server.apiUrl) && server.topics.includes(topic)) || null;
  }

  // The ntfy request settings of one send server
  function sendServerConfig(server) {
    const credentials = config.sendServerCredentials[server.id] || {};
    return {
      apiUrl: NtfyAPI.normalizeServerUrl(server.apiUrl),
      accessToken: credentials.accessToken || '',
      username: credentials.username || '',
      password: credentials.password || ''
    };
  }

  // Keeps what was typed in the send server cards before they are rebuilt, so adding a topic or
  // removing another server doesn't reset a URL or credentials that weren't saved yet.
  function captureSendServerInputs() {
    const cards = [...elements.sendServersList.querySelectorAll('.send-server-card')];
    if (cards.length === 0) return;

    const credentials = {};
    cards.forEach(card => {
      const id = card.dataset.sendServerId;
      const server = findSendServer(id);
      if (!server) return;
      const serverInput = card.querySelector('.send-server-url-input');
      if (serverInput) server.apiUrl = serverInput.value;

      const own = {
        accessToken: sendServerCredentialInput(id, 'token')?.value || '',
        username: sendServerCredentialInput(id, 'username')?.value || '',
        password: sendServerCredentialInput(id, 'password')?.value || ''
      };
      if (own.accessToken || own.username || own.password) {
        credentials[id] = own;
      }
    });
    config.sendServerCredentials = credentials;
  }

  // One card per send server: its own server, topics and credentials
  function renderSendServers() {
    captureSendServerInputs();
    elements.sendServersList.replaceChildren(
      ...config.sendServers.map((server, index) => createSendServerCard(server, index))
    );
    updateMissingSettings();
  }

  function createSendServerCard(server, index) {
    const card = document.createElement('div');
    card.className = 'subscription-card send-server-card';
    card.dataset.sendServerId = server.id;

    const header = document.createElement('div');
    header.className = 'subscription-header';

    const title = document.createElement('span');
    title.className = 'subscription-title';
    title.textContent = `发送服务器 ${index + 1}`;
    header.appendChild(title);

    if (config.sendServers.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'subscription-remove-btn';
      removeBtn.title = '删除此发送服务器';
      removeBtn.setAttribute('aria-label', '删除此发送服务器');
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => removeSendServer(server.id));
      header.appendChild(removeBtn);
    }
    card.appendChild(header);

    // Server
    const serverGroup = document.createElement('div');
    serverGroup.className = 'form-group';

    const serverLabel = document.createElement('label');
    serverLabel.className = 'form-label';
    serverLabel.textContent = '服务器地址';

    const serverInput = document.createElement('input');
    serverInput.type = 'text';
    serverInput.className = 'form-input send-server-url-input';
    serverInput.placeholder = 'https://ntfy.sh';
    serverInput.value = server.apiUrl;
    serverInput.dataset.sendServerId = server.id;
    serverInput.setAttribute('aria-label', `发送服务器 ${index + 1} 的地址`);
    serverInput.addEventListener('input', () => {
      updateMissingSettings();
      updateInsecureHint();
      debouncedSave();
    });
    serverInput.addEventListener('change', debouncedSave.flush);

    const accessBtn = document.createElement('button');
    accessBtn.type = 'button';
    accessBtn.className = 'chip send-server-access-btn';
    accessBtn.style.display = 'none';
    accessBtn.textContent = '🔓 允许访问此服务器';
    accessBtn.addEventListener('click', () => {
      const current = findSendServer(server.id);
      const apiUrl = current ? current.apiUrl : '';
      requestServerAccess(NtfyAPI.serverOriginPattern(apiUrl), apiUrl);
    });

    const accessHint = document.createElement('p');
    accessHint.className = 'form-hint send-server-access-hint';
    accessHint.style.display = 'none';
    accessHint.textContent = '你的发送服务器阻止了扩展的请求。允许访问后，扩展才能使用该服务器发送消息。';

    serverGroup.append(serverLabel, serverInput, accessBtn, accessHint);

    // Topics
    const topicsGroup = document.createElement('div');
    topicsGroup.className = 'form-group';

    const topicsLabel = document.createElement('label');
    topicsLabel.className = 'form-label';
    topicsLabel.textContent = '发送主题';

    const topicsContainer = document.createElement('div');
    topicsContainer.className = 'topics-container send-server-topics-container';
    topicsContainer.dataset.sendServerId = server.id;

    server.topics.forEach((topic, topicIndex) => {
      topicsContainer.appendChild(
        createTopicBadge(topic, topicIndex, 'sendTopic', server.id)
      );
    });

    const topicInput = document.createElement('input');
    topicInput.type = 'text';
    topicInput.className = 'topic-input-field send-server-topic-input';
    topicInput.dataset.sendServerId = server.id;
    topicInput.placeholder = server.topics.length ? '' : '输入主题名，例如 alerts';
    topicInput.setAttribute('aria-label', `添加发送服务器 ${index + 1} 的主题`);

    const topicHint = document.createElement('span');
    topicHint.className = 'topic-input-hint';
    topicHint.textContent = '按回车添加主题';

    topicInput.addEventListener('keydown', (e) => handleSendServerTopicKeydown(e, server.id));
    topicInput.addEventListener('blur', () => addSendServerTopicFromInput(server.id));
    topicInput.addEventListener('input', () => {
      topicHint.classList.toggle('visible', topicInput.value.length > 0);
    });
    topicsContainer.addEventListener('click', (e) => handleSendServerTopicRemove(e, server.id));
    topicsContainer.append(topicInput, topicHint);

    const topicsHint = document.createElement('p');
    topicsHint.className = 'form-hint';
    topicsHint.textContent = '用于发送的主题。拖动可调整顺序。';

    topicsGroup.append(topicsLabel, topicsContainer, topicsHint);

    // Credentials for this server
    const own = config.sendServerCredentials[server.id] || {};
    const credentialsDetails = document.createElement('details');
    credentialsDetails.className = 'subscription-credentials send-server-credentials';
    credentialsDetails.open = true;

    const credentialsSummary = document.createElement('summary');
    credentialsSummary.textContent = '此服务器的访问凭据（可选）';
    credentialsDetails.appendChild(credentialsSummary);

    const credentialsHint = document.createElement('p');
    credentialsHint.className = 'form-hint';
    credentialsHint.textContent = '仅用于这个发送服务器；不同服务器互不影响。';

    const tokenInput = document.createElement('input');
    tokenInput.type = 'password';
    tokenInput.className = 'form-input send-server-credential-input send-server-credential-token';
    tokenInput.placeholder = '访问令牌，例如 tk_...';
    tokenInput.value = own.accessToken || '';
    tokenInput.dataset.sendServerId = server.id;
    tokenInput.setAttribute('aria-label', `发送服务器 ${index + 1} 的访问令牌`);

    const credentialsRow = document.createElement('div');
    credentialsRow.className = 'credentials-row';

    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.className = 'form-input send-server-credential-input send-server-credential-username';
    usernameInput.placeholder = '用户名';
    usernameInput.autocomplete = 'off';
    usernameInput.value = own.username || '';
    usernameInput.dataset.sendServerId = server.id;
    usernameInput.setAttribute('aria-label', `发送服务器 ${index + 1} 的用户名`);

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.className = 'form-input send-server-credential-input send-server-credential-password';
    passwordInput.placeholder = '密码';
    passwordInput.autocomplete = 'off';
    passwordInput.value = own.password || '';
    passwordInput.dataset.sendServerId = server.id;
    passwordInput.setAttribute('aria-label', `发送服务器 ${index + 1} 的密码`);

    credentialsRow.append(usernameInput, passwordInput);
    credentialsDetails.append(credentialsHint, tokenInput, credentialsRow);

    [tokenInput, usernameInput, passwordInput].forEach(input => {
      input.addEventListener('input', () => {
        updateInsecureHint();
        debouncedSave();
      });
      input.addEventListener('change', debouncedSave.flush);
    });

    card.append(serverGroup, topicsGroup, credentialsDetails);
    return card;
  }

  function addSendServer() {
    addAllSendServerTopicsFromInputs();
    const server = createSendServer();
    config.sendServers.push(server);
    renderSendServers();
    saveConfig();
    updateServerAccessUI();
    const input = sendServerUrlInput(server.id);
    if (input) input.focus();
  }

  function removeSendServer(id) {
    if (config.sendServers.length <= 1) return;
    config.sendServers = config.sendServers.filter(server => server.id !== id);
    delete config.sendServerCredentials[id];
    renderSendServers();
    saveConfig();
    updateServerAccessUI();
  }

  // Adds the topic typed in a send server card. Returns false for an invalid topic name.
  function addSendServerTopicFromInput(id) {
    const server = findSendServer(id);
    const input = sendServerTopicInput(id);
    if (!server || !input) return true;
    const value = input.value.trim();
    if (!value) return true;

    if (!NtfyAPI.TOPIC_PATTERN.test(value)) {
      showSettingsStatus('主题名只能包含字母、数字、- 和 _（最多 64 个字符）', 'error');
      return false;
    }

    if (!server.topics.includes(value)) {
      server.topics.push(value);
      renderSendServers();
      saveConfig();
      updateServerAccessUI();
      const newInput = sendServerTopicInput(id);
      if (newInput) newInput.focus();
    } else {
      input.value = '';
    }
    return true;
  }

  function handleSendServerTopicKeydown(e, id) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSendServerTopicFromInput(id);
    } else if (e.key === 'Backspace' && !e.target.value) {
      const server = findSendServer(id);
      if (server && server.topics.length > 0) {
        server.topics.pop();
        renderSendServers();
        saveConfig();
        updateServerAccessUI();
      }
    }
  }

  function handleSendServerTopicRemove(e, id) {
    if (e.target.classList.contains('topic-remove')) {
      const server = findSendServer(id);
      if (!server) return;
      const index = parseInt(e.target.dataset.index, 10);
      server.topics.splice(index, 1);
      renderSendServers();
      saveConfig();
      updateServerAccessUI();
    }
    if (e.target.classList.contains('send-server-topics-container')) {
      const input = e.target.querySelector('.send-server-topic-input');
      if (input) input.focus();
    }
  }

  // Adds every topic typed without Enter in the send server cards. Returns false if one is invalid.
  function addAllSendServerTopicsFromInputs() {
    const pending = [];
    for (const card of elements.sendServersList.querySelectorAll('.send-server-card')) {
      const server = findSendServer(card.dataset.sendServerId);
      const input = card.querySelector('.send-server-topic-input');
      if (!server || !input) continue;
      const value = input.value.trim();
      if (!value) continue;
      if (!NtfyAPI.TOPIC_PATTERN.test(value)) {
        showSettingsStatus('主题名只能包含字母、数字、- 和 _（最多 64 个字符）', 'error');
        input.focus();
        return false;
      }
      if (!server.topics.includes(value)) {
        pending.push({ server, value, input });
      } else {
        input.value = '';
      }
    }
    if (pending.length > 0) {
      pending.forEach(({ server, value }) => server.topics.push(value));
      pending.forEach(({ input }) => { input.value = ''; });
      renderSendServers();
      saveConfig();
      updateServerAccessUI();
    }
    return true;
  }

  function createTopicBadge(topic, index, type, subscriptionId = null) {
    const badge = document.createElement('div');
    badge.className = 'topic-badge';
    badge.textContent = topic;

    setupDragAndDrop(badge, index, type, subscriptionId);

    const removeSpan = document.createElement('span');
    removeSpan.className = 'topic-remove';
    removeSpan.dataset.index = index;
    removeSpan.textContent = '×';
    badge.appendChild(removeSpan);
    return badge;
  }

  // One card per subscription: its own server and topic badges, with a remove button
  function renderSubscriptions() {
    // Keep unsaved input of the cards that are about to be replaced
    captureSubscriptionInputs();
    elements.subscriptionsList.replaceChildren(
      ...config.subscriptions.map((subscription, index) => createSubscriptionCard(subscription, index))
    );
  }

  function createSubscriptionCard(subscription, index) {
    const card = document.createElement('div');
    card.className = 'subscription-card';
    card.dataset.subscriptionId = subscription.id;

    const header = document.createElement('div');
    header.className = 'subscription-header';

    const title = document.createElement('span');
    title.className = 'subscription-title';
    title.textContent = `订阅 ${index + 1}`;
    header.appendChild(title);

    if (config.subscriptions.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'subscription-remove-btn';
      removeBtn.title = '删除此订阅';
      removeBtn.setAttribute('aria-label', '删除此订阅');
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => removeSubscription(subscription.id));
      header.appendChild(removeBtn);
    }
    card.appendChild(header);

    // Server
    const serverGroup = document.createElement('div');
    serverGroup.className = 'form-group';

    const serverLabel = document.createElement('label');
    serverLabel.className = 'form-label';
    serverLabel.textContent = '订阅服务器地址（可选）';

    const serverInput = document.createElement('input');
    serverInput.type = 'text';
    serverInput.className = 'form-input subscription-url-input';
    serverInput.placeholder = '留空则使用第一个发送服务器';
    serverInput.value = subscription.apiUrl;
    serverInput.dataset.subscriptionId = subscription.id;
    serverInput.setAttribute('aria-label', `订阅 ${index + 1} 的服务器地址`);
    serverInput.addEventListener('input', () => {
      updateMissingSettings();
      updateInsecureHint();
      debouncedSave();
    });
    serverInput.addEventListener('change', debouncedSave.flush);

    const accessBtn = document.createElement('button');
    accessBtn.type = 'button';
    accessBtn.className = 'chip subscription-access-btn';
    accessBtn.style.display = 'none';
    accessBtn.textContent = '🔓 允许访问此服务器';
    accessBtn.addEventListener('click', () => {
      const current = findSubscription(subscription.id);
      const apiUrl = current ? resolvedSubscription(current).apiUrl : '';
      requestServerAccess(NtfyAPI.serverOriginPattern(apiUrl), apiUrl);
    });

    const accessHint = document.createElement('p');
    accessHint.className = 'form-hint subscription-access-hint';
    accessHint.style.display = 'none';
    accessHint.textContent = '你的订阅服务器阻止了扩展的请求。允许访问后，扩展才能接收消息。';

    serverGroup.append(serverLabel, serverInput, accessBtn, accessHint);

    // Topics
    const topicsGroup = document.createElement('div');
    topicsGroup.className = 'form-group';

    const topicsLabel = document.createElement('label');
    topicsLabel.className = 'form-label';
    topicsLabel.textContent = '订阅主题（可选）';

    const topicsContainer = document.createElement('div');
    topicsContainer.className = 'topics-container subscription-topics-container';
    topicsContainer.dataset.subscriptionId = subscription.id;

    subscription.topics.forEach((topic, topicIndex) => {
      topicsContainer.appendChild(
        createTopicBadge(topic, topicIndex, 'subscriptionTopic', subscription.id)
      );
    });

    const topicInput = document.createElement('input');
    topicInput.type = 'text';
    topicInput.className = 'topic-input-field subscription-topic-input';
    topicInput.dataset.subscriptionId = subscription.id;
    topicInput.placeholder = subscription.topics.length ? '' : '输入订阅主题，例如 alerts';
    topicInput.setAttribute('aria-label', `添加订阅 ${index + 1} 的主题`);

    const topicHint = document.createElement('span');
    topicHint.className = 'topic-input-hint';
    topicHint.textContent = '按回车添加主题';

    topicInput.addEventListener('keydown', (e) => handleSubscriptionTopicKeydown(e, subscription.id));
    topicInput.addEventListener('blur', () => addSubscriptionTopicFromInput(subscription.id));
    topicInput.addEventListener('input', () => {
      topicHint.classList.toggle('visible', topicInput.value.length > 0);
    });
    topicsContainer.addEventListener('click', (e) => handleSubscriptionTopicRemove(e, subscription.id));
    topicsContainer.append(topicInput, topicHint);

    const topicsHint = document.createElement('p');
    topicsHint.className = 'form-hint';
    topicsHint.textContent = '接收这些主题的消息；留空则使用同一服务器上的发送主题。拖动可调整顺序。';

    topicsGroup.append(topicsLabel, topicsContainer, topicsHint);

    // Credentials for this subscription's own server
    const own = config.subscriptionCredentials[subscription.id] || {};
    const credentialsDetails = document.createElement('details');
    credentialsDetails.className = 'subscription-credentials';
    credentialsDetails.open = true;

    const credentialsSummary = document.createElement('summary');
    credentialsSummary.textContent = '此订阅的访问凭据（可选）';
    credentialsDetails.appendChild(credentialsSummary);

    const credentialsHint = document.createElement('p');
    credentialsHint.className = 'form-hint';
    credentialsHint.textContent = '仅用于这个订阅的服务器；与某个发送服务器相同时可以留空。';

    const tokenInput = document.createElement('input');
    tokenInput.type = 'password';
    tokenInput.className = 'form-input subscription-credential-input subscription-credential-token';
    tokenInput.placeholder = '访问令牌，例如 tk_...';
    tokenInput.value = own.accessToken || '';
    tokenInput.dataset.subscriptionId = subscription.id;
    tokenInput.setAttribute('aria-label', `订阅 ${index + 1} 的访问令牌`);

    const credentialsRow = document.createElement('div');
    credentialsRow.className = 'credentials-row';

    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.className = 'form-input subscription-credential-input subscription-credential-username';
    usernameInput.placeholder = '用户名';
    usernameInput.autocomplete = 'off';
    usernameInput.value = own.username || '';
    usernameInput.dataset.subscriptionId = subscription.id;
    usernameInput.setAttribute('aria-label', `订阅 ${index + 1} 的用户名`);

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.className = 'form-input subscription-credential-input subscription-credential-password';
    passwordInput.placeholder = '密码';
    passwordInput.autocomplete = 'off';
    passwordInput.value = own.password || '';
    passwordInput.dataset.subscriptionId = subscription.id;
    passwordInput.setAttribute('aria-label', `订阅 ${index + 1} 的密码`);

    credentialsRow.append(usernameInput, passwordInput);
    credentialsDetails.append(credentialsHint, tokenInput, credentialsRow);

    [tokenInput, usernameInput, passwordInput].forEach(input => {
      input.addEventListener('input', () => {
        updateInsecureHint();
        debouncedSave();
      });
      input.addEventListener('change', debouncedSave.flush);
    });

    card.append(serverGroup, topicsGroup, credentialsDetails);
    return card;
  }

  function addSubscription() {
    addAllSubscriptionTopicsFromInputs();
    const subscription = createSubscription();
    config.subscriptions.push(subscription);
    renderSubscriptions();
    saveConfig();
    updateServerAccessUI();
    const input = subscriptionUrlInput(subscription.id);
    if (input) input.focus();
  }

  function removeSubscription(id) {
    if (config.subscriptions.length <= 1) return;
    config.subscriptions = config.subscriptions.filter(subscription => subscription.id !== id);
    renderSubscriptions();
    saveConfig();
    updateServerAccessUI();
  }

  // Adds the topic typed in a subscription card. Returns false for an invalid topic name.
  function addSubscriptionTopicFromInput(id) {
    const subscription = findSubscription(id);
    const card = subscriptionCard(id);
    const input = card ? card.querySelector('.subscription-topic-input') : null;
    if (!subscription || !input) return true;
    const value = input.value.trim();
    if (!value) return true;

    if (!NtfyAPI.TOPIC_PATTERN.test(value)) {
      showSettingsStatus('主题名只能包含字母、数字、- 和 _（最多 64 个字符）', 'error');
      return false;
    }

    if (!subscription.topics.includes(value)) {
      subscription.topics.push(value);
      renderSubscriptions();
      saveConfig();
      updateServerAccessUI();
      const newCard = subscriptionCard(id);
      const newInput = newCard ? newCard.querySelector('.subscription-topic-input') : null;
      if (newInput) newInput.focus();
    } else {
      input.value = '';
    }
    return true;
  }

  function handleSubscriptionTopicKeydown(e, id) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSubscriptionTopicFromInput(id);
    } else if (e.key === 'Backspace' && !e.target.value) {
      const subscription = findSubscription(id);
      if (subscription && subscription.topics.length > 0) {
        subscription.topics.pop();
        renderSubscriptions();
        saveConfig();
        updateServerAccessUI();
      }
    }
  }

  function handleSubscriptionTopicRemove(e, id) {
    if (e.target.classList.contains('topic-remove')) {
      const subscription = findSubscription(id);
      if (!subscription) return;
      const index = parseInt(e.target.dataset.index, 10);
      subscription.topics.splice(index, 1);
      renderSubscriptions();
      saveConfig();
      updateServerAccessUI();
    }

    // Focus input if clicking on container
    if (e.target.classList.contains('subscription-topics-container')) {
      const input = e.target.querySelector('.subscription-topic-input');
      if (input) input.focus();
    }
  }

  // Commits the topics typed in every subscription card without Enter. Returns false for an
  // invalid topic name (the card stays in the settings to be corrected).
  function addAllSubscriptionTopicsFromInputs() {
    const pending = [];
    for (const card of elements.subscriptionsList.querySelectorAll('.subscription-card')) {
      const input = card.querySelector('.subscription-topic-input');
      if (!input) continue;
      const value = input.value.trim();
      if (!value) continue;
      if (!NtfyAPI.TOPIC_PATTERN.test(value)) {
        showSettingsStatus('主题名只能包含字母、数字、- 和 _（最多 64 个字符）', 'error');
        input.focus();
        return false;
      }
      const subscription = findSubscription(card.dataset.subscriptionId);
      if (subscription && !subscription.topics.includes(value)) {
        pending.push({ subscription, value, input });
      } else {
        input.value = '';
      }
    }
    if (pending.length > 0) {
      pending.forEach(({ subscription, value }) => subscription.topics.push(value));
      pending.forEach(({ input }) => { input.value = ''; });
      renderSubscriptions();
      saveConfig();
      updateServerAccessUI();
    }
    return true;
  }

  // ==================
  // Open ntfy URL
  // ==================

  function openNtfyUrl() {
    const entry = currentTopicEntry();
    const topic = entry && entry.kind !== 'all' ? entry.topic : null;
    const subscriptions = config.receiveEnabled ? effectiveSubscriptions() : [];

    // The server the selected topic belongs to: the subscription's own server, or the topic's
    // sending server; All topics uses the first subscription
    let serverUrl = '';
    if (entry && entry.kind === 'subscription') {
      serverUrl = entry.apiUrl;
    } else if (entry && entry.kind === 'send') {
      const sendServer = config.sendEnabled ? sendServerForTopic(entry.topic) : null;
      if (sendServer) {
        serverUrl = NtfyAPI.normalizeServerUrl(sendServer.apiUrl);
      }
    }
    if (!serverUrl && entry && entry.kind === 'all' && subscriptions.length > 0) {
      serverUrl = subscriptions[0].apiUrl;
    }
    if (!serverUrl) {
      serverUrl = config.apiUrl || (subscriptions[0] && subscriptions[0].apiUrl) || '';
    }
    if (!serverUrl) return;

    let url;
    try {
      url = new URL(serverUrl);
    } catch (e) {
      showStatus('设置中的服务器地址无效', 'error');
      return;
    }
    // Credentials in the server URL are for the extension's requests, not for the tab's address bar and history
    url.username = '';
    url.password = '';
    // Only append topic if it is a valid topic (present in one of the configured topic lists)
    if (topic
      && (allSendTopics().includes(topic) || subscriptions.some(sub => sub.topics.includes(topic)))) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(topic)}`;
    }

    chrome.tabs.create({ url: url.href });
  }

  // ==================
  // Send Notification
  // ==================

  function decodeDataUrl(dataUrl) {
    const base64 = (dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl).replace(/\s/g, '');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes.buffer;
  }

  function showAttachmentSendSummary(sentCount, totalCount, failures) {
    const failureDetails = failures
      .map(({ file, error }) => `${file.name}: ${error.message}`)
      .join('; ');
    const sentText = `已发送 ${sentCount}/${totalCount} 个附件。`;
    showStatus(`${sentText} 失败：${failureDetails}`, 'error');
  }

  function getZipFilename(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `ntfy-files-${datePart}-${timePart}.zip`;
  }

  async function sendNotification() {
    if (isSending) return;
    // Set before the first await, so a second trigger meanwhile (a key repeat, a double click) can't send again
    isSending = true;
    try {
      await sendComposedMessage();
    } finally {
      isSending = false;
      elements.sendBtn.disabled = false;
      renderAttachments();
    }
  }

  async function sendComposedMessage() {
    const entry = currentTopicEntry();
    const topic = entry && entry.kind !== 'all' ? entry.topic : '';
    const message = elements.messageInput.value.trim();
    const title = elements.titleInput.value.trim();
    const tagsString = tags.join(','); // Use tags array
    const markdown = elements.markdownCheckbox.checked;

    // Capture the latest values before validating or sending so a failed send can be retried.
    await flushDraftSave();

    let filesToSend;
    try {
      filesToSend = await readStoredFiles();
      attachments = filesToSend;
      renderAttachments();
    } catch (error) {
      showStatus(`加载附件失败：${error.message}`, 'error');
      return;
    }

    if (!config.sendEnabled) {
      showStatus('发送功能已关闭，请在设置中开启“发送”。', 'warning');
      return;
    }

    const sendServer = sendServerForTopic(topic);
    if (!sendServer) {
      if (!config.sendServers.some(server => NtfyAPI.normalizeServerUrl(server.apiUrl))) {
        showStatus('请在设置中配置 ntfy 服务器地址', 'warning');
      } else {
        showStatus('请选择主题', 'warning');
      }
      return;
    }

    elements.sendBtn.disabled = true;
    renderAttachments();

    try {
      const apiConfig = sendServerConfig(sendServer);

      if (filesToSend.length > 0) {
        const sendAsZip = filesToSend.length > 1 && elements.zipCheckbox.checked;

        if (sendAsZip) {
          const zipData = await ZipUtils.createZip(filesToSend.map(file => ({
            name: file.name,
            data: decodeDataUrl(file.data)
          })));

          await NtfyAPI.sendAttachment(apiConfig, topic, {
            data: zipData,
            filename: getZipFilename(),
            contentType: 'application/zip',
            message: message,
            title: title,
            priority: selectedPriority,
            tags: tagsString,
            markdown
          });

          await finishSuccessfulSend(filesToSend.length, 'ZIP 已发送！');
          return;
        }

        const failures = [];
        let sentCount = 0;
        let remainingFiles = [...filesToSend];

        // Send sequentially so the backend still receives one attachment per message.
        for (const file of filesToSend) {
          try {
            await NtfyAPI.sendAttachment(apiConfig, topic, {
              data: decodeDataUrl(file.data),
              filename: file.name,
              message: message,
              title: title,
              priority: selectedPriority,
              tags: tagsString,
              markdown
            });
          } catch (error) {
            failures.push({ file, error });
            continue;
          }

          sentCount++;
          remainingFiles = remainingFiles.filter(remainingFile => remainingFile !== file);
          await persistStoredFiles(remainingFiles);
          attachments = remainingFiles;
          renderAttachments();
        }

        if (failures.length > 0) {
          // Failed files remain in storage and the form remains unchanged for retry.
          showAttachmentSendSummary(sentCount, filesToSend.length, failures);
          return;
        }

        await finishSuccessfulSend(filesToSend.length);
      } else {
        await NtfyAPI.sendNotification(apiConfig, topic, {
          message: message,
          title: title,
          priority: selectedPriority,
          tags: tagsString,
          markdown
        });

        await finishSuccessfulSend(0);
      }
    } catch (error) {
      await updateServerAccessUI();
      showStatus(sendServerAccessMissing
        ? '错误：发送服务器阻止了请求。请在设置中允许访问该服务器。'
        : `错误：${error.message}`, 'error');
    }
  }

  async function finishSuccessfulSend(attachmentCount, successMessage) {
    cancelScheduledDraftSave();
    elements.messageInput.value = '';
    autoSizeMessageInput();
    elements.titleInput.value = '';
    updateComposerToggleUI();

    if (attachmentCount > 0) {
      await clearStoredFiles();
    }

    // Clear any saved draft state so it doesn't overwrite preferences next time.
    await removeLocalStorage(['draftState']);
    updatePriorityUI();

    // Close the popup unless "Send another" is checked (the extension's tab stays open).
    if (!elements.sendAnotherCheckbox.checked) {
      // Tags only carry over to the next message while "Send another" is checked
      tags = [];
      renderTags();
      await saveToStorage({ lastTags: [] }).catch(error => console.error('Error clearing tags:', error));
      setTimeout(() => window.close(), 100);
    } else {
      const notificationText = successMessage || (attachmentCount > 1
        ? `已发送 ${attachmentCount} 条通知！`
        : '通知已发送！');
      showStatus(notificationText, 'success');
    }
  }
  function setupTooltips() {
    const tooltip = document.getElementById('tooltip');
    let activeElement = null;
    let tooltipTimeout = null;

    document.addEventListener('mouseover', (e) => {
      // Find closest element with a title attribute or data-tooltip
      const target = e.target.closest('[title], [data-tooltip]');

      // If we are already tracking this element, do nothing (prevents timer reset on mouse move inside element)
      if (activeElement && target === activeElement) {
        return;
      }

      // If we moved to a new element (or no element), clear any pending tooltip
      if (activeElement) {
        clearTimeout(tooltipTimeout);
        hideTooltip();
      }

      if (!target) {
        return;
      }

      // If it has a title, move it to data-tooltip to suppress native tooltip
      moveTitleToTooltip(target);

      if (!target.getAttribute('data-tooltip')) return;

      activeElement = target;

      // Delay showing the tooltip
      tooltipTimeout = setTimeout(() => {
        // Double-check we are still active on this element; the text as it is now
        if (activeElement === target) {
          showTooltip(target, target.getAttribute('data-tooltip'));
        }
      }, 1000); // 1000ms delay
    });

    function moveTitleToTooltip(element) {
      if (element.hasAttribute('title')) {
        element.setAttribute('data-tooltip', element.getAttribute('title'));
        element.removeAttribute('title');
      }
    }

    // A title set while the element is hovered (e.g. "Click again to delete") would bring up the
    // native tooltip next to this one, which would keep the old text: move it over, and update
    // the tooltip if it is showing
    new MutationObserver(mutations => {
      mutations.forEach(({ target }) => {
        if (!target.hasAttribute('title')) return;
        moveTitleToTooltip(target);
        if (target === activeElement && tooltip.classList.contains('visible')) {
          showTooltip(target, target.getAttribute('data-tooltip'));
        }
      });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['title'] });

    document.addEventListener('mouseout', (e) => {
      if (activeElement && (e.target === activeElement || e.target.closest('[data-tooltip]') === activeElement)) {
        // check if we moved to child of the active element
        if (e.relatedTarget && activeElement.contains(e.relatedTarget)) {
          return;
        }

        // otherwise, we left the element entirely
        clearTimeout(tooltipTimeout);
        hideTooltip();
      }
    });

    function showTooltip(element, text) {
      if (!element.isConnected) return; // Verify element is still in DOM

      tooltip.textContent = text;
      tooltip.classList.add('visible');

      const rect = element.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const margin = 8;

      // Default: Top center
      let top = rect.top - tooltipRect.height - margin;
      let left = rect.left + (rect.width - tooltipRect.width) / 2;

      // prevent overflow top
      if (top < 0) {
        top = rect.bottom + margin;
      }

      // prevent overflow left/right
      if (left < margin) {
        left = margin;
      } else if (left + tooltipRect.width > window.innerWidth - margin) {
        left = window.innerWidth - tooltipRect.width - margin;
      }

      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
    }

    function hideTooltip() {
      tooltip.classList.remove('visible');
      activeElement = null;
    }
  }

  // ==================
  // Keyboard Shortcuts
  // ==================

  function handleGlobalKeydown(e) {
    if (e.code === 'ControlRight') {
      rightCtrlDown = true;
    }

    // defaultPrevented: the message field already handled this Enter (and sent)
    if (e.key === 'Enter' && rightCtrlDown && !e.defaultPrevented) {
      // Check if send button is visible and enabled
      // offsetParent is null if element or any parent is hidden (display: none)
      if (elements.sendBtn.offsetParent !== null && !elements.sendBtn.disabled) {
        e.preventDefault();
        elements.sendBtn.click();
      }
    }
  }

  function handleGlobalKeyup(e) {
    if (e.code === 'ControlRight') {
      rightCtrlDown = false;
    }
  }

  // ==================
  // Recent Notifications
  // ==================

  // Lists the received messages of the selected topic entry, or of all topics.
  // keepSidebar leaves the sidebar as it is, for a click that only changes the selected entry.
  async function loadNotifications(options = {}) {
    const entries = topicEntries();
    let entry = entries.find(candidate => candidate.key === receiveFilter) || null;
    if (!entry && receiveFilter !== 'all') {
      // Older versions saved only the topic name; a removed entry falls back the same way
      entry = entries.find(candidate => candidate.kind !== 'all' && candidate.topic === receiveFilter) || null;
      if (entry) {
        receiveFilter = entry.key;
        saveToStorageLocal({ receiveTopicFilter: receiveFilter }).catch(() => {});
      } else {
        receiveFilter = 'all';
      }
    }
    // Without receiving, All topics isn't offered: there is nothing to list, and nothing to send to
    if (!config.receiveEnabled && receiveFilter === 'all' && config.sendEnabled) {
      const firstSendEntry = entries.find(candidate => sendServerForTopic(candidate.topic));
      if (firstSendEntry) {
        receiveFilter = firstSendEntry.key;
      }
    }
    updateComposer();
    updateNotifyToggle();
    updateReceiveHint();

    if (!isConfigured()) {
      renderSetupHint();
      return;
    }
    elements.notificationsSection.classList.remove('setup');

    if (!config.receiveEnabled) {
      currentNotifications = [];
      if (!options.keepSidebar) {
        renderTopicSidebar([]);
      }
      return;
    }

    try {
      const localData = await getFromStorageLocal(['receivedNotifications', THUMBNAIL_CACHE_KEY]);
      // Messages of removed topics leave the history too (background), but may still be there
      const subscriptions = effectiveSubscriptions();
      const allNotifications = (localData.receivedNotifications || [])
        .filter(notification => isReceivedNotification(notification, subscriptions)
          && !deletedMessageIds.includes(notification.id));
      thumbnailCache = localData[THUMBNAIL_CACHE_KEY] || {};
      pruneThumbnails(allNotifications);

      if (!options.keepSidebar) {
        renderTopicSidebar(allNotifications);
      }

      const selectedEntry = currentTopicEntry();
      const notifications = selectedEntry && selectedEntry.kind === 'all'
        ? allNotifications
        : allNotifications.filter(notification => matchesTopicEntry(notification, selectedEntry));

      // Save currently visible notifications for bulk actions
      currentNotifications = notifications;

      // Show control bar only if there are notifications to manage
      elements.notificationsControlBar.style.visibility = notifications.length > 0 ? 'visible' : 'hidden'; // Keeps its space, so the heading doesn't move

      elements.notificationsList.innerHTML = '';

      if (notifications.length === 0) {
        const denied = deniedTopicsForSubscriptions();
        const empty = document.createElement('div');
        empty.className = 'notifications-empty';
        if (denied.length > 0) {
          empty.textContent = `收不到消息：服务器拒绝读取主题 ${denied.join('、')}（403）。`
            + '请在设置中展开对应订阅的「访问凭据」，填写该服务器的访问令牌或用户名密码。';
        } else {
          empty.textContent = '暂无通知';
        }
        elements.notificationsList.replaceChildren(empty);
        return;
      }

      // Sort notifications by time descending (newest first)
      notifications.sort((a, b) => b.time - a.time);

      notifications.forEach(notification => {
        const item = document.createElement('div');
        item.className = 'notification-item';
        item.dataset.priority = notification.priority || 3;

        const isRead = readMessageIds.includes(notification.id);
        if (isRead) {
          item.classList.add('read');
        }

        const header = document.createElement('div');
        header.className = 'notification-header';

        // Without a title, only the topic and time show, like in the ntfy web app
        if (notification.title) {
          const title = document.createElement('span');
          title.className = 'notification-title';
          title.textContent = Emojis.formatTitle(notification);
          header.appendChild(title);
        }

        const time = document.createElement('span');
        time.className = 'notification-time';
        // Unread messages get a green dot before the time, like in the ntfy web app
        const unreadDot = document.createElement('span');
        unreadDot.className = 'unread-dot';
        unreadDot.title = '未读';
        time.append(unreadDot, `${notification.topic} · ${formatTime(notification.time)}`);
        header.appendChild(time);

        item.appendChild(header);

        const message = document.createElement('div');
        message.className = 'notification-message';
        const text = Emojis.formatMessage(notification);
        // Rendered only for messages sent as Markdown, like the ntfy web app does
        const markdown = notification.content_type === 'text/markdown'
          ? Markdown.render(text, { createLink: createMessageLink })
          : null;
        message.classList.toggle('markdown', Boolean(markdown));
        message.replaceChildren(...(markdown || linkify(text)));
        item.appendChild(message);

        if (NtfyAPI.isImageAttachment(notification.attachment)) {
          item.appendChild(createImagePreview(notification));
        }

        // Footer for tags and actions
        const footer = document.createElement('div');
        footer.className = 'notification-footer';

        // Tags that are emojis already show in front of the title or message, like in the ntfy web app
        const otherTags = Emojis.unmatchedTags(notification.tags);
        if (otherTags.length > 0) {
          const tagsLine = document.createElement('div');
          tagsLine.className = 'notification-tags';
          tagsLine.textContent = `标签：${otherTags.join(', ')}`;
          footer.appendChild(tagsLine);
        }

        // Actions
        const actions = document.createElement('div');
        actions.className = 'notification-actions';

        if (!isRead) {
          const readBtn = document.createElement('button');
          readBtn.className = 'notification-action-btn read-btn';
          readBtn.textContent = '✓';
          readBtn.title = '标为已读';
          readBtn.addEventListener('click', () => handleMarkAsRead(notification.id, item, readBtn));
          actions.appendChild(readBtn);
        }

        if (notification.message) {
          const copyBtn = document.createElement('button');
          copyBtn.className = 'notification-action-btn copy-btn';
          copyBtn.appendChild(createIcon(COPY_ICON_PATH));
          copyBtn.title = '复制文本';
          copyBtn.addEventListener('click', () => handleCopy(notification.message, copyBtn));
          actions.appendChild(copyBtn);
        }

        if (notification.attachment && NtfyAPI.isHttpUrl(notification.attachment.url)) {
          const downloadBtn = document.createElement('button');
          downloadBtn.className = 'notification-action-btn download-btn';
          downloadBtn.appendChild(createIcon(DOWNLOAD_ICON_PATH));
          downloadBtn.title = notification.attachment.name ? `下载 ${notification.attachment.name}` : '下载附件';
          downloadBtn.addEventListener('click', () => handleDownload(notification.attachment, downloadBtn));
          actions.appendChild(downloadBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'notification-action-btn delete-btn';
        setDeleteButtonArmed(deleteBtn, notification.id === pendingDeleteId);
        deleteBtn.addEventListener('click', () => handleDeleteClick(notification.id, item, deleteBtn));
        actions.appendChild(deleteBtn);

        footer.appendChild(actions);
        item.appendChild(footer);

        elements.notificationsList.appendChild(item);
      });
    } catch (error) {
      console.error('Error loading notifications:', error);
      const errorDiv = document.createElement('div');
      errorDiv.className = 'notifications-error';
      errorDiv.textContent = `错误：${error.message}`;
      elements.notificationsList.replaceChildren(errorDiv);
    }
  }

  // Points to the Receive messages setting, once the extension is set up, until dismissed
  function updateReceiveHint() {
    // From the first start on, so the choice is known while setting up
    const show = !receiveHintDismissed;
    elements.receiveHint.hidden = !show;
    if (show) {
      elements.receiveHintMessage.textContent = config.receiveEnabled
        ? '只想发送？请在设置中关闭“接收与订阅”。'
        : (config.sendEnabled
          ? '扩展目前仅用于发送。要在此查看主题消息并接收桌面通知，请在设置中开启“接收与订阅”。'
          : '要接收消息，请在设置中开启“接收与订阅”。');
    }
  }

  function dismissReceiveHint() {
    if (receiveHintDismissed) return;
    receiveHintDismissed = true;
    elements.receiveHint.hidden = true;
    saveToStorageLocal({ receiveHintDismissed: true }).catch(() => {});
  }

  // Topics the server refused to the configured credentials (401/403), among the subscriptions
  function deniedTopicsForSubscriptions() {
    const denied = [];
    effectiveSubscriptions().forEach(subscription => {
      (readAccessDenied[subscription.apiUrl] || []).forEach(topic => {
        if (subscription.topics.includes(topic) && !denied.includes(topic)) {
          denied.push(topic);
        }
      });
    });
    return denied;
  }

  // Says in the settings why a server sends nothing, instead of only an empty message list
  function updateAccessDeniedHint() {
    const denied = config.receiveEnabled ? deniedTopicsForSubscriptions() : [];
    elements.accessDeniedHint.hidden = denied.length === 0;
    if (denied.length > 0) {
      elements.accessDeniedHint.textContent =
        `服务器拒绝读取这些主题（403）：${denied.join('、')}。`
        + '请展开对应订阅的「访问凭据」，填写该服务器的访问令牌或用户名密码。';
    }
  }

  // First start: nothing to list until a server and at least one topic are set
  function renderSetupHint() {
    elements.topicSidebar.replaceChildren();
    elements.topicSidebar.style.display = 'none';
    elements.topicColumn.style.display = 'none';
    elements.notificationsSection.classList.add('setup');

    const hint = document.createElement('div');
    hint.className = 'notifications-empty setup-hint';

    let titleText;
    let textText;
    if (!config.sendEnabled && !config.receiveEnabled) {
      titleText = '发送和接收均已关闭';
      textText = '请在设置中开启“发送”或“接收与订阅”。';
    } else if (config.receiveEnabled && effectiveSubscriptions().length === 0) {
      titleText = '未配置订阅';
      textText = '请在“接收与订阅”中添加订阅服务器和主题。';
    } else if (config.sendEnabled
      && !config.sendServers.some(server => NtfyAPI.normalizeServerUrl(server.apiUrl))) {
      titleText = '未配置服务器';
      textText = '请在设置中输入 ntfy 服务器和主题以开始使用。';
    } else {
      titleText = '未配置主题';
      textText = '请在设置中添加主题以开始使用。';
    }

    const title = document.createElement('div');
    title.className = 'setup-hint-title';
    title.textContent = titleText;

    const text = document.createElement('div');
    text.textContent = textText;

    hint.append(title, text);
    elements.notificationsList.replaceChildren(hint);
  }

  // Topic list: All topics (when receiving), then each configured topic entry, with unread counts
  function renderTopicSidebar(notifications) {
    const entries = topicEntries();
    const receiveTopics = effectiveReceiveTopics();
    elements.topicColumn.style.display = '';
    elements.topicSidebar.style.display = '';
    elements.topicSidebar.replaceChildren(...entries.map(entry => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'topic-filter-btn';
      btn.dataset.topicKey = entry.key;
      btn.classList.toggle('active', entry.key === receiveFilter);

      const name = document.createElement('span');
      name.className = 'topic-filter-name';
      name.textContent = topicEntryLabel(entry);
      if (entry.kind !== 'all' && topicRemarks[entry.key]) {
        name.title = entry.topic; // The real topic, which the remark hides
      }
      btn.appendChild(name);

      if (entry.kind !== 'all' && receiveTopics.includes(entry.topic)
        && (notificationsMuted || mutedTopics.includes(entry.topic))) {
        // A crossed-out bell, inlined so it doesn't depend on the header switch's markup
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('class', 'topic-muted-icon');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M20 18.69 7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z');
        icon.appendChild(path);
        btn.appendChild(icon);
      }

      const count = notifications
        .filter(notification => matchesTopicEntry(notification, entry))
        .filter(notification => !readMessageIds.includes(notification.id))
        .length;
      if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'topic-unread-count';
        badge.textContent = count;
        btn.appendChild(badge);
      }

      btn.addEventListener('click', () => selectTopicEntry(entry));
      btn.addEventListener('dblclick', (e) => {
        if (entry.kind === 'all') return;
        e.preventDefault();
        startTopicRemarkEdit(btn, entry);
      });
      return btn;
    }));
  }

  // Shows the entry's messages. The sidebar isn't rebuilt, so a double-click on an entry keeps
  // working and opens its remark field.
  function selectTopicEntry(entry) {
    if (receiveFilter !== entry.key) {
      receiveFilter = entry.key;
      saveToStorageLocal({ receiveTopicFilter: receiveFilter }).catch(() => {});
    }
    setDeleteAllArmed(false);
    elements.topicSidebar.querySelectorAll('.topic-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.topicKey === entry.key);
    });
    // Another topic's list starts at the top, not at the previous list's scroll position
    loadNotifications({ keepSidebar: true }).then(() => { elements.notificationsList.scrollTop = 0; });
  }

  // Double-click a topic: its name becomes a field for a remark shown instead of the topic name
  function startTopicRemarkEdit(btn, entry) {
    const name = btn.querySelector('.topic-filter-name');
    if (!name || btn.querySelector('.topic-remark-input')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'topic-remark-input';
    input.value = topicRemarks[entry.key] || '';
    input.placeholder = entry.topic;
    input.setAttribute('aria-label', `为 ${entry.topic} 设置备注`);
    // Clicks in the field must not select the topic again or leave the field
    ['pointerdown', 'click', 'dblclick'].forEach(type => {
      input.addEventListener(type, e => e.stopPropagation());
    });

    let finished = false;
    const finish = save => {
      if (finished) return;
      finished = true;
      if (save) {
        const remark = input.value.trim();
        if (remark) {
          topicRemarks[entry.key] = remark;
        } else {
          delete topicRemarks[entry.key];
        }
        saveToStorageLocal({ topicRemarks }).catch(error => {
          console.error('Error saving the topic remark:', error);
        });
      }
      const span = document.createElement('span');
      span.className = 'topic-filter-name';
      span.textContent = topicEntryLabel(entry);
      if (topicRemarks[entry.key]) {
        span.title = entry.topic;
      }
      input.replaceWith(span);
      if (entry.key === receiveFilter) {
        elements.notificationsTitle.textContent = topicEntryLabel(entry);
        updateNotifyToggle();
      }
    };

    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));

    name.replaceWith(input);
    input.focus();
    input.select();
  }

  // Switch in the topic header for notifications: of all topics on All topics, otherwise of the
  // selected topic. Off, messages show no desktop notification and are marked as read (background).
  // Only while receiving, as there are none otherwise.
  function updateNotifyToggle() {
    const entry = currentTopicEntry();
    const configured = Boolean(config.receiveEnabled && effectiveSubscriptions().length > 0);
    const receivable = Boolean(entry && (entry.kind === 'all' || entry.kind === 'subscription'));
    elements.notifyToggle.hidden = !configured || !receivable;
    // The pull fetches every subscription, so it sits next to the bell on All topics only
    elements.pullBtn.hidden = !configured || !entry || entry.kind !== 'all';
    const checkbox = elements.notifyCheckbox;
    if (!entry) {
      checkbox.checked = true;
      checkbox.disabled = true;
      elements.notifyToggle.title = '';
      return;
    }
    let title;
    if (entry.kind === 'all') {
      checkbox.checked = !notificationsMuted;
      checkbox.disabled = false;
      title = notificationsMuted ? '所有主题的通知已关闭' : '所有主题的通知';
    } else {
      checkbox.checked = !notificationsMuted && !mutedTopics.includes(entry.topic);
      checkbox.disabled = notificationsMuted;
      title = notificationsMuted
        ? '所有主题的通知已关闭。请在“全部主题”中开启。'
        : `${topicEntryLabel(entry)} 的通知`;
    }
    elements.notifyToggle.title = title;
  }

  // The storage change refreshes the topic list and the switch
  async function handleNotifyToggle() {
    const entry = currentTopicEntry();
    const on = elements.notifyCheckbox.checked;
    if (!entry || entry.kind === 'all') {
      notificationsMuted = !on;
    } else {
      mutedTopics = on
        ? mutedTopics.filter(topic => topic !== entry.topic)
        : [...mutedTopics, entry.topic];
    }
    try {
      await saveToStorageLocal({ notificationsMuted, mutedTopics });
    } catch (error) {
      console.error('Error saving the notification setting:', error);
    }
  }

  // Manual pull: asks the background to fetch everything the servers still cache for every
  // subscribed topic, then reports how many new messages arrived.
  async function handlePullAll() {
    if (elements.pullBtn.disabled) {
      return;
    }
    elements.pullBtn.disabled = true;
    elements.pullBtn.classList.add('pulling');
    showStatus('正在从服务器拉取消息…', 'info');
    try {
      const result = await sendMessageAsync({ action: 'pull' });
      if (!result || !result.success) {
        const reason = result && result.reason;
        const wait = result && result.retryAfter;
        if (reason === 'rate-limited') {
          showStatus(wait > 0 ? `服务器请求过于频繁，请 ${wait} 秒后再试` : '服务器请求过于频繁，请稍后再试', 'warning');
        } else if (reason === 'disabled') {
          showStatus('接收功能未开启', 'warning');
        } else if (reason === 'empty') {
          showStatus('没有配置订阅', 'warning');
        } else {
          showStatus('拉取失败', 'error');
        }
      } else if (result.rateLimited) {
        const wait = result.retryAfter > 0 ? `，请 ${result.retryAfter} 秒后再试` : '';
        showStatus(`已拉取 ${result.added} 条新消息，服务器请求过于频繁，其余主题未拉取${wait}`, 'warning');
      } else if (result.added > 0) {
        showStatus(`已拉取 ${result.added} 条新消息`, 'success');
      } else if (result.failed > 0) {
        showStatus(`没有新消息，${result.failed} 个主题拉取失败`, 'warning');
      } else {
        showStatus('没有新消息', 'success');
      }
      if (result && result.success) {
        scheduleNotificationsRefresh();
      }
    } catch (error) {
      showStatus('拉取失败', 'error');
    } finally {
      elements.pullBtn.disabled = false;
      elements.pullBtn.classList.remove('pulling');
    }
  }

  // Text and link nodes for a message: http(s) URLs become links that open in a new tab
  function linkify(text) {
    const nodes = [];
    let last = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      // Leave trailing punctuation out of the link, e.g. a full stop after the URL
      const url = match[0].replace(/[.,;:!?)\]}]+$/, '');
      if (!NtfyAPI.isHttpUrl(url)) {
        continue;
      }
      nodes.push(document.createTextNode(text.slice(last, match.index)));
      nodes.push(createMessageLink(url, [document.createTextNode(url)]));
      last = match.index + url.length;
    }
    nodes.push(document.createTextNode(text.slice(last)));
    return nodes;
  }

  // Link in a message that opens in a new tab. The tooltip shows the real target, as Markdown
  // link text can claim to be a different URL.
  function createMessageLink(url, content) {
    const link = document.createElement('a');
    link.className = 'notification-link';
    link.href = url;
    link.title = url;
    link.append(...content);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url });
    });
    return link;
  }

  // ==================
  // Image Previews
  // ==================

  const THUMBNAIL_CACHE_KEY = NtfyAPI.THUMBNAIL_CACHE_KEY;
  let thumbnailCache = {};
  const thumbnailJobs = new Map(); // message id -> Promise<string|null>
  let thumbnailCacheQueue = Promise.resolve();

  function createImagePreview(notification) {
    const attachment = notification.attachment;
    const preview = document.createElement('button');
    preview.className = 'notification-image';
    preview.title = attachment.name ? `打开 ${attachment.name}` : '打开图片';
    preview.style.display = 'none';

    const img = document.createElement('img');
    img.alt = attachment.name || '图片附件';
    img.decoding = 'async';
    img.addEventListener('load', () => { preview.style.display = ''; });
    img.addEventListener('error', () => {
      console.warn(`Image preview: could not load ${attachment.name || 'the attachment'}`);
      preview.remove();
    });
    preview.appendChild(img);

    preview.addEventListener('click', () => chrome.tabs.create({ url: attachment.url }));

    getThumbnail(notification).then(src => {
      if (src) {
        img.src = src;
      } else {
        preview.remove();
      }
    });
    return preview;
  }

  // Resolves to the thumbnail's data URL, the original URL if it can't be downscaled, or null if expired
  function getThumbnail(notification) {
    const id = notification.id;
    const attachment = notification.attachment;
    if (thumbnailCache[id]) {
      return Promise.resolve(thumbnailCache[id]);
    }
    if (NtfyAPI.isAttachmentExpired(attachment)) {
      console.warn(`Image preview: ${attachment.name || 'the attachment'} has expired`);
      return Promise.resolve(null);
    }

    if (!thumbnailJobs.has(id)) {
      thumbnailJobs.set(id, (async () => {
        try {
          const dataUrl = await NtfyAPI.createThumbnail(attachment);
          await storeThumbnail(id, dataUrl);
          return dataUrl;
        } catch (e) {
          if (e.status === 429) {
            // Server request limit: don't spend another request on the original, try again next time
            thumbnailJobs.delete(id);
            return null;
          }
          // E.g. the image's server doesn't allow reading it (CORS): show the original, scaled down by CSS
          console.warn(`Image preview: could not downscale ${attachment.name || 'the attachment'}:`, e.message);
          return attachment.url;
        }
      })());
    }
    return thumbnailJobs.get(id);
  }

  // Stored one write at a time, so thumbnails made at the same time don't overwrite each other
  function storeThumbnail(id, dataUrl) {
    thumbnailCache[id] = dataUrl;
    thumbnailCacheQueue = thumbnailCacheQueue.then(async () => {
      const stored = (await getFromStorageLocal([THUMBNAIL_CACHE_KEY]))[THUMBNAIL_CACHE_KEY] || {};
      stored[id] = dataUrl;
      await saveToStorageLocal({ [THUMBNAIL_CACHE_KEY]: stored });
    }).catch(error => console.error('Error saving image thumbnail:', error));
    return thumbnailCacheQueue;
  }

  // Drop thumbnails of messages that left the history or were deleted
  function pruneThumbnails(notifications) {
    const ids = new Set(notifications.map(notification => notification.id));
    if (Object.keys(thumbnailCache).every(id => ids.has(id))) {
      return;
    }

    thumbnailCacheQueue = thumbnailCacheQueue.then(async () => {
      const stored = (await getFromStorageLocal([THUMBNAIL_CACHE_KEY]))[THUMBNAIL_CACHE_KEY] || {};
      Object.keys(stored).forEach(id => {
        if (!ids.has(id)) {
          delete stored[id];
        }
      });
      thumbnailCache = stored;
      await saveToStorageLocal({ [THUMBNAIL_CACHE_KEY]: stored });
    }).catch(error => console.error('Error pruning image thumbnails:', error));
  }

  function formatTime(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) {
      return '刚刚';
    } else if (diffMins < 60) {
      return `${diffMins} 分钟前`;
    } else if (diffHours < 24) {
      return `${diffHours} 小时前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }

  async function loadLocalState() {
    try {
      const result = await getFromStorageLocal(['readMessageIds', 'deletedMessageIds', 'receiveTopicFilter', 'receiveHintDismissed', 'notificationsMuted', 'mutedTopics', 'readAccessDenied', 'topicRemarks']);
      readMessageIds = result.readMessageIds || [];
      deletedMessageIds = result.deletedMessageIds || [];
      receiveFilter = result.receiveTopicFilter || 'all';
      receiveHintDismissed = result.receiveHintDismissed === true;
      notificationsMuted = result.notificationsMuted === true;
      mutedTopics = result.mutedTopics || [];
      readAccessDenied = result.readAccessDenied || {};
      topicRemarks = result.topicRemarks && typeof result.topicRemarks === 'object'
        ? result.topicRemarks
        : {};
    } catch (error) {
      console.error('Error loading local state:', error);
    }
  }

  function scheduleNotificationsRefresh() {
    clearTimeout(listRefreshTimer);
    // Coalesces the burst of writes a sync makes, one per received message
    listRefreshTimer = setTimeout(() => {
      if (listPointerDown) {
        listRefreshPending = true;
        return;
      }
      loadLocalState().then(loadNotifications);
    }, 100);
  }

  function releaseListPointer() {
    if (!listPointerDown) return;
    listPointerDown = false;
    if (listRefreshPending) {
      listRefreshPending = false;
      // After the click event that follows this release
      setTimeout(scheduleNotificationsRefresh, 0);
    }
  }

  // Read-modify-write of an ID list against storage, not the popup's copy, which a refresh may have
  // replaced with an older one
  async function updateStoredIds(key, update) {
    const result = await getFromStorageLocal([key]);
    const ids = update(result[key] || []);
    await saveToStorageLocal({ [key]: ids });
    return ids;
  }

  async function handleMarkAsRead(messageId, itemElement, btnElement) {
    itemElement.classList.add('read');
    btnElement.remove();
    try {
      readMessageIds = await updateStoredIds('readMessageIds',
        ids => NtfyAPI.appendIds(ids, [messageId]));
    } catch (error) {
      console.error('Error saving readMessageIds:', error);
      showStatus('标为已读失败', 'error');
    }
  }

  const DELETE_CONFIRM_TIMEOUT = 4000;

  function setDeleteButtonArmed(btnElement, armed) {
    btnElement.classList.toggle('confirming', armed);
    btnElement.textContent = armed ? '确认删除？' : '×';
    btnElement.title = armed ? '再次点击以删除' : '删除通知';
  }

  // The first click arms the button, a second one within a few seconds deletes
  function handleDeleteClick(messageId, itemElement, btnElement) {
    if (pendingDeleteId === messageId) {
      clearPendingDelete();
      handleDelete(messageId, itemElement);
      return;
    }
    clearPendingDelete();
    pendingDeleteId = messageId;
    setDeleteButtonArmed(btnElement, true);
    pendingDeleteTimer = setTimeout(clearPendingDelete, DELETE_CONFIRM_TIMEOUT);
  }

  function clearPendingDelete() {
    clearTimeout(pendingDeleteTimer);
    pendingDeleteId = null;
    elements.notificationsList.querySelectorAll('.delete-btn.confirming')
      .forEach(btn => setDeleteButtonArmed(btn, false));
  }

  async function handleDelete(messageId, itemElement) {
    try {
      itemElement.remove();
      if (elements.notificationsList.children.length === 0) {
        elements.notificationsList.innerHTML = '<div class="notifications-empty">暂无通知</div>';
      }

      deletedMessageIds = await updateStoredIds('deletedMessageIds',
        ids => NtfyAPI.appendIds(ids, [messageId]));
      readMessageIds = await updateStoredIds('readMessageIds',
        ids => ids.filter(id => id !== messageId));
    } catch (error) {
      console.error('Error deleting notification locally:', error);
      showStatus('删除通知失败', 'error');
    }
  }

  // Download an attachment under its own name. A cross-origin link ignores the download attribute, so
  // fetch the file and save it from a blob URL.
  async function handleDownload(attachment, btnElement) {
    btnElement.disabled = true;
    try {
      let response;
      // ntfy refills its request limit by one request every 5 s, so retry a 429 a couple of times
      for (let attempt = 0; ; attempt++) {
        try {
          response = await fetch(attachment.url);
        } catch (error) {
          // E.g. the server doesn't allow reading the file (CORS): open it in a tab, where ntfy's
          // Content-Disposition: attachment makes the browser download it
          console.warn(`Download: could not fetch ${attachment.name || 'the attachment'}:`, error.message);
          chrome.tabs.create({ url: attachment.url });
          return;
        }
        if (response.status !== 429 || attempt >= DOWNLOAD_RETRY_DELAYS.length) {
          break;
        }
        showStatus('服务器繁忙，正在重试下载…', 'warning');
        await new Promise(resolve => setTimeout(resolve, DOWNLOAD_RETRY_DELAYS[attempt]));
      }
      if (!response.ok) {
        showStatus(downloadErrorMessage(response.status), 'error');
        return;
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = attachment.name || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      console.error('Download failed:', error);
      showStatus('下载失败', 'error');
    } finally {
      btnElement.disabled = false;
    }
  }

  const DOWNLOAD_RETRY_DELAYS = [6000, 12000];

  function downloadErrorMessage(status) {
    if (status === 404 || status === 410) {
      return '下载失败：附件已过期或被删除';
    }
    if (status === 429) {
      return '下载失败：服务器请求次数已达上限，请稍后再试';
    }
    return `下载失败（HTTP ${status}）`;
  }

  const DOWNLOAD_ICON_PATH = 'M5 20h14v-2H5v2zm14-11h-4V3H9v6H5l7 7 7-7z';
  const COPY_ICON_PATH = 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z';

  function createIcon(pathData) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    return svg;
  }

  // Copies the message as sent (Markdown source for Markdown messages); "Copied" confirms it
  async function handleCopy(text, btnElement) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Copy failed:', error);
      showStatus('复制失败', 'error');
      return;
    }
    btnElement.classList.add('copied');
    btnElement.textContent = '已复制';
    setTimeout(() => {
      btnElement.classList.remove('copied');
      btnElement.replaceChildren(createIcon(COPY_ICON_PATH));
    }, 1500);
  }

  async function handleMarkAllRead() {
    if (currentNotifications.length === 0) return;

    const visibleIds = currentNotifications.map(notification => notification.id);
    try {
      readMessageIds = await updateStoredIds('readMessageIds',
        ids => NtfyAPI.appendIds(ids, visibleIds));
      showStatus('已全部标为已读', 'success');
    } catch (error) {
      console.error('Error saving readMessageIds:', error);
      showStatus('全部标为已读失败', 'error');
    }
  }

  function setDeleteAllArmed(armed) {
    deleteAllArmed = armed;
    clearTimeout(deleteAllTimer);
    elements.deleteAllBtn.classList.toggle('confirming', armed);
    const entry = currentTopicEntry();
    const scope = !entry || entry.kind === 'all' ? '全部' : `“${topicEntryLabel(entry)}”中的全部`;
    elements.deleteAllBtn.textContent = armed ? `删除${scope}？` : '🗑 全部删除';
    elements.deleteAllBtn.title = armed ? '再次点击以删除' : '全部删除';
    if (armed) {
      deleteAllTimer = setTimeout(() => setDeleteAllArmed(false), DELETE_CONFIRM_TIMEOUT);
    }
  }

  // Like a single delete: the first click arms the button, the second deletes
  async function handleDeleteAll() {
    if (currentNotifications.length === 0) return;

    if (!deleteAllArmed) {
      setDeleteAllArmed(true);
      return;
    }
    setDeleteAllArmed(false);

    const visibleIds = currentNotifications.map(notification => notification.id);
    try {
      deletedMessageIds = await updateStoredIds('deletedMessageIds',
        ids => NtfyAPI.appendIds(ids, visibleIds));
      readMessageIds = await updateStoredIds('readMessageIds',
        ids => ids.filter(id => !visibleIds.includes(id)));
      showStatus('已删除全部通知', 'success');
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      showStatus('全部删除失败', 'error');
    }
  }

});
