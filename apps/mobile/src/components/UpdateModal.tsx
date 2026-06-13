import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { UpdateInfo } from '../hooks/useCheckUpdate';
import { useThemeColors } from '../utils/theme';

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
  const hasStartedDownload = progress > 0 && progress < 1;

  const colors = useThemeColors('light');

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
                更新正在系统下载管理器中下载，完成后请在通知栏中点击安装。
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
