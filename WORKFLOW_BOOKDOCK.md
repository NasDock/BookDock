# BookDock 工作流

## 当前状态

- **Schema 扩展**: 已完成（task-1）
  - Bookmark 模型已添加 `type`、`author`、`bookTitle` 字段
  - 已添加对应索引：`@@index([userId, type])`、`@@index([author])`、`@@index([bookTitle])`
  - Prisma Client 已重新生成，数据库已同步

## 待办

- 后续任务见 BOOKDOCK_NOTES_TASKS.json
