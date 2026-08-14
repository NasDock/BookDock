/**
 * @format
 */

// 必须第一行 import — react-native-gesture-handler 初始化 tap/swipe 手势识别器。
// 缺这一行会导致 Android 上所有 TouchableOpacity.onPress + native-stack
// 侧边返回手势全部失效(View.onTouchStart 还能触发,但 onPress 完全失灵)。
import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { name as appName } from './app.json';
import { PlaybackService } from './src/services/playbackService';

// P4: 注册后台播放服务 (mobile2 复用 react-native-track-player v5)
// mobile 等价代码见 git history commit 94e4cf0:apps/mobile/index.js
TrackPlayer.registerPlaybackService(() => PlaybackService);

AppRegistry.registerComponent(appName, () => App);