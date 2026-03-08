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

// generate_interceptor 占位，Phase B 实现
globalThis.everMindInterceptor = async function (chat, contextSize, abort, type) {
    // TODO: Phase B
};

(async function init() {
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.APP_READY, () => {
        console.log(`[${MODULE_NAME}] Extension loaded (skeleton)`);
    });
})();
