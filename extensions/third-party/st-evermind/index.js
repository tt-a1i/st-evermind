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

// ── generate_interceptor 占位，Phase B 实现 ──────────────────

globalThis.everMindInterceptor = async function (chat, contextSize, abort, type) {
    // TODO: Phase B
};

// ── 扩展入口 ─────────────────────────────────────────────────

(async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.APP_READY, () => {
        mountSettingsPanel();
        console.log(`[${MODULE_NAME}] Extension loaded`);
    });
})();
