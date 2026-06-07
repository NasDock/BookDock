import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { UpdateInfo } from '../../hooks/useCheckUpdate';
import { useTheme } from '../utils/theme';

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

export const UpdateModal = ({ 
  visible, 
  progress, 
  isUpdating,
  updateInfo,
  onUpdate,
  onIgnore,
  onCancel,
  onBackground 
}: UpdateModalProps) => {
  const isDownloading = isUpdating || progress > 0;

  const { colors } = useTheme();

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
          {isDownloading ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                {progress > 0 ? '正在更新...' : '准备下载...'}
              </Text>
              
              {/* 进度条区域 */}
              <View style={styles.progressContainer}>
                <View style={[styles.progressBarBackground, { backgroundColor: colors.background }]}>
                  <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
                </View>
              </View>
              <Text style={styles.percentText}>
                {progress > 0 ? `${(progress * 100).toFixed(0)}%` : '请求下载链接...'}
              </Text>
              
              {(isUpdating || progress < 1) && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 10 }} />
              )}

              {/* 底部按钮区域 */}
              <TouchableOpacity style={[styles.backgroundBtn, { backgroundColor: colors.background }]} onPress={onBackground}>
                <Text style={[styles.backgroundBtnText, { color: colors.text }]}>后台下载</Text>
              </TouchableOpacity>
            </>
          ) : updateInfo ? (
            <>
               <Text style={[styles.title, { color: colors.text }]}>发现新版本 {updateInfo.version}</Text>
                <ScrollView style={styles.scrollView}>
                  <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
                    {updateInfo.body}
                  </Text>
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
  scrollView: {
    width: '100%',
    marginBottom: 20,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
  },
  progressContainer: {
    width: '100%',
    height: 6,
    marginBottom: 8,
  },
  progressBarBackground: {
    width: '100%',
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  percentText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
  },
  backgroundBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  backgroundBtnText: {
    color: '#666',
    fontSize: 14,
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
});
