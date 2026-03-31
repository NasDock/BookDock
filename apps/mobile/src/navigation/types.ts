import type { Book } from '@bookdock/api-client';

// Root stack param list
export type RootStackParamList = {
  Main: undefined;
  Reader: { book: Book };
  TTSScreen: { book: Book };
  TTSReader: { book: Book };
  BookDetails: { book: Book };
  Login: undefined;
  MemberLogin: undefined;
  MemberBenefits: undefined;
  MemberDetail: undefined;
  MemberPaymentSuccess: undefined;
};

// Tab navigator param list
export type MainTabParamList = {
  Library: undefined;
  TTS: undefined;
  Profile: undefined;
  Settings: undefined;
};

// Navigation prop types
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
