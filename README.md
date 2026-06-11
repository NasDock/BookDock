# BookDock 📖

> BookDock（书仓） - 专为 NAS 用户打造的电子书阅读器，支持 TTS 语音朗读

BookDock（书仓）是一款专为 NAS 用户设计的电子书管理 & 阅读平台，支持多格式电子书阅读、TTS 语音朗读、多端同步，并提供强大的书源管理和 NAS 存储集成能力。

> 声仓会员可直接使用所有功能

## ✨ 功能特点

- **多格式支持**: EPUB、PDF、MOBI、TXT 等主流电子书格式
- **阅读进度同步**: 跨设备（Web / Desktop / Mobile）同步阅读进度和书签
- **个性化设置**: 字体大小、行间距、主题模式（浅色 / 深色 / 护眼 / Sepia）
- **书签 & 高亮 & 笔记**: 支持添加书签和文字高亮，并可导出笔记
- **TTS 朗读**: 支持在阅读时后台持续朗读
- **NAS 本地账户**: 不依赖互联网，直接连接 NAS 使用
- **用户管理**: 添加、编辑、删除用户，查看用户阅读统计

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
