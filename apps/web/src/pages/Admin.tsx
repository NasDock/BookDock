import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { getApiClient, User, EbookSource, Book } from '@bookdock/api-client';
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@bookdock/ui';

// ==================== File Upload Section ====================
function FileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recentUploads, setRecentUploads] = useState<Book[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [meta, setMeta] = useState({ title: '', author: '', description: '', language: 'zh' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showMetaForm, setShowMetaForm] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const supported = ['epub', 'pdf', 'txt', 'mobi'];
    if (!supported.includes(ext)) {
      setUploadError(`不支持的格式: .${ext}。支持: ${supported.join(', ')}`);
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(null);
    if (!meta.title) {
      setMeta((prev) => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }));
    }
    setShowMetaForm(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', meta.title || selectedFile.name.replace(/\.[^/.]+$/, ''));
      formData.append('author', meta.author || '未知作者');
      formData.append('description', meta.description);
      formData.append('language', meta.language);

      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        const apiBase = (window as unknown as { _bookdock_api_base?: string })._bookdock_api_base || '/api';
        xhr.open('POST', `${apiBase}/books/upload`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resp = JSON.parse(xhr.responseText);
              if (resp.success && resp.data) {
                setRecentUploads((prev) => [resp.data, ...prev.slice(0, 4)]);
                setUploadSuccess(`《${resp.data.title}》上传成功！`);
                setSelectedFile(null);
                setShowMetaForm(false);
                setMeta({ title: '', author: '', description: '', language: 'zh' });
                if (fileInputRef.current) fileInputRef.current.value = '';
              } else {
                setUploadError(resp.error || '上传失败');
              }
            } catch {
              setUploadError('解析响应失败');
            }
          } else {
            try {
              const resp = JSON.parse(xhr.responseText);
              setUploadError(resp.error || `上传失败 (${xhr.status})`);
            } catch {
              setUploadError(`上传失败 (${xhr.status})`);
            }
          }
          resolve();
        };
        xhr.onerror = () => { setUploadError('网络错误'); resolve(); };
        xhr.send(formData);
      });
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const ext = selectedFile ? selectedFile.name.split('.').pop()?.toLowerCase() : '';
  const extIcon = ext === 'epub' ? '📖' : ext === 'pdf' ? '📄' : ext === 'mobi' ? '📱' : '📝';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📤 上传书籍</h2>
        <span className="text-xs text-gray-400">支持 EPUB, PDF, TXT, MOBI</span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
      >
        <input ref={fileInputRef} type="file" accept=".epub,.pdf,.txt,.mobi" className="hidden" onChange={(e) => handleFileSelect(e.target.files)} />
        <div className="text-5xl mb-3">{dragOver ? '📥' : '📂'}</div>
        <p className="text-gray-700 dark:text-gray-300 font-medium">
          {dragOver ? '松开以上传' : '点击或拖拽文件到此处'}
        </p>
        <p className="text-sm text-gray-400 mt-1">最大文件大小: 100MB</p>
      </div>

      {/* Selected file */}
      {selectedFile && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center text-2xl">{extIcon}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)} · {ext.toUpperCase()}</p>
            </div>
            <button onClick={() => { setSelectedFile(null); setShowMetaForm(false); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-gray-400 hover:text-red-500">✕</button>
          </div>
        </div>
      )}

      {/* Metadata form */}
      {showMetaForm && selectedFile && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader><CardTitle>📋 书籍信息（可选）</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input label="书名" placeholder="自动从文件名填充" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            <Input label="作者" placeholder="未知作者" value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">语言</label>
              <select value={meta.language} onChange={(e) => setMeta({ ...meta, language: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                <option value="zh">中文</option><option value="en">英文</option><option value="ja">日文</option><option value="ko">韩文</option><option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">简介</label>
              <textarea value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} rows={3} placeholder="书籍简介..." className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            </div>
            {isUploading && (
              <div>
                <div className="flex justify-between text-sm mb-1"><span className="text-blue-500">上传中...</span><span className="text-blue-500">{uploadProgress}%</span></div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} /></div>
              </div>
            )}
            {uploadError && <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm">{uploadError}</div>}
            <Button onClick={handleUpload} disabled={isUploading || !selectedFile} className="w-full">{isUploading ? '上传中...' : '📤 开始上传'}</Button>
          </CardContent>
        </Card>
      )}

      {/* Recent uploads */}
      {uploadSuccess && recentUploads.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">最近上传</h3>
          <div className="space-y-2">
            {recentUploads.map((book) => (
              <div key={book.id} className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <span className="text-lg">{book.fileType === 'epub' ? '📖' : book.fileType === 'pdf' ? '📄' : book.fileType === 'mobi' ? '📱' : '📝'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{book.title}</p>
                  <p className="text-xs text-gray-500">{book.author} · {formatFileSize(book.fileSize)}</p>
                </div>
                <span className="text-green-500 text-sm">✓ 已上传</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Open Library Search ====================
function OpenLibrarySearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ key: string; title: string; author_name?: string[]; cover_i?: number; first_publish_year?: number; isbn?: string[]; publisher?: string[] }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,cover_i,first_publish_year,isbn,publisher`);
      const data = await response.json();
      setResults(data.docs || []);
    } catch {
      setError('搜索失败，请稍后重试');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddBook = async (result: typeof results[0]) => {
    setAddingIds((prev) => new Set(prev).add(result.key));
    try {
      const apiClient = getApiClient();
      const bookData: Partial<Book> = {
        title: result.title,
        author: result.author_name?.[0] || '未知作者',
        fileType: 'epub',
        filePath: `ol://${result.key}`,
        fileSize: 0,
        language: 'en',
        isbn: result.isbn?.[0],
        publisher: result.publisher?.[0],
        addedAt: new Date().toISOString(),
      };
      const response = await apiClient.addBook(bookData);
      if (response.success) setAddedIds((prev) => new Set(prev).add(result.key));
    } catch { /* ignore */ } finally {
      setAddingIds((prev) => { const n = new Set(prev); n.delete(result.key); return n; });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">🔍 搜索公开书籍</h2>
        <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:text-blue-600">Open Library ↗</a>
      </div>
      <form onSubmit={handleSearch} className="flex gap-3">
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索书名、作者、ISBN..." className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <Button type="submit" disabled={isSearching}>{isSearching ? '⟳ 搜索中...' : '🔍 搜索'}</Button>
      </form>
      {error && <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400">{error}</div>}
      {results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((result) => (
            <Card key={result.key}>
              <CardContent className="flex gap-4">
                <div className="w-16 h-20 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                  {result.cover_i ? (
                    <img src={`https://covers.openlibrary.org/b/id/${result.cover_i}-M.jpg`} alt={result.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-600"><span className="text-gray-400">📖</span></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{result.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{result.author_name?.[0] || '未知作者'}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {result.first_publish_year && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{result.first_publish_year}</span>}
                    {result.isbn?.[0] && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">ISBN: {result.isbn[0]}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {addedIds.has(result.key) ? (
                    <span className="text-green-500 text-sm">✓ 已添加</span>
                  ) : (
                    <Button size="sm" onClick={() => handleAddBook(result)} disabled={addingIds.has(result.key)}>
                      {addingIds.has(result.key) ? '添加中...' : '➕ 添加'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : query && !isSearching ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400"><div className="text-5xl mb-4">🔍</div><p>未找到相关书籍</p></div>
      ) : null}
    </div>
  );
}

// ==================== Ebook Sources Management ====================
function EbookSources() {
  const [sources, setSources] = useState<EbookSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [newSource, setNewSource] = useState({ name: '', type: 'local' as const, url: '', path: '' });

  useEffect(() => { fetchSources(); }, []);
  const fetchSources = async () => {
    setIsLoading(true);
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getEbookSources();
      if (response.success && response.data) setSources(response.data);
    } catch { /* ignore */ } finally { setIsLoading(false); }
  };
  const handleAddSource = async () => {
    if (!newSource.name) return;
    try {
      const apiClient = getApiClient();
      const response = await apiClient.addEbookSource(newSource);
      if (response.success && response.data) { setSources([...sources, response.data]); setShowAddForm(false); setNewSource({ name: '', type: 'local', url: '', path: '' }); }
    } catch { /* ignore */ }
  };
  const handleSync = async (id: string) => { setSyncingId(id); try { const apiClient = getApiClient(); await apiClient.syncEbookSource(id); await fetchSources(); } catch { /* ignore */ } finally { setSyncingId(null); } };
  const handleDelete = async (id: string) => { if (!window.confirm('确定要删除此电子书源吗？')) return; try { const apiClient = getApiClient(); await apiClient.deleteEbookSource(id); setSources(sources.filter((s) => s.id !== id)); } catch { /* ignore */ } };
  const handleToggleEnabled = async (id: string, enabled: boolean) => { try { const apiClient = getApiClient(); await apiClient.updateEbookSource(id, { enabled: !enabled }); setSources(sources.map((s) => s.id === id ? { ...s, enabled: !enabled } : s)); } catch { /* ignore */ } };
  const sourceTypeIcon: Record<string, string> = { local: '💻', webdav: '☁️', smb: '📁', ftp: '🌐' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📚 电子书源管理</h2>
        <Button onClick={() => setShowAddForm(true)}>➕ 添加书源</Button>
      </div>
      {showAddForm && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader><CardTitle>添加新书源</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="名称" placeholder="我的NAS书库" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
                <select value={newSource.type} onChange={(e) => setNewSource({ ...newSource, type: e.target.value as typeof newSource.type })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  <option value="local">本地文件夹</option><option value="webdav">WebDAV</option><option value="smb">SMB/共享</option><option value="ftp">FTP</option>
                </select>
              </div>
              <Input label={newSource.type === 'local' ? '文件夹路径' : 'URL/地址'} placeholder={newSource.type === 'local' ? '/mnt/books' : 'https://...'} value={newSource.url} onChange={(e) => setNewSource({ ...newSource, url: e.target.value })} />
              <Input label="子目录 (可选)" placeholder="/ebooks" value={newSource.path} onChange={(e) => setNewSource({ ...newSource, path: e.target.value })} />
            </div>
            {newSource.type === 'webdav' && <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">💡 WebDAV 配置：请确保提供完整的 URL，包含协议前缀（如 https://）</div>}
            <div className="flex gap-3 mt-4">
              <Button onClick={handleAddSource}>保存</Button>
              <Button variant="secondary" onClick={() => setShowAddForm(false)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div></div>
      ) : sources.length === 0 ? (
        <Card><CardContent className="text-center py-12"><div className="text-5xl mb-4">📂</div><p className="text-gray-500 dark:text-gray-400">暂无电子书源</p><p className="text-sm text-gray-400 mt-1">点击上方按钮添加第一个书源</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <Card key={source.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-start justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors" onClick={() => setExpandedSource(expandedSource === source.id ? null : source.id)}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{sourceTypeIcon[source.type] || '📁'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{source.name}</h3>
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs uppercase">{source.type}</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate max-w-md">{source.path || source.url || '-'}</p>
                      {source.lastSyncAt && <p className="text-xs text-gray-400 mt-1">最后同步: {new Date(source.lastSyncAt).toLocaleDateString('zh-CN')}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={source.enabled} onChange={() => handleToggleEnabled(source.id, source.enabled)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                    <span className="text-gray-400">{expandedSource === source.id ? '▲' : '▼'}</span>
                  </div>
                </div>
                {expandedSource === source.id && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">类型</span><p className="font-medium text-gray-900 dark:text-white capitalize">{source.type}</p></div>
                      <div><span className="text-gray-500">地址</span><p className="font-medium text-gray-900 dark:text-white break-all">{source.url || source.path || '-'}</p></div>
                      {source.path && <div><span className="text-gray-500">子目录</span><p className="font-medium text-gray-900 dark:text-white">{source.path}</p></div>}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" onClick={() => handleSync(source.id)} disabled={syncingId === source.id || !source.enabled}>{syncingId === source.id ? '🔄 同步中...' : '🔄 同步'}</Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(source.id)}>🗑️ 删除</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== User Management ====================
function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => { fetchUsers(); }, []);
  const fetchUsers = async () => { setIsLoading(true); try { const apiClient = getApiClient(); const response = await apiClient.getUsers(); if (response.success && response.data) setUsers(response.data.users); } catch { /* ignore */ } finally { setIsLoading(false); } };
  const handleUpdateUser = async (userId: string, updates: Partial<User>) => { try { const apiClient = getApiClient(); const response = await apiClient.updateUser(userId, updates); if (response.success && response.data) setUsers(users.map((u) => u.id === userId ? response.data! : u)); setEditingUser(null); } catch { /* ignore */ } };
  const handleDeleteUser = async (userId: string) => { if (!window.confirm('确定要删除此用户吗？')) return; try { const apiClient = getApiClient(); await apiClient.deleteUser(userId); setUsers(users.filter((u) => u.id !== userId)); } catch { /* ignore */ } };
  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">👥 用户管理</h2>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">用户名</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">邮箱</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">角色</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">会员</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">注册时间</th><th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">操作</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center"><span className="text-blue-600 dark:text-blue-400 font-medium">{user.username.charAt(0).toUpperCase()}</span></div><span className="font-medium text-gray-900 dark:text-white">{user.username}</span></div></td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{user.email || '-'}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${user.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>{user.role === 'admin' ? '管理员' : '用户'}</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${user.membership === 'premium' ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>{user.membership === 'premium' ? 'Premium' : '免费'}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditingUser(user)}>✏️</Button><Button size="sm" variant="danger" onClick={() => handleDeleteUser(user.id)}>🗑️</Button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">编辑用户: {editingUser.username}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色</label>
                <select id="edit-role" defaultValue={editingUser.role} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="user">用户</option><option value="admin">管理员</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">会员</label>
                <select id="edit-membership" defaultValue={editingUser.membership} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="free">免费</option><option value="premium">Premium</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => { const role = (document.getElementById('edit-role') as HTMLSelectElement).value as 'admin' | 'user'; const membership = (document.getElementById('edit-membership') as HTMLSelectElement).value as 'free' | 'premium'; handleUpdateUser(editingUser.id, { role, membership }); }}>保存</Button>
              <Button variant="secondary" onClick={() => setEditingUser(null)}>取消</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Books Management ====================
function BooksManagement() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'epub' | 'pdf' | 'txt' | 'mobi'>('all');

  useEffect(() => { fetchBooks(); }, []);
  const fetchBooks = async () => { setIsLoading(true); try { const apiClient = getApiClient(); const response = await apiClient.getBooks({ limit: 100 }); if (response.success && response.data) setBooks(response.data.books); } catch { /* ignore */ } finally { setIsLoading(false); } };
  const handleDeleteBook = async (bookId: string) => { if (!window.confirm('确定要删除此书籍吗？')) return; try { const apiClient = getApiClient(); await apiClient.deleteBook(bookId); setBooks(books.filter((b) => b.id !== bookId)); } catch { /* ignore */ } };
  const formatFileSize = (bytes: number): string => { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]; };
  const filteredBooks = filter === 'all' ? books : books.filter((b) => b.fileType === filter);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📖 书籍管理</h2>
      <div className="flex gap-2 flex-wrap">
        {(['all', 'epub', 'pdf', 'txt', 'mobi'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {f === 'all' ? '全部' : f.toUpperCase()}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div></div>
      ) : filteredBooks.length === 0 ? (
        <Card><CardContent className="text-center py-12"><div className="text-5xl mb-4">📚</div><p className="text-gray-500 dark:text-gray-400">{filter === 'all' ? '暂无书籍' : `暂无${filter.toUpperCase()}格式的书籍`}</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">书籍</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">作者</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">格式</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">大小</th><th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">进度</th><th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">操作</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredBooks.map((book) => (
                    <tr key={book.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-14 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                            {book.coverUrl ? <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500"><span className="text-white font-bold">{book.title.charAt(0)}</span></div>}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{book.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{book.author || '-'}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs uppercase">{book.fileType}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatFileSize(book.fileSize)}</td>
                      <td className="px-4 py-3">
                        {book.readingProgress !== undefined && book.readingProgress > 0 ? (
                          <div className="flex items-center gap-2"><div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${book.readingProgress}%` }} /></div><span className="text-xs text-gray-500">{book.readingProgress}%</span></div>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="danger" onClick={() => handleDeleteBook(book.id)}>🗑️</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== System Settings ====================
function SystemSettings() {
  const [settings, setSettings] = useState({ siteName: '书仓', siteDescription: '您的私人电子书库', allowPublicRegistration: true, defaultMembership: 'free' as 'free' | 'premium', enableTTS: true, ttsProvider: 'browser' as 'browser' | 'server' });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSave = async () => { setIsSaving(true); setSaveMessage(null); await new Promise((r) => setTimeout(r, 1000)); localStorage.setItem('bookdock_system_settings', JSON.stringify(settings)); setSaveMessage('设置已保存'); setIsSaving(false); setTimeout(() => setSaveMessage(null), 3000); };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">⚙️ 系统设置</h2>
      <Card>
        <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">网站名称</label><input type="text" value={settings.siteName} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" /></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">网站描述</label><textarea value={settings.siteDescription} onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })} rows={3} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>用户设置</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="font-medium text-gray-900 dark:text-white">允许公开注册</p><p className="text-sm text-gray-500">允许新用户自行注册账户</p></div>
            <label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={settings.allowPublicRegistration} onChange={(e) => setSettings({ ...settings, allowPublicRegistration: e.target.checked })} className="sr-only peer" /><div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div></label>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">默认会员类型</label><select value={settings.defaultMembership} onChange={(e) => setSettings({ ...settings, defaultMembership: e.target.value as 'free' | 'premium' })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"><option value="free">免费</option><option value="premium">Premium</option></select></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>TTS 设置</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="font-medium text-gray-900 dark:text-white">启用语音朗读</p><p className="text-sm text-gray-500">允许用户使用文字转语音功能</p></div>
            <label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={settings.enableTTS} onChange={(e) => setSettings({ ...settings, enableTTS: e.target.checked })} className="sr-only peer" /><div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div></label>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TTS 提供商</label><select value={settings.ttsProvider} onChange={(e) => setSettings({ ...settings, ttsProvider: e.target.value as 'browser' | 'server' })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"><option value="browser">浏览器 TTS</option><option value="server">服务器 TTS</option></select></div>
        </CardContent>
      </Card>
      {saveMessage && <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-600 dark:text-green-400 text-center">{saveMessage}</div>}
      <Button onClick={handleSave} disabled={isSaving} className="w-full">{isSaving ? '保存中...' : '💾 保存设置'}</Button>
    </div>
  );
}

// ==================== Main Admin Component ====================
export default function Admin() {
  const location = useLocation();
  const currentPath = location.pathname.replace('/admin', '') || '/';

  const tabs = [
    { path: '/admin', label: '📤 上传', exact: true },
    { path: '/admin/sources', label: '📚 书源管理' },
    { path: '/admin/users', label: '👥 用户管理' },
    { path: '/admin/books', label: '📖 书籍管理' },
    { path: '/admin/search', label: '🔍 公开搜索' },
    { path: '/admin/settings', label: '⚙️ 系统设置' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">管理面板</h1>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map((tab) => (
          <Link key={tab.path} to={tab.path} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${currentPath === tab.path ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {tab.label}
          </Link>
        ))}
      </div>
      <Routes>
        <Route path="/" element={<FileUpload />} />
        <Route path="/sources" element={<EbookSources />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/books" element={<BooksManagement />} />
        <Route path="/search" element={<OpenLibrarySearch />} />
        <Route path="/settings" element={<SystemSettings />} />
      </Routes>
    </div>
  );
}
