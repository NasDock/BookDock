import React, { useEffect } from 'react';
import { useDesktopStore, type LocalFile } from '../stores/desktopStore';
import { useFileBrowser, importLocalBook, addBook } from '../hooks/useDesktopCommands';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(file: LocalFile): string {
  if (file.is_dir) return '📁';
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'epub':
      return '📕';
    case 'pdf':
      return '📗';
    case 'mobi':
      return '📘';
    case 'txt':
      return '📄';
    default:
      return '📋';
  }
}

interface FileBrowserProps {
  onBookSelected?: (book: any) => void;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ onBookSelected }) => {
  const { currentPath, files, isLoadingFiles, books, addBook: addBookToStore } = useDesktopStore();
  const { openPath, navigateUp } = useFileBrowser();

  useEffect(() => {
    if (!currentPath) {
      // Load home directory by default
      getHomeDirectory().then((home) => {
        openPath(home);
      }).catch(() => {
        // Fallback to a default path
        openPath('/');
      });
    }
  }, []);

  const handleFileClick = async (file: LocalFile) => {
    if (file.is_dir) {
      await openPath(file.path);
    } else {
      // Import and open book
      try {
        const book = await importLocalBook(file.path);
        addBookToStore(book as any);
        await addBook(book);
        onBookSelected?.(book);
      } catch (error) {
        console.error('Failed to import book:', error);
      }
    }
  };

  const handleDoubleClick = async (file: LocalFile) => {
    if (!file.is_dir) {
      await handleFileClick(file);
    }
  };

  // Check if a file is already in the library
  const isInLibrary = (path: string) => {
    return books.some((b) => b.filePath === path);
  };

  if (isLoadingFiles && files.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Path bar */}
      <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg mb-3">
        <button
          onClick={navigateUp}
          className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="返回上级目录"
        >
          ⬆️
        </button>
        <div className="flex-1 px-3 py-1.5 bg-white dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-300 truncate">
          {currentPath || '选择目录...'}
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-3">📂</div>
            <p>此目录为空</p>
            <p className="text-sm mt-1">拖放文件到此处添加书籍</p>
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => (
              <div
                key={file.path}
                onClick={() => handleFileClick(file)}
                onDoubleClick={() => handleDoubleClick(file)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  file.is_dir
                    ? 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    : 'hover:bg-purple-50 dark:hover:bg-purple-900/20'
                }`}
              >
                <span className="text-xl">{getFileIcon(file)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {file.name}
                    </span>
                    {!file.is_dir && isInLibrary(file.path) && (
                      <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                        已入库
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {!file.is_dir && <span>{formatFileSize(file.size)}</span>}
                    {file.modified && <span>{file.modified}</span>}
                  </div>
                </div>
                {!file.is_dir && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFileClick(file);
                    }}
                    className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                  >
                    {isInLibrary(file.path) ? '阅读' : '导入'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Import this helper at top or inline it
import { getHomeDirectory } from '../hooks/useDesktopCommands';
