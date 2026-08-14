/**
 * @bookdock/ebook-reader — mobile2 类型桩
 *
 * 真实实现在 packages/ebook-reader/src/index.ts,内部用了 web 域 document/innerHTML。
 * mobile2 不需要检查它源码,只需要类型给 readerStore / ReaderScreen 用。
 *
 * 字段说明:
 *   - progressPct: mobile2 server 返回的字段名(reading-progress 接口)
 *   - percentage:  mobile ReaderScreen 内部字段名(mobile 1:1 复刻)
 *     两者都 optional,ReaderScreen.tsx 里 `percentage: progressPct` 做映射。
 */

declare module '@bookdock/ebook-reader' {
  export type ReaderMode = 'light' | 'dark' | 'sepia';
  export type ReaderFormat = 'epub' | 'pdf';

  export interface ReaderPosition {
    chapterIndex?: number;
    paragraphIndex?: number;
    cfi?: string;
    currentPage?: number;
    totalPages?: number;
    progressPct?: number;
    scrollOffset?: number;
    // mobile ReaderScreen 内部字段名(1:1 复刻 mobile)
    percentage?: number;
  }
}