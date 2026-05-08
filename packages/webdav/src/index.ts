// @ts-nocheck
/**
 * WebDAV Client for BookDock NAS Integration
 * Supports connecting to WebDAV servers (Nextcloud, Synology, etc.)
 */

import { createClient, WebDAVClient, FileStat } from 'webdav';

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  rejectUnauthorized?: boolean;
}

export interface FileItem {
  path: string;
  name: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
  contentType?: string;
  etag?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  serverInfo?: string;
  error?: string;
}

export class WebDAVClientWrapper {
  private client: WebDAVClient | null = null;
  private config: WebDAVConfig | null = null;

  /**
   * Connect to a WebDAV server
   */
  async connect(config: WebDAVConfig): Promise<void> {
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
      // @ts-ignore
      rejectUnauthorized: config.rejectUnauthorized ?? true,
    });

    // Verify connection by getting server info
    try {
      const rootContents = await client.getDirectoryContents('/');
      if (!rootContents) {
        throw new Error('Failed to list root directory');
      }
    } catch {
      // Some servers don't support root listing, that's ok
    }

    this.client = client;
    this.config = config;
  }

  /**
   * Test connection to WebDAV server
   */
  async testConnection(config: WebDAVConfig): Promise<ConnectionTestResult> {
    try {
      const client = createClient(config.url, {
        username: config.username,
        password: config.password,
        // @ts-ignore
        rejectUnauthorized: config.rejectUnauthorized ?? true,
      });

      const rootContents = await client.getDirectoryContents('/');
      const items = Array.isArray(rootContents) ? rootContents : (rootContents as any)?.data || [];

      return {
        success: true,
        serverInfo: `WebDAV server at ${config.url} (${items.length} items in root)`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(remotePath: string = '/'): Promise<FileItem[]> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const normalizedPath = remotePath === '' ? '/' : remotePath;

    const result = await this.client.getDirectoryContents(normalizedPath, {
      details: false,
      glob: '*',
    });

    // Handle both array and object response
    const items: FileStat[] = Array.isArray(result) ? result : (result as any)?.data || [];

    return items.map((item) => ({
      path: item.filename,
      name: item.basename,
      size: typeof item.size === 'number' ? item.size : 0,
      lastModified: item.lastmod ? new Date(item.lastmod) : new Date(),
      isDirectory: item.type === 'directory',
      contentType: item.mime,
      etag: item.etag,
    }));
  }

  /**
   * Download a file
   * @returns The file content as a Buffer
   */
  async downloadFile(remotePath: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const content = await this.client.getFileContents(remotePath, {
      format: 'binary',
    });

    return content as Buffer;
  }

  /**
   * Upload a file to WebDAV server
   */
  async uploadFile(remotePath: string, content: Buffer | string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    await this.client.putFileContents(remotePath, content, {
      overwrite: true,
    });
  }

  /**
   * Get file metadata
   */
  async getMetadata(remotePath: string): Promise<FileItem> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const stat = await this.client.stat(remotePath);
    const item = stat as FileStat;

    return {
      path: item.filename,
      name: item.basename,
      size: typeof item.size === 'number' ? item.size : 0,
      lastModified: item.lastmod ? new Date(item.lastmod) : new Date(),
      isDirectory: item.type === 'directory',
      contentType: item.mime,
      etag: item.etag,
    };
  }

  /**
   * Create a directory
   */
  async createDirectory(remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    await this.client.createDirectory(remotePath, { recursive: true });
  }

  /**
   * Delete a file or directory
   */
  async delete(remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    await this.client.deleteFile(remotePath);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Disconnect from WebDAV server
   */
  disconnect(): void {
    this.client = null;
    this.config = null;
  }
}

// Singleton factory
export function createWebDAVClient(): WebDAVClientWrapper {
  return new WebDAVClientWrapper();
}

export default WebDAVClientWrapper;
