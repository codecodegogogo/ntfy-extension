// WebDAV backup and restore of the extension's settings
// Used by popup.js: collects the synced settings and the device-only credentials, encrypts them
// with a password when one is set, and stores the result on a WebDAV server.

const NtfyBackup = {
    APP_ID: 'ntfy-extension',
    BACKUP_VERSION: 1,
    FILE_NAME: 'ntfy-extension-backup.json',

    // Settings kept on this device only. The message history, its thumbnails, the drafts and the
    // pending attachments are left out: they can be large and change all the time.
    LOCAL_KEYS: [
        'accessToken',
        'serverUsername',
        'serverPassword',
        'sendServerCredentials',
        'subscriptionCredentials',
        'topicRemarks',
        'notificationsMuted',
        'mutedTopics'
    ],

    /**
     * Collect everything a backup holds
     * @returns {Promise<Object>}
     */
    async collect() {
        const sync = await chrome.storage.sync.get(null);
        const local = await chrome.storage.local.get(this.LOCAL_KEYS);
        return {
            app: this.APP_ID,
            backupVersion: this.BACKUP_VERSION,
            extensionVersion: chrome.runtime.getManifest().version,
            createdAt: Date.now(),
            data: { sync, local }
        };
    },

    /**
     * Write a backup back into the extension's storage. The synced settings are replaced as a
     * whole; of the device-only ones, only the keys the backup holds are written.
     * @param {Object} backup - As collect() or parse() returns it
     * @returns {Promise<void>}
     */
    async apply(backup) {
        if (!backup || backup.app !== this.APP_ID) {
            throw new Error('这不是 ntfy-extension 的备份文件');
        }
        if (backup.backupVersion > this.BACKUP_VERSION) {
            throw new Error('备份文件来自更新版本的扩展，请先更新扩展');
        }
        const data = backup.data;
        if (!data || typeof data !== 'object') {
            throw new Error('备份文件里没有可还原的设置');
        }
        const sync = data.sync && typeof data.sync === 'object' ? data.sync : {};
        const local = data.local && typeof data.local === 'object' ? data.local : {};

        await chrome.storage.sync.clear();
        if (Object.keys(sync).length > 0) {
            await chrome.storage.sync.set(sync);
        }
        // Keys the backup doesn't hold are cleared too, so the restored state matches the backup
        await chrome.storage.local.remove(this.LOCAL_KEYS);
        const localData = {};
        this.LOCAL_KEYS.forEach(key => {
            if (local[key] !== undefined) {
                localData[key] = local[key];
            }
        });
        if (Object.keys(localData).length > 0) {
            await chrome.storage.local.set(localData);
        }
    },

    /**
     * Turn a backup into the file's text. With a password the settings are encrypted (AES-GCM,
     * Advanced Encryption Standard – Galois/Counter Mode, 一种带完整性校验的对称加密), so the file
     * can sit on a server others can read.
     * @param {Object} backup
     * @param {string} password - Empty for a plain JSON file
     * @returns {Promise<{text: string, encrypted: boolean}>}
     */
    async serialize(backup, password) {
        if (!password) {
            return { text: JSON.stringify(backup, null, 2), encrypted: false };
        }
        const cipher = await this.encrypt(JSON.stringify(backup.data), password);
        return {
            text: JSON.stringify({
                app: this.APP_ID,
                backupVersion: this.BACKUP_VERSION,
                extensionVersion: backup.extensionVersion,
                createdAt: backup.createdAt,
                encrypted: true,
                cipher
            }, null, 2),
            encrypted: true
        };
    },

    /**
     * Read a backup file's text back into a backup
     * @param {string} text
     * @param {string} password - The backup's password, for an encrypted file
     * @returns {Promise<Object>}
     */
    async parse(text, password) {
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            throw new Error('备份文件不是有效的 JSON');
        }
        if (!parsed || parsed.app !== this.APP_ID) {
            throw new Error('这不是 ntfy-extension 的备份文件');
        }
        if (parsed.encrypted) {
            if (!password) {
                throw new Error('备份已加密，请填写「备份加密密码」');
            }
            const plain = await this.decrypt(parsed.cipher, password);
            let data;
            try {
                data = JSON.parse(plain);
            } catch (e) {
                throw new Error('备份文件的内容无法解析');
            }
            return { ...parsed, data };
        }
        return parsed;
    },

    async encrypt(plainText, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            new TextEncoder().encode(plainText)
        );
        return {
            salt: this.bytesToBase64(salt),
            iv: this.bytesToBase64(iv),
            data: this.bytesToBase64(new Uint8Array(encrypted))
        };
    },

    async decrypt(cipher, password) {
        if (!cipher || !cipher.salt || !cipher.iv || !cipher.data) {
            throw new Error('备份文件已损坏');
        }
        const key = await this.deriveKey(password, this.base64ToBytes(cipher.salt));
        let decrypted;
        try {
            decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: this.base64ToBytes(cipher.iv) },
                key,
                this.base64ToBytes(cipher.data)
            );
        } catch (e) {
            throw new Error('解密失败：备份加密密码不正确，或文件已损坏');
        }
        return new TextDecoder().decode(decrypted);
    },

    // PBKDF2 (Password-Based Key Derivation Function 2, 密码派生函数) turns the password into the
    // AES key; the salt keeps the same password from giving the same key on every backup.
    async deriveKey(password, salt) {
        const material = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    bytesToBase64(bytes) {
        let binary = '';
        bytes.forEach(byte => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary);
    },

    base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    // ==================
    // WebDAV
    // ==================

    normalizeServerUrl(url) {
        const value = String(url || '').trim();
        if (!value) {
            return '';
        }
        const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
        return withProtocol.replace(/\/+$/, '');
    },

    buildFileUrl(baseUrl, directory, fileName = this.FILE_NAME) {
        const base = this.normalizeServerUrl(baseUrl);
        if (!base) {
            throw new Error('请填写 WebDAV 服务器地址');
        }
        const segments = String(directory || '')
            .split('/')
            .map(segment => segment.trim())
            .filter(Boolean)
            .map(segment => encodeURIComponent(segment));
        return `${base}/${[...segments, encodeURIComponent(fileName)].join('/')}`;
    },

    // The server's own path stays as it is; only the backup directory below it is created
    directorySegments(directory) {
        return String(directory || '')
            .split('/')
            .map(segment => segment.trim())
            .filter(Boolean)
            .map(segment => encodeURIComponent(segment));
    },

    authHeaders(username, password) {
        const headers = new Headers();
        if (username || password) {
            headers.set('Authorization', `Basic ${NtfyAPI.base64Encode(`${username || ''}:${password || ''}`)}`);
        }
        return headers;
    },

    async request(url, options) {
        let response;
        try {
            response = await fetch(url, options);
        } catch (error) {
            throw new Error(`无法连接 WebDAV 服务器：${error.message}`);
        }
        if (response.status === 401) {
            throw new Error('WebDAV 用户名或密码不正确（401）');
        }
        if (response.status === 403) {
            throw new Error('WebDAV 服务器拒绝访问（403）');
        }
        return response;
    },

    // Creates the backup directory, one level at a time below the server's own path. A level that
    // already exists (405) is fine.
    async ensureDirectory(url, directory, headers) {
        const segments = this.directorySegments(directory);
        if (segments.length === 0) {
            return;
        }
        let path = this.normalizeServerUrl(url);
        for (const segment of segments) {
            path += `/${segment}`;
            try {
                await fetch(`${path}/`, { method: 'MKCOL', headers });
            } catch (e) {
                // The server may create the file's directory itself; the PUT says more if not
            }
        }
    },

    async upload({ url, directory, username, password, text, fileName = this.FILE_NAME }) {
        const fileUrl = this.buildFileUrl(url, directory, fileName);
        await this.ensureDirectory(url, directory, this.authHeaders(username, password));
        const headers = this.authHeaders(username, password);
        headers.set('Content-Type', 'application/json; charset=utf-8');
        const response = await this.request(fileUrl, { method: 'PUT', headers, body: text });
        if (response.status === 409) {
            throw new Error('备份目录不存在，且无法自动创建（409）');
        }
        if (!response.ok) {
            throw new Error(`上传失败（HTTP ${response.status}）`);
        }
        return fileUrl;
    },

    async download({ url, directory, username, password, fileName = this.FILE_NAME }) {
        const fileUrl = this.buildFileUrl(url, directory, fileName);
        const response = await this.request(fileUrl, {
            method: 'GET',
            headers: this.authHeaders(username, password),
            cache: 'no-store'
        });
        if (response.status === 404) {
            throw new Error('服务器上没有找到备份文件（404），请先备份');
        }
        if (!response.ok) {
            throw new Error(`下载失败（HTTP ${response.status}）`);
        }
        return response.text();
    },

    // PROPFIND (WebDAV's "list what is there") checks the address and the login, and tells a WebDAV
    // server from a plain web server
    async test({ url, username, password }) {
        const base = this.normalizeServerUrl(url);
        if (!base) {
            throw new Error('请填写 WebDAV 服务器地址');
        }
        const headers = this.authHeaders(username, password);
        headers.set('Depth', '0');
        headers.set('Content-Type', 'application/xml; charset=utf-8');
        const response = await this.request(`${base}/`, {
            method: 'PROPFIND',
            headers,
            body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'
        });
        if (response.status === 207 || response.ok) {
            return true;
        }
        if (response.status === 404) {
            throw new Error('WebDAV 地址不存在（404），请检查服务器地址');
        }
        if (response.status === 405) {
            throw new Error('服务器不支持 WebDAV（405）');
        }
        throw new Error(`连接失败（HTTP ${response.status}）`);
    }
};
