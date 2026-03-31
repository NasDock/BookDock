/**
 * SMB2 Client for BookDock NAS Integration
 * Supports connecting to SMB/CIFS shares (Synology, QNAP, Windows Server, etc.)
 */

import SMB2 from 'smb2';
import { Readable, PassThrough } from 'stream';

export interface SMBConfig {
  share: string;        // e.g., '\\\\server\\share' or 'smb://server/share'
  username: string;
  password: string;
  domain?: string;      // e.g., 'WORKGROUP'
  port?: number;        // Default: 445
}

export interface FileItem {
  path: string;
  name: string;
  size: number;
  lastModified: Date;
  isDirectory: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  shareInfo?: string;
  error?: string;
}

export class SMBClientWrapper {
  private smbClient: SMB2 | null = null;
  private config: SMBConfig | null = null;

  /**
   * Connect to an SMB share
   */
  async connect(config: SMBConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new SMB2({
        share: config.share,
        username: config.username,
        password: config.password,
        domain: config.domain || 'WORKGROUP',
        port: config.port || 445,
        autoCryptoLevel: 2, // Use strongest encryption
      } as SMB2.Options);

      client.on('error', (err) => {
        reject(new Error(`SMB connection error: ${err.message}`));
      });

      client.on('open', () => {
        this.smbClient = client;
        this.config = config;
        resolve();
      });

      // Trigger connection
      try {
        client.readdir('', () => {
          // Connection successful (even if dir is empty)
          this.smbClient = client;
          this.config = config;
          resolve();
        });
      } catch (e) {
        // Try a simple operation to verify connection
        try {
          client.stat('', () => {
            this.smbClient = client;
            this.config = config;
            resolve();
          });
        } catch {
          // Will trigger error event
        }
      }
    });
  }

  /**
   * Test connection to SMB share
   */
  async testConnection(config: SMBConfig): Promise<ConnectionTestResult> {
    return new Promise((resolve) => {
      const client = new SMB2({
        share: config.share,
        username: config.username,
        password: config.password,
        domain: config.domain || 'WORKGROUP',
        port: config.port || 445,
        autoCryptoLevel: 2,
      } as SMB2.Options);

      client.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      client.on('open', () => {
        client.close(() => {
          resolve({ success: true, shareInfo: `Connected to ${config.share}` });
        });
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        try { client.close(() => {}); } catch { /* ignore */ }
        resolve({ success: false, error: 'Connection timeout' });
      }, 10000);

      try {
        client.readdir('', (err) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            client.close(() => {
              resolve({ success: true, shareInfo: `Connected to ${config.share}` });
            });
          }
        });
      } catch (e) {
        resolve({ success: false, error: String(e) });
      }
    });
  }

  /**
   * List files in a directory on the share
   */
  async listFiles(sharePath: string = '/'): Promise<FileItem[]> {
    if (!this.smbClient) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.smbClient!.readdir(sharePath, (err: Error | null, files: SMB2.FileInfo[]) => {
        if (err) {
          reject(new Error(`Failed to list files at ${sharePath}: ${err.message}`));
          return;
        }

        const items: FileItem[] = (files || []).map((file) => ({
          path: sharePath === '/' ? `/${file.filename}` : `${sharePath}/${file.filename}`,
          name: file.filename,
          size: file.size || 0,
          lastModified: file.stat?.mtime ? new Date(file.stat.mtime) : new Date(),
          isDirectory: file.isDirectory ?? false,
        }));

        resolve(items);
      });
    });
  }

  /**
   * Download a file from the share
   * @returns The file content as a Buffer
   */
  async downloadFile(sharePath: string): Promise<Buffer> {
    if (!this.smbClient) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      const readStream = this.smbClient!.createReadStream(sharePath) as Readable;

      readStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      readStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      readStream.on('error', (err: Error) => {
        reject(new Error(`Failed to download ${sharePath}: ${err.message}`));
      });
    });
  }

  /**
   * Download a file as a readable stream
   */
  async downloadFileStream(sharePath: string): Promise<NodeJS.ReadableStream> {
    if (!this.smbClient) {
      throw new Error('Not connected. Call connect() first.');
    }

    return this.smbClient.createReadStream(sharePath) as Readable;
  }

  /**
   * Upload a file to the share
   * @param sharePath Destination path on the share
   * @param content File content
   */
  async uploadFile(sharePath: string, content: Buffer | string): Promise<void> {
    if (!this.smbClient) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      const writeStream = this.smbClient!.createWriteStream(sharePath);

      writeStream.on('error', (err: Error) => {
        reject(new Error(`Failed to upload to ${sharePath}: ${err.message}`));
      });

      writeStream.on('finish', () => {
        resolve();
      });

      if (typeof content === 'string') {
        writeStream.write(Buffer.from(content));
      } else {
        writeStream.write(content);
      }

      writeStream.end();
    });
  }

  /**
   * Get file metadata
   */
  async getMetadata(sharePath: string): Promise<FileItem> {
    if (!this.smbClient) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.smbClient!.stat(sharePath, (err: Error | null, stat: SMB2.FileInfo) => {
        if (err) {
          reject(new Error(`Failed to get metadata for ${sharePath}: ${err.message}`));
          return;
        }

        const name = sharePath.split(/[/\\]/).filter(Boolean).pop() || sharePath;

        resolve({
          path: sharePath,
          name,
          size: stat.size || 0,
          lastModified: stat.stat?.mtime ? new Date(stat.stat.mtime) : new Date(),
          isDirectory: stat.isDirectory ?? false,
        });
      });
    });
  }

  /**
   * Create a directory
   */
  async createDirectory(sharePath: string): Promise<void> {
    if (!this.smbClient) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.smbClient!.mkdir(sharePath, (err: Error | null) => {
        if (err) {
          reject(new Error(`Failed to create directory ${sharePath}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Delete a file or directory
   */
  async delete(sharePath: string): Promise<void> {
    if (!this.smbClient) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.smbClient!.unlink(sharePath, (err: Error | null) => {
        if (err) {
          reject(new Error(`Failed to delete ${sharePath}: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.smbClient !== null;
  }

  /**
   * Disconnect and close the SMB connection
   */
  disconnect(): void {
    if (this.smbClient) {
      try {
        this.smbClient.close(() => {});
      } catch { /* ignore */ }
      this.smbClient = null;
    }
    this.config = null;
  }
}

// Singleton factory
export function createSMBClient(): SMBClientWrapper {
  return new SMBClientWrapper();
}

export default SMBClientWrapper;
