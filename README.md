# GOFRUXA 划词翻译插件（Chrome / Edge / Kiwi Browser）

`fanyi_gofruxa` 是一个 Manifest V3 浏览器扩展，支持 PC Chrome、Windows Edge 与 Android Kiwi Browser。用户在网页中划词或长按选择文字后，页面右侧会出现“译”悬浮球，点击即可翻译，并可把译文替换回原文位置。

官网页面：https://gofruxa.com/fanyi

## 功能特性

- **划词悬浮球**：PC 鼠标划词、Android Kiwi 长按选择文字后显示右侧“译”悬浮球。
- **跨端兼容**：支持 Chrome、Edge、Kiwi Browser，兼容 `mouseup`、`touchend`、`selectionchange`。
- **直译模式**：支持 Google 非官方免费接口，以及登录后云端百度翻译配置。
- **AI 翻译模式**：支持 NVIDIA 云模型 API Key。
- **账号同步**：在 GOFRUXA 网站账号中保存百度 APP ID / Key 和 NVIDIA API Key，插件登录后自动导入到浏览器本地。
- **域名级设置**：可为当前网站保存默认翻译类型、直译引擎、AI 模型、源语言和目标语言。
- **原文替换**：支持网页普通文本、`input`、`textarea` 和部分 `contenteditable` 编辑器中的选区替换。
- **小屏适配**：弹窗在 Android 小屏幕中自动收缩，避免超出屏幕。

## 目录结构

```text
manifest.json      # Manifest V3 配置
content.js         # 划词检测、悬浮球、面板、替换逻辑、账号交互
content.css        # 悬浮球、弹窗、Toast、小屏样式
background.js      # Service Worker，负责云端 API、Google/NVIDIA 请求、存储同步
md5.js             # 原生 JS MD5，保留用于百度签名兼容
options.html       # 插件选项页
options.css        # 选项页样式
options.js         # 插件登录、百度/NVIDIA Key 保存与自动导入
icons/             # 扩展图标
```

## Chrome / Edge 安装方法

1. 下载 Release 中的 `fanyi_chrome.zip`。
2. 解压到本地目录。
3. 打开 `chrome://extensions/` 或 `edge://extensions/`。
4. 开启“开发者模式”。
5. 点击“加载已解压的扩展程序”。
6. 选择解压后的扩展目录。
7. 打开普通网页，选中文字，点击右侧“译”悬浮球。

> 扩展更新或重新加载后，请刷新已经打开的网页，否则可能出现 `EXTENSION_CONTEXT_INVALIDATED`。

## Android Kiwi Browser 安装方法

1. 下载 Release 中的 `fanyi_chrome.zip`。
2. 将 zip 文件传到 Android 手机。
3. 打开 Kiwi Browser，访问 `chrome://extensions/`。
4. 开启“开发者模式”。
5. 点击 `+ (from .zip/.crx/.user.js)`，选择 `fanyi_chrome.zip`。
6. 打开网页，长按选择文字，松手后点击右侧“译”悬浮球。

## 账号与 Key 配置

### 网站端配置

1. 打开 https://gofruxa.com/fanyi/account.html。
2. 使用 E-mail 注册或登录。
3. 保存百度翻译 `APP ID / Key`。
4. 可选：保存 `NVIDIA API Key`，用于 AI 翻译。
5. 插件端登录同一账号后，会自动检查网站端是否存在百度/NVIDIA Key，并导入到浏览器本地存储。

### 插件端配置

1. 右键扩展图标，打开“选项”。
2. 登录同一 GOFRUXA 翻译账号。
3. 如果网站端已经保存 Key，插件会自动导入。
4. 也可以直接在插件选项页保存百度 Key 或 NVIDIA Key。

## 使用方法

### 普通翻译

1. 在网页中选中文字。
2. 点击右侧“译”悬浮球。
3. 插件根据当前域名设置执行翻译。
4. 如果网页允许替换，译文会替换原选区；如果替换失败，会显示提示或弹窗。

### 当前域名设置

1. 长按或按住悬浮球约 650ms。
2. 打开当前域名设置面板。
3. 可选择翻译类型、直译引擎、NVIDIA AI 模型、原始语言和目标语言。
4. 点击“保存为当前域名默认设置”。

## 常见问题

### EXTENSION_CONTEXT_INVALIDATED 是什么？

这表示当前网页中的 content script 还是旧扩展上下文，但扩展本体已经被刷新、重新加载或覆盖安装。刷新当前网页即可；如果还出现，关闭标签页后重新打开。

### 百度翻译不能用？

确认网站端或插件选项页已保存百度 APP ID / Key，并确认百度开放平台已开通“通用翻译 API”。

### NVIDIA AI 翻译不能用？

确认已保存 NVIDIA API Key。不要重复填写 `Bearer` 前缀，插件会自动处理。

## 开发说明

本项目不使用 React、Vue、TypeScript、Webpack、Vite 或 npm 依赖，所有代码均为原生 JavaScript / CSS / HTML，可直接作为“已解压的扩展程序”加载。

## 打包 Release ZIP

Windows PowerShell：

```powershell
Compress-Archive -Path .\manifest.json,.\content.js,.\content.css,.ackground.js,.\md5.js,.\options.html,.\options.css,.\options.js,.\icons -DestinationPath .anyi_chrome.zip -Force
```

## 版本

当前版本：`0.2.2`

## License

MIT License
