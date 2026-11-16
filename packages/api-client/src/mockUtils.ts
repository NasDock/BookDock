import { Book, Author, Collection } from "./index";
import { MOCK_COVER_DATA_URIS } from "./mockCovers";

function getStableHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
}

// 封面/头像统一使用内联本地图片，避免 Unsplash 外链在国内加载失败导致截图空白。
const getMockUrlFromSeed = (seed: string) => {
    const hash = parseInt(getStableHash(seed));
    return MOCK_COVER_DATA_URIS[hash % MOCK_COVER_DATA_URIS.length];
};

const getMockCover = (seed: string) => getMockUrlFromSeed(seed);
const getMockAvatar = (seed: string) => getMockUrlFromSeed("avatar_" + seed);

const chineseFirstNames = ["张", "王", "李", "赵", "陈", "林", "周", "吴", "徐", "孙", "马", "朱", "胡", "郭", "何", "高", "罗", "郑", "梁", "谢"];
const chineseLastNames = ["伟", "芳", "娜", "秀英", "敏", "静", "丽", "强", "磊", "洋", "勇", "杰", "娟", "涛", "明", "超", "秀兰", "霞", "平", "刚"];

const bookNames = [
  "时光倒流", "梦境边缘", "城市回响", "夏日长河", "午夜飞行", "云端漫步", "昨日重现", "星空之下",
  "孤独的信徒", "破晓时分", "无声的告别", "热带风暴", "冬日物语", "幻夜", "蓝色森林", "远方的呼唤",
  "风之谷", "雨中的城", "霓虹物语", "碎梦", "失眠夜", "远行", "海浪声", "告白",
  "流浪者", "最后一次", "最初的爱", "遗忘", "寻找", "归途", "瞬息全宇宙", "平行时空"
];

const authorNames = [
  "陈默", "林雨桐", "苏晚晴", "顾言", "江屿", "沈清辞", "许知远", "陆沉舟",
  "叶知秋", "宋时微", "温以凡", "傅慎行", "谢景行", "沈倦", "江忍", "段嘉许"
];

const collectionNames = [
  "我的书架", "待读清单", "经典文学", "科幻世界", "历史长河", "哲学思考",
  "诗歌集", "旅行日记", "人生感悟", "技术进阶", "艺术鉴赏", "心理学"
];

function seedRandom(seed: string | number) {
    const s = String(seed);
    const hashStr = getStableHash(s);
    let hash = parseInt(hashStr);
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
}

function getSeededElement<T>(array: T[], seed: string | number): T {
    const r = seedRandom(seed);
    return array[Math.floor(r * array.length)];
}

export const mockBook = (book: Book): Book => {
  if (!book) return book;
  const seed = String(book.id || book.title || book.filePath || "book");
  const mockedTitle = getSeededElement(bookNames, seed);
  const mockedAuthor = getSeededElement(authorNames, seed);

  return {
    ...book,
    title: mockedTitle,
    author: mockedAuthor,
    coverUrl: getMockCover(mockedTitle),
    authors: book.authors?.map(mockAuthor),
  };
};

export const mockAuthor = (author: Author): Author => {
  if (!author) return author;
  const seed = String(author.id || author.name || "author");
  const mockedName = getSeededElement(authorNames, seed);

  return {
    ...author,
    name: mockedName,
    avatarUrl: getMockAvatar(mockedName),
  };
};

export const mockCollection = (collection: Collection): Collection => {
  if (!collection) return collection;
  const seed = String(collection.id || collection.name || "collection");
  const mockedName = getSeededElement(collectionNames, seed);

  return {
    ...collection,
    name: mockedName,
    coverUrl: getMockCover(mockedName),
  };
};

export const mockData = <T>(data: T): T => {
  if (!data || (data as any)._isMocked) return data;

  // Handle common response structures (ApiResponse)
  if (typeof data === 'object' && data !== null && 'success' in data && 'data' in data) {
    return {
      ...data,
      data: mockData((data as any).data)
    } as any;
  }

  // Handle list structures
  if (typeof data === 'object' && data !== null && Array.isArray((data as any).list)) {
      return {
          ...data,
          list: (data as any).list.map((item: any) => mockData(item))
      } as any;
  }

  // Handle array structures
  if (Array.isArray(data)) {
    return data.map(item => mockData(item)) as any;
  }

  if (typeof data === 'object' && data !== null) {
    let mocked: any = data;

    // Detect Book: 服务端 books 模块返回 fileType，推荐/收藏/书单/作者/进度等接口只返回 format，两者都要命中。
    if ((data as any).title !== undefined && ((data as any).fileType !== undefined || (data as any).format !== undefined)) {
      mocked = mockBook(data as any);
    }
    // Detect Collection (先于 Author：两者都有 name + bookCount)
    else if ((data as any).name !== undefined && ((data as any).coverUrl !== undefined || (data as any).description !== undefined || (data as any).books !== undefined)) {
      mocked = mockCollection(data as any);
    }
    // Detect Author (has name and bio or bookCount)
    else if ((data as any).name !== undefined && ((data as any).bio !== undefined || (data as any).bookCount !== undefined || (data as any).avatarUrl !== undefined)) {
      mocked = mockAuthor(data as any);
    }

    // 无论是否命中模型都继续遍历子对象：书单里的 books、响应里的 items 等嵌套书籍也要 mock。
    // authors 已由 mockBook 处理，跳过以免二次改名。
    const result: any = {};
    for (const key in mocked) {
      const value = (mocked as any)[key];
      result[key] = key !== 'authors' && value && typeof value === 'object'
        ? mockData(value)
        : value;
    }
    result._isMocked = true;
    return result;
  }
  return data;
};