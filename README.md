# BookDock 📖

> BookDock（书仓） - 专为 NAS 用户打造的电子书阅读器，支持 TTS 语音朗读

BookDock（书仓）是一款专为 NAS 用户设计的电子书管理 & 阅读平台，支持多格式电子书阅读、TTS 语音朗读、多端同步，并提供强大的书源管理和 NAS 存储集成能力。


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

## Docker 部署

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

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mmdctjj/BookDock&type=Date)](https://star-history.com/#mmdctjj/BookDock&Date)