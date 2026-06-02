/**
 * 数据迁移脚本：将现有 Book.author 字符串和 metadata.authorIntro 迁移到 Author 表
 *
 * 运行方式：
 * npx ts-node scripts/migrate-authors.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting author migration...');

  // 1. 获取所有有作者信息的书籍
  const books = await prisma.book.findMany({
    where: {
      OR: [
        { author: { not: null } },
        { author: { not: '' } },
      ],
    },
    select: {
      id: true,
      title: true,
      author: true,
      metadata: true,
    },
  });

  console.log(`Found ${books.length} books with author info`);

  let authorCount = 0;
  let linkCount = 0;

  for (const book of books) {
    if (!book.author || book.author === 'Unknown') continue;

    // 解析作者名（按逗号或顿号分割）
    const authorNames = book.author
      .split(/[,，、]/) // 支持英文逗号、中文逗号、顿号
      .map((n) => n.trim())
      .filter((n) => n && n !== 'Unknown');

    if (authorNames.length === 0) continue;

    // 尝试从 metadata 提取 authorIntro
    let authorIntro: string | undefined;
    try {
      const meta = JSON.parse(book.metadata || '{}');
      authorIntro = meta.authorIntro;
    } catch {
      // ignore parse error
    }

    // 为每个作者创建记录并关联
    for (let i = 0; i < authorNames.length; i++) {
      const name = authorNames[i];

      // 查找或创建作者
      let author = await prisma.author.findUnique({
        where: { name },
      });

      if (!author) {
        author = await prisma.author.create({
          data: {
            name,
            bio: i === 0 ? authorIntro : undefined, // 第一个作者获得 bio
            source: 'migration',
          },
        });
        authorCount++;
        console.log(`  Created author: ${name}`);
      } else if (i === 0 && authorIntro && !author.bio) {
        // 如果作者已存在但没有 bio，补充 bio
        await prisma.author.update({
          where: { id: author.id },
          data: { bio: authorIntro },
        });
        console.log(`  Updated bio for: ${name}`);
      }

      // 创建 BookAuthor 关联（如果不存在）
      const existingLink = await prisma.bookAuthor.findUnique({
        where: {
          bookId_authorId: { bookId: book.id, authorId: author.id },
        },
      });

      if (!existingLink) {
        await prisma.bookAuthor.create({
          data: {
            bookId: book.id,
            authorId: author.id,
            sortOrder: i,
          },
        });
        linkCount++;
      }
    }
  }

  console.log('\nMigration completed!');
  console.log(`  Authors created: ${authorCount}`);
  console.log(`  Book-author links created: ${linkCount}`);
}

migrate()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
