# API 文档

BookDock RESTful API 文档，基于 Swagger 自动生成（部署后访问 `/api/docs`）。

所有接口前缀为 `/api`，认证接口使用 **Bearer Token**（JWT）。

---

## 认证

### 基础信息

- **Base URL**: `http://localhost:8080/api`（开发环境）
- **Content-Type**: `application/json`
- **认证方式**: `Authorization: Bearer <access_token>`

### 响应格式

```json
// 成功
{
  "code": 0,
  "data": { ... }
}

// 失败
{
  "code": 40001,
  "message": "错误描述"
}
```

### 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 40001 | 参数错误 |
| 40101 | 未登录 / Token 过期 |
| 40301 | 无权限 |
| 40401 | 资源不存在 |
| 50001 | 服务器内部错误 |

---

## 认证 API `/api/auth`

### 发送验证码

```
POST /api/auth/send-sms
```

**请求体**：

```json
{
  "phone": "13800138000"
}
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "expiresIn": 300
  }
}
```

---

### 手机号注册

```
POST /api/auth/register/phone
```

**请求体**：

```json
{
  "phone": "13800138000",
  "code": "123456",
  "password": "your-password"
}
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

---

### 手机号登录

```
POST /api/auth/login/phone
```

**请求体**：

```json
{
  "phone": "13800138000",
  "code": "123456"
}
```

或密码登录：

```json
{
  "phone": "13800138000",
  "password": "your-password"
}
```

---

### 账户密码登录

```
POST /api/auth/login
```

**请求体**：

```json
{
  "phone": "13800138000",
  "password": "your-password"
}
```

---

### 账户注册

```
POST /api/auth/register
```

**请求体**：

```json
{
  "phone": "13800138000",
  "password": "your-password"
}
```

---

### 刷新 Token

```
POST /api/auth/refresh
```

**请求头**：

```
Authorization: Bearer <refresh_token>
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

---

### 登出

```
POST /api/auth/logout
```

**响应**：

```json
{
  "code": 0,
  "message": "登出成功"
}
```

---

### 获取当前用户信息

```
GET /api/auth/me
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "id": "user_123",
    "phone": "13800138000",
    "nickname": "书虫",
    "avatar": "https://example.com/avatar.jpg",
    "role": "user",
    "vip": {
      "level": "pro",
      "expireAt": "2025-12-31T23:59:59Z"
    },
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

---

## 书架 API `/api/books`

### 获取书籍列表

```
GET /api/books
```

**Query 参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页数量 |
| `search` | string | - | 搜索书名/作者 |
| `format` | string | - | 按格式筛选（epub/pdf/mobi/txt） |
| `status` | string | - | 阅读状态（reading/finished/none） |
| `sort` | string | `-createdAt` | 排序字段（-createdAt/-updatedAt/title） |

**响应**：

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "book_001",
        "title": "三体",
        "author": "刘慈欣",
        "format": "epub",
        "cover": "https://example.com/covers/tisan.jpg",
        "size": 2048576,
        "progress": 45,
        "status": "reading",
        "lastReadAt": "2024-03-20T10:30:00Z",
        "createdAt": "2024-01-15T08:00:00Z"
      }
    ],
    "total": 120,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### 获取书籍详情

```
GET /api/books/:id
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "id": "book_001",
    "title": "三体",
    "author": "刘慈欣",
    "publisher": "重庆出版社",
    "format": "epub",
    "language": "zh-CN",
    "cover": "https://example.com/covers/tisan.jpg",
    "size": 2048576,
    "path": "/ebooks/santi.epub",
    "progress": 45,
    "status": "reading",
    "lastReadAt": "2024-03-20T10:30:00Z",
    "tags": ["科幻", "硬科幻"],
    "chapters": [
      { "id": "ch_001", "title": "第一章 地球往事", "index": 0 },
      { "id": "ch_002", "title": "第二章 两个质子", "index": 1 }
    ],
    "createdAt": "2024-01-15T08:00:00Z"
  }
}
```

---

### 上传书籍

```
POST /api/books
```

**请求体**（multipart/form-data）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | File | 电子书文件 |
| `title` | string | 书名（可选，自动从文件读取） |
| `author` | string | 作者（可选） |

---

### 搜索书籍

```
GET /api/books/search
```

**Query 参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 搜索关键词 |
| `page` | number | 页码 |
| `pageSize` | number | 每页数量 |

---

### 删除书籍

```
DELETE /api/books/:id
```

---

### 获取书籍封面

```
GET /api/books/:id/cover
```

返回书籍封面图片（302 重定向到 CDN 或返回 Base64）。

---

### 下载书籍文件

```
GET /api/books/:id/download
```

---

## 阅读进度 API `/api/reading-progress`

### 同步阅读进度

```
POST /api/reading-progress/books/:bookId
```

**请求体**：

```json
{
  "progress": 45,
  "chapterId": "ch_003",
  "cfi": "/6/4[chapter_3]!/4/2,/1:0,/3:0",
  "scrollTop": 1200
}
```

> - `progress`: 0-100 的百分比
> - `chapterId`: 当前章节 ID
> - `cfi`: EPUB CFI 位置（EPUB 格式使用）
> - `scrollTop`: PDF 阅读位置（PDF 格式使用）

---

### 获取阅读进度

```
GET /api/reading-progress/books/:bookId
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "bookId": "book_001",
    "progress": 45,
    "chapterId": "ch_003",
    "cfi": "/6/4[chapter_3]!/4/2,/1:0,/3:0",
    "updatedAt": "2024-03-20T10:30:00Z"
  }
}
```

---

### 批量同步阅读进度

```
POST /api/reading-progress/sync
```

**请求体**：

```json
{
  "items": [
    {
      "bookId": "book_001",
      "progress": 45,
      "chapterId": "ch_003"
    },
    {
      "bookId": "book_002",
      "progress": 100,
      "chapterId": "ch_010"
    }
  ]
}
```

---

### 获取阅读统计

```
GET /api/reading-progress/stats
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "totalBooks": 25,
    "readingBooks": 5,
    "finishedBooks": 18,
    "totalReadingTime": 36000,
    "averageProgress": 62
  }
}
```

---

## 书签 & 高亮 API

> 路径前缀：`/api/reading-progress`

### 添加书签

```
POST /api/reading-progress/bookmarks/:bookId
```

**请求体**：

```json
{
  "chapterId": "ch_003",
  "cfi": "/6/4[chapter_3]!/4/2,/1:0,/3:0",
  "note": "重要章节"
}
```

---

### 获取书籍书签列表

```
GET /api/reading-progress/bookmarks?bookId=book_001
```

**响应**：

```json
{
  "code": 0,
  "data": [
    {
      "id": "bm_001",
      "bookId": "book_001",
      "chapterId": "ch_003",
      "cfi": "/6/4[chapter_3]!/4/2,/1:0,/3:0",
      "note": "重要章节",
      "createdAt": "2024-03-20T10:00:00Z"
    }
  ]
}
```

---

### 更新书签

```
PUT /api/reading-progress/bookmarks/:bookmarkId
```

---

### 删除书签

```
DELETE /api/reading-progress/bookmarks/:bookmarkId
```

---

### 添加高亮

```
POST /api/reading-progress/highlights
```

**请求体**：

```json
{
  "bookId": "book_001",
  "chapterId": "ch_003",
  "cfi": "/6/4[chapter_3]!/4/2,/1:0,/3:0",
  "text": "这是高亮的文字内容",
  "color": "yellow",
  "note": "我的笔记"
}
```

---

## TTS API `/api/tts`

### 获取可用语音列表

```
GET /api/tts/voices
```

**响应**：

```json
{
  "code": 0,
  "data": [
    {
      "id": "zh-CN female",
      "name": "云间紫罗兰（女声）",
      "language": "zh-CN",
      "gender": "female",
      "engine": "server"
    },
    {
      "id": "zh-CN male",
      "name": "磁性男声",
      "language": "zh-CN",
      "gender": "male",
      "engine": "server"
    },
    {
      "id": "en-US female",
      "name": "英伦女声",
      "language": "en-US",
      "gender": "female",
      "engine": "server"
    }
  ]
}
```

---

### 创建 TTS 合成任务

```
POST /api/tts/jobs
```

**请求体**：

```json
{
  "bookId": "book_001",
  "chapterId": "ch_003",
  "text": "这是需要朗读的文字内容",
  "voiceId": "zh-CN female",
  "speed": 1.0,
  "volume": 0.8
}
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "jobId": "tts_job_001",
    "status": "pending",
    "audioUrl": null
  }
}
```

### 查询 TTS 任务状态

```
GET /api/tts/jobs/:jobId
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "jobId": "tts_job_001",
    "status": "completed",
    "audioUrl": "https://cdn.bookdock.com/tts/job_001.mp3",
    "duration": 45
  }
}
```

> status: `pending` | `processing` | `completed` | `failed`

---

## 会员 API `/api/vip`

### 发送登录验证码

```
POST /api/vip/send-code
```

**请求体**：

```json
{
  "phone": "13800138000"
}
```

---

### 手机号登录（会员）

```
POST /api/vip/login
```

**请求体**：

```json
{
  "phone": "13800138000",
  "code": "123456"
}
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

---

### 获取会员信息

```
GET /api/vip/profile
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "id": "user_123",
    "phone": "13800138000",
    "level": "pro",
    "expireAt": "2025-12-31T23:59:59Z",
    "benefits": {
      "unlimitedBooks": true,
      "unlimitedTts": true,
      "multiSource": true,
      "adminAccess": false
    }
  }
}
```

---

### 获取会员产品列表

```
GET /api/vip/products
```

**响应**：

```json
{
  "code": 0,
  "data": [
    {
      "id": "pro_yearly",
      "name": "专业版年卡",
      "description": "一年无限使用",
      "price": 99,
      "period": "1年",
      "features": ["无限书籍", "无限TTS", "无限书源", "管理后台"]
    },
    {
      "id": "pro_lifetime",
      "name": "专业版永久卡",
      "description": "一次购买永久使用",
      "price": 299,
      "period": "永久",
      "features": ["无限书籍", "无限TTS", "无限书源", "管理后台", "优先新功能"]
    }
  ]
}
```

---

### 创建订单

```
POST /api/vip/create-order
```

**请求体**：

```json
{
  "productId": "pro_yearly",
  "paymentMethod": "wechat|alipay"
}
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "orderId": "order_12345",
    "qrCode": "weixin://wxpay/...",
    "amount": 99,
    "expireAt": "2024-03-20T11:00:00Z"
  }
}
```

---

### 支付回调

```
POST /api/vip/callback
```

第三方支付平台（微信/支付宝）回调接口。

---

### 查询订单

```
GET /api/vip/order/:id
```

---

## 书源 API `/api/source`

### 获取书源列表

```
GET /api/source
```

**响应**：

```json
{
  "code": 0,
  "data": [
    {
      "id": "src_001",
      "name": "我的NAS",
      "type": "webdav",
      "config": {
        "url": "https://nas.example.com/webdav",
        "username": "admin",
        "basePath": "/ebooks"
      },
      "lastSyncAt": "2024-03-20T08:00:00Z",
      "bookCount": 120,
      "enabled": true
    }
  ]
}
```

---

### 添加书源

```
POST /api/source
```

**请求体**：

```json
{
  "name": "我的NAS",
  "type": "webdav",
  "config": {
    "url": "https://nas.example.com/webdav",
    "username": "admin",
    "password": "password",
    "basePath": "/ebooks"
  }
}
```

支持的 `type`：
- `webdav` — WebDAV 协议
- `smb` — SMB/CIFS 协议
- `ftp` — FTP 协议

---

### 测试书源连接

```
POST /api/source/test-config
```

**请求体**：

```json
{
  "type": "webdav",
  "config": {
    "url": "https://nas.example.com/webdav",
    "username": "admin",
    "password": "password"
  }
}
```

---

### 获取书源文件列表

```
GET /api/source/:id/files
```

Query 参数：`path`（目录路径）

---

### 同步书源

```
POST /api/source/:id/sync
```

手动触发一次书源同步。

---

### 更新书源

```
PUT /api/source/:id
```

---

### 删除书源

```
DELETE /api/source/:id
```

---

## 管理后台 API `/api/admin`

> 需要管理员权限（role: admin）

### 获取用户列表

```
GET /api/admin/users
```

**Query 参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码 |
| `pageSize` | number | 每页数量 |
| `search` | string | 搜索用户名/手机号 |

---

### 获取指定用户

```
GET /api/admin/users/:userId
```

---

### 更新用户

```
PUT /api/admin/users/:userId
```

**请求体**：

```json
{
  "role": "admin",
  "vip": {
    "level": "pro",
    "expireAt": "2025-12-31T23:59:59Z"
  }
}
```

---

### 删除用户

```
DELETE /api/admin/users/:userId
```

---

### 获取数据源列表

```
GET /api/admin/data-sources
```

返回系统中所有书源（包含所有用户配置的书源）。

---

### 添加数据源

```
POST /api/admin/data-sources
```

---

### 更新数据源

```
PUT /api/admin/data-sources/:sourceId
```

---

### 删除数据源

```
DELETE /api/admin/data-sources/:sourceId
```

---

### 触发全局同步

```
POST /api/admin/sync
```

手动触发所有书源同步任务。

---

### 获取同步任务列表

```
GET /api/admin/sync-jobs
```

---

### 获取系统统计

```
GET /api/admin/stats
```

**响应**：

```json
{
  "code": 0,
  "data": {
    "totalUsers": 120,
    "totalBooks": 3500,
    "totalStorageUsed": 10737418240,
    "vipUsers": 45,
    "todayActiveUsers": 32,
    "readingStats": {
      "totalReadingTime": 3600000,
      "avgProgress": 58
    }
  }
}
```
