# st-evermind

SillyTavern 第三方扩展，通过 [EverMind](https://github.com/EverMind-ai) API 为角色对话提供跨会话持久记忆与关系成长能力。

## 安装

1. 打开 SillyTavern → Extensions → Install Extension
2. 输入仓库地址：`https://github.com/tt-a1i/st-evermind`
3. 安装后在扩展设置中找到 **EverMind Memory** 面板

## 配置

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API 地址 | EverMind 服务地址 | `https://api.evermind.ai` |
| API Key | EverMind API 密钥 | 空 |
| User ID | 用户标识 | `default_user` |
| 注入条数 | 每次生成注入多少条记忆 | `5` |
| 注入方式 | `system`（系统提示词）或 `hidden_message`（隐藏消息） | `system` |
| 自动写入 | 是否自动将每条消息写入记忆 | 关 |
| 新对话继承 | 新 chat 是否继承角色跨对话记忆 | 每次询问 |
| 角色关系成长 | 启用 Part 2 实验功能 | 关 |

配置完成后点击 **测试连接** 验证 API 可达。

## 功能

### Part 1：跨对话记忆（稳定）

- 消息自动/手动写回 EverMind
- 角色卡首次写入（幂等，内容变化才重写）
- 生成前自动搜索相关记忆并注入 prompt
- 新对话可继承角色历史记忆
- 记忆可视化面板（事件/内心/设定 三标签）
- 清除当前对话记忆 / 清除角色跨对话记忆

### Part 2：角色关系成长（实验）

- 关系信号检测（支持/信任/冲突/亲密 四维度）
- 信号累积触发 LLM 合成角色内心状态
- 内心状态作为隐藏记忆注入后续对话
- 角色感知漂移检测（面板内触发）

## 已知限制

- **群组对话不支持**：当前仅支持 1v1 角色对话
- **API Key 明文存储**：存储在 ST 的 extensionSettings 中，仅适合本地或演示环境
- **语义提取延迟**：EverMind 写入后需要短暂时间才能被搜索到
- **Part 2 为实验功能**：信号检测基于关键词匹配，可能存在误判

## 技术架构

```
manifest.json    扩展声明（generate_interceptor: everMindInterceptor）
index.js         全部逻辑（~980 行）
style.css        面板与设置样式
```

- 双 group_id 设计：`st_{char}_{chat}` 会话级 + `st_char_{char}` 角色级
- `generate_interceptor` 在每次 AI 生成前注入记忆
- 事件驱动：MESSAGE_SENT / MESSAGE_RECEIVED / CHAT_CHANGED / APP_READY

## 安全提示

本扩展在本地与 EverMind API 之间传输对话内容。在公共网络或共享设备上使用时，请确保：

- EverMind 服务通过 HTTPS 访问或仅在本地运行
- 不要将包含 API Key 的配置文件提交到公开仓库

## 版本

- `v0.1.0` - 初始版本，Part 1 完整 + Part 2 实验

## License

MIT
