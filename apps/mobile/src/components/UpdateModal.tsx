import React, { useMemo } from 'react';
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { UpdateInfo } from '../hooks/useCheckUpdate';
import { ThemeColors, useThemeColors } from '../utils/theme';

interface UpdateModalProps {
  visible: boolean;
  progress: number;
  isUpdating: boolean;
  updateInfo: UpdateInfo | null;
  onUpdate: () => void;
  onIgnore: () => void;
  onCancel: () => void;
  onBackground: () => void;
}

/**
 * 根据主题色生成 markdown 渲染样式
 * 只覆盖与品牌色相关的部分,其它沿用库内置默认
 */
const buildMarkdownStyles = (colors: ThemeColors) => ({
  body: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  // 文本基础色
  text: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  // 标题
  heading1: { color: colors.text, fontSize: 20, fontWeight: '700' as const, marginTop: 8, marginBottom: 6 },
  heading2: { color: colors.text, fontSize: 18, fontWeight: '700' as const, marginTop: 8, marginBottom: 6 },
  heading3: { color: colors.text, fontSize: 16, fontWeight: '600' as const, marginTop: 6, marginBottom: 4 },
  heading4: { color: colors.text, fontSize: 15, fontWeight: '600' as const, marginTop: 6, marginBottom: 4 },
  heading5: { color: colors.text, fontSize: 14, fontWeight: '600' as const, marginTop: 4, marginBottom: 4 },
  heading6: { color: colors.text, fontSize: 14, fontWeight: '600' as const, marginTop: 4, marginBottom: 4 },
  // 强调
  strong: { fontWeight: '700' as const, color: colors.text },
  em: { fontStyle: 'italic' as const, color: colors.text },
  // 链接 - 沿用主题主色
  link: { color: colors.primary, textDecorationLine: 'underline' as const },
  // 列表
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { color: colors.text, marginVertical: 2 },
  // 引用
  blockquote: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.primary,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
  },
  // 代码
  code_inline: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 4,
  },
  code_block: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 8,
    marginVertical: 6,
  },
  fence: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 8,
    marginVertical: 6,
  },
  // 分割线
  hr: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 8,
  },
  // 表格
  table: { borderColor: colors.border, borderWidth: 1 },
  th: { backgroundColor: colors.surface, color: colors.text, padding: 6 },
  tr: { borderColor: colors.border, borderWidth: 1 },
  td: { color: colors.text, padding: 6 },
});

export const UpdateModal = ({
  visible,
  progress,
  isUpdating,
  updateInfo,
  onUpdate,
  onIgnore,
  onCancel,
  onBackground,
}: UpdateModalProps) => {
  const isDownloading = isUpdating || progress > 0;
  const hasStartedDownload = progress > 0 && progress < 1;

  const colors = useThemeColors('light');
  const markdownStyles = useMemo(() => buildMarkdownStyles(colors), [colors]);

  // 链接用系统浏览器打开,避免弹窗内跳走
  const handleLinkPress = (url: string) => {
    Linking.openURL(url);
    return false; // 阻止默认 Linking 行为,避免重复触发
  };

  // body 兜底:GitHub release body 可能为 null/空字符串
  const body = updateInfo?.body?.trim() || '建议立即更新体验新功能';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isDownloading ? onBackground : onCancel}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View style={styles.backdropCenter}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {hasStartedDownload ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                下载已启动
              </Text>

              <Text style={[styles.descText, { color: colors.textSecondary }]}>
                更新正在系统下载管理器中下载,完成后请在通知栏中点击安装。
              </Text>

              <TouchableOpacity
                style={[styles.okBtn, { backgroundColor: colors.primary }]}
                onPress={onBackground}
              >
                <Text style={[styles.okBtnText, { color: '#fff' }]}>知道了</Text>
              </TouchableOpacity>
            </>
          ) : updateInfo ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>发现新版本 {updateInfo.version}</Text>
              <ScrollView style={styles.scrollView}>
                <Markdown
                  style={markdownStyles}
                  onLinkPress={handleLinkPress}
                  mergeStyle
                >
                  {body}
                </Markdown>
              </ScrollView>

              <View style={styles.buttonContainer}>
                <TouchableOpacity style={[styles.ignoreBtn, { backgroundColor: colors.background }]} onPress={onIgnore}>
                  <Text style={[styles.ignoreBtnText, { color: colors.text }]}>忽略此版本</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.updateBtn,
                    { backgroundColor: colors.primary, opacity: isUpdating ? 0.7 : 1 },
                  ]}
                  onPress={onUpdate}
                  disabled={isUpdating}
                >
                  <Text style={[styles.updateBtnText, { color: colors.background }]}>
                    {isUpdating ? '准备中...' : '立即更新'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdropCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '80%',
    maxHeight: '70%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  descText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  scrollView: {
    width: '100%',
    marginBottom: 20,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
  },
  ignoreBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  ignoreBtnText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  updateBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  updateBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  okBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  okBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});