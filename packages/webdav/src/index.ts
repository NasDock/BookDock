/**
 * WebDAV Client for BookDock NAS Integration
 * Supports connecting to WebDAV servers (Nextcloud, Synology, etc.)
 */

import { createClient, WebDAVClient, FileStat, ResponseBodyData } from 'webdav';

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  /**
   * If true, SSL certificate errors are ignored (for self-signed certs)
   * @default false
   */
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
      // @ts-expect-error - rejectUnauthorized is a valid SSL option for the underlying http agent
      rejectUnauthorized: config.rejectUnauthorized ?? true,
    });

    // Verify connection by getting server info
    await client.getServerInfo();

    this.client = client;
    this.config = config;
  }

  /**
   * Test connection to the WebDAV server
   */
  async testConnection(config: WebDAVConfig): Promise<ConnectionTestResult> {
    try {
      const tempClient = createClient(config.url, {
        username: config.username,
        password: config.password,
        // @ts-expect-error - rejectUnauthorized is a valid SSL option
        rejectUnauthorized: config.rejectUnauthorized ?? true,
      });

      const info = await tempClient.getServerInfo();
      return {
        success: true,
        serverInfo: info,
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

    const normalizedPath = this.normalizePath(remotePath);

    try {
      const stats = await this.client.getFileStat(normalizedPath);

      if (!stats.isDirectory) {
        // If it's a file, return just that file
        return [this.statToFileItem(normalizedPath, stats)];
      }

      const contents = await this.client.getDirectoryContents(normalizedPath, {
        deep: false,
        details: true,
      });

      return (contents as FileStat[]).map((stat) => {
        const itemPath = stat.filename;
        return this.statToFileItem(itemPath, stat);
      });
    } catch (err) {
      throw new Error(`Failed to list files at ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Download a file
   * @returns The file content as a Buffer
   */
  async downloadFile(remotePath: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const normalizedPath = this.normalizePath(remotePath);

    try {
      const data = await this.client.getFileContents(normalizedPath, {
        format: 'binary',
      });

      return Buffer.from(data as ArrayBuffer);
    } catch (err) {
      throw new Error(`Failed to download ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Download a file as a Readable stream
   */
  async downloadFileStream(remotePath: string): Promise<NodeJS.ReadableStream> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const normalizedPath = this.normalizePath(remotePath);

    try {
      const data = await this.client.getFileContents(normalizedPath, {
        format: 'stream',
      });
      return data as NodeJS.ReadableStream;
    } catch (err) {
      throw new Error(`Failed to download ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Upload a file
   * @param remotePath Destination path on WebDAV server
   * @param content File content as Buffer, ArrayBuffer, or string
   */
  async uploadFile(remotePath: string, content: Buffer | ArrayBuffer | string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const normalizedPath = this.normalizePath(remotePath);

    try {
      // Ensure parent directory exists
      const parentPath = this.getParentPath(normalizedPath);
      if (parentPath && parentPath !== '/') {
        await this.ensureDirectory(parentPath);
      }

      await this.client.putFileContents(normalizedPath, content, {
        overwrite: true,
      });
    } catch (err) {
      throw new Error(`Failed to upload to ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(remotePath: string): Promise<FileItem> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const normalizedPath = this.normalizePath(remotePath);

    try {
      const stat = await this.client.getFileStat(normalizedPath);
      return this.statToFileItem(normalizedPath, stat);
    } catch (err) {
      throw new Error(`Failed to get metadata for ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Create a directory
   */
  async createDirectory(remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const normalizedPath = this.normalizePath(remotePath);

    try {
      await this.client.createDirectory(normalizedPath);
    } catch (err) {
      throw new Error(`Failed to create directory ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Delete a file or directory
   */
  async delete(remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const normalizedPath = this.normalizePath(remotePath);

    try {
      await this.client.deleteFile(normalizedPath);
    } catch (err) {
      throw new Error(`Failed to delete ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Disconnect and clear credentials
   */
  disconnect(): void {
    this.client = null;
    this.config = null;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    // Ensure path starts with /
    let normalized = path.startsWith('/') ? path : `/${path}`;
    // Remove trailing slash (except for root)
    normalized = normalized !== '/' && normalized.endsWith('/')
      ? normalized.slice(0, -1)
      : normalized;
    return normalized;
  }

  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash > 0 ? normalized.substring(0, lastSlash) : '/';
  }

  private async ensureDirectory(remotePath: string): Promise<void> {
    try {
      await this.client!.getFileStat(remotePath);
    } catch {
      // Directory doesn't exist, create it
      const parentPath = this.getParentPath(remotePath);
      if (parentPath && parentPath !== '/' && parentPath !== remotePath) {
        await this.ensureDirectory(parentPath);
      }
      await this.client!.createDirectory(remotePath);
    }
  }

  private statToFileItem(path: string, stat: FileStat): FileItem {
    // Extract filename from path
    const name = path.split('/').filter(Boolean).pop() || path;

    return {
      path,
      name,
      size: typeof stat.size === 'number' ? stat.size : 0,
      lastModified: stat.lastModified ? new Date(stat.lastModified) : new Date(),
      isDirectory: stat.isDirectory ?? false,
      contentType: stat.type,
      etag: stat.etag,
    };
  }
}

// Singleton factory for server-side use
export function createWebDAVClient(): WebDAVClientWrapper {
  return new WebDAVClientWrapper();
}

export default WebDAVClientWrapper;
