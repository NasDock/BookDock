import type { Book, Author } from '@bookdock/api-client';

// Root stack param list — 与 mobile/src/navigation/types.ts 字段一致
// 后续每迁一个页面,把对应 component 接到 RootNavigator 的 <Stack.Screen> 上即可。
export type RootStackParamList = {
  Main: undefined;
  Reader: { book: Book };
  TTSScreen: { book: Book; showChapterPicker?: boolean };
  TTSReader: { book: Book };
  BookDetails: { book: Book };
  AuthorDetail: { author: Author };
  Login: undefined;
  MemberLogin: { initialMode?: 'scan' } | undefined;
  ScanLogin: undefined;
  MemberBenefits: undefined;
  MemberDetail: undefined;
  MemberPaymentSuccess: undefined;
  SourceManage: undefined;
  Settings: undefined;
  AdminUsers: undefined;
  CollectionDetail: { collectionId: string };
  Notes: { bookId?: string; author?: string };
  Stats: undefined;
  Search: undefined;
};

// Tab navigator param list
export type MainTabParamList = {
  Library: undefined;
  Recommend: undefined;
  Profile: undefined;
};

// Navigation prop types
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}