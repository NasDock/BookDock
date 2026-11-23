## License

This project is licensed under a **Personal-Use Only License**.

- 个人免费、可修改、可分发
- 商业使用需获得作者授权

查看完整协议请见：**[LICENSE](./LICENSE)**。

# BookDock 📖

<p align="center">
<img src="./apps/desktop/public/logo.png" width="200" />
</p>

BookDock（书仓）是一款专为 NAS 用户设计的电子书管理 & 阅读平台，支持多格式电子书阅读、TTS 语音朗读、多端同步，并提供强大的书源管理和 NAS 存储集成能力。

## ✨ 功能特点

- **多格式支持**: EPUB、PDF、MOBI、TXT 等主流电子书格式
- **阅读进度同步**: 跨设备（Web / Desktop / Mobile）同步阅读进度和书签
- **个性化设置**: 字体大小、行间距、主题模式（浅色 / 深色 / 护眼 / Sepia）
- **书签 & 高亮 & 笔记**: 支持添加书签和文字高亮，并可导出笔记
- **TTS 朗读**: 支持在阅读时后台持续朗读
- **NAS 本地账户**: 不依赖互联网，直接连接 NAS 使用
- **用户管理**: 添加、编辑、删除用户，查看用户阅读统计

## 本地开发

### 环境准备

- Node.js 22 + pnpm
- 将 `.env.example` 复制为 `.env`，按注释填写数据库、存储路径等配置

```bash
pnpm install
pnpm --filter @bookdock/server run prisma:generate
pnpm --filter @bookdock/server run prisma:push   # 首次建表 / 表结构变更后同步
# 需要生成迁移文件时改用：pnpm --filter @bookdock/server run prisma:migrate
```

### 启动

| 场景 | 命令 |
| --- | --- |
| Web 前端 + 服务端（推荐） | `pnpm dev` |
| 桌面端 Electron | `pnpm dev:desktop` |
| 仅服务端 | `pnpm --filter @bookdock/server run dev` |
| 移动端 Expo | `pnpm --filter @bookdock/mobile run start` |
| 移动端 Android / iOS 真机 | `pnpm --filter @bookdock/mobile run android` / `pnpm --filter @bookdock/mobile run ios` |

> 全量生产构建：`pnpm build`。桌面端单平台构建命令见下方发包章节。

## 发包

### 测试包

推送到 `feat/test` 分支，或在 GitHub Actions 手动触发 **Test Build (feat/test)**，会自动构建并上传：

| 端 | 产物与去向 | 本地等价命令 |
| --- | --- | --- |
| Desktop | dmg / exe / AppImage + deb → GitHub Release 草稿 `test-build`、Minio | `pnpm --filter @bookdock/desktop run build:mac` / `build:win` / `build:linux` |
| Android | `BookDock-{version}-test.apk` → 同上 | `cd apps/mobile/android && ./gradlew assembleRelease` |
| Server | Docker 镜像 `feat-test` 标签 → ghcr.io / Docker Hub / Harbor | `docker build --target runner -f Dockerfile .` |

### 正式包

```bash
pnpm release patch          # 也可 minor / major / 指定版本 x.y.z
git push && git push --tags
```

`pnpm release` 会统一更新所有包与 `app.json` 的版本号、执行 `expo prebuild`，并提交 `vX.Y.Z` tag。推送 tag 后自动触发：

| 工作流 | 产物 |
| --- | --- |
| `desktop-release.yml` | Desktop 三平台安装包 → GitHub Release（latest）、Minio |
| `android-release.yml` | `BookDock-{version}.apk` → GitHub Release、Minio |
| `docker-publish.yml` | Docker 镜像（版本号 + latest）→ ghcr.io / Docker Hub / Harbor |

## NAS 部署

```yaml
version: "3.9"

services:
  bookdock:
    image: mmdctjj/bookdock:latest
    container_name: bookdock
    restart: unless-stopped
    ports:
      - "8088:8088"
    environment:
      NODE_ENV: production
      PORT: 8088
      # SQLite
      DATABASE_URL: file:/data/db/bookdock.db
      # Storage paths
      NAS_EBOOK_PATH: /data/ebooks
      # 需要打开豆瓣网站自己复制
      DOUBAN_COOKIE: xxxx
      CACHE_PATH: /data/covers

    volumes:
      # Database
      - bookdock:/data/db
      # Ebook library
      - /volume1/迅雷下载/TXT:/data/ebooks
      - ./data/covers:/data/covers

volumes:
  bookdock:
```

> macOS 用户首次安装提示"已损坏"的解决方法：
>
> 1. 将 BookDock.app 拖到 Applications
> 2. 打开终端执行：xattr -cr /Applications/BookDock.app
> 3. 再次打开应用即可

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mmdctjj/BookDock&type=Date)](https://star-history.com/#mmdctjj/BookDock&Date)
