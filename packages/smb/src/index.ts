// @ts-nocheck
/**
 * SMB2 Client for BookDock NAS Integration
 * Supports connecting to SMB/CIFS shares
 */

import SMB2 from 'smb2';

export interface SMBConfig {
  share: string;       // e.g. "smb://192.168.1.100/library"
  username: string;
  password: string;
  domain?: string;
  port?: number;
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
  serverInfo?: string;
  error?: string;
}

export class SMBClientWrapper {
  private client: any | null = null;
  private config: SMBConfig | null = null;

  /**
   * Connect to an SMB share
   */
  async connect(config: SMBConfig): Promise<void> {
    // Parse share URL: smb://host/share
    const parsed = this.parseShareUrl(config.share);

    const smb = new (SMB2 as any)({
      share: `\\\\${parsed.host}\\${parsed.share}`,
      domain: config.domain || 'WORKGROUP',
      username: config.username,
      password: config.password,
      port: config.port || 445,
    });

    // Test connection by reading directory
    await new Promise<void>((resolve, reject) => {
      smb.readdir('.', (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.client = smb;
    this.config = config;
  }

  /**
   * Test connection to SMB share
   */
  async testConnection(config: SMBConfig): Promise<ConnectionTestResult> {
    try {
      const parsed = this.parseShareUrl(config.share);
      const smb = new (SMB2 as any)({
        share: `\\\\${parsed.host}\\${parsed.share}`,
        domain: config.domain || 'WORKGROUP',
        username: config.username,
        password: config.password,
        port: config.port || 445,
      });

      await new Promise<void>((resolve, reject) => {
        smb.readdir('.', (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return { success: true, serverInfo: `SMB share at ${config.share}` };
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

    const normalizedPath = remotePath === '/' ? '.' : remotePath;

    const files: FileItem[] = await new Promise((resolve, reject) => {
      this.client.readdir(normalizedPath, (err: any, items: any[]) => {
        if (err) reject(err);
        else {
          resolve(
            items.map((item: any) => ({
              path: `${remotePath}/${item.name}`,
              name: item.name,
              size: item.size || 0,
              lastModified: item.lastModified || new Date(),
              isDirectory: item.isDirectory || false,
            })),
          );
        }
      });
    });

    return files;
  }

  /**
   * Download a file
   */
  async downloadFile(remotePath: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.client.readFile(remotePath, (err: any, data: Buffer) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Upload a file
   */
  async uploadFile(remotePath: string, content: Buffer | string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.client.writeFile(remotePath, content, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Disconnect from SMB share
   */
  disconnect(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.config = null;
  }

  private parseShareUrl(shareUrl: string): { host: string; share: string } {
    // smb://host/share
    const withoutPrefix = shareUrl.replace(/^smb:\/\//, '');
    const [host, ...shareParts] = withoutPrefix.split('/');
    return { host, share: shareParts.join('/') || 'share' };
  }
}

export function createSMBClient(): SMBClientWrapper {
  return new SMBClientWrapper();
}

export default SMBClientWrapper;
