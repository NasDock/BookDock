import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  getApiClient,
  type EbookSource,
  type CreateSourceInput,
  type SourceType,
  type ConnectionTestResult,
} from '@bookdock/api-client';

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string; icon: string }[] = [
  { value: 'webdav', label: 'WebDAV', icon: '☁️' },
  { value: 'smb', label: 'SMB / SMB2', icon: '📁' },
  { value: 'ftp', label: 'FTP / FTPS', icon: '🖥️' },
];

const FORMAT_OPTIONS = ['epub', 'pdf', 'mobi', 'txt', 'azw3', 'fb2', 'djvu'];

interface FormState {
  name: string;
  type: SourceType;
  // WebDAV
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavBasePath: string;
  // SMB
  smbShare: string;
  smbUsername: string;
  smbPassword: string;
  smbDomain: string;
  smbPort: string;
  smbBasePath: string;
  // FTP
  ftpHost: string;
  ftpPort: string;
  ftpUsername: string;
  ftpPassword: string;
  ftpSecure: boolean;
  ftpBasePath: string;
  // Common
  autoSync: boolean;
  syncIntervalSecs: string;
  formats: string[];
}

const emptyForm = (type: SourceType = 'webdav'): FormState => ({
  name: '',
  type,
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
  webdavBasePath: '',
  smbShare: '',
  smbUsername: '',
  smbPassword: '',
  smbDomain: '',
  smbPort: '445',
  smbBasePath: '',
  ftpHost: '',
  ftpPort: '21',
  ftpUsername: '',
  ftpPassword: '',
  ftpSecure: false,
  ftpBasePath: '',
  autoSync: true,
  syncIntervalSecs: '3600',
  formats: ['epub', 'pdf', 'txt'],
});

const TYPE_ICONS: Record<SourceType, string> = {
  webdav: '☁️',
  smb: '📁',
  ftp: '🖥️',
};

export function SourceManageScreen() {
  const [sources, setSources] = useState<EbookSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<EbookSource | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const apiClient = useMemo(() => getApiClient(), []);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getSources();
      if (res.success && res.data) {
        setSources(res.data);
      }
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openAddModal = () => {
    setEditingSource(null);
    setForm(emptyForm());
    setTestResult(null);
    setShowModal(true);
  };

  const openEditModal = (source: EbookSource) => {
    setEditingSource(source);
    setTestResult(null);
    const isValidType = (t: string): t is SourceType => t === 'webdav' || t === 'smb' || t === 'ftp';
    const type: SourceType = isValidType(source.type) ? source.type : 'webdav';
    setForm({
      name: source.name,
      type,
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
      webdavBasePath: source.basePath || '',
      smbShare: source.url || '',
      smbUsername: source.username || '',
      smbPassword: '',
      smbDomain: '',
      smbPort: '445',
      smbBasePath: source.basePath || '',
      ftpHost: source.host || '',
      ftpPort: '21',
      ftpUsername: source.username || '',
      ftpPassword: '',
      ftpSecure: false,
      ftpBasePath: source.basePath || '',
      autoSync: source.autoSync,
      syncIntervalSecs: String(source.syncIntervalSecs),
      formats: source.formats || ['epub', 'pdf', 'txt'],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSource(null);
    setTestResult(null);
  };

  const buildInput = (): CreateSourceInput => {
    const base = {
      name: form.name,
      type: form.type,
      autoSync: form.autoSync,
      syncIntervalSecs: parseInt(form.syncIntervalSecs) || 3600,
      formats: form.formats,
    };
    if (form.type === 'webdav') {
      return {
        ...base,
        webdavConfig: {
          url: form.webdavUrl,
          username: form.webdavUsername || undefined,
          password: form.webdavPassword || undefined,
          basePath: form.webdavBasePath || undefined,
        },
      };
    } else if (form.type === 'smb') {
      return {
        ...base,
        smbConfig: {
          share: form.smbShare,
          username: form.smbUsername || undefined,
          password: form.smbPassword || undefined,
          domain: form.smbDomain || undefined,
          port: parseInt(form.smbPort) || 445,
          basePath: form.smbBasePath || undefined,
        },
      };
    } else {
      return {
        ...base,
        ftpConfig: {
          host: form.ftpHost,
          port: parseInt(form.ftpPort) || 21,
          username: form.ftpUsername || undefined,
          password: form.ftpPassword || undefined,
          secure: form.ftpSecure,
          basePath: form.ftpBasePath || undefined,
        },
      };
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('请输入书源名称');
      return;
    }
    setSaving(true);
    try {
      const input = buildInput();
      let res;
      if (editingSource) {
        res = await apiClient.updateSource(editingSource.id, input);
      } else {
        res = await apiClient.createSource(input);
      }
      if (res.success) {
        await loadSources();
        closeModal();
      } else {
        alert(`保存失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (source: EbookSource) => {
    try {
      const res = await apiClient.deleteSource(source.id);
      if (res.success) {
        setSources((prev) => prev.filter((s) => s.id !== source.id));
      } else {
        alert(`删除失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
    setDeleteConfirmId(null);
  };

  const handleSync = async (source: EbookSource) => {
    setSyncingIds((prev) => new Set(prev).add(source.id));
    try {
      const res = await apiClient.syncSource(source.id);
      if (res.success && res.data) {
        const { booksAdded, status } = res.data;
        alert(`同步完成\n状态: ${status}\n新增书籍: ${booksAdded}`);
        await loadSources();
      } else {
        alert(`同步失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`同步失败: ${err.message}`);
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const input = buildInput();
      const res = await apiClient.testSourceConfig(input);
      if (res.success && res.data) {
        setTestResult(res.data);
      } else {
        setTestResult({ success: false, error: res.error || '测试失败' });
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const toggleFormat = (fmt: string) => {
    setForm((prev) => ({
      ...prev,
      formats: prev.formats.includes(fmt)
        ? prev.formats.filter((f) => f !== fmt)
        : [...prev.formats, fmt],
    }));
  };

  const getAddress = (source: EbookSource) => {
    if (source.type === 'ftp') return source.host || '-';
    return source.url || '-';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusLabel = (source: EbookSource) => {
    if (source.lastError) return { text: '⚠️ 连接异常', color: 'text-red-500' };
    if (source.lastSyncAt) return { text: '🟢 已同步', color: 'text-green-500' };
    return { text: '⚪ 未同步', color: 'text-gray-400' };
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📡 书源管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              管理 NAS / 远程书库，同步电子书到本地书架
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span>➕</span> 添加书源
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📡</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">暂无书源</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">添加 NAS 书源，将远程书籍同步到 BookDock</p>
            <button
              onClick={openAddModal}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              添加第一个书源
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {sources.map((source) => {
              const status = getStatusLabel(source);
              const isSyncing = syncingIds.has(source.id);
              return (
                <div
                  key={source.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                      {(TYPE_ICONS as Record<string, string>)[source.type] || '📂'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {source.name}
                        </h3>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">
                          {SOURCE_TYPE_OPTIONS.find((s) => s.value === source.type)?.label || '本地'}
                        </span>
                        <span className={`text-xs font-medium ${status.color}`}>
                          {status.text}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-gray-400 text-xs">地址</span>
                          <p className="text-gray-700 dark:text-gray-300 truncate" title={getAddress(source)}>
                            {getAddress(source)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">书籍</span>
                          <p className="text-gray-700 dark:text-gray-300 font-medium">
                            {source.bookCount} 本
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">最后同步</span>
                          <p className="text-gray-700 dark:text-gray-300">
                            {formatDate(source.lastSyncAt)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">路径</span>
                          <p className="text-gray-700 dark:text-gray-300 truncate" title={source.basePath}>
                            {source.basePath || '/'}
                          </p>
                        </div>
                      </div>

                      {source.lastError && (
                        <div className="mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-600 dark:text-red-400">
                          ⚠️ {source.lastError}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleSync(source)}
                        disabled={isSyncing}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isSyncing ? (
                          <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          '🔄'
                        )}
                        同步
                      </button>
                      <button
                        onClick={() => openEditModal(source)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 font-medium transition-colors flex items-center gap-1.5"
                      >
                        ✏️ 编辑
                      </button>
                      {deleteConfirmId === source.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleDelete(source)}
                            className="px-2 py-1.5 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(source.id)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 font-medium transition-colors flex items-center gap-1.5"
                        >
                          🗑️ 删除
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingSource ? '✏️ 编辑书源' : '➕ 添加书源'}
              </h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  书源名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="例如：我的 NAS 书库"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  类型
                </label>
                <div className="flex gap-2">
                  {SOURCE_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setField('type', opt.value)}
                      className={`flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                        form.type === opt.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* WebDAV fields */}
              {form.type === 'webdav' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      WebDAV URL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.webdavUrl}
                      onChange={(e) => setField('webdavUrl', e.target.value)}
                      placeholder="https://nas.example.com/dav"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">用户名</label>
                      <input
                        type="text"
                        value={form.webdavUsername}
                        onChange={(e) => setField('webdavUsername', e.target.value)}
                        placeholder="（可选）"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">密码</label>
                      <input
                        type="password"
                        value={form.webdavPassword}
                        onChange={(e) => setField('webdavPassword', e.target.value)}
                        placeholder={editingSource ? '（不修改请留空）' : '（可选）'}
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">书库路径</label>
                    <input
                      type="text"
                      value={form.webdavBasePath}
                      onChange={(e) => setField('webdavBasePath', e.target.value)}
                      placeholder="/ebooks"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </>
              )}

              {/* SMB fields */}
              {form.type === 'smb' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      SMB 共享路径 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.smbShare}
                      onChange={(e) => setField('smbShare', e.target.value)}
                      placeholder="smb://192.168.1.100/library"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">用户名</label>
                      <input
                        type="text"
                        value={form.smbUsername}
                        onChange={(e) => setField('smbUsername', e.target.value)}
                        placeholder="（可选）"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">端口</label>
                      <input
                        type="text"
                        value={form.smbPort}
                        onChange={(e) => setField('smbPort', e.target.value)}
                        placeholder="445"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">密码</label>
                      <input
                        type="password"
                        value={form.smbPassword}
                        onChange={(e) => setField('smbPassword', e.target.value)}
                        placeholder={editingSource ? '（不修改请留空）' : '（可选）'}
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">域</label>
                      <input
                        type="text"
                        value={form.smbDomain}
                        onChange={(e) => setField('smbDomain', e.target.value)}
                        placeholder="WORKGROUP"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">书库路径</label>
                    <input
                      type="text"
                      value={form.smbBasePath}
                      onChange={(e) => setField('smbBasePath', e.target.value)}
                      placeholder="/ebooks"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </>
              )}

              {/* FTP fields */}
              {form.type === 'ftp' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        FTP 主机 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.ftpHost}
                        onChange={(e) => setField('ftpHost', e.target.value)}
                        placeholder="192.168.1.100"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">端口</label>
                      <input
                        type="text"
                        value={form.ftpPort}
                        onChange={(e) => setField('ftpPort', e.target.value)}
                        placeholder="21"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">用户名</label>
                      <input
                        type="text"
                        value={form.ftpUsername}
                        onChange={(e) => setField('ftpUsername', e.target.value)}
                        placeholder="（可选）"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">密码</label>
                      <input
                        type="password"
                        value={form.ftpPassword}
                        onChange={(e) => setField('ftpPassword', e.target.value)}
                        placeholder={editingSource ? '（不修改请留空）' : '（可选）'}
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.ftpSecure}
                        onChange={(e) => setField('ftpSecure', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">使用 FTPS (TLS)</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">书库路径</label>
                    <input
                      type="text"
                      value={form.ftpBasePath}
                      onChange={(e) => setField('ftpBasePath', e.target.value)}
                      placeholder="/ebooks"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </>
              )}

              {/* Formats */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">支持格式</label>
                <div className="flex flex-wrap gap-2">
                  {FORMAT_OPTIONS.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => toggleFormat(fmt)}
                      className={`px-3 py-1.5 text-xs rounded-full font-medium border transition-colors ${
                        form.formats.includes(fmt)
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto sync */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoSync}
                    onChange={(e) => setField('autoSync', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">自动同步</span>
                </label>
              </div>

              {/* Test connection */}
              <div>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="w-full py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {testing ? (
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    '🔗'
                  )}
                  测试连接
                </button>

                {testResult && (
                  <div
                    className={`mt-3 px-4 py-3 rounded-lg text-sm flex items-start gap-2 ${
                      testResult.success
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    }`}
                  >
                    <span>{testResult.success ? '✅' : '❌'}</span>
                    <span className="flex-1">
                      {testResult.success
                        ? (testResult.message || '连接成功！')
                        : (testResult.error || '连接失败')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                {editingSource ? '保存修改' : '添加书源'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}