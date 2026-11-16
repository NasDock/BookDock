import type { Book, Author } from '@bookdock/api-client';
import type { EbookSource } from '../services/api';

// Root stack param list
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
