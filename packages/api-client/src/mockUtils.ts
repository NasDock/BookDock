import { Book, Author, Collection } from "./index";

function getStableHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
}

const unsplashIds = [
  "1508700115892-45ecd05ae2ad", // Headphones
  "1511379938547-c1f69419868d", // Studio
  "1506157786151-b8491531f063", // Bokeh
  "1493225255756-d9584f8606e9", // Vinyl
  "1419242902214-272b3f66ee7a", // Starry Sky
  "1476275466078-4007374efbbe", // Books
  "1481627835980-16bf899c17f7", // Library
  "1495446815901-a7297e633e8d", // Nature
  "1512820178375-8266326b3e79", // Coffee
  "1507842217153-e21293d8b9ff", // Landscape
];

const getMockUrlFromSeed = (seed: string, size = 500) => {
    const hash = parseInt(getStableHash(seed));
    const id = unsplashIds[hash % unsplashIds.length];
    return `https://images.unsplash.com/photo-${id}?w=${size}&h=${size}&fit=crop`;
};

const getMockCover = (seed: string) => getMockUrlFromSeed(seed, 500);
const getMockAvatar = (seed: string) => getMockUrlFromSeed("avatar_" + seed, 300);

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
    let mocked = data;
    let handled = false;

    // Detect Book (has title and fileType)
    if ((data as any).title !== undefined && (data as any).fileType !== undefined) {
      mocked = mockBook(data as any) as any;
      handled = true;
    }
    // Detect Author (has name and bio or bookCount)
    else if ((data as any).name !== undefined && ((data as any).bio !== undefined || (data as any).bookCount !== undefined || (data as any).avatarUrl !== undefined)) {
      mocked = mockAuthor(data as any) as any;
      handled = true;
    }
    // Detect Collection (has name and bookCount)
    else if ((data as any).name !== undefined && (data as any).bookCount !== undefined && (data as any).coverUrl !== undefined) {
      mocked = mockCollection(data as any) as any;
      handled = true;
    }

    // Mark as mocked to prevent recursive loops or double processing
    if (mocked && typeof mocked === 'object') {
        (mocked as any)._isMocked = true;
    }

    // Always process children even if not a direct model match (for nested structures)
    if (!handled) {
        const result: any = {};
        for (const key in data) {
          result[key] = mockData((data as any)[key]);
        }
        return result;
    }
    return mocked;
  }
  return data;
};