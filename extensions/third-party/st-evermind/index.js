// ============================================================
// st-evermind/index.js — EverMind Memory for SillyTavern
// 单文件实现，所有模块内联
// ============================================================

const MODULE_NAME = 'st_evermind';
const API_BASE = '/api/v1/memories';

const defaultSettings = Object.freeze({
    enabled: false,
    api_base_url: 'http://localhost:1995',
    api_key: '',
    user_id: 'st_user',
    inject_limit: 6,
    inject_mode: 'system',
    auto_write: true,
    memory_inherit: 'ask',
    growth_enabled: false,
});

function getSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE_NAME]) {
        ctx.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    ctx.extensionSettings[MODULE_NAME] = SillyTavern.libs.lodash.merge(
        structuredClone(defaultSettings),
        ctx.extensionSettings[MODULE_NAME]
    );
    return ctx.extensionSettings[MODULE_NAME];
}

// ── group_id 与上下文工具 ─────────────────────────────────────

function sanitize(s) {
    return s.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 40);
}

function buildGroupId(charName, chatFile) {
    return `st_${sanitize(charName)}_${sanitize(chatFile)}`;
}

function buildCharGroupId(charName) {
    return `st_char_${sanitize(charName)}`;
}

function getCurrentGroupId() {
    const ctx = SillyTavern.getContext();
    if (ctx.characterId === undefined) return null;
    const char = ctx.characters[ctx.characterId];
    if (!char) return null;
    const meta = SillyTavern.getContext().chatMetadata;
    if (!meta[MODULE_NAME]) meta[MODULE_NAME] = {};
    if (!meta[MODULE_NAME].group_id) {
        const chatFile = meta.file_name || 'default';
        meta[MODULE_NAME].group_id = buildGroupId(char.name, chatFile);
        SillyTavern.getContext().saveMetadata();
    }
    return meta[MODULE_NAME].group_id;
}

function getCurrentCharGroupId() {
    const ctx = SillyTavern.getContext();
    if (ctx.characterId === undefined) return null;
    const char = ctx.characters[ctx.characterId];
    if (!char) return null;
    return buildCharGroupId(char.name);
}

function getCurrentCharacterName() {
    const ctx = SillyTavern.getContext();
    if (ctx.characterId === undefined) return null;
    return ctx.characters[ctx.characterId]?.name || null;
}

function getLastUserMessage(chat) {
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user && chat[i].mes) return chat[i].mes;
    }
    return '';
}

// ── EverMind HTTP 客户端 ──────────────────────────────────────

const EverMindClient = {

    _headers() {
        const s = getSettings();
        const h = { 'Content-Type': 'application/json' };
        if (s.api_key) h['Authorization'] = `Bearer ${s.api_key}`;
        return h;
    },

    _url(path = '') {
        return `${getSettings().api_base_url}${API_BASE}${path}`;
    },

    async writeMessage(stMessage, groupId, charName, { flush = false } = {}) {
        const s = getSettings();
        const isUser = stMessage.is_user;
        const payload = {
            message_id: `st_${stMessage.send_date || Date.now()}_${isUser ? s.user_id : 'char'}_${Math.random().toString(36).slice(2, 6)}`,
            create_time: new Date(stMessage.send_date || Date.now()).toISOString(),
            sender: isUser ? s.user_id : charName,
            sender_name: isUser ? (stMessage.name || s.user_id) : charName,
            role: isUser ? 'user' : 'assistant',
            content: stMessage.mes,
            group_id: groupId,
            group_name: charName,
            refer_list: [],
        };
        if (flush) payload.flush = true;

        try {
            const res = await fetch(this._url(''), {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            console.debug(`[${MODULE_NAME}] writeMessage:`, data.result?.status_info);
            return data;
        } catch (e) {
            console.error(`[${MODULE_NAME}] writeMessage failed:`, e.message);
            return null;
        }
    },

    async searchMemories(query, groupId, charGroupId, scope = 'both') {
        const s = getSettings();
        const results = [];

        const doSearch = async (gid) => {
            const payload = {
                query,
                user_id: s.user_id,
                group_id: gid,
                retrieve_method: 'hybrid',
                memory_types: ['episodic_memory', 'profile', 'event_log'],
                top_k: s.inject_limit,
                include_metadata: true,
            };
            try {
                const res = await fetch(this._url('/search'), {
                    method: 'POST',
                    headers: this._headers(),
                    body: JSON.stringify(payload),
                });
                if (!res.ok) return [];
                const data = await res.json();
                return this._flattenResults(data.result?.memories || []);
            } catch (e) {
                console.error(`[${MODULE_NAME}] search failed (group: ${gid}):`, e.message);
                return [];
            }
        };

        if (scope === 'session' || scope === 'both') {
            results.push(...await doSearch(groupId));
        }
        if ((scope === 'character' || scope === 'both') && charGroupId) {
            results.push(...await doSearch(charGroupId));
        }

        const seen = new Set();
        return results
            .filter(m => {
                if (seen.has(m.content)) return false;
                seen.add(m.content);
                return true;
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, s.inject_limit);
    },

    _flattenResults(memories) {
        const flat = [];
        for (const group of memories) {
            for (const [type, items] of Object.entries(group)) {
                for (const item of items) {
                    flat.push({
                        type,
                        content: item.content || item.summary || '',
                        timestamp: item.timestamp || '',
                        score: item.score || 0,
                    });
                }
            }
        }
        return flat;
    },

    async upsertConversationMeta(groupId, charName) {
        const s = getSettings();
        const payload = {
            version: '1.0.0',
            scene: 'assistant',
            scene_desc: { description: `SillyTavern roleplay with ${charName}`, type: 'roleplay' },
            name: charName,
            group_id: groupId,
            created_at: new Date().toISOString(),
            user_details: {
                [s.user_id]: { full_name: s.user_id, role: 'user' },
                [charName]: { full_name: charName, role: 'assistant', custom_role: 'Character' },
            },
            tags: ['sillytavern', 'roleplay'],
        };
        try {
            const res = await fetch(this._url('/conversation-meta'), {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            console.debug(`[${MODULE_NAME}] conversation-meta upserted for`, groupId);
        } catch (e) {
            console.error(`[${MODULE_NAME}] upsertConversationMeta failed:`, e.message);
        }
    },

    async deleteMemories(groupId) {
        try {
            await fetch(this._url(''), {
                method: 'DELETE',
                headers: this._headers(),
                body: JSON.stringify({ group_id: groupId }),
            });
        } catch (e) {
            console.error(`[${MODULE_NAME}] delete failed:`, e.message);
        }
    },
};

// ── 设置面板 ──────────────────────────────────────────────────

const SETTINGS_HTML = `
<div id="evermind-settings">
  <div class="evermind-row">
    <label>
      <input type="checkbox" id="evermind-enabled" />
      启用 EverMind 记忆
    </label>
  </div>
  <div class="evermind-row">
    <label>API 地址</label>
    <input type="text" id="evermind-api-url" placeholder="http://localhost:1995" />
  </div>
  <div class="evermind-row">
    <label>API Key <small>(明文存储，仅用于演示)</small></label>
    <input type="password" id="evermind-api-key" placeholder="留空表示本地部署无鉴权" />
  </div>
  <div class="evermind-row">
    <label>用户 ID</label>
    <input type="text" id="evermind-user-id" placeholder="st_user" />
  </div>
  <div class="evermind-row">
    <label>注入条数上限</label>
    <input type="number" id="evermind-inject-limit" min="1" max="20" />
  </div>
  <div class="evermind-row">
    <label>注入位置</label>
    <select id="evermind-inject-mode">
      <option value="system">System（推荐）</option>
      <option value="hidden_message">Hidden Message</option>
    </select>
  </div>
  <div class="evermind-row">
    <label>
      <input type="checkbox" id="evermind-auto-write" />
      自动写入每条消息
    </label>
  </div>
  <div class="evermind-row">
    <button id="evermind-test-btn">测试连接</button>
    <span id="evermind-test-result"></span>
  </div>
</div>
`;

function loadSettingsUI() {
    const s = getSettings();
    document.getElementById('evermind-enabled').checked = s.enabled;
    document.getElementById('evermind-api-url').value = s.api_base_url;
    document.getElementById('evermind-api-key').value = s.api_key;
    document.getElementById('evermind-user-id').value = s.user_id;
    document.getElementById('evermind-inject-limit').value = s.inject_limit;
    document.getElementById('evermind-inject-mode').value = s.inject_mode;
    document.getElementById('evermind-auto-write').checked = s.auto_write;
}

function bindSettingsEvents() {
    const s = getSettings();
    const { saveSettingsDebounced } = SillyTavern.getContext();

    const bind = (id, key, transform = (v) => v) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            s[key] = transform(el.type === 'checkbox' ? el.checked : el.value);
            saveSettingsDebounced();
        });
    };

    bind('evermind-enabled', 'enabled');
    bind('evermind-api-url', 'api_base_url');
    bind('evermind-api-key', 'api_key');
    bind('evermind-user-id', 'user_id');
    bind('evermind-inject-limit', 'inject_limit', Number);
    bind('evermind-inject-mode', 'inject_mode');
    bind('evermind-auto-write', 'auto_write');

    // 测试连接：用最小可读 API（GET /memories?limit=1）
    document.getElementById('evermind-test-btn').addEventListener('click', async () => {
        const result = document.getElementById('evermind-test-result');
        result.textContent = '连接中...';
        try {
            const h = { 'Content-Type': 'application/json' };
            if (s.api_key) h['Authorization'] = `Bearer ${s.api_key}`;
            const res = await fetch(
                `${s.api_base_url}${API_BASE}?user_id=test&limit=1`,
                { headers: h }
            );
            if (res.ok) {
                result.textContent = '✅ 连接成功';
                result.style.color = 'lightgreen';
            } else {
                result.textContent = `❌ HTTP ${res.status}`;
                result.style.color = 'salmon';
            }
        } catch (e) {
            result.textContent = `❌ ${e.message}`;
            result.style.color = 'salmon';
        }
    });
}

function mountSettingsPanel() {
    const container = document.getElementById('extensions_settings');
    if (!container) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>EverMind Memory</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                ${SETTINGS_HTML}
            </div>
        </div>
    `;
    container.appendChild(wrapper);
    loadSettingsUI();
    bindSettingsEvents();
}

// ── 角色卡写入（角色级幂等）──────────────────────────────────

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(36);
}

async function writeCharacterCardToMemory(charGroupId, character) {
    const fields = [
        { key: 'description', label: '角色设定' },
        { key: 'personality', label: '性格' },
        { key: 'scenario', label: '场景背景' },
    ];

    const cardContent = fields.map(f => character[f.key]?.trim() || '').join('|');
    const cardHash = simpleHash(cardContent);

    // 角色级幂等：hash 存在 extensionSettings，跨所有 chat 共享
    const s = getSettings();
    if (!s._cardHashes) s._cardHashes = {};
    if (s._cardHashes[character.name] === cardHash) {
        console.debug(`[${MODULE_NAME}] Character card unchanged, skip write`);
        return;
    }

    for (const f of fields) {
        const value = character[f.key]?.trim();
        if (!value) continue;
        await EverMindClient.writeMessage({
            is_user: false,
            name: character.name,
            send_date: Date.now(),
            mes: `[${f.label}] ${value}`,
        }, charGroupId, character.name, { flush: true });
    }

    s._cardHashes[character.name] = cardHash;
    SillyTavern.getContext().saveSettingsDebounced();
    console.debug(`[${MODULE_NAME}] Character card written:`, character.name);
}

// ── 关键消息检测 ──────────────────────────────────────────────

const ROLEPLAY_KEYWORDS = [
    '记住', '设定', '规则', '世界观', '你是', '你的身份',
    '背景', '约定', '不能', '禁止', '一定要', '永远',
    'remember', 'setting', 'rule', 'you are', 'your role',
    'always', 'never', 'must',
];

function isKeyRoleplayMessage(text) {
    return ROLEPLAY_KEYWORDS.some(kw =>
        text.toLowerCase().includes(kw.toLowerCase())
    );
}

// ── 消息写回 ──────────────────────────────────────────────────

async function handleMessageWriteback(messageIndex) {
    const s = getSettings();
    if (!s.enabled || !s.auto_write) return;

    const groupId = getCurrentGroupId();
    const charName = getCurrentCharacterName();
    if (!groupId || !charName) return;

    const ctx = SillyTavern.getContext();
    const message = ctx.chat[messageIndex];
    if (!message?.mes) return;

    const isKey = message.is_user && isKeyRoleplayMessage(message.mes);

    // 写入当前会话 group
    await EverMindClient.writeMessage(message, groupId, charName, { flush: isKey });

    // 关键设定额外写入角色维度 group（跨会话存活）
    if (isKey) {
        const charGroupId = getCurrentCharGroupId();
        if (charGroupId) {
            await EverMindClient.writeMessage(
                message, charGroupId, charName, { flush: true }
            );
            toastr.info('关键设定已存入长期记忆', '', { timeOut: 2000 });
        }
    }
}

async function handleChatChanged() {
    const s = getSettings();
    if (!s.enabled) return;

    const ctx = SillyTavern.getContext();
    if (ctx.characterId === undefined) return;
    const char = ctx.characters[ctx.characterId];
    if (!char) return;

    // 重置 group_id 缓存
    const meta = SillyTavern.getContext().chatMetadata;
    if (meta[MODULE_NAME]) {
        delete meta[MODULE_NAME].group_id;
    }

    const groupId = getCurrentGroupId();
    await EverMindClient.upsertConversationMeta(groupId, char.name);

    // 角色卡写入（带幂等保护）
    const charGroupId = getCurrentCharGroupId();
    if (charGroupId) {
        await writeCharacterCardToMemory(charGroupId, char);
    }
}

function registerEventListeners() {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.MESSAGE_SENT, handleMessageWriteback);
    eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageWriteback);
    eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
}

// ── 记忆注入 ──────────────────────────────────────────────────

function formatMemoriesForInjection(memories) {
    if (!memories.length) return null;
    const lines = memories.map(m => {
        const time = m.timestamp
            ? `[${new Date(m.timestamp).toLocaleDateString('zh-CN')}] `
            : '';
        return `- ${time}${m.content}`;
    });
    return [
        '[长期记忆 / Long-term Memory]',
        ...lines,
        '[记忆结束 / End of Memory]',
    ].join('\n');
}

globalThis.everMindInterceptor = async function (chat, contextSize, abort, type) {
    const s = getSettings();
    if (!s.enabled) return;
    if (['quiet', 'impersonate'].includes(type)) return;

    const groupId = getCurrentGroupId();
    if (!groupId) return;

    const lastMsg = getLastUserMessage(chat);
    if (!lastMsg) return;

    // 最小版：只查 session scope，Phase C 升级为双 scope
    const memories = await EverMindClient.searchMemories(
        lastMsg, groupId, null, 'session'
    );
    if (!memories.length) return;

    const memoryText = formatMemoriesForInjection(memories);
    if (!memoryText) return;

    if (s.inject_mode === 'system') {
        chat.unshift({
            is_user: false,
            is_system: true,
            name: 'Memory',
            send_date: Date.now(),
            mes: memoryText,
        });
    } else {
        let insertAt = 0;
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i].is_user) { insertAt = i; break; }
        }
        chat.splice(insertAt, 0, {
            is_user: false,
            name: 'Memory',
            send_date: Date.now(),
            mes: memoryText,
        });
    }

    console.debug(`[${MODULE_NAME}] Injected ${memories.length} memories (type: ${type})`);
};

// ── 扩展入口 ─────────────────────────────────────────────────

(async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.APP_READY, () => {
        mountSettingsPanel();
        registerEventListeners();
        console.log(`[${MODULE_NAME}] Extension loaded`);
    });
})();
