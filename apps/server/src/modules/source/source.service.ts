import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
    CreateSourceDto,
    UpdateSourceDto,
    SourceResponseDto,
    SourceFileItemDto,
    SyncResultDto,
    ConnectionTestResultDto,
    SourceType,
    WebDAVConfigDto,
    SMBConfigDto,
    FTPConfigDto,
} from './dto/source.dto';
import { WebDAVClientWrapper, FileItem as WebDAVFileItem } from '@bookdock/webdav';
import { SMBClientWrapper, FileItem as SMBFileItem } from '@bookdock/smb';
import { FTPClientWrapper, FileItem as FTPFileItem } from '@bookdock/ftp';

interface StoredSource {
    id: string;
    name: string;
    type: SourceType;
    enabled: boolean;
    autoSync: boolean;
    syncIntervalSecs: number;
    formats: string[];
    lastSyncAt?: string;
    lastError?: string;
    bookCount: number;
    createdAt: string;
    updatedAt: string;
    // Connection configs (encrypted passwords)
    webdavConfig?: WebDAVConfigDto & { _encryptedPassword?: string };
    smbConfig?: SMBConfigDto & { _encryptedPassword?: string };
    ftpConfig?: FTPConfigDto & { _encryptedPassword?: string };
}

@Injectable()
export class SourceService {
    private readonly dataDir: string;
    private readonly sourcesPath: string;
    private readonly encryptionKey: Buffer;

    constructor(
        @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
        private readonly configService: ConfigService,
    ) {
        this.dataDir = join(process.cwd(), 'data');
        this.sourcesPath = join(this.dataDir, 'sources.json');
        this.encryptionKey = scryptSync(
            this.configService.get<string>('app.jwtSecret', 'bookdock-dev-secret') + 'encrypt',
            'salt',
            32,
        );

        // Ensure data directory exists
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
    }

    // ─── CRUD Operations ─────────────────────────────────────────────────────

    async create(dto: CreateSourceDto): Promise<SourceResponseDto> {
        const sources = this.loadSources();

        const id = `src_${Date.now()}_${randomBytes(4).toString('hex')}`;
        const now = new Date().toISOString();

        // Encrypt passwords before storing
        const webdavConfig = dto.webdavConfig ? this.encryptPasswordsInWebDAVConfig(dto.webdavConfig) : undefined;
        const smbConfig = dto.smbConfig ? this.encryptPasswordsInSMBConfig(dto.smbConfig) : undefined;
        const ftpConfig = dto.ftpConfig ? this.encryptPasswordsInFTPConfig(dto.ftpConfig) : undefined;

        const source: StoredSource = {
            id,
            name: dto.name,
            type: dto.type,
            enabled: true,
            autoSync: dto.autoSync ?? true,
            syncIntervalSecs: dto.syncIntervalSecs ?? 3600,
            formats: dto.formats ?? ['epub', 'pdf', 'mobi', 'txt'],
            lastSyncAt: undefined,
            lastError: undefined,
            bookCount: 0,
            createdAt: now,
            updatedAt: now,
            webdavConfig,
            smbConfig,
            ftpConfig,
        };

        sources.push(source);
        this.saveSources(sources);

        return this.toResponse(source);
    }

    async findAll(): Promise<SourceResponseDto[]> {
        const sources = this.loadSources();
        return sources.map((s) => this.toResponse(s));
    }

    async findOne(id: string): Promise<SourceResponseDto> {
        const sources = this.loadSources();
        const source = sources.find((s) => s.id === id);
        if (!source) {
            throw new NotFoundException(`Source with id ${id} not found`);
        }
        return this.toResponse(source);
    }

    async update(id: string, dto: UpdateSourceDto): Promise<SourceResponseDto> {
        const sources = this.loadSources();
        const idx = sources.findIndex((s) => s.id === id);
        if (idx === -1) {
            throw new NotFoundException(`Source with id ${id} not found`);
        }

        const existing = sources[idx];

        // Encrypt any new passwords
        const webdavConfig = dto.webdavConfig
            ? this.encryptPasswordsInWebDAVConfig(dto.webdavConfig)
            : existing.webdavConfig;
        const smbConfig = dto.smbConfig
            ? this.encryptPasswordsInSMBConfig(dto.smbConfig)
            : existing.smbConfig;
        const ftpConfig = dto.ftpConfig
            ? this.encryptPasswordsInFTPConfig(dto.ftpConfig)
            : existing.ftpConfig;

        const updated: StoredSource = {
            ...existing,
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.enabled !== undefined && { enabled: dto.enabled }),
            ...(dto.autoSync !== undefined && { autoSync: dto.autoSync }),
            ...(dto.syncIntervalSecs !== undefined && { syncIntervalSecs: dto.syncIntervalSecs }),
            ...(dto.formats !== undefined && { formats: dto.formats }),
            webdavConfig,
            smbConfig,
            ftpConfig,
            updatedAt: new Date().toISOString(),
        };

        sources[idx] = updated;
        this.saveSources(sources);

        return this.toResponse(updated);
    }

    async remove(id: string): Promise<void> {
        const sources = this.loadSources();
        const filtered = sources.filter((s) => s.id !== id);
        if (filtered.length === sources.length) {
            throw new NotFoundException(`Source with id ${id} not found`);
        }
        this.saveSources(filtered);
    }

    // ─── Connection Testing ───────────────────────────────────────────────────

    async testConnection(id: string): Promise<ConnectionTestResultDto> {
        const sources = this.loadSources();
        const source = sources.find((s) => s.id === id);
        if (!source) {
            throw new NotFoundException(`Source with id ${id} not found`);
        }

        return this.testConnectionByType(source);
    }

    async testConnectionByConfig(dto: CreateSourceDto): Promise<ConnectionTestResultDto> {
        if (!dto.type) {
            throw new BadRequestException('Source type is required');
        }

        // Create a temporary source-like object for testing
        const tempSource: StoredSource = {
            id: 'temp',
            name: dto.name,
            type: dto.type,
            enabled: true,
            autoSync: false,
            syncIntervalSecs: 3600,
            formats: dto.formats ?? ['epub', 'pdf', 'mobi', 'txt'],
            bookCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            webdavConfig: dto.webdavConfig,
            smbConfig: dto.smbConfig,
            ftpConfig: dto.ftpConfig,
        };

        return this.testConnectionByType(tempSource);
    }

    private async testConnectionByType(source: StoredSource): Promise<ConnectionTestResultDto> {
        try {
            switch (source.type) {
                case 'webdav': {
                    if (!source.webdavConfig?.url) {
                        throw new BadRequestException('WebDAV URL is required');
                    }
                    const config = this.decryptWebDAVConfig(source.webdavConfig);
                    const client = new WebDAVClientWrapper();
                    const result = await client.testConnection(config);
                    return result;
                }
                case 'smb': {
                    if (!source.smbConfig?.share) {
                        throw new BadRequestException('SMB share is required');
                    }
                    const config = this.decryptSMBConfig(source.smbConfig);
                    const client = new SMBClientWrapper();
                    return await client.testConnection(config);
                }
                case 'ftp': {
                    if (!source.ftpConfig?.host) {
                        throw new BadRequestException('FTP host is required');
                    }
                    const config = this.decryptFTPConfig(source.ftpConfig);
                    const client = new FTPClientWrapper();
                    return await client.testConnection(config);
                }
                default:
                    throw new BadRequestException(`Unknown source type: ${source.type}`);
            }
        } catch (err) {
            if (err instanceof BadRequestException) throw err;
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    // ─── File Operations ─────────────────────────────────────────────────────

    async listFiles(id: string, path: string = '/'): Promise<SourceFileItemDto[]> {
        const sources = this.loadSources();
        const source = sources.find((s) => s.id === id);
        if (!source) {
            throw new NotFoundException(`Source with id ${id} not found`);
        }

        const basePath = this.getBasePath(source);
        const remotePath = this.joinPath(basePath, path);

        try {
            switch (source.type) {
                case 'webdav': {
                    const config = this.decryptWebDAVConfig(source.webdavConfig!);
                    const client = new WebDAVClientWrapper();
                    await client.connect(config);
                    const files = await client.listFiles(remotePath);
                    client.disconnect();
                    return files.map((f) => this.webdavFileToDto(f));
                }
                case 'smb': {
                    const config = this.decryptSMBConfig(source.smbConfig!);
                    const client = new SMBClientWrapper();
                    await client.connect(config);
                    const files = await client.listFiles(remotePath);
                    client.disconnect();
                    return files.map((f) => this.smbFileToDto(f));
                }
                case 'ftp': {
                    const config = this.decryptFTPConfig(source.ftpConfig!);
                    const client = new FTPClientWrapper();
                    await client.connect(config);
                    const files = await client.listFiles(remotePath);
                    client.disconnect();
                    return files.map((f) => this.ftpFileToDto(f));
                }
                default:
                    throw new BadRequestException(`Unknown source type: ${source.type}`);
            }
        } catch (err) {
            throw new InternalServerErrorException(
                `Failed to list files: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    async downloadFile(id: string, filePath: string): Promise<Buffer> {
        const sources = this.loadSources();
        const source = sources.find((s) => s.id === id);
        if (!source) {
            throw new NotFoundException(`Source with id ${id} not found`);
        }

        const basePath = this.getBasePath(source);
        const remotePath = this.joinPath(basePath, filePath);

        try {
            switch (source.type) {
                case 'webdav': {
                    const config = this.decryptWebDAVConfig(source.webdavConfig!);
                    const client = new WebDAVClientWrapper();
                    await client.connect(config);
                    const data = await client.downloadFile(remotePath);
                    client.disconnect();
                    return data;
                }
                case 'smb': {
                    const config = this.decryptSMBConfig(source.smbConfig!);
                    const client = new SMBClientWrapper();
                    await client.connect(config);
                    const data = await client.downloadFile(remotePath);
                    client.disconnect();
                    return data;
                }
                case 'ftp': {
                    const config = this.decryptFTPConfig(source.ftpConfig!);
                    const client = new FTPClientWrapper();
                    await client.connect(config);
                    const data = await client.downloadFile(remotePath);
                    client.disconnect();
                    return data;
                }
                default:
                    throw new BadRequestException(`Unknown source type: ${source.type}`);
            }
        } catch (err) {
            throw new InternalServerErrorException(
                `Failed to download file: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    // ─── Sync Operations ─────────────────────────────────────────────────────

    async sync(id: string): Promise<SyncResultDto> {
        const sources = this.loadSources();
        const idx = sources.findIndex((s) => s.id === id);
        if (idx === -1) {
            throw new NotFoundException(`Source with id ${id} not found`);
        }

        const source = sources[idx];
        const result: SyncResultDto = {
            sourceId: id,
            status: 'success',
            booksAdded: 0,
            booksUpdated: 0,
            booksFailed: 0,
            errors: [],
            syncedAt: new Date(),
        };

        try {
            const basePath = this.getBasePath(source);
            const files = await this.listFiles(id, basePath);

            // Filter to only ebook files
            const ebookFiles = files.filter((f) => {
                if (f.isDirectory) return false;
                const ext = f.name.split('.').pop()?.toLowerCase() || '';
                return source.formats.includes(ext);
            });

            for (const file of ebookFiles) {
                try {
                    // Extract metadata and create book entry
                    const book = await this.createBookFromSource(source, file);
                    if (book) {
                        result.booksAdded++;
                    }
                } catch (err) {
                    result.booksFailed++;
                    result.errors?.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
                }
            }

            // Update source last sync info
            sources[idx].lastSyncAt = new Date().toISOString();
            sources[idx].lastError = result.errors?.length > 0 ? result.errors[0] : undefined;
            sources[idx].bookCount = ebookFiles.length;
            sources[idx].updatedAt = new Date().toISOString();
            this.saveSources(sources);

            if (result.booksFailed > 0 && result.booksAdded === 0) {
                result.status = 'failed';
            } else if (result.booksFailed > 0) {
                result.status = 'partial';
            }
        } catch (err) {
            result.status = 'failed';
            result.errors?.push(err instanceof Error ? err.message : String(err));
            sources[idx].lastError = result.errors[0];
            sources[idx].updatedAt = new Date().toISOString();
            this.saveSources(sources);
        }

        return result;
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    private loadSources(): StoredSource[] {
        try {
            if (!existsSync(this.sourcesPath)) {
                return [];
            }
            const data = readFileSync(this.sourcesPath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    private saveSources(sources: StoredSource[]): void {
        writeFileSync(this.sourcesPath, JSON.stringify(sources, null, 2), 'utf-8');
    }

    private encrypt(plaintext: string): string {
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        // Format: iv:authTag:encrypted (all base64)
        return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
    }

    private decrypt(ciphertext: string): string {
        const parts = ciphertext.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted value format');
        }
        const iv = Buffer.from(parts[0], 'base64');
        const authTag = Buffer.from(parts[1], 'base64');
        const encrypted = Buffer.from(parts[2], 'base64');
        const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    }

    private encryptPasswordsInWebDAVConfig(config: WebDAVConfigDto): WebDAVConfigDto & { _encryptedPassword?: string } {
        if (config.password) {
            return { ...config, _encryptedPassword: this.encrypt(config.password), password: undefined };
        }
        return config as WebDAVConfigDto & { _encryptedPassword?: string };
    }

    private decryptWebDAVConfig(config: WebDAVConfigDto & { _encryptedPassword?: string }): WebDAVConfigDto {
        if (config._encryptedPassword) {
            return { ...config, password: this.decrypt(config._encryptedPassword) };
        }
        return config;
    }

    private encryptPasswordsInSMBConfig(config: SMBConfigDto): SMBConfigDto & { _encryptedPassword?: string } {
        if (config.password) {
            return { ...config, _encryptedPassword: this.encrypt(config.password), password: undefined };
        }
        return config as SMBConfigDto & { _encryptedPassword?: string };
    }

    private decryptSMBConfig(config: SMBConfigDto & { _encryptedPassword?: string }): SMBConfigDto {
        if (config._encryptedPassword) {
            return { ...config, password: this.decrypt(config._encryptedPassword) };
        }
        return config;
    }

    private encryptPasswordsInFTPConfig(config: FTPConfigDto): FTPConfigDto & { _encryptedPassword?: string } {
        if (config.password) {
            return { ...config, _encryptedPassword: this.encrypt(config.password), password: undefined };
        }
        return config as FTPConfigDto & { _encryptedPassword?: string };
    }

    private decryptFTPConfig(config: FTPConfigDto & { _encryptedPassword?: string }): FTPConfigDto {
        if (config._encryptedPassword) {
            return { ...config, password: this.decrypt(config._encryptedPassword) };
        }
        return config;
    }

    private getBasePath(source: StoredSource): string {
        switch (source.type) {
            case 'webdav':
                return source.webdavConfig?.basePath || '/';
            case 'smb':
                return source.smbConfig?.basePath || '/';
            case 'ftp':
                return source.ftpConfig?.basePath || '/';
            default:
                return '/';
        }
    }

    private joinPath(base: string, relative: string): string {
        const cleanBase = base === '/' ? '' : base;
        const cleanRelative = relative.startsWith('/') ? relative.substring(1) : relative;
        if (!cleanRelative) return base;
        return cleanBase ? `${cleanBase}/${cleanRelative}` : `/${cleanRelative}`;
    }

    private toResponse(source: StoredSource): SourceResponseDto {
        return {
            id: source.id,
            name: source.name,
            type: source.type,
            url: source.webdavConfig?.url || source.smbConfig?.share,
            host: source.ftpConfig?.host,
            basePath: this.getBasePath(source),
            username: source.webdavConfig?.username || source.smbConfig?.username || source.ftpConfig?.username,
            enabled: source.enabled,
            autoSync: source.autoSync,
            syncIntervalSecs: source.syncIntervalSecs,
            formats: source.formats,
            lastSyncAt: source.lastSyncAt ? new Date(source.lastSyncAt) : undefined,
            lastError: source.lastError,
            bookCount: source.bookCount,
            createdAt: new Date(source.createdAt),
            updatedAt: new Date(source.updatedAt),
        };
    }

    private webdavFileToDto(file: WebDAVFileItem): SourceFileItemDto {
        return {
            path: file.path,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            isDirectory: file.isDirectory,
        };
    }

    private smbFileToDto(file: SMBFileItem): SourceFileItemDto {
        return {
            path: file.path,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            isDirectory: file.isDirectory,
        };
    }

    private ftpFileToDto(file: FTPFileItem): SourceFileItemDto {
        return {
            path: file.path,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            isDirectory: file.isDirectory,
        };
    }

    private async createBookFromSource(source: StoredSource, file: SourceFileItemDto): Promise<boolean> {
        // Determine format from extension
        const ext = file.name.split('.').pop()?.toLowerCase() || 'other';
        const formatMap: Record<string, string> = {
            epub: 'epub',
            pdf: 'pdf',
            mobi: 'mobi',
            azw3: 'azw3',
            fb2: 'fb2',
            txt: 'txt',
            djvu: 'djvu',
        };
        const format = formatMap[ext] || 'other';

        // Extract title from filename (remove extension)
        const title = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

        // Check if book with same hash/path exists
        const existing = await this.prisma.book.findFirst({
            where: {
                filePath: { contains: file.name },
                isDeleted: false,
            },
        });

        if (existing) {
            return false; // Book already exists
        }

        await this.prisma.book.create({
            data: {
                title,
                author: 'Unknown',
                format: format as any,
                filePath: file.path,
                fileSize: BigInt(file.size),
                language: 'unknown',
                // Note: actual file content should be downloaded and stored
                // For now, we just create metadata entries
            },
        });

        return true;
    }
}
