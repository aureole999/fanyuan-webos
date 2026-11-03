# 番源 (fanyuan-webos)

面向 LG webOS（目标 LG C1 / webOS 6.x，免 Root）的追番与弹幕播放应用，应用 ID 为 `com.local.animesources`。无需额外部署家庭服务器或 NAS，安装到电视即可直接使用。

---

## 功能特性

- **番剧资料与时间表**：提供每日新番放送时间表、番剧搜索、评分、简介与剧集列表。
- **本地追番与历史记录**：支持番剧收藏（`想看` / `在看` / `看过`）、观看历史记录、断点自动续播，以及长按剧集标记已看。
- **在线视频源订阅**：与 Animeko 相同，应用不内置任何视频源规则，首次启动时自动下载默认订阅（Animeko 兼容格式），也可以在设置中添加、替换或停用订阅，手动刷新或按周期（1 / 6 / 12 / 24 小时）自动更新。
- **播放与线路切换**：支持播放中选集、切换同集不同线路、倍速播放（1x / 1.25x / 1.5x / 2x）与自动连播下一集。
- **弹幕服务与匹配**：默认使用公开的弹弹play 数据镜像，无需配置；也可以在设置中接入兼容 [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api) 的自建服务以获取更多平台的弹幕。自动匹配番剧与剧集弹幕，支持在播放器内手动指定平台/番剧/集数，以及调节弹幕开关、时间偏移、样式与密度。
- **电视界面**：基于 LG Enact 4.9.5 / Sandstone 2.9.6 与 Spotlight 焦点管理；海报、设置行、按钮、输入框、进度条等高频控件使用轻量自制组件，以保证在 LG C1 等低性能电视上的流畅度。
- **电视遥控操作**：
  - 支持方向键、确定键、返回键及动感应遥控器滚轮/指针。
  - 播放时控制栏隐藏状态下，按 `左右方向键` 直接快退/快进 10 秒；按 `OK` 唤出控制栏。

---

## 构建与安装

### 环境要求
- Node.js 18+ 与 npm
- LG 官方打包工具 [`@webos-tools/cli`](https://webostv.developer.lge.com/develop/tools/cli-installation)

### 1. 构建并打包 IPK

```sh
npm ci
npm run build
ares-package dist/app dist/service -o .
```

打包完成后会在当前目录生成 `com.local.animesources_0.7.4_all.ipk`。

### 2. 安装到电视

确保电视已开启 Developer Mode 并通过 `ares-setup-device` 配置好设备名（如 `YOUR_TV`）：

```sh
ares-install --device YOUR_TV com.local.animesources_0.7.4_all.ipk
ares-launch --device YOUR_TV com.local.animesources
```

---

## 界面回归测试

界面测试需 Node.js 22+。安装 [agent-browser](https://github.com/vercel-labs/agent-browser) 及其浏览器后，可以执行：

```sh
npm run build
npm run test:ui
```

测试使用本机模拟数据，覆盖设置弹窗、焦点恢复、直接输入搜索、时间表、订阅、空剧集换源以及播放器长按跳转；不连接电视或真实视频源。

## 外部服务

应用在电视上直接访问以下服务，不需要自建服务器：

| 服务 | 用途 |
|---|---|
| [Bangumi API](https://bangumi.github.io/api/)（`api.bgm.tv`） | 番剧资料、每日放送、本季热门、高分经典、剧集与续集关系 |
| `api.animeko.org` | 分割放送的季度关系；订阅地址直连失败时的公开订阅代理 |
| 视频源订阅（默认 `sub.creamycake.org`，可在设置中更换） | 视频源规则；各视频源网站由规则决定，与本项目无关 |
| 弹弹play 数据镜像（`api.danmaku.weeblify.app`） | 默认弹幕来源，并按 Bangumi 作品 ID 核验弹幕番剧 |
| 自建 [danmu_api](https://github.com/huangxd-/danmu_api)（可选） | 在设置中开启「使用自建服务」后替代默认弹幕来源 |

## 致谢与许可证

- 界面控件与焦点管理使用 [Enact / Sandstone](https://github.com/enactjs/sandstone)（Apache-2.0）；字体和依赖许可随安装包提供。
- 本项目按 **AGPL-3.0** 许可证发布，详见 [`LICENSE.txt`](LICENSE.txt)。
- 视频源规则格式与弹幕匹配参考 [`open-ani/animeko`](https://github.com/open-ani/animeko)。本仓库不包含任何视频源规则。
- 滚动弹幕渲染复用自 [`asdf17128/bili-webos`](https://github.com/asdf17128/bili-webos)（MIT 许可证，详见 [`frontend/vendor/bilitv/LICENSE`](frontend/vendor/bilitv/LICENSE)）。
- 第三方依赖许可证保存在 [`THIRD_PARTY_NOTICES/`](THIRD_PARTY_NOTICES/)，包括 `webOSTV.js`（Apache-2.0）和 Mozilla 根证书包（MPL-2.0）。
- 本项目为非官方实验移植版，与 Animeko、BiliTV 或 LG 官方无关。

### 弹幕作品身份核验

自动匹配在首个名称查询未找到优先弹弹play条目时，通过只读的弹弹play镜像作品资料核对 Bangumi 作品 ID，识别译名或季度命名不同的同一作品。身份关联（包括镜像确认没有对应条目的结果）按作品缓存 30 分钟，镜像无法连接时 1 分钟后重试；切集时重新解析当前服务的剧集 ID，区分季内集号与累计集号。未开启自建服务时，搜索、作品资料和弹幕都来自该镜像；开启自建服务后，镜像只用于核验作品身份，弹幕从自建服务获取。均不需要账号或密钥。手动关联始终优先：只有当它返回空弹幕、且自动匹配通过 Bangumi 作品 ID 核验时才会被替代，按名称猜测的结果不会覆盖手动选择。
