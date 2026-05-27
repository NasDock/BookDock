import type { Book } from '@bookdock/api-client';
import type { EbookSource } from '../services/api';

// Root stack param list
export type RootStackParamList = {
  Main: undefined;
  Reader: { book: Book };
  TTSScreen: { book: Book };
  TTSReader: { book: Book };
  BookDetails: { book: Book };
  Login: undefined;
  MemberLogin: { initialMode?: 'scan' } | undefined;
  ScanLogin: undefined;
  MemberBenefits: undefined;
  MemberDetail: undefined;
  MemberPaymentSuccess: undefined;
  SourceManage: undefined;
  Settings: undefined;
  AdminUsers: undefined;
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
