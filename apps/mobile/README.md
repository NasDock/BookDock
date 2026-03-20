# BookDock Mobile (React Native)

BookDock mobile app built with React Native and Expo.

## Features

- 📚 **Library Management**: Grid/List view of books with search and filtering
- 📖 **EPUB Reader**: WebView-based reader with customizable themes (light/dark/sepia)
- 🎧 **Text-to-Speech**: Listen to books with adjustable playback speed
- 🌙 **Dark Mode**: Full dark mode support with system theme detection
- 📥 **Offline Support**: Download books for offline reading
- 📤 **Share**: Native sharing functionality
- 🔔 **Push Notifications**: Reading reminders and updates
- 💾 **Auto-save Progress**: Automatically save reading position

## Tech Stack

- React Native 0.76+
- Expo SDK 52
- TypeScript
- React Navigation 6
- Zustand (state management)
- expo-file-system (local file access)
- AsyncStorage (offline storage)
- expo-notifications (push notifications)

## Project Structure

```
apps/mobile/
├── src/
│   ├── screens/          # Screen components
│   │   ├── LibraryScreen.tsx
│   │   ├── ReaderScreen.tsx
│   │   ├── TTSScreen.tsx
│   │   ├── TTSTabScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── navigation/        # Navigation setup
│   │   ├── RootNavigator.tsx
│   │   ├── MainTabNavigator.tsx
│   │   └── types.ts
│   ├── stores/            # Zustand stores (shared with web)
│   │   ├── authStore.ts
│   │   ├── libraryStore.ts
│   │   ├── readerStore.ts
│   │   ├── themeStore.ts
│   │   └── ttsStore.ts
│   ├── services/           # Native services
│   │   └── index.ts        # Notifications, FileSystem, Sharing
│   ├── types/              # TypeScript types
│   │   └── index.ts
│   └── utils/              # Utilities
│       └── theme.ts
├── assets/                 # App icons and splash screen
├── App.tsx                 # App entry point
└── index.js                # React Native entry
```

## Shared Packages

The mobile app shares code with the web app via monorepo packages:

- `@bookdock/api-client` - API client for backend communication
- `@bookdock/auth` - Authentication logic
- `@bookdock/tts` - Text-to-speech integration
- `@bookdock/ui` - Shared UI components

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+
- Expo CLI (`npx expo-cli`)

### Running the App

```bash
# Install dependencies
cd apps/mobile
pnpm install

# Start development server
pnpm start

# Run on iOS (requires macOS)
pnpm ios

# Run on Android (requires Android SDK)
pnpm android
```

### Building for Production

```bash
# Build Android APK
pnpm build:android

# Build iOS (requires Apple Developer account)
pnpm build:ios
```

## Reader Implementation

The reader uses a WebView to render book content. This approach:
- Provides cross-platform consistency
- Supports EPUB and PDF formats via HTML5/JavaScript libraries
- Allows easy theming and customization
- Maintains performance across devices

For production, consider integrating:
- [epub.js](https://github.com/futurepress/epub.js) for EPUB rendering
- [react-native-pdf](https://github.com/react-native-community/react-native-pdf) for PDF rendering

## State Management

The app uses Zustand for state management with AsyncStorage for persistence:

- **themeStore**: App theme (light/dark/system)
- **authStore**: User authentication state
- **libraryStore**: Book library and local file management
- **readerStore**: Reader configuration (font, theme, etc.)
- **ttsStore**: Text-to-speech playback state

## Offline Support

- Books can be downloaded for offline reading via expo-file-system
- Reading progress is automatically synced to AsyncStorage
- PWA support via Expo's web platform

## Push Notifications

Uses Expo Notifications for:
- Daily reading reminders (configurable time)
- Book update notifications
- Sync reminders

Requires user permission and proper device configuration.
