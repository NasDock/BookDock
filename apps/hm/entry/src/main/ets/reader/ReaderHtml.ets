// [API 23+] reader/ReaderHtml.ets — 1:1 对齐 mobile generateReaderHtml / injectedJS
// 滚动模式 HTML 生成器 + WebView 注入脚本(进度/划线/点击区域/自动滚动)
// ArkTS 严格模式:所有字符串拼接用模板字面量,禁 + 号拼接(可读性)
import { ReaderConfig } from '../store/ReaderStore';

// ─── 滚动模式 HTML(对齐 mobile generateReaderHtml)─────────────────────

export function generateReaderHtml(
  bookTitle: string,
  bookAuthor: string,
  content: string,
  fileType: string,
  config: ReaderConfig
): string {
  const isDark: boolean = config.mode === 'dark';
  const isSepia: boolean = config.mode === 'sepia';
  const bgColor: string = isDark ? '#1a1a1a' : isSepia ? '#f4ecd8' : '#ffffff';
  const textColor: string = isDark ? '#e0e0e0' : isSepia ? '#5c4b37' : '#1a1a1a';
  const linkColor: string = isDark ? '#6b9fff' : '#0066cc';

  if (fileType === 'txt' || fileType === 'text') {
    // txt 转义 HTML 特殊字符
    const safeContent: string = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    html, body, pre, p, span, div {
      -webkit-user-select: text !important;
      user-select: text !important;
      -webkit-touch-callout: default !important;
    }
    body {
      font-family: ${config.fontFamily};
      font-size: ${config.fontSize}px;
      line-height: ${config.lineHeight};
      color: ${textColor};
      background: ${bgColor};
      margin: 0;
      padding: ${config.margin}px;
      padding-top: ${config.margin + 56}px;
      text-align: justify;
      word-wrap: break-word;
      -webkit-touch-callout: default !important;
    }
    h1 { font-size: ${config.fontSize * 1.5}px; margin-bottom: 0.5em; color: ${textColor}; }
    h2 { font-size: ${config.fontSize * 1.3}px; margin-bottom: 0.5em; color: ${textColor}; }
    pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
  </style>
</head>
<body>
  <pre>${safeContent}</pre>
</body>
</html>`;
  }

  // EPUB / MOBI / AZW3 - content is already HTML from server, embed directly
  if (fileType === 'epub' || fileType === 'mobi' || fileType === 'azw3') {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    html, body, p, span, div, article, section {
      -webkit-user-select: text !important;
      user-select: text !important;
      -webkit-touch-callout: default !important;
    }
    body {
      font-family: ${config.fontFamily};
      font-size: ${config.fontSize}px;
      line-height: ${config.lineHeight};
      color: ${textColor};
      background: ${bgColor};
      margin: 0;
      padding: ${config.margin}px;
      padding-top: ${config.margin + 56}px;
      text-align: justify;
      word-wrap: break-word;
      -webkit-touch-callout: default !important;
    }
    h1, h2, h3, h4, h5, h6 { color: ${textColor}; margin-top: 1em; margin-bottom: 0.5em; }
    h1 { font-size: ${config.fontSize * 1.5}px; }
    h2 { font-size: ${config.fontSize * 1.3}px; }
    h3 { font-size: ${config.fontSize * 1.15}px; }
    p { margin: 0.5em 0; }
    img { max-width: 100%; height: auto; }
    a { color: ${linkColor}; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
  }

  // fallback - show a message with download option
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: ${config.fontFamily};
      font-size: ${config.fontSize}px;
      color: ${textColor};
      background: ${bgColor};
      margin: 0;
      padding: ${config.margin}px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
    }
    .card {
      background: ${isDark ? '#2a2a2a' : '#f5f5f5'};
      padding: 2em;
      border-radius: 12px;
      max-width: 400px;
    }
    h2 { margin-top: 0; }
    .format { color: ${linkColor}; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${bookTitle}</h2>
    <p>作者：${bookAuthor}</p>
    <p>本书格式为 <span class="format">${fileType.toUpperCase()}</span></p>
    <p>请下载本书以使用兼容的 EPUB 阅读器进行离线阅读。</p>
  </div>
</body>
</html>`;
}

// ─── 注入脚本(对齐 mobile injectedJS)────────────────────────────────
// 滚动监听/点击区域/文本选择/自动滚动 全套逻辑
// ArkTS 模板字面量内 ${} 会被 ArkTS 求值,JS 侧的 ${} 必须转义为 \${}

export function generateInjectedJs(
  initialScrollOffset: number,
  autoScrollSpeed: number,
  autoScrollEnabled: boolean
): string {
  const offset: number = Math.max(0, Math.round(initialScrollOffset));
  const speed: number = Math.max(1, Math.min(100, Math.round(autoScrollSpeed)));
  const enabled: string = autoScrollEnabled ? 'true' : 'false';

  return `(function() {
  const initialScrollOffset = ${offset};
  if (typeof window.__readerInitialPositionRestored !== 'boolean') {
    window.__readerInitialPositionRestored = false;
  }
  let lastScrollTop = -1;
  let lastScrollDirection = '';
  let directionAnchor = 0;
  let autoScrolling = false;

  const sendProgress = () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const scrollHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    ) - window.innerHeight;
    const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
    if (Math.abs(scrollTop - lastScrollTop) > 24) {
      lastScrollTop = scrollTop;
      window.readerBridge.postMessage(JSON.stringify({
        type: 'scroll',
        progress: Math.max(0, Math.min(100, progress)),
        scrollOffset: Math.max(0, Math.round(scrollTop))
      }));
    }
  };

  const detectScrollDirection = () => {
    if (autoScrolling) return;
    if (autoScroll && autoScroll.isSuppressingDirection && autoScroll.isSuppressingDirection()) return;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (scrollTop <= 10) return;
    const delta = scrollTop - directionAnchor;
    if (delta > 30) {
      if (lastScrollDirection !== 'down') {
        lastScrollDirection = 'down';
        window.readerBridge.postMessage(JSON.stringify({ type: 'scrollDirection', direction: 'down' }));
      }
      directionAnchor = scrollTop;
    } else if (delta < -30) {
      if (lastScrollDirection !== 'up') {
        lastScrollDirection = 'up';
        window.readerBridge.postMessage(JSON.stringify({ type: 'scrollDirection', direction: 'up' }));
      }
      directionAnchor = scrollTop;
    }
  };

  const restorePosition = () => {
    if (window.__readerInitialPositionRestored) return;
    window.__readerInitialPositionRestored = true;
    if (initialScrollOffset > 0) {
      requestAnimationFrame(function() {
        const cur = window.pageYOffset || document.documentElement.scrollTop || 0;
        if (Math.abs(cur - initialScrollOffset) > 1) {
          window.scrollTo(0, initialScrollOffset);
          lastScrollTop = initialScrollOffset;
          directionAnchor = initialScrollOffset;
        }
        sendProgress();
      });
    } else {
      sendProgress();
    }
  };

  window.addEventListener('scroll', () => {
    sendProgress();
    detectScrollDirection();
  }, { passive: true });

  document.addEventListener('click', function(e) {
    if (getSelectedText()) return;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    directionAnchor = scrollTop;
    lastScrollDirection = '';
    window.readerBridge.postMessage(JSON.stringify({
      type: 'click',
      x: e.clientX,
      y: e.clientY
    }));
  });

  // ── Text selection ───────────────────────────────────────────────
  let selectionReportTimer = null;
  let lastReportedSelection = '';

  function getSelectedText() {
    const selection = window.getSelection && window.getSelection();
    return selection ? selection.toString().trim() : '';
  }

  function reportSelectionAfterSettled(delay) {
    if (selectionReportTimer) clearTimeout(selectionReportTimer);
    selectionReportTimer = setTimeout(function() {
      const text = getSelectedText();
      if (text.length > 0 && text !== lastReportedSelection) {
        lastReportedSelection = text;
        window.readerBridge.postMessage(JSON.stringify({
          type: 'textSelected',
          text: text
        }));
      }
    }, delay);
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let touchActive = false;
  let didMove = false;

  document.addEventListener('touchstart', function(e) {
    lastReportedSelection = '';
    if (selectionReportTimer) { clearTimeout(selectionReportTimer); selectionReportTimer = null; }
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchActive = true;
      didMove = false;
    }
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!touchActive || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dx) + Math.abs(dy) > 8) didMove = true;
    if (didMove) autoScroll.pause();
  }, { passive: true });

  document.addEventListener('touchend', function() {
    reportSelectionAfterSettled(350);
    if (didMove) autoScroll.scheduleResume(1200);
    touchActive = false;
    didMove = false;
  });

  document.addEventListener('mouseup', function() { reportSelectionAfterSettled(250); });
  document.addEventListener('selectionchange', function() { reportSelectionAfterSettled(500); });

  // ── Auto-scroll engine ───────────────────────────────────────────
  const autoScroll = (function() {
    let running = false;
    let userSpeed = ${speed};
    let speedPxPerSec = userSpeed * 4;
    let enabled = ${enabled};
    let lastTs = 0;
    let resumeTimer = null;
    let rafId = null;
    let suppressDirectionUntil = 0;

    function tick(ts) {
      if (!running) return;
      if (lastTs === 0) lastTs = ts;
      const elapsedSec = Math.min(0.1, (ts - lastTs) / 1000);
      lastTs = ts;
      const sh = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
      if (sh <= 0) { rafId = requestAnimationFrame(tick); return; }
      const st = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (st >= sh - 1) {
        running = false;
        autoScrolling = false;
        suppressDirectionUntil = Date.now() + 800;
        postStatus(false, speedPxPerSec);
        window.readerBridge.postMessage(JSON.stringify({ type: 'autoScrollEnd' }));
        return;
      }
      window.scrollBy(0, speedPxPerSec * elapsedSec);
      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      enabled = true;
      autoScrolling = true;
      lastTs = 0;
      rafId = requestAnimationFrame(tick);
      postStatus(true, speedPxPerSec);
    }

    function stop() {
      running = false;
      enabled = false;
      autoScrolling = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      suppressDirectionUntil = Date.now() + 600;
      postStatus(false, speedPxPerSec);
    }

    function pause() {
      if (!running) return;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      suppressDirectionUntil = Date.now() + 600;
    }

    function scheduleResume(delay) {
      if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
      if (!enabled) return;
      resumeTimer = setTimeout(function() {
        resumeTimer = null;
        if (enabled) start();
      }, delay || 1200);
    }

    function setSpeed(newUserSpeed) {
      const u = Math.max(1, Math.min(100, Math.round(newUserSpeed)));
      userSpeed = u;
      speedPxPerSec = u * 4;
      postStatus(running, speedPxPerSec);
    }

    function isEnabled() { return enabled; }
    function isRunning() { return running; }
    function isSuppressingDirection() { return Date.now() < suppressDirectionUntil; }

    function postStatus(isRunning, currentSpeed) {
      window.readerBridge.postMessage(JSON.stringify({
        type: 'autoScrollStatus',
        running: isRunning,
        speed: currentSpeed,
      }));
    }

    window.__autoScrollStart = start;
    window.__autoScrollStop = stop;
    window.__autoScrollSetSpeed = setSpeed;
    window.__autoScrollIsRunning = isRunning;
    window.__autoScrollIsEnabled = isEnabled;

    return { start, stop, pause, scheduleResume, setSpeed, isSuppressingDirection };
  })();

  if (${enabled}) {
    setTimeout(function() { autoScroll.start(); }, 600);
  }

  requestAnimationFrame(() => { restorePosition(); });
})();
true;
`;
}

// ─── 设置变更注入(对齐 mobile applyReaderSettings)─────────────────────

export function generateApplySettingsJs(
  mode: string,
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  margin: number
): string {
  const isDark: boolean = mode === 'dark';
  const isSepia: boolean = mode === 'sepia';
  const bgColor: string = isDark ? '#1a1a1a' : isSepia ? '#f4ecd8' : '#ffffff';
  const textColor: string = isDark ? '#e0e0e0' : isSepia ? '#5c4b37' : '#1a1a1a';
  const safeFont: string = fontFamily.replace(/'/g, "\\'");

  return `(function() {
  const body = document.body;
  if (body) {
    body.style.fontFamily = '${safeFont}';
    body.style.fontSize = '${fontSize}px';
    body.style.lineHeight = '${lineHeight}';
    body.style.color = '${textColor}';
    body.style.background = '${bgColor}';
    body.style.padding = '${margin}px';
    body.style.paddingTop = '${margin + 56}px';
  }
  const headings = document.querySelectorAll('h1, h2');
  headings.forEach(h => { h.style.color = '${textColor}'; });
})();
true;
`;
}

// ─── 高亮注入(对齐 mobile handleCreateHighlight)─────────────────────

export function generateHighlightJs(): string {
  return `(function() {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.backgroundColor = '#FFEB3B';
    span.style.padding = '2px 0';
    span.style.borderRadius = '2px';
    span.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
    span.dataset.highlight = 'true';
    try {
      range.surroundContents(span);
    } catch (e) {
      document.execCommand('HiliteColor', false, '#FFEB3B');
    }
    selection.removeAllRanges();
  }
})();
true;
`;
}

// ─── 自动滚动控制注入(对齐 mobile handleToggleAutoScroll)──────────────

export function generateAutoScrollStartJs(speed: number): string {
  return `(function() {
  if (window.__autoScrollSetSpeed) window.__autoScrollSetSpeed(${speed});
  if (window.__autoScrollStart) window.__autoScrollStart();
})();
true;
`;
}

export function generateAutoScrollStopJs(): string {
  return `(function() {
  if (window.__autoScrollStop) window.__autoScrollStop();
})();
true;
`;
}

export function generateAutoScrollSetSpeedJs(speed: number): string {
  return `(function() {
  if (window.__autoScrollSetSpeed) window.__autoScrollSetSpeed(${speed});
})();
true;
`;
}

// ─── 位置上报注入(对齐 mobile requestCurrentPositionSave)─────────────

export function generateReportPositionJs(): string {
  return `(function() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const scrollHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight
  ) - window.innerHeight;
  const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
  window.readerBridge.postMessage(JSON.stringify({
    type: 'scroll',
    progress: Math.max(0, Math.min(100, progress)),
    scrollOffset: Math.max(0, Math.round(scrollTop))
  }));
})();
true;
`;
}
