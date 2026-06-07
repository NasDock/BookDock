import { DownloadOutlined } from '@ant-design/icons';
import { Button, Modal, Typography } from 'antd';
import React from 'react';
import type { UpdateInfo } from '../hooks/useCheckUpdate';

const { Paragraph, Text } = Typography;

type IpcRendererBridge = {
  openExternal: (url: string) => void;
};

interface UpdateModalProps {
  visible: boolean;
  updateInfo: UpdateInfo | null;
  onCancel: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ visible, updateInfo, onCancel }) => {
  if (!updateInfo) return null;
  const isWebRuntime = typeof window !== 'undefined' && !(window as any).ipcRenderer;

  const handleDownload = () => {
    if (updateInfo.downloadUrl) {
        const ipcRenderer = (window as Window & { ipcRenderer?: IpcRendererBridge }).ipcRenderer;
        if (ipcRenderer) {
            ipcRenderer.openExternal(updateInfo.downloadUrl);
        } else {
            window.open(updateInfo.downloadUrl, '_blank');
        }
    }
  };

  return (
    <Modal
      title={`发现新版本 ${updateInfo.version}`}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {isWebRuntime ? '知道了' : '稍后更新'}
        </Button>,
        ...(!isWebRuntime
          ? [
              <Button
                key="download"
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleDownload}
              >
                前往下载
              </Button>,
            ]
          : []),
      ]}
    >
      {isWebRuntime && (
        <Paragraph>
          <Text type="secondary">
            Web 版本无需手动下载，请刷新页面或等待自动更新。
          </Text>
        </Paragraph>
      )}
      <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '10px 0' }}>
        <Paragraph>
          <Text strong>更新内容：</Text>
        </Paragraph>
        <div style={{ lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
          {updateInfo.body}
        </div>
      </div>
    </Modal>
  );
};

export default UpdateModal;
