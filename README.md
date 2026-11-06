# 发送到 ntfy（汉化增强版）

一个用于发送和接收 ntfy 通知的浏览器扩展，基于
[TheDuffman85/send_to_ntfy_extension](https://github.com/TheDuffman85/send_to_ntfy_extension)
修改，遵循 MIT 许可证。

当前版本：**3.3.0**

## 本版本完成的修改

- **界面汉化**：弹窗、设置页、右键菜单、桌面通知、文件选择器、表情分类和错误提示均已翻译为中文。
- **设置页重组**：分为「发送」「接收与订阅」「外观」三个区块；「发送」和「接收与订阅」各带一个开关，默认关闭，关闭时折叠且不启用对应功能。
- **多个订阅**：接收支持添加任意多个订阅，每个订阅可以有自己的服务器和多个主题。
- **独立服务器**：发送和每个订阅可以连接不同的 ntfy 服务器；订阅的服务器或主题留空时，自动沿用发送服务器/主题。
- **多连接接收**：后台为每个订阅服务器分别建立 WebSocket 连接，轮询、消息历史和未读计数按服务器区分，同名主题不会串消息。
- **权限提示**：某个订阅服务器被浏览器拦截时，会在对应订阅卡片中单独显示「允许访问此服务器」按钮。
- **旧配置迁移**：旧版的单个订阅服务器/主题会自动迁移为第一个订阅；已配置发送的老用户升级后发送开关自动开启。
- **保留原功能**：右键发送、附件与 ZIP、优先级、标签与表情、Markdown、桌面通知、主题和弹窗尺寸等。

## 安装

- **Chrome / Edge**：解压 `build/send-to-ntfy-zh-chrome-v3.3.0.zip`，在扩展页开启开发者模式，选择「加载已解压的扩展程序」。
- **Firefox**：在 `about:debugging#/runtime/this-firefox` 中临时载入 `build/send-to-ntfy-zh-firefox-v3.3.0.xpi`。

详细配置和使用方法见 [使用说明.md](使用说明.md)。

## 构建

```bash
./build.sh          # Chrome + Firefox
./build.sh chrome
./build.sh firefox
```

需要 `node` 和 `zip`。构建产物在 `build/`。

## 许可证

MIT，见 [LICENSE](LICENSE)。原项目版权归 TheDuffman85 所有。
