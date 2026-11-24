// [API 22+] utils/SystemBarHelper.ets
// 统一管理系统状态栏 / 手势导航条颜色,避免"系统深色栏 + 应用浅色页"撞色。
// 阅读页仍可临时覆盖为阅读主题,退出时由 ReaderScreen 恢复为当前 App 主题。
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { Theme } from '../theme/Theme';

const DOMAIN = 0x0009;
const TAG = 'SystemBarHelper';

export function applySystemBars(win: window.Window, t: Theme): void {
  try {
    const iconColor: string = t.dark ? '#FFFFFF' : '#000000';
    // 手势导航模式下,底部沉浸条区域绘制的是窗口背景色,navigationBarColor
    // 未必能覆盖它。必须同步窗口背景色,否则无论页面/主题怎么切底部都是系统默认黑色。
    win.setWindowBackgroundColor(t.colors.background);
    // setWindowSystemBarProperties 返回 Promise,不 catch 会在失败时产生未处理 rejects。
    void win.setWindowSystemBarProperties({
      statusBarColor: t.colors.background,
      navigationBarColor: t.colors.background,
      statusBarContentColor: iconColor,
      navigationBarContentColor: iconColor
    }).catch((): void => {
      hilog.warn(DOMAIN, TAG, 'setWindowSystemBarProperties rejected');
    });
  } catch (err) {
    hilog.warn(DOMAIN, TAG, 'applySystemBars failed: %{public}s', JSON.stringify(err));
  }
}
