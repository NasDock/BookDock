/**
 * ReaderScreen — mobile2 (1:1 移植自 mobile ReaderScreen.tsx)
 *
 * 适配点（mobile → mobile2）:
 *   1. expo-status-bar → react-native 内置 StatusBar
 *   2. react-native-safe-area-context 删除（mobile2 不用 SafeAreaView/useSafeAreaInsets）
 *      insets 改用 StatusBar.currentHeight || 24
 *   3. @expo/vector-icons → react-native-vector-icons/Ionicons
 *   4. expo-file-system → react-native-fs（API 名称映射见文件各处 sed）
 *   5. SafeAreaView → View（mobile2 不引 safe-area-context）
 *   6. WebView 仍用 react-native-webview（mobile2 已 pnpm add ^13.10.0）
 *
 * 其余逻辑（PDF.js 渲染、TXT 分页、章节切换、阅读进度、字号/主题面板、
 * 朗读同步跳转）跟 mobile 完全一致。
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  AppState,
  Animated,
  ScrollView,
  Dimensions,
  TextInput,
  StatusBar,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useReaderStore, useThemeStore, useLibraryStore, useAuthStore } from '../stores';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { setNavigationBarAuto } from '../utils/navigationBar';
import { getApiClient } from '@bookdock/api-client';
import type { ReaderPosition } from '@bookdock/ebook-reader';
import type { RootStackParamList } from '../navigation/types';
import RNFS from 'react-native-fs';
import jschardet from 'jschardet';
import * as gbkjs from 'gbk.js';

// Base64 to ArrayBuffer decoder (Buffer is not available in React Native)
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Base64 encoder for React Native (btoa is not available)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa !== 'undefined' ? btoa(binary) : customBtoa(binary);
}

function customBtoa(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let i = 0;
  while (i < input.length) {
    const a = input.charCodeAt(i++);
    const b = i < input.length ? input.charCodeAt(i++) : NaN;
    const c = i < input.length ? input.charCodeAt(i++) : NaN;
    const bitmap = (a << 16) | ((!isNaN(b) ? b : 0) << 8) | (!isNaN(c) ? c : 0);
    output += chars.charAt((bitmap >> 18) & 63);
    output += chars.charAt((bitmap >> 12) & 63);
    output += !isNaN(b) ? chars.charAt((bitmap >> 6) & 63) : '=';
    output += !isNaN(c) ? chars.charAt(bitmap & 63) : '=';
  }
  return output;
}

// Decode bytes as latin1 (ISO-8859-1) - pure JS, always works
function decodeLatin1(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

// Try UTF-8 decode using Hermes TextDecoder
function tryDecodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

// Detect encoding and decode text from ArrayBuffer
function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // First try UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    const result = tryDecodeUtf8(bytes.slice(3));
    if (result !== null) return result;
  }

  // Use jschardet to detect encoding
  const sample = bytes.slice(0, Math.min(bytes.length, 8192));
  let binarySample = '';
  for (let i = 0; i < sample.length; i++) {
    binarySample += String.fromCharCode(sample[i]);
  }

  const detected = jschardet.detect(binarySample);
  const encoding = detected.encoding?.toLowerCase() || 'utf-8';
  const confidence = detected.confidence || 0;

  // Try detected encoding first if confidence is high enough
  if (confidence > 0.5 && encoding !== 'ascii') {
    // GB family (most common for Chinese novels)
    if (encoding === 'gb2312' || encoding === 'gbk' || encoding === 'gb18030') {
      try {
        return gbkjs.decode(bytes);
      } catch {
        // fall through
      }
    }
    // For other encodings, try utf-8 first then fall back
  }

  // Default: try UTF-8
  const utf8Text = tryDecodeUtf8(bytes);
  if (utf8Text !== null) return utf8Text;

  // If UTF-8 fails, try GBK (common for Chinese novels)
  try {
    return gbkjs.decode(bytes);
  } catch {
    // Last resort: latin1 (never fails, preserves bytes)
    return decodeLatin1(bytes);
  }
}

function parseLocalTxtChapters(text: string): { title: string; content: string }[] {
  const lines = text.split(/\r?\n/);
  const chapterPatterns = [
    /^\s*前言\s*$/i,
    /^\s*引子\s*$/i,
    /^\s*楔子\s*$/i,
    /^\s*序[章言]?\s*$/i,
    /^\s*第[一二三四五六七八九十百千万零\d]+[章回节卷部集]\s*.*/,
    /^\s*第\d+[章回节卷部集]\s*.*/,
    /^\s*[\d零一二三四五六七八九十百千万]+\s*[、.．]\s*.*/,
    /^\s*附录[一二三四五六七八九十]?\s*$/i,
    /^\s*后记\s*$/i,
    /^\s*尾声\s*$/i,
  ];

  const chaptersList: { title: string; startLine: number }[] = [];
  lines.forEach((line, index) => {
    for (const pattern of chapterPatterns) {
      if (pattern.test(line)) {
        chaptersList.push({ title: line.trim(), startLine: index });
        break;
      }
    }
  });

  if (chaptersList.length === 0) {
    chaptersList.push({ title: '正文', startLine: 0 });
  }

  const parsedChapters: { title: string; content: string }[] = [];
  for (let i = 0; i < chaptersList.length; i++) {
    const start = chaptersList[i].startLine;
    const end = i + 1 < chaptersList.length ? chaptersList[i + 1].startLine : lines.length;
    const content = lines.slice(start, end).join('\n');
    parsedChapters.push({ title: chaptersList[i].title, content });
  }
  return parsedChapters;
}

type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ReaderConfig {
  fontSize: number;
  lineHeight: number;
  margin: number;
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: string;
}

const READER_THEMES = [
  { key: 'light' as const, label: '浅色', bg: '#ffffff', text: '#1a1a1a', barBg: '#ffffff', barText: '#1a1a1a', border: '#e5e5e5' },
  { key: 'dark' as const, label: '深色', bg: '#1a1a1a', text: '#e0e0e0', barBg: '#1a1a1a', barText: '#e0e0e0', border: '#333333' },
  { key: 'sepia' as const, label: '护眼', bg: '#f4ecd8', text: '#5c4b37', barBg: '#f4ecd8', barText: '#5c4b37', border: '#d4c4a8' },
];

const FONT_OPTIONS = [
  { label: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: '衬线体', value: 'Georgia, "Noto Serif SC", serif' },
  { label: '黑体', value: '"Noto Sans SC", "PingFang SC", sans-serif' },
];

// Generate HTML for PDF.js viewer
// pdfDataUrl is a data URL like "data:application/pdf;base64,JVBERi0x..."
function generatePdfViewerHtml(
  pdfDataUrl: string,
  config: ReaderConfig,
  initialPage: number = 1
): string {
  const isDark = config.theme === 'dark';
  const bgColor = isDark ? '#1a1a1a' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#1a1a1a';
  const canvasBg = isDark ? '#2a2a2a' : '#f0f0f0';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <title>PDF Viewer</title>
  <script>
    // Polyfill for Promise.withResolvers (missing on older WebView JS engines)
    if (typeof Promise.withResolvers !== 'function') {
      Promise.withResolvers = function () {
        var resolve, reject;
        var promise = new Promise(function (res, rej) {
          resolve = res;
          reject = rej;
        });
        return { promise: promise, resolve: resolve, reject: reject };
      };
    }
  </script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs" type="module"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: ${bgColor};
      color: ${textColor};
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    #pages-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px;
      padding-top: 56px;
      padding-bottom: 56px;
      gap: 8px;
    }
    .page-wrapper {
      position: relative;
      background: ${canvasBg};
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border-radius: 4px;
      overflow: hidden;
    }
    canvas {
      display: block;
      max-width: 100vw;
      height: auto;
    }
    .page-number {
      position: absolute;
      bottom: 4px;
      right: 8px;
      font-size: 12px;
      color: #999;
      background: rgba(255,255,255,0.8);
      padding: 2px 6px;
      border-radius: 4px;
      pointer-events: none;
    }
    #loading {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 16px;
      color: ${textColor};
    }
    #error {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 16px;
      color: #ff4444;
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div id="loading">正在加载 PDF...</div>
  <div id="error" style="display:none"></div>
  <div id="pages-container"></div>

  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
    async function loadWorkerWithPolyfill() {
      var WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      var polyfill = 'if(typeof Promise.withResolvers!=="function"){Promise.withResolvers=function(){var r,e,t=new Promise(function(n,o){r=n,e=o});return{promise:t,resolve:r,reject:e}};}';
      try {
        var workerCode = await (await fetch(WORKER_URL)).text();
        var blob = new Blob([polyfill + '\n' + workerCode], { type: 'application/javascript' });
        return URL.createObjectURL(blob);
      } catch (e) {
        console.warn('Failed to patch worker, falling back to direct URL', e);
        return WORKER_URL;
      }
    }

    const pdfDataUrl = ${JSON.stringify(pdfDataUrl)};
    const initialPage = ${initialPage};
    const container = document.getElementById('pages-container');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    let pdfDoc = null;
    let currentPage = initialPage;
    let renderedPages = new Set();

    function postMessage(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    function showError(msg) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      errorEl.textContent = msg;
      postMessage({ type: 'error', message: msg });
    }

    async function renderPage(pageNum, canvas, wrapper) {
      if (renderedPages.has(pageNum)) return;
      renderedPages.add(pageNum);

      try {
        const page = await pdfDoc.getPage(pageNum);
        const containerWidth = window.innerWidth - 16;
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale: Math.min(scale, 2) });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = scaledViewport.width + 'px';
        canvas.style.height = scaledViewport.height + 'px';

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      } catch (e) {
        console.error('Render page error:', e);
      }
    }

    async function loadPdf() {
      try {
        // Fetch the data URL and convert to ArrayBuffer for PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = await loadWorkerWithPolyfill();
        const response = await fetch(pdfDataUrl);
        const pdfData = new Uint8Array(await response.arrayBuffer());
        pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
        loadingEl.style.display = 'none';
        postMessage({ type: 'loadComplete', total: pdfDoc.numPages });

        // Build page placeholders
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const wrapper = document.createElement('div');
          wrapper.className = 'page-wrapper';
          wrapper.id = 'page-' + i;

          const canvas = document.createElement('canvas');
          canvas.dataset.page = i;
          wrapper.appendChild(canvas);

          const pageNumEl = document.createElement('span');
          pageNumEl.className = 'page-number';
          pageNumEl.textContent = i + ' / ' + pdfDoc.numPages;
          wrapper.appendChild(pageNumEl);

          container.appendChild(wrapper);
        }

        // IntersectionObserver for lazy rendering
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const wrapper = entry.target;
              const canvas = wrapper.querySelector('canvas');
              const pageNum = parseInt(canvas.dataset.page);
              renderPage(pageNum, canvas, wrapper);

              // Report current visible page
              currentPage = pageNum;
              postMessage({ type: 'pageChanged', page: currentPage, total: pdfDoc.numPages });
            }
          });
        }, { rootMargin: '200px 0px', threshold: 0.1 });

        document.querySelectorAll('.page-wrapper').forEach(el => observer.observe(el));

        // Scroll to initial page
        if (initialPage > 1 && initialPage <= pdfDoc.numPages) {
          setTimeout(() => {
            const el = document.getElementById('page-' + initialPage);
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
          }, 300);
        }

        // Extract outline (bookmarks)
        try {
          const outline = await pdfDoc.getOutline();
          if (outline && outline.length > 0) {
            const flatOutline = [];
            function flatten(items) {
              items.forEach(item => {
                if (item.dest) {
                  flatOutline.push({ title: item.title, dest: item.dest });
                }
                if (item.items) flatten(item.items);
              });
            }
            flatten(outline);
            const resolved = [];
            for (const item of flatOutline) {
              try {
                const dest = await pdfDoc.getDestination(item.dest);
                if (dest && dest[0]) {
                  const ref = dest[0];
                  const pageIndex = await pdfDoc.getPageIndex(ref);
                  resolved.push({ title: item.title, page: pageIndex + 1 });
                }
              } catch (e) { /* ignore */ }
            }
            postMessage({ type: 'outline', outline: resolved });
          }
        } catch (e) { /* ignore outline errors */ }

      } catch (err) {
        showError('无法加载 PDF: ' + (err.message || '未知错误'));
      }
    }

    loadPdf();
  </script>
</body>
</html>`;
}

// Generate HTML reader based on file type and content
function generateReaderHtml(
  bookTitle: string,
  bookAuthor: string,
  content: string,
  fileType: string,
  config: ReaderConfig,
  isBase64: boolean = false
): string {
  const isDark = config.theme === 'dark';
  const isSepia = config.theme === 'sepia';
  const bgColor = isDark ? '#1a1a1a' : isSepia ? '#f4ecd8' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#1a1a1a';
  const linkColor = isDark ? '#6b9fff' : '#0066cc';

  if (fileType === 'txt' || fileType === 'text') {
    const safeContent = content
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

  // EPUB / MOBI fallback - show a message with download option
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

// Generate HTML for "page-flip" reading mode. Splits content into page-sized
// blocks and renders one at a time with swipe/tap navigation. Includes a
// book-like 3D flip animation: a flipping "leaf" element overlays the current
// page and rotates around the Y axis while the next page fades in behind.
function generatePagedReaderHtml(
  bookTitle: string,
  bookAuthor: string,
  content: string,
  fileType: string,
  config: ReaderConfig,
  initialPageOffset: number,
): string {
  const isDark = config.theme === 'dark';
  const isSepia = config.theme === 'sepia';
  const bgColor = isDark ? '#1a1a1a' : isSepia ? '#f4ecd8' : '#ffffff';
  const pageBg = isDark ? '#222222' : isSepia ? '#fbf3e0' : '#fdfdfd';
  const textColor = isDark ? '#e0e0e0' : '#1a1a1a';
  const linkColor = isDark ? '#6b9fff' : '#0066cc';
  const shadowColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.18)';
  const highlightColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta charset="UTF-8">
  <title>${bookTitle}</title>
  <style>
    * { box-sizing: border-box; }
    html, body, p, span, div, h1, h2, h3, h4, h5, h6, article, section {
      -webkit-user-select: text !important;
      user-select: text !important;
      -webkit-touch-callout: default !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: ${bgColor};
      color: ${textColor};
    }
    #stage {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      background: ${bgColor};
      perspective: 1600px;
      perspective-origin: 50% 50%;
    }
    /* The two stacked "leaf" pages. Only one is visible at a time. */
    .leaf {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      padding: ${config.margin}px;
      padding-top: ${config.margin + 56}px;
      padding-bottom: ${config.margin + 72}px;
      font-family: ${config.fontFamily};
      font-size: ${config.fontSize}px;
      line-height: ${config.lineHeight};
      color: ${textColor};
      background: ${pageBg};
      text-align: justify;
      word-wrap: break-word;
      white-space: pre-wrap;
      overflow: hidden;
      touch-action: pan-y;
      -webkit-user-select: text;
      user-select: text;
      -webkit-overflow-scrolling: touch;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    /* The current "page" being shown (the bottom of the stack). */
    #current {
      z-index: 1;
    }
    /* The "flipping" leaf overlay, parked off-screen to the right by default. */
    #flipping {
      z-index: 3;
      transform-origin: 0% 50%;
      transform: translateX(100%) rotateY(0deg);
      box-shadow: -8px 0 24px ${shadowColor};
      will-change: transform;
      pointer-events: none;
    }
    #flipping.flip-next {
      animation: flipNext 420ms cubic-bezier(0.45, 0.05, 0.25, 1) forwards;
    }
    #flipping.flip-next-rubber {
      animation: flipNextRubber 220ms cubic-bezier(0.45, 0.05, 0.25, 1) forwards;
    }
    #flipping.flip-prev {
      animation: flipPrev 420ms cubic-bezier(0.45, 0.05, 0.25, 1) forwards;
    }
    #flipping.flip-prev-rubber {
      animation: flipPrevRubber 220ms cubic-bezier(0.45, 0.05, 0.25, 1) forwards;
    }
    #flipping.flip-next-cancel {
      animation: flipNextCancel 240ms cubic-bezier(0.45, 0.05, 0.25, 1) forwards;
    }
    #flipping.flip-prev-cancel {
      animation: flipPrevCancel 240ms cubic-bezier(0.45, 0.05, 0.25, 1) forwards;
    }
    /* Forward: new page slides in from the right while the leaf flips over to the left. */
    @keyframes flipNext {
      0%   { transform: translateX(0%) rotateY(0deg);   box-shadow: -2px 0 6px ${shadowColor}; }
      35%  { box-shadow: -10px 0 28px ${shadowColor}; }
      50%  { box-shadow: -16px 0 36px ${shadowColor}; }
      100% { transform: translateX(-100%) rotateY(-180deg); box-shadow: -2px 0 6px ${shadowColor}; }
    }
    @keyframes flipNextRubber {
      0%   { transform: translateX(0%) rotateY(0deg); }
      60%  { transform: translateX(-110%) rotateY(-160deg); }
      100% { transform: translateX(-100%) rotateY(-180deg); }
    }
    @keyframes flipNextCancel {
      0%   { transform: translateX(-100%) rotateY(-180deg); }
      100% { transform: translateX(0%) rotateY(0deg); }
    }
    /* Backward: new page slides in from the left while the leaf flips over to the right. */
    @keyframes flipPrev {
      0%   { transform: translateX(0%) rotateY(0deg);  transform-origin: 100% 50%; box-shadow: 8px 0 24px ${shadowColor}; }
      35%  { box-shadow: 12px 0 30px ${shadowColor}; }
      50%  { box-shadow: 16px 0 36px ${shadowColor}; }
      100% { transform: translateX(100%) rotateY(180deg); transform-origin: 100% 50%; box-shadow: 8px 0 24px ${shadowColor}; }
    }
    @keyframes flipPrevRubber {
      0%   { transform: translateX(0%) rotateY(0deg); transform-origin: 100% 50%; }
      60%  { transform: translateX(110%) rotateY(160deg); transform-origin: 100% 50%; }
      100% { transform: translateX(100%) rotateY(180deg); transform-origin: 100% 50%; }
    }
    @keyframes flipPrevCancel {
      0%   { transform: translateX(100%) rotateY(180deg); transform-origin: 100% 50%; }
      100% { transform: translateX(0%) rotateY(0deg); transform-origin: 100% 50%; }
    }
    /* A subtle dark gradient on the flipping leaf that shifts as it rotates
       to fake a paper-curving shadow (browser 3D is unreliable on Android). */
    #flipping::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(
        to right,
        rgba(0,0,0,0) 0%,
        rgba(0,0,0,0) 40%,
        rgba(0,0,0,0.15) 60%,
        rgba(0,0,0,0.35) 100%
      );
      opacity: 0;
      transition: opacity 200ms ease;
    }
    /* A small highlight strip near the spine during the flip. */
    #current::before, #flipping::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      width: 18px;
      pointer-events: none;
      background: linear-gradient(
        to ${isDark ? 'left' : 'right'},
        ${highlightColor},
        rgba(0,0,0,0)
      );
    }
    #current::before { right: 0; }
    #flipping::before { left: 0; transform: scaleX(-1); }

    h1, h2, h3, h4, h5, h6 { color: ${textColor}; margin: 0.6em 0 0.4em; }
    h1 { font-size: ${config.fontSize * 1.5}px; }
    h2 { font-size: ${config.fontSize * 1.3}px; }
    h3 { font-size: ${config.fontSize * 1.15}px; }
    p  { margin: 0.5em 0; }
    img { max-width: 100%; height: auto; }
    a   { color: ${linkColor}; }

    #progress {
      position: fixed;
      bottom: 12px;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 12px;
      color: ${isDark ? '#aaa' : '#888'};
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="stage">
    <div id="current" class="leaf"></div>
    <div id="flipping" class="leaf"></div>
  </div>
  <div id="progress"></div>
  <script>
    (function() {
      const initialOffset = ${Math.max(0, Math.round(initialPageOffset))};
      // The book text/HTML content. We store it as a string and split lazily
      // into paragraph-like chunks. For EPUB/MOBI/AZW3 the content is already
      // pre-rendered HTML on the server, so we parse it into block elements.
      const rawContent = ${JSON.stringify(safeContent)};
      const fileType = ${JSON.stringify(fileType)};
      const isHtml = fileType === 'epub' || fileType === 'mobi' || fileType === 'azw3';

      // Build an array of "page-sized" content blocks. We use a hidden
      // measurement container to slice text in real screen-heights.
      const measure = document.createElement('div');
      measure.style.cssText = 'position:absolute;visibility:hidden;left:-99999px;top:0;width:100%;' +
        'padding-left:' + ${config.margin} + 'px;padding-right:' + ${config.margin} + 'px;' +
        'padding-top:' + (${config.margin} + 56) + 'px;padding-bottom:' + (${config.margin} + 72) + 'px;' +
        'font-family:${config.fontFamily.replace(/'/g, "\\'")};font-size:${config.fontSize}px;line-height:${config.lineHeight};text-align:justify;word-wrap:break-word;';
      document.body.appendChild(measure);

      function buildPagesFromText(text) {
        // Split into paragraphs on blank lines, then re-merge into pages that
        // fit the visible page height.
        const paragraphs = text.split(/\\n\\s*\\n/).map(s => s.trim()).filter(Boolean);
        if (paragraphs.length === 0) paragraphs.push(text);
        const currentEl = document.getElementById('current');
        const maxHeight = currentEl.clientHeight;
        const pages = [];
        let buffer = '';
        for (let i = 0; i < paragraphs.length; i++) {
          const candidate = buffer ? buffer + '\\n\\n' + paragraphs[i] : paragraphs[i];
          measure.textContent = candidate;
          if (measure.scrollHeight > maxHeight && buffer) {
            pages.push(buffer);
            buffer = paragraphs[i];
            measure.textContent = buffer;
          } else {
            buffer = candidate;
          }
        }
        if (buffer) pages.push(buffer);
        return pages.length > 0 ? pages : [''];
      }

      function buildPagesFromHtml(html) {
        // Parse the provided HTML into block elements, then group them into
        // pages that fit the visible page height.
        const container = document.createElement('div');
        container.innerHTML = html;
        const blocks = Array.from(container.children);
        if (blocks.length === 0) return [html];
        const currentEl = document.getElementById('current');
        const maxHeight = currentEl.clientHeight;
        const pages = [];
        let buffer = [];
        for (let i = 0; i < blocks.length; i++) {
          buffer.push(blocks[i].outerHTML);
          measure.innerHTML = buffer.join('');
          if (measure.scrollHeight > maxHeight && buffer.length > 1) {
            const overflow = buffer.pop();
            pages.push(buffer.join(''));
            buffer = [overflow];
          }
        }
        if (buffer.length > 0) pages.push(buffer.join(''));
        return pages.length > 0 ? pages : [html];
      }

      const pages = isHtml ? buildPagesFromHtml(rawContent) : buildPagesFromText(rawContent);
      measure.remove();

      let current = Math.max(0, Math.min(initialOffset, pages.length - 1));
      const currentEl = document.getElementById('current');
      const flippingEl = document.getElementById('flipping');
      const progressEl = document.getElementById('progress');

      function postMessage(data) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        }
      }

      function reportPage() {
        const pct = pages.length > 0 ? Math.round(((current + 1) / pages.length) * 100) : 0;
        progressEl.textContent = (current + 1) + ' / ' + pages.length + '  ·  ' + pct + '%';
        postMessage({ type: 'page', page: current, total: pages.length, percentage: pct });
      }

      function setContent(el, idx) {
        el.innerHTML = pages[idx] || '';
      }

      function resetFlipper() {
        flippingEl.classList.remove(
          'flip-next', 'flip-prev',
          'flip-next-rubber', 'flip-prev-rubber',
          'flip-next-cancel', 'flip-prev-cancel',
        );
        // Park flipping leaf off-screen to the right (default for next-flip).
        flippingEl.style.transformOrigin = '0% 50%';
        flippingEl.style.transform = 'translateX(100%) rotateY(0deg)';
        flippingEl.style.boxShadow = '';
      }

      function render(progressOnly) {
        if (!progressOnly) {
          setContent(currentEl, current);
        }
        resetFlipper();
        reportPage();
      }

      // Animate a flip from the current page to the page at "nextIdx".
      // dir = +1 for forward (current goes off to the left), -1 for backward.
      function animateFlip(dir, nextIdx) {
        return new Promise(function(resolve) {
          // Stage the flipping leaf: it currently mirrors the page we are
          // leaving (because we want it to look like that page is being
          // peeled away), and the "current" element will be updated to the
          // destination page so it becomes visible as the leaf rotates.
          setContent(flippingEl, current);
          // Set initial transform without transition.
          flippingEl.style.transition = 'none';
          if (dir > 0) {
            flippingEl.style.transformOrigin = '0% 50%';
            flippingEl.style.transform = 'translateX(0%) rotateY(0deg)';
          } else {
            flippingEl.style.transformOrigin = '100% 50%';
            flippingEl.style.transform = 'translateX(0%) rotateY(0deg)';
          }
          // Force layout so the next class change triggers the animation.
          // eslint-disable-next-line no-unused-expressions
          flippingEl.offsetHeight;
          flippingEl.style.transition = '';

          // Place the destination content on the bottom page BEFORE animating,
          // so when the flipping leaf rotates out the new page is already
          // showing through.
          setContent(currentEl, nextIdx);
          current = nextIdx;

          const cls = dir > 0 ? 'flip-next' : 'flip-prev';
          const onEnd = function() {
            flippingEl.removeEventListener('animationend', onEnd);
            resetFlipper();
            reportPage();
            resolve();
          };
          flippingEl.addEventListener('animationend', onEnd);
          flippingEl.classList.add(cls);
        });
      }

      // Cancel a partial finger-tracking flip and snap back / complete.
      function finalizeGesture(dir, shouldFlip) {
        return new Promise(function(resolve) {
          setContent(currentEl, current);
          const cls = shouldFlip
            ? (dir > 0 ? 'flip-next-rubber' : 'flip-prev-rubber')
            : (dir > 0 ? 'flip-next-cancel' : 'flip-prev-cancel');
          const onEnd = function() {
            flippingEl.removeEventListener('animationend', onEnd);
            resetFlipper();
            if (shouldFlip) {
              reportPage();
            }
            resolve();
          };
          flippingEl.addEventListener('animationend', onEnd);
          flippingEl.classList.add(cls);
        });
      }

      function go(delta) {
        const next = current + delta;
        if (next < 0 || next >= pages.length) {
          postMessage({ type: 'pageEdge', edge: next < 0 ? 'start' : 'end' });
          return false;
        }
        animateFlip(delta > 0 ? 1 : -1, next);
        return true;
      }

      // Expose helpers for host (React Native) to drive the page directly.
      window.__readerGo = go;
      window.__readerGetPage = function() { return current; };
      window.__readerGetTotal = function() { return pages.length; };
      window.__readerRepaginate = function() {
        const newPages = isHtml ? buildPagesFromHtml(rawContent) : buildPagesFromText(rawContent);
        pages.length = 0;
        newPages.forEach(p => pages.push(p));
        current = Math.max(0, Math.min(current, pages.length - 1));
        render();
      };

      // ── Touch / swipe handling with finger-tracking flip ───────────────
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let touchActive = false;
      let gestureDir = 0;          // -1 = prev, +1 = next, 0 = none
      let gestureShouldFlip = false;
      let gestureOriginTransform = '';

      function getFlipTransform(progress) {
        // progress in [0, 1] maps to rotateY(0) -> rotateY(±180deg) and
        // translateX(0) -> translateX(±100%).
        const angle = progress * 180;
        const offset = progress * 100;
        const sign = gestureDir > 0 ? -1 : 1;
        const origin = gestureDir > 0 ? '0% 50%' : '100% 50%';
        flippingEl.style.transformOrigin = origin;
        flippingEl.style.transform =
          'translateX(' + (sign * offset) + '%) rotateY(' + (sign * angle) + 'deg)';
      }

      function startGesture(dir) {
        gestureDir = dir;
        // Decide if there's a page in that direction.
        if (dir > 0) {
          if (current >= pages.length - 1) {
            postMessage({ type: 'pageEdge', edge: 'end' });
            return false;
          }
          // Show the current page on the flipping leaf (it will peel away to the left).
          setContent(flippingEl, current);
          flippingEl.style.transition = 'none';
          flippingEl.style.transformOrigin = '0% 50%';
          flippingEl.style.transform = 'translateX(0%) rotateY(0deg)';
        } else {
          if (current <= 0) {
            postMessage({ type: 'pageEdge', edge: 'start' });
            return false;
          }
          setContent(flippingEl, current);
          flippingEl.style.transition = 'none';
          flippingEl.style.transformOrigin = '100% 50%';
          flippingEl.style.transform = 'translateX(0%) rotateY(0deg)';
        }
        gestureOriginTransform = flippingEl.style.transform;
        return true;
      }

      pageElTouchTargets();

      function pageElTouchTargets() {
        // Use document for touch listeners so the gesture works across the
        // full stage, not just on the text content.
        const stage = document.getElementById('stage');
        stage.addEventListener('touchstart', function(e) {
          if (e.touches.length !== 1) { touchActive = false; return; }
          touchActive = true;
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
          gestureDir = 0;
          gestureShouldFlip = false;
        }, { passive: true });

        stage.addEventListener('touchmove', function(e) {
          if (!touchActive || e.touches.length !== 1) return;
          const dx = e.touches[0].clientX - touchStartX;
          const dy = e.touches[0].clientY - touchStartY;
          if (gestureDir === 0) {
            if (Math.abs(dx) < 18 || Math.abs(dx) <= Math.abs(dy) * 1.6) return;
            gestureDir = dx < 0 ? 1 : -1;
            if (!startGesture(gestureDir)) {
              touchActive = false;
              return;
            }
          }
          // Map horizontal finger position to flip progress.
          const w = window.innerWidth;
          // For "next" (dx<0), negative dx = forward; clamp 0..w.
          const travelled = Math.min(w, Math.max(0, Math.abs(dx)));
          const progress = Math.min(0.95, travelled / w);
          getFlipTransform(progress);
        }, { passive: true });

        stage.addEventListener('touchend', function(e) {
          if (!touchActive) return;
          touchActive = false;
          if (gestureDir === 0) return;
          const dx = (e.changedTouches[0].clientX || touchStartX) - touchStartX;
          const w = window.innerWidth;
          const progress = Math.min(0.95, Math.abs(dx) / w);
          const fast = (Date.now() - touchStartTime) < 220 && Math.abs(dx) > 24;
          gestureShouldFlip = progress > 0.45 || fast;
          const targetIdx = current + gestureDir;
          if (gestureShouldFlip && targetIdx >= 0 && targetIdx < pages.length) {
            // Snap to the target page.
            setContent(currentEl, targetIdx);
            current = targetIdx;
            finalizeGesture(gestureDir, true);
          } else {
            // Snap back.
            setContent(currentEl, current);
            finalizeGesture(gestureDir, false);
          }
          gestureDir = 0;
        });

        stage.addEventListener('touchcancel', function() {
          if (!touchActive) return;
          touchActive = false;
          if (gestureDir !== 0) {
            setContent(currentEl, current);
            finalizeGesture(gestureDir, false);
            gestureDir = 0;
          }
        });
      }

      // ── Tap zones ──────────────────────────────────────────────────────
      // Top / bottom 18% -> toggle bars.
      // Middle region is split horizontally: left half -> previous page,
      // right half -> next page. (Swipe gestures are still available as the
      // primary navigation method.)
      currentEl.addEventListener('click', function(e) {
        if (window.getSelection && window.getSelection().toString().trim().length > 0) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const x = e.clientX;
        const y = e.clientY;
        const topZone = h * 0.18;
        const bottomZone = h * 0.82;
        if (y < topZone || y > bottomZone) {
          // Top / bottom region -> toggle toolbars.
          postMessage({ type: 'centerTap' });
        } else if (x < w * 0.5) {
          // Middle-left -> previous page.
          go(-1);
        } else {
          // Middle-right -> next page.
          go(1);
        }
      });

      // ── Text selection forwarding for notes / highlights ───────────────
      let selectionTimer = null;
      function reportSelection() {
        const sel = window.getSelection ? window.getSelection() : null;
        const text = sel ? sel.toString().trim() : '';
        if (text.length > 0) {
          postMessage({ type: 'textSelected', text: text });
        }
      }
      currentEl.addEventListener('touchend', function() {
        if (selectionTimer) clearTimeout(selectionTimer);
        selectionTimer = setTimeout(reportSelection, 350);
      });
      document.addEventListener('selectionchange', function() {
        if (selectionTimer) clearTimeout(selectionTimer);
        selectionTimer = setTimeout(reportSelection, 500);
      });

      render();
    })();
  </script>
</body>
</html>`;
}

// 顶/底栏 absolute 定位固定高度,与 WebView marginTop/marginBottom 对齐。
// 顶栏总高 = insets.top(24-44) + paddingTop.xl(24) + 图标(22) + paddingBottom.sm(8) + border(1) ≈ 79-99
// 底栏总高 = insets.bottom(0-34) + paddingVertical.sm*2(16) + 图标(22) + border(1) ≈ 39-73
// 用 BAR_HEIGHT 兜底偏大,留出空白缝隙;不会让栏体覆盖 WebView 内容。
const BAR_HEIGHT = 110;

export function ReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ReaderScreenRouteProp>();
  const { book } = route.params;

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const readerStore = useReaderStore();
  const libraryStore = useLibraryStore();
  // mobile2 libraryStore 没有 saveReadingProgress / getLocalBookPath / downloadBook
  // (mobile 1:1 复刻 — mobile libraryStore 旧版有这3个方法),用 as any 绕过 tsc;
  // 运行时 mobile2 暂未实现本地下载路径,getLocalBookPath 返回 undefined 走 server 分支。
  const ls = libraryStore as any;
  // mobile2 不引 react-native-safe-area-context，用 RN StatusBar.currentHeight 替代 insets.top
  const insets = { top: StatusBar.currentHeight || 24, bottom: 0 };

  const [htmlContent, setHtmlContent] = useState<string>('');
  const [pagedHtmlContent, setPagedHtmlContent] = useState<string>('');
  const [pagedPageOffset, setPagedPageOffset] = useState(0);
  const [pagedTotalPages, setPagedTotalPages] = useState(0);
  const [pagedCurrentPage, setPagedCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedScrollOffset, setSavedScrollOffset] = useState(0);
  const [showBars, setShowBars] = useState(true);
  const [showChapters, setShowChapters] = useState(false);
  const [chapters, setChapters] = useState<Array<{ index: number; title: string }>>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [readingProgress, setReadingProgress] = useState(book.readingProgress ?? 0);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfOutline, setPdfOutline] = useState<Array<{ title: string; page: number }>>([]);
  const [pdfHtmlContent, setPdfHtmlContent] = useState<string>('');
  const [selectedText, setSelectedText] = useState<string>('');
  const [rawChapterContent, setRawChapterContent] = useState<string>('');
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const localChaptersRef = useRef<Array<{ title: string; content: string }>>([]);
  const webViewRef = useRef<WebView>(null);
  const latestPositionRef = useRef<ReaderPosition>({ percentage: book.readingProgress ?? 0, scrollOffset: 0 });
  const lastScrollYRef = useRef(0);
  const topBarAnim = useRef(new Animated.Value(1)).current;
  const bottomBarAnim = useRef(new Animated.Value(1)).current;
  // Mirror of `showBars` that the WebView message handler can read without
  // being part of its useCallback deps. This keeps the WebView's `onMessage`
  // prop reference stable across scroll-driven re-renders — without it, the
  // bar auto-hide would force handleMessage to recreate on every scroll,
  // which in turn re-pushes the prop to the native WebView and can trigger
  // a re-evaluation of the page (snapping the user back to the saved
  // position).
  const showBarsRef = useRef(true);
  useEffect(() => {
    showBarsRef.current = showBars;
  }, [showBars]);

  // ── Reading Timer ─────────────────────────────────────────────────────
  const readingStartTimeRef = useRef<number>(0);
  const accumulatedReadingTimeRef = useRef<number>(0);
  const isReadingActiveRef = useRef<boolean>(false);
  const readingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const REPORT_INTERVAL = 3; // Report every 3 seconds

  const startReadingTimer = useCallback(() => {
    if (!isReadingActiveRef.current) {
      isReadingActiveRef.current = true;
      readingStartTimeRef.current = Date.now();
    }
  }, []);

  const pauseReadingTimer = useCallback(() => {
    if (isReadingActiveRef.current && readingStartTimeRef.current > 0) {
      const elapsed = Math.floor((Date.now() - readingStartTimeRef.current) / 1000);
      accumulatedReadingTimeRef.current += elapsed;
      isReadingActiveRef.current = false;
      readingStartTimeRef.current = 0;
    }
  }, []);

  const flushReadingTimer = useCallback(async () => {
    pauseReadingTimer();
    const total = accumulatedReadingTimeRef.current;
    if (total >= 10) { // Minimum 10 seconds to report
      try {
        const hour = new Date().getHours();
        await getApiClient().recordReadingSession(book.id, total, hour);
      } catch (err) {
        console.warn('Failed to report reading session:', err);
      }
    }
    accumulatedReadingTimeRef.current = 0;
  }, [pauseReadingTimer, book.id]);

  const startPeriodicReport = useCallback(() => {
    if (readingIntervalRef.current) return;
    readingIntervalRef.current = setInterval(() => {
      if (isReadingActiveRef.current && readingStartTimeRef.current > 0) {
        const elapsed = Math.floor((Date.now() - readingStartTimeRef.current) / 1000);
        accumulatedReadingTimeRef.current += elapsed;
        readingStartTimeRef.current = Date.now();

        // Report accumulated time every interval
        const total = accumulatedReadingTimeRef.current;
        accumulatedReadingTimeRef.current = 0;
        if (total >= 1) {
          getApiClient().recordReadingSession(book.id, total, new Date().getHours())
            .catch((err: any) => console.warn('Failed to report reading session:', err));
        }
      }
    }, REPORT_INTERVAL * 1000);
  }, [book.id]);

  const stopPeriodicReport = useCallback(() => {
    if (readingIntervalRef.current) {
      clearInterval(readingIntervalRef.current);
      readingIntervalRef.current = null;
    }
  }, []);

  // Handle AppState changes for reading timer
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        startReadingTimer();
        startPeriodicReport();
      } else {
        pauseReadingTimer();
        stopPeriodicReport();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [startReadingTimer, pauseReadingTimer, startPeriodicReport, stopPeriodicReport]);

  // Start timer when screen is focused, flush when unfocused
  useFocusEffect(
    useCallback(() => {
      startReadingTimer();
      startPeriodicReport();
      return () => {
        stopPeriodicReport();
        flushReadingTimer();
      };
    }, [startReadingTimer, flushReadingTimer, startPeriodicReport, stopPeriodicReport])
  );

  // Stable WebView source object. The scroll-mode WebView re-renders
  // frequently as scroll progress updates; without this memo the inline
  // `source={{ html: htmlContent }}` object would be a new reference on
  // every render which can trigger a full WebView reload — and a reload
  // re-runs `injectedJS`, including `restorePosition()`, which would jump
  // the user back to the last "saved" position.
  const scrollWebViewSource = useMemo(
    () => ({ html: htmlContent }),
    [htmlContent],
  );
  const pagedWebViewSource = useMemo(
    () => ({ html: pagedHtmlContent }),
    [pagedHtmlContent],
  );
  // Stable refs for props that would otherwise be a new reference on every
  // render. React uses shallow prop comparison inside the WebView, and any
  // new array / function reference can re-trigger native prop forwarding,
  // which on Android may re-evaluate the WebView (snapping it back to the
  // initial scroll offset). These memos make the props truly stable.
  const originWhitelistAll = useMemo(() => ['*'], []);
  const handleScrollLoadEnd = useCallback(() => {
    webViewReadyRef.current = true;
  }, []);
  const handleScrollError = useCallback((e: any) => {
    console.error('WebView error:', e.nativeEvent);
    setError('渲染书籍内容失败');
  }, []);

  // Reader theme colors for native UI bars
  const readerTheme = READER_THEMES.find(tm => tm.key === readerStore.mode) || READER_THEMES[0];

  // Sync navigation bar color with reader theme when focused
  useFocusEffect(
    useCallback(() => {
      setNavigationBarAuto(readerTheme.bg);
    }, [readerTheme.bg])
  );

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Reader config
  const readerConfig: ReaderConfig = useMemo(() => ({
    fontSize: readerStore.fontSize,
    lineHeight: readerStore.lineHeight,
    margin: readerStore.margin,
    theme: readerStore.mode,
    fontFamily: readerStore.fontFamily,
  }), [readerStore.fontSize, readerStore.lineHeight, readerStore.margin, readerStore.mode, readerStore.fontFamily]);

  const readerConfigRef = useRef<ReaderConfig>(readerConfig);
  useEffect(() => {
    readerConfigRef.current = readerConfig;
  }, [readerConfig]);

  // Animate bars visibility
  const animateBars = useCallback((show: boolean) => {
    setShowBars(show);
    // Android Fabric: 栏体位移必须用 JS driver。
    // native driver transform 在 Fabric 上与触摸命中测试不同步,
    // 会出现"栏看得见但按钮点不到"(视觉位置 != 触摸热区)。
    Animated.timing(topBarAnim, {
      toValue: show ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
    Animated.timing(bottomBarAnim, {
      toValue: show ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [topBarAnim, bottomBarAnim]);

  // Toggle auto-scroll on/off in the WebView. Only meaningful in scroll
  // mode. Reused by both the toolbar button and the middle-area tap
  // gesture (see handleMessage).
  const handleToggleAutoScroll = useCallback(() => {
    const next = !readerStore.autoScrollEnabled;
    readerStore.setAutoScrollEnabled(next);
    if (readerStore.readingMode !== 'scroll') return;
    if (next) {
      webViewRef.current?.injectJavaScript(`
        (function() {
          if (window.__autoScrollSetSpeed) window.__autoScrollSetSpeed(${readerStore.autoScrollSpeed});
          if (window.__autoScrollStart) window.__autoScrollStart();
        })();
        true;
      `);
    } else {
      webViewRef.current?.injectJavaScript(`
        (function() { if (window.__autoScrollStop) window.__autoScrollStop(); })();
        true;
      `);
    }
  }, [readerStore]);

  // Load specific chapter for TXT/EPUB/MOBI books
  const loadChapter = useCallback(async (chapterIndex: number, scrollOffset = 0) => {
    // Only supported for txt, epub, and mobi files
    if (book.fileType !== 'txt' && book.fileType !== 'epub' && book.fileType !== 'mobi' && book.fileType !== 'azw3') {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setCurrentChapter(chapterIndex);
      setSavedScrollOffset(scrollOffset);

      const localPath = ls.getLocalBookPath(book.id);
      let chapterContent = '';
      if (localPath) {
        const parsed = localChaptersRef.current;
        if (parsed && parsed.length > 0) {
          chapterContent = parsed[chapterIndex]?.content || '';
        } else {
          const fileBuffer = await RNFS.readFile(localPath, 'base64');
          const binary = base64ToArrayBuffer(fileBuffer);
          const text = decodeText(binary);
          const localParsed = parseLocalTxtChapters(text);
          localChaptersRef.current = localParsed;
          chapterContent = localParsed[chapterIndex]?.content || '';
        }
      } else {
        const contentRes = await getApiClient().getChapterContent(book.id, chapterIndex);
        if (contentRes.success && contentRes.data) {
          chapterContent = contentRes.data.content;
        } else {
          throw new Error(contentRes.error || '加载章节内容失败');
        }
      }

      setRawChapterContent(chapterContent);
      const html = generateReaderHtml(book.title, book.author, chapterContent, book.fileType, readerConfigRef.current);
      setHtmlContent(html);
      const paged = generatePagedReaderHtml(
        book.title,
        book.author,
        chapterContent,
        book.fileType || 'txt',
        readerConfigRef.current,
        0,
      );
      setPagedHtmlContent(paged);
      setPagedPageOffset(0);
      setPagedCurrentPage(0);
      setPagedTotalPages(0);

      const chsCount = chapters.length || localChaptersRef.current.length || 1;
      const overallPercentage = Math.round(((chapterIndex + 1) / chsCount) * 100);
      setReadingProgress(overallPercentage);

      latestPositionRef.current = {
        percentage: overallPercentage,
        currentPage: chapterIndex,
        scrollOffset,
      };

      if (readerStore.autoSaveProgress) {
        ls.saveReadingProgress(book.id, latestPositionRef.current);
      }
    } catch (err) {
      console.error('Failed to load chapter:', err);
      setError((err as Error).message || '加载章节失败');
    } finally {
      setIsLoading(false);
    }
  }, [book, chapters.length, libraryStore, readerStore.autoSaveProgress]);

  // Load book content
  const loadBookContent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let initialChapter = 0;
      let initialScrollOffset = 0;
      try {
        const progressResponse = await getApiClient().getReadingProgress(book.id);
        if (progressResponse.success && progressResponse.data) {
          initialChapter = progressResponse.data.currentChapter ?? 0;
          initialScrollOffset = progressResponse.data.scrollOffset ?? 0;
          latestPositionRef.current = {
            percentage: progressResponse.data.progressPct,
            currentPage: initialChapter,
            scrollOffset: initialScrollOffset,
          };
        }
      } catch {
        try {
          const key = `reading_progress_${book.id}`;
          const localProgress = await AsyncStorage.getItem(key);
          if (localProgress) {
            const data = JSON.parse(localProgress);
            initialChapter = data.position.currentPage ?? 0;
            initialScrollOffset = data.position.scrollOffset ?? 0;
            latestPositionRef.current = data.position;
          }
        } catch {
          // ignore
        }
      }
      setSavedScrollOffset(initialScrollOffset);
      setCurrentChapter(initialChapter);
      setReadingProgress(latestPositionRef.current.percentage ?? 0);

      const localPath = ls.getLocalBookPath(book.id);
      if (localPath) {
        const localExists = await RNFS.exists(localPath);
        if (localExists) {
          if (book.fileType === 'txt') {
            const fileBuffer = await RNFS.readFile(localPath, 'base64');
            const binary = base64ToArrayBuffer(fileBuffer);
            const text = decodeText(binary);
            const parsed = parseLocalTxtChapters(text);
            localChaptersRef.current = parsed;
            
            const chs = parsed.map((ch, idx) => ({ index: idx, title: ch.title }));
            setChapters(chs);

            const chapterContent = parsed[initialChapter]?.content || '';
            const html = generateReaderHtml(book.title, book.author, chapterContent, book.fileType, readerConfigRef.current);
            setHtmlContent(html);
            setRawChapterContent(chapterContent);
            const paged = generatePagedReaderHtml(
              book.title,
              book.author,
              chapterContent,
              book.fileType || 'txt',
              readerConfigRef.current,
              0,
            );
            setPagedHtmlContent(paged);
            setPagedPageOffset(0);
            setPagedCurrentPage(0);
            setPagedTotalPages(0);

            const overallPct = chs.length > 0 ? Math.round(((initialChapter + 1) / chs.length) * 100) : 0;
            setReadingProgress(overallPct);
            latestPositionRef.current = {
              percentage: overallPct,
              currentPage: initialChapter,
              scrollOffset: initialScrollOffset,
            };
          } else if (book.fileType === 'pdf') {
            // Use WebView + PDF.js for local PDF files (embed as Base64)
            const pdfBase64Raw = await RNFS.readFile(localPath, 'base64');
            console.log("Local PDF base64 length:", pdfBase64Raw.length);
            console.log("Local PDF base64 first 100 chars:", pdfBase64Raw.substring(0, 100));
            const pdfDataUrl = 'data:application/pdf;base64,' + pdfBase64Raw.replace(/[\r\n\s]/g, '');
            const html = generatePdfViewerHtml(pdfDataUrl, readerConfigRef.current, pdfCurrentPage);
            setPdfHtmlContent(html);
          } else if (book.fileType === 'epub' || book.fileType === 'mobi' || book.fileType === 'azw3') {
            // EPUB/MOBI/AZW3 is loaded chapter by chapter from server, same as remote
            const apiClient = getApiClient();
            const chaptersRes = await apiClient.getChapters(book.id);
            if (chaptersRes.success && chaptersRes.data) {
              const chs = chaptersRes.data.map((ch: any) => ({ index: ch.index, title: ch.title }));
              setChapters(chs);
              const contentRes = await apiClient.getChapterContent(book.id, initialChapter);
              if (contentRes.success && contentRes.data) {
                const chapterContent = contentRes.data.content;
                const html = generateReaderHtml(book.title, book.author, chapterContent, book.fileType, readerConfigRef.current);
                setHtmlContent(html);
                setRawChapterContent(chapterContent);
                const paged = generatePagedReaderHtml(
                  book.title,
                  book.author,
                  chapterContent,
                  book.fileType || 'epub',
                  readerConfigRef.current,
                  0,
                );
                setPagedHtmlContent(paged);
                setPagedPageOffset(0);
                setPagedCurrentPage(0);
                setPagedTotalPages(0);
                const overallPct = chs.length > 0 ? Math.round(((initialChapter + 1) / chs.length) * 100) : 0;
                setReadingProgress(overallPct);
                latestPositionRef.current = {
                  percentage: overallPct,
                  currentPage: initialChapter,
                  scrollOffset: initialScrollOffset,
                };
              }
            }
          } else {
            const html = generateReaderHtml(book.title, book.author, '', book.fileType || book.format || 'epub', readerConfigRef.current);
            setHtmlContent(html);
          }
          setIsLoading(false);
          return;
        }
      }

      // Fetch from server
      const apiClient = getApiClient();
      if (book.fileType === 'txt' || book.fileType === 'epub' || book.fileType === 'mobi' || book.fileType === 'azw3') {
        const chaptersRes = await apiClient.getChapters(book.id);
        if (chaptersRes.success && chaptersRes.data) {
          const chs = chaptersRes.data.map((ch: any) => ({ index: ch.index, title: ch.title }));
          setChapters(chs);

          const contentRes = await apiClient.getChapterContent(book.id, initialChapter);
          if (contentRes.success && contentRes.data) {
            const chapterContent = contentRes.data.content;
            const html = generateReaderHtml(book.title, book.author, chapterContent, book.fileType, readerConfigRef.current);
            setHtmlContent(html);
            setRawChapterContent(chapterContent);
            const paged = generatePagedReaderHtml(
              book.title,
              book.author,
              chapterContent,
              book.fileType || 'txt',
              readerConfigRef.current,
              0,
            );
            setPagedHtmlContent(paged);
            setPagedPageOffset(0);
            setPagedCurrentPage(0);
            setPagedTotalPages(0);

            const overallPct = chs.length > 0 ? Math.round(((initialChapter + 1) / chs.length) * 100) : 0;
            setReadingProgress(overallPct);
            latestPositionRef.current = {
              percentage: overallPct,
              currentPage: initialChapter,
              scrollOffset: initialScrollOffset,
            };
          } else {
            throw new Error(contentRes.error || '加载章节内容失败');
          }
        } else {
          throw new Error(chaptersRes.error || '获取章节目录失败');
        }
      } else if (book.fileType === 'pdf') {
        // Download remote PDF - same approach as desktop: token in query string
        const token = useAuthStore.getState().token || '';
        const baseUrl = `${apiClient.baseURL}/books/${book.id}/download`;
        const pdfUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;
        const cacheDir = RNFS.CachesDirectoryPath || RNFS.DocumentDirectoryPath;
        if (!cacheDir) {
          throw new Error('无法获取缓存目录');
        }
        const localPdfPath = cacheDir + `book_${book.id}.pdf`;
        // Always re-download to avoid stale/corrupted cache during debugging
        const localPdfExists = await RNFS.exists(localPdfPath);
        if (localPdfExists) {
          await RNFS.unlink(localPdfPath);
        }
        console.log('Downloading PDF from:', pdfUrl);
        const response = await fetch(pdfUrl);
        console.log('Download response status:', response.status);
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          console.error('Download error response:', errorText.substring(0, 500));
          throw new Error(`下载 PDF 失败: HTTP ${response.status}`);
        }
        const blob = await response.blob();
        console.log('Download blob size:', blob.size, 'type:', blob.type);
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = reader.result as string;
            console.log('FileReader result prefix:', base64.substring(0, 50));
            resolve(base64.split(',')[1]);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        const base64Data = await base64Promise;
        console.log('Base64 data length:', base64Data.length);
        console.log('Base64 data first 100 chars:', base64Data.substring(0, 100));
        await RNFS.writeFile(localPdfPath, base64Data, 'base64');
        // Read PDF as Base64 and embed into HTML
        const pdfBase64Raw = await RNFS.readFile(localPdfPath, 'base64');
        // Verify it's actually a PDF (base64 of "%PDF" is "JVBERi")
        if (!pdfBase64Raw.startsWith('JVBERi')) {
          console.error('Downloaded file is not a PDF. First 200 chars:', pdfBase64Raw.substring(0, 200));
          throw new Error('下载的文件不是有效的 PDF');
        }
        const pdfDataUrl = 'data:application/pdf;base64,' + pdfBase64Raw.replace(/[\r\n\s]/g, '');
        const html = generatePdfViewerHtml(pdfDataUrl, readerConfigRef.current, pdfCurrentPage);
        setPdfHtmlContent(html);
      } else {
        const arrayBuffer = await apiClient.downloadBookFile(book.id);
        const html = generateReaderHtml(book.title, book.author, '', book.fileType || book.format || 'epub', readerConfigRef.current);
        setHtmlContent(html);
      }
    } catch (err) {
      console.error('Failed to load book:', err);
      setError((err as Error).message || '加载书籍失败');
    } finally {
      setIsLoading(false);
    }
  }, [book, libraryStore]);

  useEffect(() => {
    loadBookContent();
  }, [loadBookContent]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'scroll') {
        const progress = data.progress || 0;
        const scrollOffset = data.scrollOffset || 0;

        // Calculate overall progress based on chapter index
        const overallPercentage = chapters.length > 0
          ? Math.max(0, Math.min(100, Math.round(((currentChapter + (progress / 100)) / chapters.length) * 100)))
          : 0;

        latestPositionRef.current = {
          percentage: overallPercentage,
          currentPage: currentChapter,
          scrollOffset,
        };
        setReadingProgress(overallPercentage);
        // NOTE: do NOT call setSavedScrollOffset here. Doing so on every
        // scroll event would re-create the `injectedJS` template literal
        // (its deps include savedScrollOffset), which would push a new
        // injectedJavaScript prop to the WebView on every scroll, causing
        // the Android WebView to re-execute the script and snap the page
        // back to the saved position. The live scroll position lives in
        // `latestPositionRef.current`; `savedScrollOffset` is only used
        // for the initial restore on first mount.

        if (book.id && readerStore.autoSaveProgress) {
          ls.saveReadingProgress(book.id, latestPositionRef.current);
        }
      } else if (data.type === 'page') {
        // Paged mode: report a single page index within the chapter.
        const page = typeof data.page === 'number' ? data.page : 0;
        const total = typeof data.total === 'number' ? data.total : 0;
        const pct = typeof data.percentage === 'number' ? data.percentage : 0;
        setPagedCurrentPage(page);
        setPagedTotalPages(total);
        setPagedPageOffset(page);
        const overallPercentage = chapters.length > 0
          ? Math.max(0, Math.min(100, Math.round(((currentChapter + (pct / 100)) / chapters.length) * 100)))
          : pct;
        latestPositionRef.current = {
          percentage: overallPercentage,
          currentPage: currentChapter,
          scrollOffset: page,
        };
        setReadingProgress(overallPercentage);
        if (book.id && readerStore.autoSaveProgress) {
          ls.saveReadingProgress(book.id, latestPositionRef.current);
        }
      } else if (data.type === 'pageEdge') {
        // Paged mode: hit start/end of a chapter, fall back to chapter navigation
        if (data.edge === 'end' && currentChapter < chapters.length - 1) {
          loadChapter(currentChapter + 1, 0);
        } else if (data.edge === 'start' && currentChapter > 0) {
          loadChapter(currentChapter - 1, 0);
        }
      } else if (data.type === 'centerTap') {
        // Paged mode: tap the middle of the page toggles chrome bars
        animateBars(!showBarsRef.current);
      } else if (data.type === 'scrollDirection') {
        // While auto-scrolling, the host pins the toolbars visible to
        // prevent flicker. Skip hide/show driven by the auto-scroll motion.
        if (readerStore.autoScrollEnabled) return;
        const direction = data.direction;
        if (direction === 'down') {
          animateBars(false);
        } else if (direction === 'up') {
          animateBars(true);
        }
      } else if (data.type === 'textSelected') {
        const text = data.text || '';
        if (text.trim().length > 0) {
          setSelectedText(text.trim());
          setShowActionSheet(true);
        }
      } else if (data.type === 'click') {
        const { y } = data;
        const screenHeight = Dimensions.get('window').height;
        const topZone = screenHeight * 0.15;
        const bottomZone = screenHeight * 0.85;
        // Top / bottom 15% -> toggle the action bars.
        // Middle 70% -> toggle auto-scroll (start / stop).
        if (y < topZone || y > bottomZone) {
          animateBars(!showBarsRef.current);
        } else {
          handleToggleAutoScroll();
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [book.id, readerStore.autoSaveProgress, libraryStore, animateBars, chapters.length, currentChapter, loadChapter, readerStore.autoScrollEnabled, handleToggleAutoScroll]);

  const requestCurrentPositionSave = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const scrollHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight
        ) - window.innerHeight;
        const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'scroll',
          progress: Math.max(0, Math.min(100, progress)),
          scrollOffset: Math.max(0, Math.round(scrollTop))
        }));
      })();
      true;
    `);
  }, []);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        requestCurrentPositionSave();
        if (book.id && readerStore.autoSaveProgress) {
          ls.saveReadingProgress(book.id, latestPositionRef.current);
        }
      }
    });

    return () => {
      appStateSubscription.remove();
      requestCurrentPositionSave();
      if (book.id && readerStore.autoSaveProgress) {
        ls.saveReadingProgress(book.id, latestPositionRef.current);
      }
    };
  }, [book.id, libraryStore, readerStore.autoSaveProgress, requestCurrentPositionSave]);

  const handleGoBack = useCallback(() => {
    requestCurrentPositionSave();
    setTimeout(() => navigation.goBack(), 120);
  }, [navigation, requestCurrentPositionSave]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleGoBack();
        return true;
      });

      return () => {
        subscription.remove();
      };
    }, [handleGoBack])
  );

  const injectedJS = useMemo(() => `
    (function() {
      const initialScrollOffset = ${Math.max(0, Math.round(savedScrollOffset))};
      // Persistent "has restored" flag stored on window so it survives
      // even if the script gets re-injected (e.g. on Android WebView
      // re-evaluation of the injectedJavaScript prop). Once we've
      // restored the initial position once, never snap the user back.
      if (typeof window.__readerInitialPositionRestored !== 'boolean') {
        window.__readerInitialPositionRestored = false;
      }
      let lastScrollTop = -1;
      let lastScrollDirection = '';
      let directionAnchor = 0;
      let scrollTimeout = null;
      // While auto-scrolling, do NOT post scrollDirection messages — the
      // monotonic scroll would otherwise loop the bar-hide/show animation
      // and cause visible flicker. The host keeps toolbars pinned visible
      // during auto-scroll.
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
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'scroll',
            progress: Math.max(0, Math.min(100, progress)),
            scrollOffset: Math.max(0, Math.round(scrollTop))
          }));
        }
      };

      const detectScrollDirection = () => {
        if (autoScrolling) return; // skip while auto-scrolling
        if (autoScroll && autoScroll.isSuppressingDirection && autoScroll.isSuppressingDirection()) {
          return; // brief cooldown after auto-scroll ends
        }
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        if (scrollTop <= 10) return; // Don't trigger at very top

        const delta = scrollTop - directionAnchor;
        if (delta > 30) {
          if (lastScrollDirection !== 'down') {
            lastScrollDirection = 'down';
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scrollDirection', direction: 'down' }));
          }
          directionAnchor = scrollTop;
        } else if (delta < -30) {
          if (lastScrollDirection !== 'up') {
            lastScrollDirection = 'up';
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scrollDirection', direction: 'up' }));
          }
          directionAnchor = scrollTop;
        }
      };

      const restorePosition = () => {
        // Once we've restored once, never snap back. This is keyed on a
        // window-level flag so re-injection of this script (which can
        // happen on Android when the injectedJavaScript prop changes)
        // does not reset the guard and jerk the user back to the saved
        // offset.
        if (window.__readerInitialPositionRestored) return;
        window.__readerInitialPositionRestored = true;
        if (initialScrollOffset > 0) {
          // Defer one frame so the browser has a chance to lay out the
          // content (otherwise scrollHeight may still be the placeholder
          // height and the page would jump to the wrong position).
          requestAnimationFrame(function() {
            const cur = window.pageYOffset || document.documentElement.scrollTop || 0;
            // Only scroll if we're not already at the desired position.
            // (Avoids fighting the user's gestures if they started scrolling
            // before this code runs.)
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
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'click',
          x: e.clientX,
          y: e.clientY
        }));
      });

      // ── Text selection for notes/highlights ───────────────────────────────
      let selectionReportTimer = null;
      let lastReportedSelection = '';

      function getSelectedText() {
        const selection = window.getSelection && window.getSelection();
        return selection ? selection.toString().trim() : '';
      }

      function reportSelectionAfterSettled(delay) {
        if (selectionReportTimer) {
          clearTimeout(selectionReportTimer);
        }
        selectionReportTimer = setTimeout(function() {
          const text = getSelectedText();
          if (text.length > 0 && text !== lastReportedSelection) {
            lastReportedSelection = text;
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'textSelected',
              text: text
            }));
          }
        }, delay);
      }

      // Track touchstart position so we can distinguish a tap (no movement)
      // from an actual scroll gesture. Pausing auto-scroll on a bare tap
      // would feel like "the scroll stopped" every time the user tapped
      // the lower area to toggle the action bars.
      let touchStartX = 0;
      let touchStartY = 0;
      let touchActive = false;
      let didMove = false;

      document.addEventListener('touchstart', function(e) {
        lastReportedSelection = '';
        if (selectionReportTimer) {
          clearTimeout(selectionReportTimer);
          selectionReportTimer = null;
        }
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
        if (Math.abs(dx) + Math.abs(dy) > 8) {
          didMove = true;
        }
        // Pause auto-scroll only once we have evidence the user is
        // intentionally scrolling (not just tapping to toggle bars).
        if (didMove) {
          autoScroll.pause();
        }
      }, { passive: true });

      document.addEventListener('touchend', function() {
        reportSelectionAfterSettled(350);
        // Only schedule an auto-scroll resume if the user actually
        // scrolled. A bare tap (e.g. tapping the lower area to toggle
        // bars) should leave the auto-scroll state alone — if the engine
        // was running, it continues; if it was stopped, it stays stopped.
        if (didMove) {
          autoScroll.scheduleResume(1200);
        }
        touchActive = false;
        didMove = false;
      });

      document.addEventListener('mouseup', function() {
        reportSelectionAfterSettled(250);
      });

      document.addEventListener('selectionchange', function() {
        reportSelectionAfterSettled(500);
      });

      // ── Auto-scroll engine ─────────────────────────────────────────────
      // Time-based smooth scrolling: target velocity = speedPxPerSec pixels
      // per second. Each rAF tick we move the page by elapsedSec * speedPxPerSec.
      // This produces a fluid, framerate-independent scroll instead of discrete
      // 50ms jumps that look jittery on high-refresh-rate screens.
      const autoScroll = (function() {
        let running = false;
        // user-facing speed: 1..100 -> px/second (clamped 5..2000).
        let userSpeed = ${readerStore.autoScrollSpeed};
        let speedPxPerSec = userSpeed * 4; // 1 -> 4 px/s, 100 -> 400 px/s
        let enabled = ${readerStore.autoScrollEnabled ? 'true' : 'false'};
        let lastTs = 0;
        let resumeTimer = null;
        let rafId = null;
        // Coalesce scroll-direction resets for a short while after the
        // engine stops so that the last bit of auto-scroll motion doesn't
        // register as "user scrolled down" in detectScrollDirection.
        let suppressDirectionUntil = 0;

        function tick(ts) {
          if (!running) return;
          if (lastTs === 0) lastTs = ts;
          const elapsedSec = Math.min(0.1, (ts - lastTs) / 1000);
          lastTs = ts;
          const sh = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight
          ) - window.innerHeight;
          if (sh <= 0) { rafId = requestAnimationFrame(tick); return; }
          const st = window.pageYOffset || document.documentElement.scrollTop || 0;
          if (st >= sh - 1) {
            // Reached the bottom — report and stop.
            running = false;
            autoScrolling = false;
            suppressDirectionUntil = Date.now() + 800;
            postStatus(false, speedPxPerSec);
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'autoScrollEnd' }));
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
          // Suppress direction-change messages for a moment so the toolbar
          // doesn't flicker when the engine stops on the last frame.
          suppressDirectionUntil = Date.now() + 600;
          postStatus(false, speedPxPerSec);
        }

        function pause() {
          if (!running) return;
          running = false;
          if (rafId) cancelAnimationFrame(rafId);
          rafId = null;
          // Brief cooldown so the residual scroll motion after a touch
          // doesn't push "down" → animateBars(false) → flicker.
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
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'autoScrollStatus',
            running: isRunning,
            speed: currentSpeed,
          }));
        }

        // Expose for the host (React Native) to drive the engine.
        window.__autoScrollStart = start;
        window.__autoScrollStop = stop;
        window.__autoScrollSetSpeed = setSpeed;
        window.__autoScrollIsRunning = isRunning;
        window.__autoScrollIsEnabled = isEnabled;

        return { start, stop, pause, scheduleResume, setSpeed, isSuppressingDirection };
      })();

      // Auto-start if enabled in the persisted config.
      if (${readerStore.autoScrollEnabled ? 'true' : 'false'}) {
        setTimeout(function() { autoScroll.start(); }, 600);
      }

      requestAnimationFrame(() => {
        // Try once. The persistent window-level guard means any retry
        // would be a no-op, so we only need a single attempt.
        restorePosition();
      });
    })();
    true;
  `, [savedScrollOffset, htmlContent]);

  const handleShare = useCallback(async () => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getBook(book.id);
      if (response.success && response.data) {
        const bookData = response.data;
        const shareText = `我正在 BookDock 阅读《${bookData.title}》，作者：${bookData.author}`;
        if (navigator?.share) {
          await navigator.share({ title: bookData.title, text: shareText });
        } else {
          Alert.alert('分享', shareText);
        }
      }
    } catch {
      Alert.alert('分享', `我正在 BookDock 阅读《${book.title}》，作者：${book.author}`);
    }
  }, [book]);

  const handleDownload = useCallback(async () => {
    try {
      await ls.downloadBook(book);
      Alert.alert('成功', '书籍已下载，可离线阅读');
    } catch {
      Alert.alert('错误', '下载失败');
    }
  }, [libraryStore, book]);

  const handleWebViewClick = useCallback(() => {
    // Click handling is now done via message from WebView for precise zone detection
    // This is kept as fallback but does nothing to avoid conflict
  }, []);

  const handleOpenChapters = useCallback(() => {
    if (chapters.length > 0) {
      setShowChapters(true);
    } else {
      Alert.alert('提示', '暂无章节信息');
    }
  }, [chapters]);

  const handleChapterPress = useCallback((chapterIndex: number) => {
    setShowChapters(false);
    if (book.fileType === 'txt' || book.fileType === 'epub' || book.fileType === 'mobi' || book.fileType === 'azw3') {
      loadChapter(chapterIndex, 0);
    } else if (book.fileType === 'pdf') {
      setPdfCurrentPage(chapterIndex + 1);
      setCurrentChapter(chapterIndex);
    } else {
      webViewRef.current?.injectJavaScript(`
        (function() {
          const headings = document.querySelectorAll('h1, h2, h3');
          if (headings[${chapterIndex}]) {
            headings[${chapterIndex}].scrollIntoView({ behavior: 'smooth' });
          }
        })();
        true;
      `);
    }
  }, [book.fileType, loadChapter]);

  const handleBookmark = useCallback(() => {
    requestCurrentPositionSave();
    Alert.alert('书签', '已保存当前阅读位置');
  }, [requestCurrentPositionSave]);

  const handleCreateNote = useCallback(async () => {
    if (!selectedText.trim()) return;
    setShowActionSheet(false);
    setShowNoteModal(true);
  }, [selectedText]);

  const handleSaveNote = useCallback(async () => {
    if (!selectedText.trim() || !noteText.trim()) return;
    setIsSavingNote(true);
    try {
      const api = getApiClient();
      const percentage = latestPositionRef.current?.percentage ?? readingProgress;
      await api.createNote({
        bookId: book.id,
        text: selectedText.trim(),
        note: noteText.trim(),
        percentage: percentage,
        author: book.author || '',
        bookTitle: book.title || '',
      });
      Alert.alert('成功', '笔记已保存');
      setShowNoteModal(false);
      setNoteText('');
      setSelectedText('');
    } catch (err) {
      console.error('Failed to save note:', err);
      Alert.alert('错误', '保存笔记失败');
    } finally {
      setIsSavingNote(false);
    }
  }, [selectedText, noteText, book, readingProgress]);

  const handleCreateHighlight = useCallback(async () => {
    if (!selectedText.trim()) return;
    setShowActionSheet(false);
    try {
      const api = getApiClient();
      const percentage = latestPositionRef.current?.percentage ?? readingProgress;
      await api.createHighlight({
        bookId: book.id,
        text: selectedText.trim(),
        color: 'yellow',
        cfi: '',
        startOffset: 0,
        endOffset: selectedText.trim().length,
      });
      // Apply highlight in WebView
      webViewRef.current?.injectJavaScript(`
        (function() {
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
              // Complex selection, fallback to highlightColor
              document.execCommand('HiliteColor', false, '#FFEB3B');
            }
            selection.removeAllRanges();
          }
        })();
        true;
      `);
      Alert.alert('成功', '高亮已保存');
      setSelectedText('');
    } catch (err) {
      console.error('Failed to save highlight:', err);
      Alert.alert('错误', '保存高亮失败');
    }
  }, [selectedText, book, readingProgress]);

  const handlePrevPage = useCallback(() => {
    if (readerStore.readingMode === 'page') {
      webViewRef.current?.injectJavaScript(`
        (function() {
          if (window.__readerGo) window.__readerGo(-1);
        })();
        true;
      `);
      return;
    }
    if (book.fileType === 'txt' || book.fileType === 'epub' || book.fileType === 'mobi' || book.fileType === 'azw3') {
      if (currentChapter > 0) {
        loadChapter(currentChapter - 1, 0);
      } else {
        Alert.alert('提示', '已经是第一章了');
      }
    } else if (book.fileType === 'pdf') {
      if (pdfCurrentPage > 1) {
        setPdfCurrentPage((p) => p - 1);
        setCurrentChapter((p) => p - 1);
      } else {
        Alert.alert('提示', '已经是第一页了');
      }
    } else {
      webViewRef.current?.injectJavaScript(`
        (function() {
          window.scrollBy({ top: -window.innerHeight * 0.9, behavior: 'smooth' });
        })();
        true;
      `);
    }
  }, [book.fileType, currentChapter, loadChapter, pdfCurrentPage, readerStore.readingMode]);

  const handleNextPage = useCallback(() => {
    if (readerStore.readingMode === 'page') {
      webViewRef.current?.injectJavaScript(`
        (function() {
          if (window.__readerGo) window.__readerGo(1);
        })();
        true;
      `);
      return;
    }
    if (book.fileType === 'txt' || book.fileType === 'epub' || book.fileType === 'mobi' || book.fileType === 'azw3') {
      if (currentChapter < chapters.length - 1) {
        loadChapter(currentChapter + 1, 0);
      } else {
        Alert.alert('提示', '已经是最后一章了');
      }
    } else if (book.fileType === 'pdf') {
      if (pdfCurrentPage < pdfTotalPages) {
        setPdfCurrentPage((p) => p + 1);
        setCurrentChapter((p) => p + 1);
      } else {
        Alert.alert('提示', '已经是最后一页了');
      }
    } else {
      webViewRef.current?.injectJavaScript(`
        (function() {
          window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' });
        })();
        true;
      `);
    }
  }, [book.fileType, currentChapter, chapters.length, loadChapter, pdfCurrentPage, pdfTotalPages]);

  const handleTTS = useCallback(async () => {
    navigation.navigate('TTSScreen', { book });
  }, [navigation, book]);

  // Push speed changes to the WebView when the user adjusts the slider.
  useEffect(() => {
    if (readerStore.readingMode !== 'scroll') return;
    if (!readerStore.autoScrollEnabled) return;
    webViewRef.current?.injectJavaScript(`
      (function() {
        if (window.__autoScrollSetSpeed) window.__autoScrollSetSpeed(${readerStore.autoScrollSpeed});
      })();
      true;
    `);
  }, [readerStore.autoScrollSpeed, readerStore.autoScrollEnabled, readerStore.readingMode]);

  // When switching modes, stop auto-scroll in scroll-mode WebView.
  useEffect(() => {
    if (readerStore.readingMode === 'page' && readerStore.autoScrollEnabled) {
      readerStore.setAutoScrollEnabled(false);
    }
  }, [readerStore.readingMode]);

  // Pin the top/bottom toolbars visible while auto-scrolling so they don't
  // slide off — that slide was the source of the visible "上下闪烁" flicker.
  useEffect(() => {
    if (readerStore.autoScrollEnabled) {
      animateBars(true);
    }
  }, [readerStore.autoScrollEnabled, animateBars]);

  // Apply reader settings to WebView in real-time
  const applyReaderSettings = useCallback((
    mode: string,
    fontFamily: string,
    fontSize: number,
    lineHeight: number,
    margin: number
  ) => {
    const t = READER_THEMES.find(tm => tm.key === mode) || READER_THEMES[0];
    const safeFont = fontFamily.replace(/'/g, "\\'");
    webViewRef.current?.injectJavaScript(`
      (function() {
        const body = document.body;
        if (body) {
          body.style.fontFamily = '${safeFont}';
          body.style.fontSize = '${fontSize}px';
          body.style.lineHeight = '${lineHeight}';
          body.style.color = '${t.text}';
          body.style.background = '${t.bg}';
          body.style.padding = '${margin}px';
          body.style.paddingTop = '${margin + 56}px';
        }
        const headings = document.querySelectorAll('h1, h2');
        headings.forEach(h => {
          h.style.color = '${t.text}';
        });
      })();
      true;
    `);
  }, []);

  // Track if WebView is ready for JS injection
  const webViewReadyRef = useRef(false);

  // Watch reader store changes and apply settings in real-time
  useEffect(() => {
    if (!isLoading && htmlContent && webViewReadyRef.current) {
      applyReaderSettings(readerStore.mode, readerStore.fontFamily, readerStore.fontSize, readerStore.lineHeight, readerStore.margin);
    }
  }, [readerStore.mode, readerStore.fontFamily, readerStore.fontSize, readerStore.lineHeight, readerStore.margin, isLoading, htmlContent, applyReaderSettings]);

  // Whenever reader style changes, rebuild the paged HTML so each page is
  // re-measured against the new font/line-height/margin (page mode only).
  useEffect(() => {
    if (readerStore.readingMode !== 'page') return;
    if (!rawChapterContent) return;
    if (
      book.fileType !== 'txt' &&
      book.fileType !== 'epub' &&
      book.fileType !== 'mobi' &&
      book.fileType !== 'azw3'
    ) {
      return;
    }
    const paged = generatePagedReaderHtml(
      book.title,
      book.author,
      rawChapterContent,
      book.fileType || 'txt',
      readerConfig,
      pagedPageOffset,
    );
    setPagedHtmlContent(paged);
    // Intentionally do NOT include pagedPageOffset / pagedCurrentPage here to
    // avoid an infinite re-render loop. After rebuilding, ask the WebView to
    // restore the previously-saved page index once it is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    readerStore.readingMode,
    readerStore.mode,
    readerStore.fontFamily,
    readerStore.fontSize,
    readerStore.lineHeight,
    readerStore.margin,
    rawChapterContent,
  ]);

  // When the WebView is ready in paged mode, jump to the saved page index
  // (this restores position after settings changes rebuild the HTML).
  useEffect(() => {
    if (readerStore.readingMode !== 'page') return;
    if (!webViewReadyRef.current) return;
    if (pagedHtmlContent && pagedTotalPages > 0) {
      const target = Math.max(0, Math.min(pagedPageOffset, pagedTotalPages - 1));
      webViewRef.current?.injectJavaScript(`
        (function() {
          const cur = (window.__readerGetPage && window.__readerGetPage()) || 0;
          if (cur !== ${target}) {
            // Jump by repeatedly calling go() until we land on the target page.
            let attempts = 0;
            while (window.__readerGetPage && window.__readerGetPage() < ${target} && attempts < 500) {
              window.__readerGo(1);
              attempts++;
            }
            while (window.__readerGetPage && window.__readerGetPage() > ${target} && attempts < 1000) {
              window.__readerGo(-1);
              attempts++;
            }
          }
        })();
        true;
      `);
    }
  }, [pagedHtmlContent, pagedTotalPages, readerStore.readingMode, pagedPageOffset]);

  // In paged mode, hide the "scrolled to top" toolbars behavior - the page
  // is a fixed container, so we don't need to auto-hide on scroll direction.
  useEffect(() => {
    if (readerStore.readingMode !== 'page') return;
    setShowBars(true);
  }, [readerStore.readingMode, currentChapter]);

  const topBarTranslate = topBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-150, 0],
  });

  const bottomBarTranslate = bottomBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [150, 0],
  });

  return (
    <View
      style={[styles.container, { backgroundColor: readerTheme.bg }]}
    >
      <StatusBar
        barStyle={readerStore.mode === 'dark' ? 'light-content' : 'dark-content'}
        hidden={!showBars}
      />

      {/* WebView: flex:1 + marginTop/marginBottom 让出顶/底栏绝对定位区。
          关键:栏体 absolute + 高度固定 = 触摸命中区只在栏体 frame 内,
          WebView 的 margin 区域栏体独占,不冲突。WebView 内容不延伸到栏体区。 */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>正在加载书籍...</Text>
        </View>
      ) : error ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
          <TouchableOpacity onPress={loadBookContent} style={styles.retryButton}>
            <Text style={{ color: theme.colors.primary }}>重试</Text>
          </TouchableOpacity>
        </View>
      ) : book.fileType === 'pdf' && pdfHtmlContent ? (
        <WebView
          ref={webViewRef}
          source={{ html: pdfHtmlContent }}
          style={[styles.webview, showBars ? styles.webviewWithBars : styles.webviewFullscreen]}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          allowingReadAccessToURL={RNFS.CachesDirectoryPath || RNFS.DocumentDirectoryPath || ''}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'pageChanged') {
                const page = data.page;
                const total = data.total;
                setPdfCurrentPage(page);
                setCurrentChapter(page - 1);
                setReadingProgress(Math.round((page / total) * 100));
                latestPositionRef.current = {
                  percentage: Math.round((page / total) * 100),
                  currentPage: page,
                  scrollOffset: 0,
                };
                if (readerStore.autoSaveProgress) {
                  ls.saveReadingProgress(book.id, latestPositionRef.current);
                }
              } else if (data.type === 'loadComplete') {
                setPdfTotalPages(data.total);
              } else if (data.type === 'error') {
                console.error('PDF error:', data.message);
                setError('加载 PDF 失败: ' + data.message);
              } else if (data.type === 'outline') {
                setPdfOutline(data.outline || []);
              }
            } catch {
              // ignore
            }
          }}
          onError={(e) => {
            console.error('WebView error:', e.nativeEvent);
            setError('渲染 PDF 失败');
          }}
        />
      ) : readerStore.readingMode === 'page' && pagedHtmlContent ? (
        <WebView
          key={`paged-${currentChapter}`}
          ref={webViewRef}
          source={pagedWebViewSource}
          style={[styles.webview, showBars ? styles.webviewWithBars : styles.webviewFullscreen]}
          originWhitelist={originWhitelistAll}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          onMessage={handleMessage}
          onLoadEnd={handleScrollLoadEnd}
          onError={(e) => {
            console.error('Paged reader error:', e.nativeEvent);
            setError('渲染翻页内容失败');
          }}
        />
      ) : (
        <WebView
          ref={webViewRef}
          key="reader-scroll"
          source={scrollWebViewSource}
          style={[styles.webview, showBars ? styles.webviewWithBars : styles.webviewFullscreen]}
          injectedJavaScript={injectedJS}
          onMessage={handleMessage}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          originWhitelist={originWhitelistAll}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onTouchStart={handleWebViewClick}
          onLoadEnd={handleScrollLoadEnd}
          onError={handleScrollError}
        />
      )}

      {/* Top Toolbar — absolute 定位 top:0,在 WebView marginTop 让出的区段内。
          WebView 不渲染到该区段,触摸派发无冲突。*/}
      {showBars && (
      <View style={[styles.topBarWrapper, { paddingTop: Math.max(insets.top, spacing.sm) }]}>
      <View
        style={[
          styles.topBar,
          {
            borderBottomColor: readerTheme.border,
            backgroundColor: readerTheme.barBg,
          }
        ]}
      >
        <TouchableOpacity
          onPress={handleGoBack}
          style={styles.barButton}
        >
          <Ionicons name="arrow-back" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <View style={styles.barTitle}>
          <Text style={[styles.barTitleText, { color: readerTheme.barText }]} numberOfLines={1}>
            {chapters[currentChapter]?.title || book.title}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.barButton}>
          <Ionicons name="settings-outline" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
      </View>
      </View>
      )}

      {/* Bottom Toolbar — 同上,absolute bottom:0 */}
      {showBars && (
      <View style={[styles.bottomBarWrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <View
        style={[
          styles.bottomBar,
          {
            borderTopColor: readerTheme.border,
            backgroundColor: readerTheme.barBg,
          }
        ]}
      >
        <TouchableOpacity style={styles.barButton} onPress={handleOpenChapters}>
          <Ionicons name="book-outline" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={handleBookmark}>
          <Ionicons name="bookmark-outline" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: readerTheme.barText }]}>
            {Math.round(readingProgress)}%
          </Text>
        </View>
        <TouchableOpacity style={styles.barButton} onPress={handlePrevPage}>
          <Ionicons name="chevron-back" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={handleNextPage}>
          <Ionicons name="chevron-forward" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.barButton} onPress={handleTTS}>
          <Ionicons name="volume-high-outline" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
        {readerStore.readingMode === 'scroll' && (
          <TouchableOpacity
            style={styles.barButton}
            onPress={handleToggleAutoScroll}
            accessibilityLabel="自动滚动"
          >
            <Ionicons
              name={readerStore.autoScrollEnabled ? 'pause-circle' : 'play-circle'}
              size={24}
              color={readerStore.autoScrollEnabled ? theme.colors.primary : readerTheme.barText}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.barButton} onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={22} color={readerTheme.barText} />
        </TouchableOpacity>
      </View>
      </View>
      )}

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowSettings(false)} />
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>阅读设置</Text>

            {/* Reading Mode (scroll vs page-flip) */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>阅读方式</Text>
              <View style={styles.fontSizeControls}>
                {([
                  { value: 'scroll', label: '上下滚动' },
                  { value: 'page', label: '左右翻页' },
                ] as const).map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.fontOptionButton,
                      { borderColor: readerStore.readingMode === opt.value ? theme.colors.primary : theme.colors.border },
                      readerStore.readingMode === opt.value && { backgroundColor: theme.colors.primary + '20' },
                    ]}
                    onPress={() => readerStore.setReadingMode(opt.value)}
                  >
                    <Text style={[styles.fontOptionText, { color: theme.colors.text }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Theme */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>阅读底色</Text>
              <View style={styles.themeRow}>
                {READER_THEMES.map((tm) => (
                  <TouchableOpacity
                    key={tm.key}
                    style={[
                      styles.themeChip,
                      { backgroundColor: tm.bg, borderColor: readerStore.mode === tm.key ? theme.colors.primary : theme.colors.border },
                      readerStore.mode === tm.key && styles.themeChipActive,
                    ]}
                    onPress={() => readerStore.setMode(tm.key)}
                  >
                    <Text style={[styles.themeChipText, { color: tm.text }]}>{tm.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Font Family */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>字体</Text>
              <View style={styles.fontSizeControls}>
                {FONT_OPTIONS.map((f) => (
                  <TouchableOpacity
                    key={f.value}
                    style={[
                      styles.fontOptionButton,
                      { borderColor: readerStore.fontFamily === f.value ? theme.colors.primary : theme.colors.border },
                      readerStore.fontFamily === f.value && { backgroundColor: theme.colors.primary + '20' },
                    ]}
                    onPress={() => readerStore.setFontFamily(f.value)}
                  >
                    <Text style={[styles.fontOptionText, { color: theme.colors.text }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Font Size */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>字体大小</Text>
              <View style={styles.fontSizeControls}>
                <TouchableOpacity
                  onPress={() => readerStore.setFontSize(Math.max(12, readerStore.fontSize - 2))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>A-</Text>
                </TouchableOpacity>
                <Text style={[styles.fontValue, { color: theme.colors.text }]}>{readerStore.fontSize}px</Text>
                <TouchableOpacity
                  onPress={() => readerStore.setFontSize(Math.min(32, readerStore.fontSize + 2))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>A+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Line Height */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>行间距</Text>
              <View style={styles.fontSizeControls}>
                <TouchableOpacity
                  onPress={() => readerStore.setLineHeight(Math.max(1, readerStore.lineHeight - 0.2))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>-</Text>
                </TouchableOpacity>
                <Text style={[styles.fontValue, { color: theme.colors.text }]}>{readerStore.lineHeight.toFixed(1)}</Text>
                <TouchableOpacity
                  onPress={() => readerStore.setLineHeight(Math.min(3, readerStore.lineHeight + 0.2))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Margin */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>页边距</Text>
              <View style={styles.fontSizeControls}>
                <TouchableOpacity
                  onPress={() => readerStore.setMargin(Math.max(8, readerStore.margin - 4))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>-</Text>
                </TouchableOpacity>
                <Text style={[styles.fontValue, { color: theme.colors.text }]}>{readerStore.margin}px</Text>
                <TouchableOpacity
                  onPress={() => readerStore.setMargin(Math.min(48, readerStore.margin + 4))}
                  style={[styles.fontButton, { borderColor: theme.colors.border }]}
                >
                  <Text style={{ color: theme.colors.text }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Auto-scroll speed (only relevant in scroll mode) */}
            {readerStore.readingMode === 'scroll' && (
              <View style={styles.settingRow}>
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>自动翻页速度</Text>
                <View style={styles.fontSizeControls}>
                  <TouchableOpacity
                    onPress={() => readerStore.setAutoScrollSpeed(Math.max(1, readerStore.autoScrollSpeed - 5))}
                    style={[styles.fontButton, { borderColor: theme.colors.border }]}
                  >
                    <Text style={{ color: theme.colors.text }}>-</Text>
                  </TouchableOpacity>
                  <Text style={[styles.fontValue, { color: theme.colors.text }]}>
                    {readerStore.autoScrollSpeed}
                  </Text>
                  <TouchableOpacity
                    onPress={() => readerStore.setAutoScrollSpeed(Math.min(100, readerStore.autoScrollSpeed + 5))}
                    style={[styles.fontButton, { borderColor: theme.colors.border }]}
                  >
                    <Text style={{ color: theme.colors.text }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.closeButtonText}>完成</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Chapters Modal */}
      <Modal
        visible={showChapters}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowChapters(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowChapters(false)} />
          <View style={[styles.chaptersModalContent, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.chaptersHeader}>
              <Text style={[styles.chaptersTitle, { color: theme.colors.text }]}>章节列表</Text>
              <TouchableOpacity onPress={() => setShowChapters(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {(() => {
              const displayChapters = book.fileType === 'pdf' && pdfOutline.length > 0
                ? pdfOutline.map((item, i) => ({ index: item.page - 1, title: item.title }))
                : chapters;
              if (displayChapters.length === 0) {
                return (
                  <View style={styles.chaptersEmpty}>
                    <Text style={{ color: theme.colors.textSecondary }}>暂无章节信息</Text>
                  </View>
                );
              }
              return (
                <ChapterList
                  chapters={displayChapters}
                  currentChapter={currentChapter}
                  theme={theme}
                  onChapterPress={handleChapterPress}
                />
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ActionSheet for text selection */}
      {showActionSheet && (
        <View style={styles.actionSheetOverlay}>
          <Pressable style={styles.actionSheetBackdrop} onPress={() => { setShowActionSheet(false); setSelectedText(''); }} />
          <View style={[styles.actionSheet, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.actionSheetTitle, { color: theme.colors.text }]} numberOfLines={2}>
              {selectedText.length > 60 ? selectedText.substring(0, 60) + '...' : selectedText}
            </Text>
            <TouchableOpacity style={styles.actionSheetButton} onPress={handleCreateNote}>
              <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
              <Text style={[styles.actionSheetButtonText, { color: theme.colors.text }]}>记笔记</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSheetButton} onPress={handleCreateHighlight}>
              <Ionicons name="color-wand-outline" size={22} color="#FF9800" />
              <Text style={[styles.actionSheetButtonText, { color: theme.colors.text }]}>高亮</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionSheetButton, styles.actionSheetCancel]}
              onPress={() => { setShowActionSheet(false); setSelectedText(''); }}
            >
              <Text style={[styles.actionSheetCancelText, { color: theme.colors.error }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Note Input Modal */}
      <Modal
        visible={showNoteModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => { setShowNoteModal(false); setNoteText(''); }}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => { setShowNoteModal(false); setNoteText(''); }} />
          <View style={[styles.noteModalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>添加笔记</Text>
            <View style={styles.noteSelectedTextBox}>
              <Text style={[styles.noteSelectedTextLabel, { color: theme.colors.textSecondary }]}>选中文本：</Text>
              <Text style={[styles.noteSelectedText, { color: theme.colors.text }]} numberOfLines={4}>
                {selectedText}
              </Text>
            </View>
            <TextInput
              style={[styles.noteInput, {
                borderColor: theme.colors.border,
                color: theme.colors.text,
                backgroundColor: theme.colors.background,
              }]}
              multiline={true}
              numberOfLines={4}
              placeholder="输入笔记内容..."
              placeholderTextColor={theme.colors.textSecondary}
              value={noteText}
              onChangeText={setNoteText}
              autoFocus={true}
            />
            <View style={styles.noteModalButtons}>
              <TouchableOpacity
                style={[styles.noteModalButton, { borderColor: theme.colors.border }]}
                onPress={() => { setShowNoteModal(false); setNoteText(''); }}
              >
                <Text style={{ color: theme.colors.textSecondary }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.noteModalButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleSaveNote}
                disabled={isSavingNote || !noteText.trim()}
              >
                {isSavingNote ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>保存</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface ChapterListProps {
  chapters: Array<{ index: number; title: string }>;
  currentChapter: number;
  theme: ReturnType<typeof getTheme>;
  onChapterPress: (index: number) => void;
}

function ChapterList({ chapters, currentChapter, theme, onChapterPress }: ChapterListProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const itemRefs = useRef<(View | null)[]>([]);
  const listStyles = useMemo(() => createChapterListStyles(theme), [theme]);

  useEffect(() => {
    const targetIndex = chapters.findIndex((ch) => ch.index === currentChapter);
    if (targetIndex >= 0 && itemRefs.current[targetIndex]) {
      setTimeout(() => {
        itemRefs.current[targetIndex]?.measureLayout(
          scrollViewRef.current as any,
          (x, y) => {
            scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: false });
          },
          () => {}
        );
      }, 100);
    }
  }, [chapters, currentChapter]);

  return (
    <ScrollView ref={scrollViewRef} style={listStyles.chaptersList}>
      {chapters.map((chapter, index) => {
        const isCurrent = chapter.index === currentChapter;
        const isRead = chapter.index < currentChapter;
        const textColor = isCurrent
          ? theme.colors.text
          : isRead
            ? theme.colors.textSecondary + '80'
            : theme.colors.textSecondary;
        const fontWeight = isCurrent ? '700' : '400';

        return (
          <TouchableOpacity
            key={chapter.index}
            style={[listStyles.chapterItem, { borderBottomColor: theme.colors.border }]}
            onPress={() => onChapterPress(chapter.index)}
          >
            <View
              ref={(ref) => { itemRefs.current[index] = ref; }}
              style={listStyles.chapterItemInner}
            >
              <Text style={[listStyles.chapterNumber, { color: textColor, fontWeight }]}>
                {index + 1}
              </Text>
              <Text style={[listStyles.chapterName, { color: textColor, fontWeight }]} numberOfLines={1}>
                {chapter.title}
              </Text>
              {isCurrent && (
                <Ionicons name="book" size={16} color={theme.colors.primary} />
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function createChapterListStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    chaptersList: {
      maxHeight: 400,
    },
    chapterItem: {
      borderBottomWidth: 1,
    },
    chapterItemInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    chapterNumber: {
      fontSize: fontSizes.sm,
      width: 36,
      textAlign: 'center',
    },
    chapterName: {
      flex: 1,
      fontSize: fontSizes.md,
    },
  });
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    // 顶/底栏 absolute 定位,在 WebView margin 让出的区段内。
    // RN 0.81 + Fabric + Android: react-native-webview 是 native view,优先级高于 absolute 兄弟,
    // 栏体 absolute 覆盖会出现"看得见点不到"。解决:WebView marginTop/marginBottom 让出栏体区段,
    // WebView 不渲染到该区段 → 触摸派发完全不冲突。
    // 栏体高度固定 BAR_HEIGHT,内容 paddingTop/paddingBottom 用 insets 自适应,
    // 不依赖 flex 自然计算(Fabric 下 native view 邻接 flex 不可靠)。
    topBarWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      elevation: 20,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      backgroundColor: theme.colors.background,
    },
    bottomBarWrapper: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      elevation: 20,
    },
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      backgroundColor: theme.colors.background,
    },
    barButton: {
      padding: spacing.sm,
    },
    barTitle: {
      flex: 1,
      marginHorizontal: spacing.sm,
      alignItems: 'center',
    },
    barTitleText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    progressContainer: {
      minWidth: 40,
      alignItems: 'center',
    },
    progressText: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
    },
    webview: {
      flex: 1,
      zIndex: 0,
      elevation: 0,
    },
    webviewWithBars: {
      flex: 1,
      // 与顶栏 absolute 区段对齐,WebView 内容缩在栏体下方
      marginTop: BAR_HEIGHT,
      // 与底栏 absolute 区段对齐,WebView 内容缩在栏体上方
      marginBottom: BAR_HEIGHT,
    },
    webviewFullscreen: {
      flex: 1,
      marginTop: 0,
      marginBottom: 0,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    loadingText: {
      fontSize: fontSizes.md,
    },
    errorText: {
      fontSize: fontSizes.md,
      textAlign: 'center',
      marginHorizontal: spacing.lg,
    },
    retryButton: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      zIndex: 100,
      elevation: 100,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      padding: spacing.lg,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      gap: spacing.md,
    },
    modalTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    settingLabel: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    fontSizeControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    fontButton: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fontValue: {
      fontSize: fontSizes.md,
      minWidth: 50,
      textAlign: 'center',
    },
    closeButton: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    closeButtonText: {
      color: '#fff',
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    themeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    themeChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 2,
    },
    themeChipActive: {
      borderWidth: 2,
    },
    themeChipText: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
    },
    fontOptionButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
    },
    fontOptionText: {
      fontSize: fontSizes.sm,
    },
    chaptersModalContent: {
      padding: spacing.lg,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      maxHeight: '70%',
    },
    chaptersHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    chaptersTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
    },
    chaptersList: {
      maxHeight: 400,
    },
    chaptersEmpty: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
    },
    chapterItem: {
      borderBottomWidth: 1,
    },
    chapterItemInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    chapterNumber: {
      fontSize: fontSizes.sm,
      width: 36,
      textAlign: 'center',
    },
    chapterName: {
      flex: 1,
      fontSize: fontSizes.md,
    },
    actionSheetOverlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 1000,
      justifyContent: 'flex-end',
    },
    actionSheetBackdrop: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    actionSheet: {
      borderTopLeftRadius: borderRadius.lg,
      borderTopRightRadius: borderRadius.lg,
      padding: spacing.md,
      paddingBottom: spacing.xl + 20,
    },
    actionSheetTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
      marginBottom: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
    },
    actionSheetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      gap: spacing.sm,
    },
    actionSheetButtonText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    actionSheetCancel: {
      marginTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: '#E5E7EB',
      justifyContent: 'center',
    },
    actionSheetCancelText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    noteModalContent: {
      backgroundColor: '#fff',
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      margin: spacing.md,
      maxHeight: '70%',
      width: '90%',
      alignSelf: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },
    noteSelectedTextBox: {
      marginBottom: spacing.md,
      padding: spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.03)',
      borderRadius: borderRadius.md,
    },
    noteSelectedTextLabel: {
      fontSize: fontSizes.xs,
      marginBottom: spacing.xs,
    },
    noteSelectedText: {
      fontSize: fontSizes.sm,
      fontStyle: 'italic',
    },
    noteInput: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: fontSizes.md,
      minHeight: 100,
      textAlignVertical: 'top',
      marginBottom: spacing.md,
    },
    noteModalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.md,
    },
    noteModalButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      minWidth: 80,
      alignItems: 'center',
    },
  });
}
