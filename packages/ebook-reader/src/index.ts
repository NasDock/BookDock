import { Book, ApiResponse } from '@bookdock/api-client';
import { getApiClient } from '@bookdock/api-client';

export type ReaderMode = 'light' | 'dark' | 'sepia';
export type ReaderFormat = 'epub' | 'pdf';

export interface ReaderPosition {
  cfi?: string;
  currentPage?: number;
  totalPages?: number;
  percentage: number;
}

export interface ReaderConfig {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  margin?: number;
  mode?: ReaderMode;
  textDirection?: 'ltr' | 'rtl';
}

export interface BookRenderer {
  destroy: () => void;
  getPosition: () => ReaderPosition;
  setPosition: (position: ReaderPosition) => void;
  render: () => Promise<void>;
}

// EPUB Reader Component using epub.js
export class EpubReader implements BookRenderer {
  private container: HTMLElement;
  private book: import('epubjs').Book | null = null;
  private rendition: import('epubjs').Rendition | null = null;
  private currentLocation: string = '';
  private metadata: { title?: string; author?: string } = {};

  constructor(container: HTMLElement, fileUrl?: string, fileBlob?: Blob) {
    this.container = container;
    this.initBook(fileUrl, fileBlob);
  }

  private async initBook(fileUrl?: string, fileBlob?: Blob): Promise<void> {
    const { default: ePub } = await import('epubjs');
    
    if (fileBlob) {
      this.book = ePub(fileBlob);
    } else if (fileUrl) {
      this.book = ePub(fileUrl);
    } else {
      throw new Error('Either fileUrl or fileBlob must be provided');
    }

    await this.book.ready;
    this.metadata = await this.book.loaded.metadata;
  }

  async render(): Promise<void> {
    if (!this.book) throw new Error('Book not initialized');

    const spine = this.book.spine;
    this.rendition = this.book.renderTo(this.container, {
      width: '100%',
      height: '100%',
      spread: 'auto',
    });

    await this.rendition.display();
    
    // Restore position if available
    if (this.currentLocation) {
      await this.rendition.display(this.currentLocation);
    }
  }

  getPosition(): ReaderPosition {
    if (!this.rendition) {
      return { percentage: 0 };
    }

    const location = this.rendition.currentLocation();
    const percentage = location.start?.percentage ?? 0;
    const currentPage = location.start?.index ?? 0;
    const totalPages = this.book?.spine?.length ?? 0;

    return {
      cfi: location.start?.cfi,
      currentPage,
      totalPages,
      percentage: Math.round(percentage * 100),
    };
  }

  setPosition(position: ReaderPosition): void {
    if (position.cfi) {
      this.currentLocation = position.cfi;
    }
  }

  nextPage(): void {
    this.rendition?.next();
  }

  prevPage(): void {
    this.rendition?.prev();
  }

  goTo(position: string): Promise<void> {
    return this.rendition?.display(position) ?? Promise.resolve();
  }

  applyConfig(config: ReaderConfig): void {
    if (!this.rendition) return;

    this.rendition.themes.fontSize(`${config.fontSize ?? 16}px`);
    this.rendition.themes.font(config.fontFamily ?? 'Georgia, serif');
    this.rendition.themes.override('line-height', config.lineHeight?.toString() ?? '1.6');
    this.rendition.themes.override('margin', `${config.margin ?? 40}px`);

    const themeColors: Record<ReaderMode, { body: string; text: string }> = {
      light: { body: '#ffffff', text: '#333333' },
      dark: { body: '#1a1a1a', text: '#e0e0e0' },
      sepia: { body: '#f5ebe0', text: '#5c4b37' },
    };

    const colors = themeColors[config.mode ?? 'light'];
    this.rendition.themes.override('body', {
      background: colors.body,
      color: colors.text,
    });
  }

  onLocationChange(callback: (location: ReaderPosition) => void): void {
    this.rendition?.on('locationChanged', (location: { start: { cfi: string; index: number; percentage: number } }) => {
      callback({
        cfi: location.start.cfi,
        currentPage: location.start.index,
        percentage: Math.round(location.start.percentage * 100),
      });
    });
  }

  getMetadata(): { title?: string; author?: string } {
    return this.metadata;
  }

  destroy(): void {
    this.rendition?.destroy();
    this.book?.destroy();
    this.container.innerHTML = '';
  }
}

// PDF Reader Component using pdf.js
export class PdfReader implements BookRenderer {
  private container: HTMLElement;
  private pdfDoc: import('pdfjs-dist').PDFDocumentProxy | null = null;
  private currentPage: number = 1;
  private totalPages: number = 0;
  private pageRendering: boolean = false;
  private pageNumPending: number | null = null;
  private scale: number = 1.5;

  constructor(container: HTMLElement, fileUrl?: string, fileBlob?: Blob) {
    this.container = container;
    this.initPdf(fileUrl, fileBlob);
  }

  private async initPdf(fileUrl?: string, fileBlob?: Blob): Promise<void> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    let loadingTask;
    if (fileBlob) {
      const arrayBuffer = await fileBlob.arrayBuffer();
      loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    } else if (fileUrl) {
      loadingTask = pdfjsLib.getDocument(fileUrl);
    } else {
      throw new Error('Either fileUrl or fileBlob must be provided');
    }

    this.pdfDoc = await loadingTask.promise;
    this.totalPages = this.pdfDoc.numPages;
  }

  async render(): Promise<void> {
    if (!this.pdfDoc) throw new Error('PDF not initialized');
    await this.renderPage(this.currentPage);
  }

  private async renderPage(num: number): Promise<void> {
    if (!this.pdfDoc) return;

    this.pageRendering = true;

    try {
      const page = await this.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: this.scale });

      // Clear container
      this.container.innerHTML = '';
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      this.container.appendChild(canvas);

      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      this.currentPage = num;
      this.pageRendering = false;

      if (this.pageNumPending !== null) {
        await this.renderPage(this.pageNumPending);
        this.pageNumPending = null;
      }
    } catch (error) {
      this.pageRendering = false;
      throw error;
    }
  }

  queueRenderPage(num: number): void {
    if (this.pageRendering) {
      this.pageNumPending = num;
    } else {
      this.renderPage(num);
    }
  }

  getPosition(): ReaderPosition {
    return {
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      percentage: Math.round((this.currentPage / this.totalPages) * 100),
    };
  }

  setPosition(position: ReaderPosition): void {
    if (position.currentPage) {
      this.currentPage = position.currentPage;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.queueRenderPage(this.currentPage + 1);
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.queueRenderPage(this.currentPage - 1);
    }
  }

  goToPage(pageNum: number): Promise<void> {
    if (pageNum >= 1 && pageNum <= this.totalPages) {
      return this.renderPage(pageNum);
    }
    return Promise.resolve();
  }

  setScale(scale: number): void {
    this.scale = scale;
    this.renderPage(this.currentPage);
  }

  destroy(): void {
    this.pdfDoc?.destroy();
    this.container.innerHTML = '';
  }
}

// Factory function to create the appropriate reader
export async function createBookReader(
  container: HTMLElement,
  book: Book,
  config?: ReaderConfig
): Promise<BookRenderer> {
  const apiClient = getApiClient();
  
  try {
    const fileBlob = await apiClient.getBookFile(book.id);
    const fileUrl = URL.createObjectURL(fileBlob);

    if (book.fileType === 'pdf') {
      const reader = new PdfReader(container, fileUrl);
      await reader.render();
      return reader;
    } else {
      // Default to epub for epub, mobi, txt
      const reader = new EpubReader(container, fileUrl);
      await reader.render();
      
      if (config) {
        reader.applyConfig(config);
      }
      
      return reader;
    }
  } catch (error) {
    console.error('Failed to create book reader:', error);
    throw error;
  }
}


