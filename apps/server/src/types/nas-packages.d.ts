declare module '@bookdock/webdav' {
  export interface FileItem {
    id: string;
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
    lastModified: Date;
    mimeType?: string;
    isDirectory: boolean;
  }

  export interface ConnectionTestResult {
    success: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }

  export class WebDAVClientWrapper {
    constructor();
    testConnection(config: { host: string; username: string; password: string; basePath?: string }): Promise<ConnectionTestResult>;
    connect(config: { host: string; username: string; password: string; basePath?: string }): Promise<void>;
    listFiles(path: string): Promise<FileItem[]>;
    downloadFile(path: string): Promise<Buffer>;
    disconnect(): Promise<void>;
  }
}

declare module '@bookdock/smb' {
  export interface FileItem {
    id: string;
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
    lastModified: Date;
    mimeType?: string;
    isDirectory: boolean;
  }

  export interface ConnectionTestResult {
    success: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }

  export class SMBClientWrapper {
    constructor();
    testConnection(config: { host: string; username: string; password: string; domain?: string; shareName?: string }): Promise<ConnectionTestResult>;
    connect(config: { host: string; username: string; password: string; domain?: string; shareName?: string }): Promise<void>;
    listFiles(path: string): Promise<FileItem[]>;
    downloadFile(path: string): Promise<Buffer>;
    disconnect(): Promise<void>;
  }
}

declare module '@bookdock/ftp' {
  export interface FileItem {
    id: string;
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
    lastModified: Date;
    mimeType?: string;
    isDirectory: boolean;
  }

  export interface ConnectionTestResult {
    success: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }

  export class FTPClientWrapper {
    constructor();
    testConnection(config: { host: string; port?: number; username: string; password: string; secure?: boolean }): Promise<ConnectionTestResult>;
    connect(config: { host: string; port?: number; username: string; password: string; secure?: boolean }): Promise<void>;
    listFiles(path: string): Promise<FileItem[]>;
    downloadFile(path: string): Promise<Buffer>;
    disconnect(): Promise<void>;
  }
}
