# BookDock 📖

> 书仓 - 专为 NAS 用户打造的电子书阅读器，支持 TTS 语音朗读

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/Platform-Web%20|%20Desktop%20|%20Mobile-green.svg" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
  <img src="https://img.shields.io/badge/Node-%3E%3D18-brightgreen.svg" alt="Node">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D8-orange.svg" alt="pnpm">
</p>

BookDock（书仓）是一款专为 NAS 用户设计的电子书管理 & 阅读平台，支持多格式电子书阅读、TTS 语音朗读、多端同步，并提供强大的书源管理和 NAS 存储集成能力。

---

## ✨ 功能特点

### 📚 阅读功能
- **多格式支持**: EPUB、PDF、MOBI、TXT 等主流电子书格式
- **阅读进度同步**: 跨设备（Web / Desktop / Mobile）同步阅读进度和书签
- **个性化设置**: 字体大小、行间距、主题模式（浅色 / 深色 / 护眼 / Sepia）
- **书签 & 高亮**: 支持添加书签和文字高亮，并可导出笔记

### 🔊 语音朗读 (TTS)
- **多种语音引擎**: Web Speech API（前端离线朗读）+ 服务器端 TTS（高质量云端合成）
- **中文语音优化**: 专为中文设计的语音模型，语速 / 语调可调
- **播放控制**: 播放 / 暂停 / 停止、语速调节、音量调节、段落跳转
- **后台播放**: 支持在阅读时后台持续朗读

### 📱 多平台支持
- **Web 应用**: 响应式设计，支持 PWA 离线使用，可安装到桌面
- **桌面应用**: Tauri 构建，原生窗口体验，支持 Windows / macOS / Linux
- **移动端 (PWA)**: 渐进式 Web 应用，手机浏览器即可使用
- **NAS 存储集成**: 支持 WebDAV、SMB/AFP、FTP 等协议直连 NAS 文件

### 🔐 账户系统
- **在线账户**: 手机号注册 / 登录，云端数据同步
- **NAS 本地账户**: 不依赖互联网，直接连接 NAS 使用
- **会员系统**: 免费版（有限额）+ 专业版（年卡 / 永久卡，无限制）

### 👨💼 管理功能（管理员）
- **用户管理**: 添加、编辑、删除用户，查看用户阅读统计
- **书籍管理**: 上传、删除、批量导入书籍，查看书籍列表
- **书源管理**: 配置多个书源（WebDAV / SMB / FTP），支持定时自动同步

---

## 🖥️ 界面预览

| 书架 | 阅读器 | 听书模式 |
|:---:|:---:|:---:|
| ![书架预览](https://via.placeholder.com/400x300?text=书架页面) | ![阅读器预览](https://via.placeholder.com/400x300?text=阅读器) | ![听书模式](https://via.placeholder.com/400x300?text=听书模式) |

| 管理后台 | 会员中心 |
|:---:|:---:|
| ![管理后台](https://via.placeholder.com/400x300?text=管理后台) | ![会员中心](https://via.placeholder.com/400x300?text=会员中心) |

---

## 🚀 快速开始

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 18 | 前端和 API Server 运行基础 |
| pnpm | >= 8 | 推荐使用 pnpm 9.x |
| Rust | latest（仅桌面端） | Tauri 桌面端构建需要 |
| PostgreSQL | >= 14 | 数据库（Docker 部署时由容器提供） |
| Redis | >= 6 | 缓存和消息队列（Docker 部署时由容器提供） |

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/mmdctjj/BookDock.git
cd BookDock

# 2. 安装依赖（使用 pnpm）
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置必要的环境变量（见下文）

# 4. 启动开发服务
pnpm dev
```

> 💡 如果没有 NAS 或不想连接后端，可以只启动 Web 前端的部分功能（离线 TTS）。

### 开发模式启动

#### Web 前端 + API Server（完整功能）

```bash
# 终端 1：启动 API Server（NestJS）
cd apps/server
pnpm dev

# 终端 2：启动 Web 前端（Vite）
cd apps/web
pnpm dev
```

访问 `http://localhost:5173` 即可使用 Web 版本。

#### 桌面应用（Tauri）

```bash
# 确保已安装 Rust
rustc --version
cargo --version

# 启动桌面应用开发模式
pnpm desktop:dev
```

#### 移动端（PWA）

```bash
cd apps/mobile
pnpm dev
```

### 生产构建

```bash
# 构建所有应用
pnpm build

# 构建产物位于各 apps 的 dist 目录：
# apps/web/dist/         → Web 静态资源
# apps/desktop/src-tauri/target/release/  → 桌面可执行文件
```

---

## ⚙️ 环境变量配置

在项目根目录创建 `.env` 文件：

```bash
cp .env.example .env
```

### 必需变量

```env
# API 配置
VITE_API_BASE_URL=http://localhost:8080/api

# 数据库（仅生产部署）
DATABASE_URL=postgres://user:password@localhost:5432/bookdock

# JWT 配置
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRY=7d

# NAS 存储路径
NAS_EBOOK_PATH=/path/to/ebooks
NAS_AUDIO_PATH=/path/to/audiobooks
```

### 可选变量

```env
# TTS 服务地址（留空则使用浏览器内置 TTS）
VITE_TTS_SERVER_URL=http://localhost:8081

# API Server
PORT=3000
API_BASE_URL=http://localhost
CORS_ORIGINS=http://localhost:5173

# Redis
REDIS_URL=redis://localhost:6379

# 统计分析
VITE_ANALYTICS_ID=

# Nginx 端口配置
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443

# PostgreSQL
POSTGRES_USER=bookdock
POSTGRES_PASSWORD=your-password
POSTGRES_DB=bookdock
```

---

## 🛠️ 技术栈

### 前端（apps/web）

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18 | UI 框架 |
| TypeScript | 5 | 类型安全 |
| Vite | 5 | 构建工具 |
| TailwindCSS | 3 | 样式框架 |
| Zustand | 4 | 状态管理 |
| React Router | 6 | 路由管理 |
| TanStack Query | 5 | 数据请求与缓存 |
| epub.js | latest | EPUB 渲染引擎 |
| pdf.js | latest | PDF 渲染引擎 |

### 共享包（packages）

| 包名 | 用途 |
|------|------|
| `@bookdock/ui` | 共享 UI 组件库（Button / Input / Card 等） |
| `@bookdock/api-client` | 统一 API 客户端（Axios + 拦截器） |
| `@bookdock/ebook-reader` | 电子书渲染核心（epub.js / pdf.js 封装） |
| `@bookdock/tts` | TTS 语音合成封装（Web Speech + 服务端） |
| `@bookdock/auth` | 认证 & 授权（JWT + Refresh Token） |
| `@bookdock/webdav` | WebDAV 协议客户端 |
| `@bookdock/smb` | SMB/CIFS 协议客户端 |
| `@bookdock/ftp` | FTP 协议客户端 |

### 后端（apps/server）

| 技术 | 用途 |
|------|------|
| NestJS | Web 框架 |
| Prisma | ORM（PostgreSQL） |
| BullMQ | 任务队列（书籍索引、TTS 任务） |
| Redis | 缓存 & 消息队列 |
| JWT / Passport | 认证 & 授权 |
| Swagger | API 文档 |

### 桌面端（apps/desktop）

| 技术 | 用途 |
|------|------|
| Tauri 2 | 跨平台桌面框架 |
| Rust | 后端语言（文件操作、系统集成） |

### TTS 服务（tts-service）

| 技术 | 用途 |
|------|------|
| Python 3 | 服务端 TTS 引擎 |
| edge-tts / Coqui TTS | 中文语音合成模型 |

---

## 📁 项目结构

```
BookDock/
├── apps/
│   ├── web/                      # Web 应用（主要前端）
│   │   ├── src/
│   │   │   ├── pages/            # 页面组件
│   │   │   │   ├── Home/         # 首页
│   │   │   │   ├── Bookshelf/    # 书架
│   │   │   │   ├── Reader/       # 阅读器
│   │   │   │   ├── Settings/     # 设置
│   │   │   │   └── Admin/        # 管理后台
│   │   │   ├── components/       # 共享 UI 组件
│   │   │   ├── hooks/            # 自定义 Hooks
│   │   │   ├── stores/           # Zustand 状态管理
│   │   │   ├── services/        # API 服务层
│   │   │   ├── types/           # TypeScript 类型定义
│   │   │   └── utils/           # 工具函数
│   │   ├── index.html
│   │   └── package.json
│   │
│   ├── desktop/                  # Tauri 桌面应用
│   │   ├── src/                  # React 前端
│   │   ├── src-tauri/            # Rust 后端
│   │   │   ├── src/
│   │   │   │   └── main.rs       # Tauri 入口
│   │   │   ├── Cargo.toml
│   │   │   └── tauri.conf.json
│   │   └── package.json
│   │
│   ├── mobile/                   # 移动端 PWA
│   │   ├── src/
│   │   └── app.json
│   │
│   └── server/                   # NestJS API Server
│       ├── src/
│       │   ├── main.ts           # 应用入口
│       │   ├── app.module.ts     # 根模块
│       │   ├── config/           # 配置模块
│       │   │   └── database.module.ts
│       │   ├── health.controller.ts  # 健康检查
│       │   └── modules/
│       │       ├── auth/         # 认证模块
│       │       │   ├── auth.controller.ts
│       │       │   ├── auth.service.ts
│       │       │   ├── strategies/  # Passport 策略
│       │       │   └── guards/      # 路由守卫
│       │       ├── books/       # 书籍管理模块
│       │       ├── reading-progress/  # 阅读进度 & 书签
│       │       ├── tts/          # TTS 任务管理
│       │       ├── vip/          # 会员系统
│       │       ├── source/       # 书源管理（WebDAV/SMB/FTP）
│       │       └── admin/       # 管理后台
│       └── prisma/
│           └── schema.prisma     # 数据库模型
│
├── packages/                     # 共享 npm 包
│   ├── ui/                      # UI 组件库
│   ├── api-client/              # API 客户端封装
│   ├── ebook-reader/            # 电子书渲染核心
│   ├── tts/                     # TTS 封装
│   ├── auth/                    # 认证工具
│   ├── webdav/                  # WebDAV 客户端
│   ├── smb/                     # SMB 客户端
│   └── ftp/                     # FTP 客户端
│
├── tts-service/                 # Python TTS 服务
│   └── tts_service.py
│
├── docs/                        # 文档
│   ├── QUICK_START.md           # 快速入门
│   ├── USER_GUIDE.md            # 用户指南
│   ├── DEPLOY.md                # 部署指南
│   └── API.md                   # API 文档
│
├── scripts/                     # 工具脚本
│
├── nginx/                       # Nginx 配置
│   ├── nginx.conf
│   └── conf.d/
│
├── Dockerfile.server            # API Server Docker 构建文件
├── Dockerfile.tts               # TTS 服务 Docker 构建文件
├── docker-compose.yml           # Docker Compose 编排
├── pnpm-workspace.yaml          # pnpm 工作空间配置
├── tsconfig.json                # TypeScript 根配置
├── package.json                 # 根 package.json
└── README.md
```

---

## 📝 API 文档

详细的 API 接口文档请参考 [docs/API.md](./docs/API.md)。

API 基于 RESTful 风格设计，认证使用 JWT Bearer Token，主要模块包括：

| 模块 | 前缀 | 说明 |
|------|------|------|
| 认证 | `/api/auth` | 登录 / 注册 / 刷新 Token |
| 书籍 | `/api/books` | 书架 CRUD / 搜索 / 下载 |
| 阅读进度 | `/api/reading-progress` | 进度同步 / 书签 / 高亮 |
| TTS | `/api/tts` | 语音列表 / 合成任务 |
| 会员 | `/api/vip` | 登录 / 权益 / 订单 |
| 书源 | `/api/source` | 书源 CRUD / 同步 |
| 管理 | `/api/admin` | 用户管理 / 数据统计 |

---

## 🚢 部署指南

详细的 Docker / NAS / 云平台部署说明请参考 [docs/DEPLOY.md](./docs/DEPLOY.md)。

### Docker 快速部署

```bash
# 1. 克隆项目
git clone https://github.com/mmdctjj/BookDock.git
cd BookDock

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填写 NAS 路径和数据库密码

# 3. 一键启动
docker-compose up -d

# 4. 访问
open http://localhost
```

### 支持的部署平台

- ✅ **Docker** — 完整服务（API + TTS + Nginx + PostgreSQL + Redis）
- ✅ **NAS** — 威联通（QNAP）、群晖（Synology）、Unraid
- ✅ **云平台** — Vercel（Web 前端）、Railway、Render
- ✅ **桌面打包** — Electron / Tauri 构建可分发安装包

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发流程

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/your-username/BookDock.git

# 2. 创建功能分支
git checkout -b feature/your-feature-name

# 3. 安装依赖
pnpm install

# 4. 开发
pnpm dev

# 5. 提交（遵循 Conventional Commits）
git commit -m "feat: add new feature"

# 6. Push 并创建 PR
git push origin feature/your-feature-name
```

### 代码规范

- 使用 TypeScript，遵循项目 tsconfig 配置
- 前端组件使用 TailwindCSS 样式
- 后端使用 NestJS 模块化结构
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。

---

## 🙏 致谢

- [epub.js](https://github.com/futurepress/epub.js) — EPUB 渲染引擎
- [pdf.js](https://github.com/mozilla/pdf.js) — PDF 渲染引擎
- [TailwindCSS](https://tailwindcss.com/) — 样式框架
- [Tauri](https://tauri.app/) — 跨平台桌面框架
- [NestJS](https://nestjs.com/) — 后端 Web 框架
- [Prisma](https://prisma.io/) — 数据库 ORM

---

<p align="center">
  Made with ❤️ for NAS users
</p>
