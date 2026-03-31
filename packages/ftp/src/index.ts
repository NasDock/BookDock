/**
 * FTP Client for BookDock NAS Integration
 * Supports connecting to FTP/FTPS servers
 */

import { Client, FileInfo } from 'basic-ftp';
import { Readable } from 'stream';
import { createReadStream, createWriteStream } from 'fs';
import { statSync } from 'fs';

export interface FTPConfig {
  host: string;
  port?: number;         // Default: 21
  username: string;
  password: string;
  secure?: boolean;      // Use FTP over TLS (FTPS). Default: false (plain FTP)
  secureOptions?: {
    /**
     * If true, reject unauthorized certs (for self-signed certs)
     * @default false
     */
    rejectUnauthorized?: boolean;
  };
}

export interface FileItem {
  path: string;
  name: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
  permissions?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  serverInfo?: string;
  error?: string;
}

export class FTPClientWrapper {
  private client: Client | null = null;
  private config: FTPConfig | null = null;

  /**
   * Connect to an FTP server
   */
  async connect(config: FTPConfig): Promise<void> {
    const client = new Client();

    // Set timeout
    client.trackProgress((info) => {}); // Enable progress tracking

    try {
      await client.access({
        host: config.host,
        port: config.port || 21,
        user: config.username,
        password: config.password,
        secure: config.secure ? {
          rejectUnauthorized: config.secureOptions?.rejectUnauthorized ?? true,
        } : false,
        // @ts-expect-error - ts types for ftp are incomplete
        timeout: 30000,
      });

      this.client = client;
      this.config = config;
    } catch (err) {
      await client.close();
      throw new Error(`FTP connection failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Test connection to FTP server
   */
  async testConnection(config: FTPConfig): Promise<ConnectionTestResult> {
    const client = new Client();

    try {
      await client.access({
        host: config.host,
        port: config.port || 21,
        user: config.username,
        password: config.password,
        secure: config.secure ? {
          rejectUnauthorized: config.secureOptions?.rejectUnauthorized ?? true,
        } : false,
        // @ts-expect-error - ts types for ftp are incomplete
        timeout: 10000,
      });

      const sysInfo = await client.send('SYST');
      await client.close();

      return {
        success: true,
        serverInfo: sysInfo.trim(),
      };
    } catch (err) {
      await client.close();
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

    try {
      const items: FileItem[] = [];

      // Normalize path
      const normalizedPath = remotePath === '' ? '/' : remotePath;

      await this.client.cwd(normalizedPath);
      const fileInfos = await this.client.list(normalizedPath, false);

      for (const fileInfo of fileInfos) {
        const fullPath = normalizedPath === '/'
          ? `/${fileInfo.name}`
          : `${normalizedPath}/${fileInfo.name}`;

        items.push({
          path: fullPath,
          name: fileInfo.name,
          size: typeof fileInfo.size === 'number' ? fileInfo.size : parseInt(String(fileInfo.size), 10) || 0,
          lastModified: fileInfo.modifiedAt ? new Date(fileInfo.modifiedAt) : new Date(),
          isDirectory: fileInfo.isDirectory ?? fileInfo.type === 1,
          permissions: fileInfo.permissions ?? undefined,
        });
      }

      return items;
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

    try {
      const buffers: Buffer[] = [];

      await this.client.download(buffers, remotePath);

      return Buffer.concat(buffers);
    } catch (err) {
      throw new Error(`Failed to download ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Download a file as a readable stream
   */
  async downloadFileStream(remotePath: string): Promise<NodeJS.ReadableStream> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      const passThrough = new PassThrough();

      this.client.downloadFrom(remotePath, passThrough).catch((err) => {
        passThrough.destroy(err);
      });

      return passThrough;
    } catch (err) {
      throw new Error(`Failed to download ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Upload a file to the FTP server
   * @param remotePath Destination path on FTP server
   * @param content File content as Buffer, string, or local file path
   */
  async uploadFile(remotePath: string, content: Buffer | string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      if (typeof content === 'string') {
        // If it's a local file path, upload the file
        try {
          const stats = statSync(content);
          if (stats.isFile()) {
            const stream = createReadStream(content);
            await this.client.uploadFrom(stream, remotePath);
            return;
          }
        } catch {
          // Not a valid file path, treat as string content
        }

        // Upload string/Buffer content
        const buffer = Buffer.from(content);
        await this.client.upload(Buffer.from(buffer), remotePath);
      } else {
        // Upload Buffer
        await this.client.upload(Buffer.from(content), remotePath);
      }
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

    try {
      // Use list with name check for a single file
      const list = await this.client.list(remotePath, false);

      if (list.length === 0) {
        throw new Error(`File not found: ${remotePath}`);
      }

      const fileInfo = list[0];
      const name = remotePath.split('/').filter(Boolean).pop() || remotePath;

      return {
        path: remotePath,
        name: fileInfo.name || name,
        size: typeof fileInfo.size === 'number' ? fileInfo.size : parseInt(String(fileInfo.size), 10) || 0,
        lastModified: fileInfo.modifiedAt ? new Date(fileInfo.modifiedAt) : new Date(),
        isDirectory: fileInfo.isDirectory ?? fileInfo.type === 1,
        permissions: fileInfo.permissions ?? undefined,
      };
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

    try {
      await this.client.ensureDir(remotePath);
    } catch (err) {
      throw new Error(`Failed to create directory ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Delete a file
   */
  async delete(remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      await this.client.remove(remotePath);
    } catch (err) {
      throw new Error(`Failed to delete ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Delete an empty directory
   */
  async removeDirectory(remotePath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    try {
      await this.client.removeDir(remotePath);
    } catch (err) {
      throw new Error(`Failed to remove directory ${remotePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null && this.client.closed === false;
  }

  /**
   * Disconnect from FTP server
   */
  disconnect(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.config = null;
  }
}

// Singleton factory
export function createFTPClient(): FTPClientWrapper {
  return new FTPClientWrapper();
}

export default FTPClientWrapper;
