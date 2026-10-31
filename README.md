# 番源 (fanyuan-webos)

面向 LG webOS（目标 LG C1 / webOS 6.x，免 Root）的追番与弹幕播放应用，应用 ID 为 `com.local.animesources`。无需额外部署家庭服务器或 NAS，安装到电视即可直接使用。

---

## 功能特性

- **番剧资料与时间表**：提供每日新番放送时间表、番剧搜索、评分、简介与剧集列表。
- **本地追番与历史记录**：支持番剧收藏（`想看` / `在看` / `看过`）、观看历史记录、断点自动续播，以及长按剧集标记已看。
- **在线视频源订阅**：内置 5 个初始在线视频源，支持在设置中管理在线订阅源、手动刷新或按周期（1 / 6 / 12 / 24 小时）自动更新。
- **播放与线路切换**：支持播放中选集、切换同集不同线路、倍速播放（1x / 1.25x / 1.5x / 2x）与自动连播下一集。
- **弹幕服务与匹配**：支持接入兼容 [huangxd-/danmu_api](https://github.com/huangxd-/danmu_api) 的自建弹幕服务，自动匹配番剧与剧集弹幕，并支持在播放器内手动指定平台/番剧/集数，以及调节弹幕开关、时间偏移、字号与透明度。
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

打包完成后会在当前目录生成 `com.local.animesources_0.6.6_all.ipk`。

### 2. 安装到电视

确保电视已开启 Developer Mode 并通过 `ares-setup-device` 配置好设备名（如 `YOUR_TV`）：

```sh
ares-install --device YOUR_TV com.local.animesources_0.6.6_all.ipk
ares-launch --device YOUR_TV com.local.animesources
```

---

## 致谢与许可证

- 本项目按 **AGPL-3.0** 许可证发布，详见 [`LICENSE.txt`](LICENSE.txt)。
- 视频源规则与弹幕匹配参考 [`open-ani/animeko`](https://github.com/open-ani/animeko)，初始规则快照来自 [`creamycake-anime/animeko-subs`](https://github.com/creamycake-anime/animeko-subs)。
- 部分界面组件复用自 [`asdf17128/bili-webos`](https://github.com/asdf17128/bili-webos)（MIT 许可证，详见 [`frontend/vendor/bilitv/LICENSE`](frontend/vendor/bilitv/LICENSE)）。
- 第三方依赖许可证保存在 [`THIRD_PARTY_NOTICES/`](THIRD_PARTY_NOTICES/)。
- 本项目为非官方实验移植版，与 Animeko、BiliTV 或 LG 官方无关。
