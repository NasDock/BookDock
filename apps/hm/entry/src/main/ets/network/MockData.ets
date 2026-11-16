// [feat/mock] 宣传截图专用：把服务端返回的书籍统一替换成本地 mock 数据。
// 封面图位于 apps/server/public/mock-covers/，由服务端 /covers 静态目录提供，
// 全部走本地服务器，不依赖任何外网图片。
// 按书籍 id 做稳定映射：同一本书每次刷新拿到的书名、作者、封面都相同。

const MOCK_ENABLED: boolean = true;

export interface MockBookPreset {
  title: string;
  author: string;
  coverUrl: string;
}

const MOCK_BOOKS: MockBookPreset[] = [
  { title: '时光倒流', author: '陈默', coverUrl: '/covers/mock-01.jpg' },
  { title: '梦境边缘', author: '林雨桐', coverUrl: '/covers/mock-02.jpg' },
  { title: '城市回响', author: '苏晚晴', coverUrl: '/covers/mock-03.jpg' },
  { title: '夏日长河', author: '顾言', coverUrl: '/covers/mock-04.jpg' },
  { title: '午夜飞行', author: '江屿', coverUrl: '/covers/mock-05.jpg' },
  { title: '云端漫步', author: '沈清辞', coverUrl: '/covers/mock-06.jpg' },
  { title: '昨日重现', author: '许知远', coverUrl: '/covers/mock-07.jpg' },
  { title: '星空之下', author: '陆沉舟', coverUrl: '/covers/mock-08.jpg' },
  { title: '破晓时分', author: '叶知秋', coverUrl: '/covers/mock-09.jpg' },
  { title: '蓝色森林', author: '宋时微', coverUrl: '/covers/mock-10.jpg' },
  { title: '雨中的城', author: '温以凡', coverUrl: '/covers/mock-11.jpg' },
  { title: '归途', author: '傅慎行', coverUrl: '/covers/mock-12.jpg' }
];

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash = hash | 0;
  }
  return Math.abs(hash);
}

function pickPreset(seed: string): MockBookPreset {
  return MOCK_BOOKS[stableHash(seed) % MOCK_BOOKS.length];
}

// 服务端书籍对象都带 title + author；章节、用户、书单等对象不会同时具备这两个字段。
function isBookLike(record: Record<string, Object>): boolean {
  return typeof record['title'] === 'string' && typeof record['author'] === 'string';
}

/** 递归改写响应体：命中书籍则替换文案与封面，否则继续遍历子对象/数组。 */
export function applyMockData(value: Object): Object {
  if (!MOCK_ENABLED) {
    return value;
  }
  if (Array.isArray(value)) {
    const source: Object[] = value as Object[];
    const result: Object[] = [];
    for (const item of source) {
      result.push(applyMockData(item));
    }
    return result;
  }
  if (typeof value !== 'object') {
    return value;
  }

  const record: Record<string, Object> = value as Record<string, Object>;
  if (isBookLike(record)) {
    const id: Object = record['id'];
    const filePath: Object = record['filePath'];
    const seed: string = typeof id === 'string' ? id as string
      : (typeof filePath === 'string' ? filePath as string
        : (record['title'] as string) + '|' + (record['author'] as string));
    const preset: MockBookPreset = pickPreset(seed);
    record['title'] = preset.title;
    record['author'] = preset.author;
    // 原本没有封面的书也会补上 mock 封面，保证截图里每一本都有图。
    record['coverUrl'] = preset.coverUrl;
    return record;
  }

  const keys: string[] = Object.keys(record);
  for (const key of keys) {
    const child: Object = record[key];
    if (child && typeof child === 'object') {
      record[key] = applyMockData(child);
    }
  }
  return record;
}
