# 番源 (fanyuan-webos)

面向 LG webOS（目标 LG C1 / webOS 6.x，免 Root）的追番与弹幕播放应用，应用 ID 为 `com.local.animesources`。无需额外部署家庭服务器或 NAS，安装到电视即可直接使用。

---

## 功能特性

- **番剧资料与时间表**：提供每日新番放送时间表、番剧搜索、评分、简介与剧集列表。
- **本地追番与历史记录**：支持番剧收藏（`想看` / `在看` / `看过`）、观看历史记录、断点自动续播，以及长按剧集标记已看。
- **在线视频源订阅**：与 Animeko 相同，应用不内置任何视频源规则，首次启动时自动下载默认订阅（Animeko 兼容格式），也可以在设置中添加、替换或停用订阅，手动刷新或按周期（1 / 6 / 12 / 24 小时）自动更新。
- **播放与线路切换**：支持播放中选集、切换同集不同线路、倍速播放（1x / 1.25x / 1.5x / 2x）与自动连播下一集。
- **弹幕服务与匹配**：默认使用项目的只读弹幕服务（`danmu-api.aureole999.workers.dev`），无需配置；推荐自行部署 danmu_api，也可以在设置中接入兼容 [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api) 的自建服务以获取更多平台的弹幕。自动匹配番剧与剧集弹幕，支持在播放器内手动指定平台/番剧/集数，以及调节弹幕开关、时间偏移、样式与密度。
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

打包完成后会在当前目录生成 `com.local.animesources_0.7.5_all.ipk`。

### 2. 安装到电视

确保电视已开启 Developer Mode 并通过 `ares-setup-device` 配置好设备名（如 `YOUR_TV`）：

```sh
ares-install --device YOUR_TV com.local.animesources_0.7.5_all.ipk
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
| 项目默认服务（`danmu-api.aureole999.workers.dev`） | 匿名只读的 danmu_api，仅使用 dandan 来源 |
| 弹弹play 数据镜像（`api.danmaku.weeblify.app`） | 用于核验 Bangumi 与弹弹play的作品 ID；默认服务的 dandan 上游也依赖它 |
| 自建 [danmu_api](https://github.com/huangxd-/danmu_api)（可选） | 在设置中开启「使用自建服务」后替代默认弹幕来源 |

## 致谢与许可证

- 界面控件与焦点管理使用 [Enact / Sandstone](https://github.com/enactjs/sandstone)（Apache-2.0）；字体和依赖许可随安装包提供。
- 本项目按 **AGPL-3.0** 许可证发布，详见 [`LICENSE.txt`](LICENSE.txt)。
- 视频源规则格式与弹幕匹配参考 [`open-ani/animeko`](https://github.com/open-ani/animeko)。本仓库不包含任何视频源规则。
- 滚动弹幕渲染复用自 [`asdf17128/bili-webos`](https://github.com/asdf17128/bili-webos)（MIT 许可证，详见 [`frontend/vendor/bilitv/LICENSE`](frontend/vendor/bilitv/LICENSE)）。
- 第三方依赖许可证保存在 [`THIRD_PARTY_NOTICES/`](THIRD_PARTY_NOTICES/)，包括 `webOSTV.js`（Apache-2.0）和 Mozilla 根证书包（MPL-2.0）。
- 本项目为非官方实验移植版，与 Animeko、BiliTV 或 LG 官方无关。

### 弹幕作品身份核验

自动匹配优先通过只读的弹弹play镜像作品资料核对 Bangumi 作品 ID，确认同一作品后，直接按弹弹play作品 ID 向当前服务请求剧集与弹幕。自建服务尚未缓存该 ID 时，使用已确认的名称建立缓存，并核对来源和作品 ID；ID 无法确认、目标集缺失或弹幕为空时，再回退名称匹配。身份关联（包括镜像确认没有对应条目的结果）按作品缓存 30 分钟，镜像无法连接时 1 分钟后重试；切集时重新解析当前服务的剧集 ID，区分季内集号与累计集号。未开启自建服务时，搜索、剧集和弹幕通过项目默认服务获取；开启自建服务后，使用自己的 danmu_api 地址和 Token。镜像仍用于核验作品身份。均不需要账号或密钥。手动关联始终优先：当它在当前服务中不存在、剧集失效或返回空弹幕时，才尝试通过已核验的 Bangumi 作品 ID 恢复，按名称猜测的结果不会覆盖手动选择。


### 多季番与源集号映射

详情页有 Bangumi 身份时，以该条目的正片列表为选集基准。视频源页面按条目内 `ep`、Bangumi `sort`、季内连续编号分别匹配；分割放送、跨季合并、序章和特别篇均保留各自身份。集名冲突、重复或集数结构不足以确认时不自动播放。缺失剧集显示为“此线路暂无”，不会把后续剧集往前挪。

`src/episode-matching.cjs` 是视频和弹幕共用的纯匹配规则；`src/bangumi-context.cjs` 只读取 Bangumi 资料并缓存系列和剧集；`src/source-matcher.cjs` 负责搜源、读取线路和生成保留原始播放 ID 的映射。播放器将明确的 Bangumi 剧集 ID 交给弹幕服务。已有源进度可继续读取，新进度按 Bangumi 剧集 ID 跨源保存。

`npm test` 包含 `test/multiseason.test.cjs`。`test/fixtures/multiseason/` 保存实际查询的公开名称、集号及页面列表，覆盖黑礁、无职、Re:0，以及独立验证的 86、进击的巨人、夏目友人帐和灵能百分百；不含访问令牌或临时视频地址。回归完全离线，包含搜索到播放映射和自动弹幕调用的回放。

不转换“陆／六”等作品名称中的写法。自动匹配不能确认页面时保留候选，用户手动选择后按条目和视频源保存在本机；再次点击当前视频源，或再次点击已选中的线路，可打开匹配及候选番剧列表；重新选择后更新该条目的本地关联，取消则保留当前页面。


### 查看其它源集数与源搜索数量

匹配剧集列表后的“更多”可展开该线路未匹配到当前番剧的集数，保持源原始名称和编号。这些集数可手动播放，不借用当前季的 Bangumi 身份或自动套用其弹幕，可在播放器中手动选择弹幕。

详情页打开选源列表时，每个源只执行一次番剧搜索，显示同名匹配数及需确认的候选数；数字不是可播放集数。探测最多同时两个，结果只更新对应数字，不重建详情页或移动焦点；关闭弹窗取消尚未开始的查询。结果缓存五分钟，订阅规则刷新后重新探测，查询失败不计为零。

设置 → 播放 →「继续观看时先选集」可让首页和观看历史中的续播入口先进入番剧选集页；默认关闭，继续直接续播。选集页的「继续观看」按钮始终可直接续播。
