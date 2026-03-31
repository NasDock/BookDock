# 部署指南

本文档介绍 BookDock 的各种部署方式，包括 Docker、NAS、云平台和桌面应用打包。

---

## Docker 部署（完整服务）

### 前提条件

- Docker Engine >= 20.10
- Docker Compose >= 2.0
- PostgreSQL 和 Redis 由 docker-compose 自动启动

### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/mmdctjj/BookDock.git
cd BookDock

# 2. 配置环境变量
cp .env.example .env
# 必填项：
#   - JWT_SECRET          → 设置一个强密码
#   - POSTGRES_PASSWORD  → 数据库密码
#   - NAS_EBOOK_PATH      → NAS 上存放电子书的目录路径
#   - NAS_AUDIO_PATH      → NAS 上存放音频的目录路径（可留空）

# 3. 启动所有服务
docker-compose up -d

# 4. 查看服务状态
docker-compose ps

# 5. 查看日志
docker-compose logs -f api
```

### 服务架构

```
┌─────────────────────────────────────────────────────────┐
│                      Nginx (端口 80/443)                │
│                   反向代理 + SSL + 静态资源              │
└──────────────┬──────────────────┬───────────────────────┘
               │                  │
        ┌──────▼──────┐   ┌──────▼──────┐
        │  API Server │   │  TTS Service│
        │   (NestJS)  │   │   (Python)  │
        │   :3000     │   │   :5000     │
        └──────┬──────┘   └─────────────┘
               │
     ┌─────────┼─────────┐
     │                   │
┌────▼────┐        ┌─────▼────┐
│PostgreSQL│        │  Redis   │
│ :5432   │        │  :6379   │
└─────────┘        └──────────┘
```

启动后访问：
- Web UI: `http://<your-host>`
- API: `http://<your-host>/api`
- API 文档: `http://<your-host>/api/docs`（Swagger）

### 更新部署

```bash
cd BookDock
git pull
docker-compose build
docker-compose up -d
```

---

## NAS 部署

### 威联通（QNAP）

#### 方法一：Container Station

1. 登录 QNAP 管理后台
2. 打开 **Container Station**
3. 点击 **「创建应用程序」**
4. 导入 `docker-compose.yml` 文件
5. 配置环境变量（必填：NAS_EBOOK_PATH, NAS_AUDIO_PATH, JWT_SECRET）
6. 创建并启动

#### 方法二：SSH + Docker

```bash
# 通过 SSH 登录 QNAP
ssh admin@<qnap-ip>

# 克隆项目
git clone https://github.com/mmdctjj/BookDock.git
cd BookDock

# 编辑 docker-compose.yml，将 NAS 路径替换为实际 QNAP 路径
# 例如：/share/BOOKS/Ebooks, /share/BOOKS/Audiobooks

# 启动
docker-compose up -d
```

#### 注意事项

- NAS_EBOOK_PATH 和 NAS_AUDIO_PATH 必须为 QNAP 上实际存在的目录
- 建议在 QNAP 上单独创建共享文件夹 `BookDock` 存放数据
- 确保 Container Station 有足够内存（推荐 4GB+）

### 群晖（Synology）

#### 方法一：Docker 套件

1. 登录群晖管理后台
2. 打开 **Docker 套件**
3. 点击 **「注册表」**，搜索并下载 `nginx`, `postgres`, `redis`, `node`
4. 在 **「映像」** 中依次启动容器
5. 配置网络和卷挂载

#### 方法二：docker-compose（SSH）

```bash
# 启用 SSH
# 系统设置 → 终端 → 启用 SSH

# SSH 登录
ssh admin@synology-ip

# 如果没有 docker-compose，安装它
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 克隆并配置
git clone https://github.com/mmdctjj/BookDock.git
cd BookDock
nano .env  # 配置 NAS 路径等

# 启动
sudo docker-compose up -d
```

#### 注意事项

- 确保 DSM 用户有 Docker 权限
- 群晖的 `/volume1/` 对应 NAS 物理路径
- 路径示例：`/volume1/Books/Ebooks`, `/volume1/Books/Audio`

### Unraid

1. 在 Unraid 管理页面打开 **Docker** 标签
2. 添加以下容器模板（或使用 docker-compose）：

```yaml
# Unraid docker-compose 示例
services:
  nginx:
    image: nginx:1.27-alpine
    container_name: bookdock-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /mnt/user/books/ebooks:/data/ebooks:ro
      - ./nginx:/etc/nginx/conf.d:ro
    depends_on:
      - api
      - tts
    restart: unless-stopped

  api:
    image: bookdock-api:latest
    environment:
      DATABASE_URL: postgres://bookdock:password@postgres:5432/bookdock
      REDIS_URL: redis://redis:6379
      JWT_SECRET: your-secret
      NAS_EBOOK_PATH: /data/ebooks
    volumes:
      - /mnt/user/books/ebooks:/data/ebooks:ro
    depends_on:
      - postgres
      - redis

  tts:
    image: bookdock-tts:latest
    ports:
      - "5000:5000"

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bookdock
      POSTGRES_USER: bookdock
      POSTGRES_PASSWORD: password
    volumes:
      - /mnt/user/appdata/bookdock/postgres:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - /mnt/user/appdata/bookdock/redis:/data
```

---

## Vercel 部署 Web 前端

仅部署 Web UI（需自行提供 API Server）。

### 步骤

```bash
# 1. 在项目根目录安装 Vercel CLI（如果还没有）
npm i -g vercel

# 2. 进入 Web 应用目录
cd apps/web

# 3. 部署
vercel --prod

# 4. 设置环境变量
vercel env add VITE_API_BASE_URL
# 输入你的 API Server 地址，例如：https://api.your-domain.com/api
```

### Vercel 环境变量

在 Vercel Dashboard → 项目 → Settings → Environment Variables 中设置：

| 变量名 | 值 | 说明 |
|--------|----|------|
| `VITE_API_BASE_URL` | `https://api.your-domain.com/api` | API 地址 |
| `VITE_TTS_SERVER_URL` | `https://api.your-domain.com/tts` | TTS 地址（可选） |

---

## Railway 部署

Railway 支持一键部署，支持 Node.js 和 Python。

### 部署 API Server

1. 登录 [Railway](https://railway.app)
2. 点击 **「New Project」→「Deploy from GitHub」**
3. 选择 `BookDock` 仓库
4. Railway 自动检测为 Node.js 项目
5. 在 **「Variables」** 中添加环境变量：

```env
DATABASE_URL=postgres://...
REDIS_URL=redis://...
JWT_SECRET=your-secret
NAS_EBOOK_PATH=/data/ebooks
NAS_AUDIO_PATH=/data/audiobooks
PORT=3000
```

6. 部署完成后获取 API 地址

### 部署 TTS 服务

1. 新建一个 Railway 项目
2. 选择 Python runtime
3. 设置构建命令：`pip install -r requirements.txt`
4. 设置启动命令：`python tts-service/tts_service.py`
5. 添加环境变量（端口 5000）

---

## Render 部署

### API Server

1. 登录 [Render](https://render.com)
2. 创建 **Blueprint**（使用 `render.yaml`）
3. 或手动创建 Web Service：
   - Build Command: `cd apps/server && npm install && npm run build`
   - Start Command: `cd apps/server && node dist/main.js`
4. 添加环境变量（DATABASE_URL, REDIS_URL, JWT_SECRET 等）

### TTS 服务

- 创建 **Private Service**（Python）
- Start Command: `python tts_service.py`
- 暴露端口 5000

---

## Electron 桌面应用打包

### 构建 Windows 安装包

```bash
cd BookDock

# 安装 Electron Builder
pnpm add -D electron-builder

# 构建 Windows 安装包（.exe）
pnpm desktop:build --win

# 产物位置：apps/desktop/release/
```

### 构建 macOS 安装包

```bash
# 构建 macOS 安装包（.dmg）
pnpm desktop:build --mac

# 产物位置：apps/desktop/release/
```

### 构建 Linux 安装包

```bash
pnpm desktop:build --linux

# 产物：.deb, .AppImage 等格式
```

### 签名配置（macOS）

在 `apps/desktop/src-tauri/tauri.conf.json` 中配置：

```json
{
  "bundle": {
    "mac": {
      "identity": "Developer ID Application: Your Name (TEAMID)",
      "entitlements": "./entitlements.plist"
    }
  }
}
```

### 发布到 GitHub Releases

```bash
# 使用 GitHub Actions 自动构建发布
# 在 .github/workflows/release.yml 中配置：
pnpm desktop:build --publish always
```

---

## HTTPS / SSL 配置

### 使用 Let's Encrypt（自动）

```bash
# 在 .env 中配置
NAS_CERT_PATH=./certbot/conf
NAS_CERT_WWW_PATH=./certbot/www

# 启动后自动申请证书（需要域名解析已生效）
docker-compose up -d
```

### 使用已有证书

```bash
# 将证书文件放到 certbot/conf/ 目录
# 编辑 nginx/conf.d/ssl.conf 配置证书路径
```

---

## 故障排除

### 常见问题

**Q: docker-compose 启动失败，提示端口被占用**
```bash
# 检查端口占用
lsof -i :80
lsof -i :443
# 修改 .env 中 NGINX_HTTP_PORT / NGINX_HTTPS_PORT
```

**Q: API Server 连接不上 PostgreSQL**
```bash
# 检查容器网络
docker network ls
docker network inspect bookdock_bookdock
# 确保 postgres 容器名正确，DATABASE_URL 格式正确
```

**Q: NAS 书源同步失败**
```bash
# 检查 NAS 路径是否正确挂载
docker exec bookdock-api ls /data/ebooks
# 检查 NAS 连接信息（用户名/密码/路径）
```

**Q: TTS 无法朗读**
```bash
# 检查 TTS 服务健康状态
curl http://localhost:5000/health
# 检查 API Server 中 TTS_API_URL 环境变量配置
```

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看单个服务
docker-compose logs -f api
docker-compose logs -f tts
docker-compose logs -f nginx
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启单个服务
docker-compose restart api
```
