# BookDock 📖

> 书仓 - 专为 NAS 用户打造的电子书阅读器，支持 TTS 语音朗读

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/Platform-Web%20|%20Desktop%20|%20Mobile-green.svg" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
</p>

## ✨ 功能特点

### 📚 阅读功能
- **多格式支持**: EPUB、PDF、MOBI、TXT
- **阅读进度同步**: 跨设备同步阅读进度
- **个性化设置**: 字体大小、行间距、主题模式（浅色/深色/护眼）
- **书签功能**: 管理和跳转到书签位置

### 🔊 语音朗读 (TTS)
- **多种语音引擎**: 支持 Web Speech API 和服务器端 TTS
- **中文语音优化**: 专为中文设计
- **播放控制**: 播放/暂停/停止、语速调节、音量调节
- **后台播放**: 支持在阅读时后台播放

### 📱 多平台支持
- **Web 应用**: 响应式设计，支持 PWA 离线使用
- **桌面应用**: Tauri 构建，原生体验
- **NAS 集成**: 支持 WebDAV、SMB、FTP 等协议连接 NAS

### 🔐 账户系统
- **在线账户**: 注册/登录云端同步
- **NAS 本地账户**: 直接连接 NAS 使用
- **会员系统**: 免费版和专业版

### 👨‍💼 管理功能 (管理员)
- **用户管理**: 添加、编辑、删除用户
- **书籍管理**: 上传、删除、查看书籍
- **电子书源管理**: 配置多个书源，自动同步

## 🛠️ 技术栈

### 前端
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **TailwindCSS** - 样式框架
- **Zustand** - 状态管理
- **React Router** - 路由管理

### 共享包
- `@bookdock/ui` - 共享 UI 组件库
- `@bookdock/api-client` - API 客户端
- `@bookdock/ebook-reader` - 电子书渲染引擎
- `@bookdock/tts` - TTS 语音合成
- `@bookdock/auth` - 认证和授权

### 桌面端
- **Tauri** - 跨平台桌面框架
- **Rust** - 后端语言

## 📦 安装

### 前置要求
- Node.js >= 18
- pnpm >= 8
- Rust (仅桌面端开发)

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/mmdctjj/BookDock.git
cd BookDock

# 安装依赖
pnpm install

# 启动 Web 开发服务器
pnpm dev
```

### 桌面端开发

```bash
# 安装 Rust 依赖
cd apps/desktop/src-tauri
cargo install

# 返回项目根目录
cd ../..

# 启动桌面应用
pnpm desktop:dev
```

## 📁 项目结构

```
BookDock/
├── apps/
│   ├── web/                 # Web 应用 (主要)
│   │   ├── src/
│   │   │   ├── pages/       # 页面组件
│   │   │   ├── hooks/       # 自定义 Hooks
│   │   │   ├── stores/      # Zustand 状态管理
│   │   │   └── components/  # 共享组件
│   │   └── ...
│   ├── desktop/             # Tauri 桌面应用
│   │   ├── src/             # React 前端
│   │   ├── src-tauri/       # Rust 后端
│   │   └── ...
│   └── mobile/              # 移动端 (PWA)
├── packages/
│   ├── ui/                 # UI 组件库
│   ├── api-client/          # API 客户端
│   ├── ebook-reader/        # 电子书渲染
│   ├── tts/                 # TTS 语音合成
│   └── auth/                # 认证授权
├── pnpm-workspace.yaml      # pnpm 工作空间配置
├── tsconfig.json            # TypeScript 配置
└── README.md
```

## 🎨 界面预览

### 书架页面
- 网格/列表视图切换
- 书籍封面、标题、作者
- 阅读进度显示
- 搜索和筛选功能

### 阅读器
- 舒适的阅读界面
- 多种主题模式
- 字体大小调节
- 页面导航

### 听书模式
- 语音朗读控制
- 播放进度显示
- 语速/音量调节
- 语音选择

## 🔧 环境变量

创建 `.env` 文件:

```env
VITE_API_BASE_URL=http://localhost:8080/api
```

## 📝 API 文档

详细的 API 文档请参考 [API 文档](./docs/api.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [epub.js](https://github.com/futurepress/epub.js) - EPUB 渲染
- [pdf.js](https://github.com/mozilla/pdf.js) - PDF 渲染
- [TailwindCSS](https://tailwindcss.com/) - 样式框架
- [Tauri](https://tauri.app/) - 桌面应用框架

---

<p align="center">
  Made with ❤️ for NAS users
</p>
