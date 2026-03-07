/**
 * Interactive redaction overlay for the PDF viewer.
 *
 * Draws transparent rectangles over the PDF pages that map to
 * PDF coordinate regions for redaction annotations.
 */

export interface RedactionRegion {
  page: number;       // 0-indexed page
  rect: [number, number, number, number]; // [x1, y1, x2, y2] in PDF coords
}

interface PageInfo {
  wrapper: HTMLElement;
  canvas: HTMLCanvasElement;
  pdfWidth: number;
  pdfHeight: number;
}

export class RedactionOverlay {
  private regions: RedactionRegion[] = [];
  private overlays: Map<number, HTMLDivElement> = new Map();
  private pages: PageInfo[] = [];
  private drawing = false;
  private activePageIndex = -1;
  private startX = 0;
  private startY = 0;
  private currentRect: HTMLDivElement | null = null;

  private onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
  private onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
  private onMouseUp = (e: MouseEvent) => this.handleMouseUp(e);

  get isDrawing(): boolean { return this.drawing; }
  get count(): number { return this.regions.length; }

  /** Call after each renderPdf to re-attach overlays */
  attachToViewer(viewer: HTMLElement, pageInfos: PageInfo[]) {
    this.detach();
    this.pages = pageInfos;

    for (let i = 0; i < pageInfos.length; i++) {
      const overlay = document.createElement('div');
      overlay.className = 'redaction-overlay';
      overlay.dataset.page = String(i);
      pageInfos[i].wrapper.appendChild(overlay);
      this.overlays.set(i, overlay);
    }

    // Re-draw existing regions
    this.redrawRegions();
  }

  setDrawing(enabled: boolean) {
    this.drawing = enabled;
    for (const overlay of this.overlays.values()) {
      overlay.classList.toggle('drawing', enabled);
    }
    if (enabled) {
      document.addEventListener('mousedown', this.onMouseDown, true);
      document.addEventListener('mousemove', this.onMouseMove, true);
      document.addEventListener('mouseup', this.onMouseUp, true);
    } else {
      document.removeEventListener('mousedown', this.onMouseDown, true);
      document.removeEventListener('mousemove', this.onMouseMove, true);
      document.removeEventListener('mouseup', this.onMouseUp, true);
    }
  }

  getRegions(): RedactionRegion[] {
    return [...this.regions];
  }

  clear() {
    this.regions = [];
    this.redrawRegions();
  }

  detach() {
    this.setDrawing(false);
    for (const overlay of this.overlays.values()) {
      overlay.remove();
    }
    this.overlays.clear();
    this.pages = [];
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.drawing) return;
    const target = (e.target as HTMLElement).closest('.redaction-overlay') as HTMLDivElement | null;
    if (!target) return;

    const pageIdx = parseInt(target.dataset.page || '-1');
    if (pageIdx < 0) return;

    e.preventDefault();
    this.activePageIndex = pageIdx;
    const rect = target.getBoundingClientRect();
    this.startX = e.clientX - rect.left;
    this.startY = e.clientY - rect.top;

    this.currentRect = document.createElement('div');
    this.currentRect.className = 'redaction-rect';
    this.currentRect.style.left = `${this.startX}px`;
    this.currentRect.style.top = `${this.startY}px`;
    this.currentRect.style.width = '0px';
    this.currentRect.style.height = '0px';
    target.appendChild(this.currentRect);
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.currentRect || this.activePageIndex < 0) return;
    const overlay = this.overlays.get(this.activePageIndex);
    if (!overlay) return;

    const rect = overlay.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;

    const left = Math.min(this.startX, curX);
    const top = Math.min(this.startY, curY);
    const width = Math.abs(curX - this.startX);
    const height = Math.abs(curY - this.startY);

    this.currentRect.style.left = `${left}px`;
    this.currentRect.style.top = `${top}px`;
    this.currentRect.style.width = `${width}px`;
    this.currentRect.style.height = `${height}px`;
  }

  private handleMouseUp(e: MouseEvent) {
    if (!this.currentRect || this.activePageIndex < 0) return;

    const overlay = this.overlays.get(this.activePageIndex);
    if (!overlay) { this.currentRect = null; return; }

    const overlayRect = overlay.getBoundingClientRect();
    const endX = e.clientX - overlayRect.left;
    const endY = e.clientY - overlayRect.top;

    const screenLeft = Math.min(this.startX, endX);
    const screenTop = Math.min(this.startY, endY);
    const screenRight = Math.max(this.startX, endX);
    const screenBottom = Math.max(this.startY, endY);

    // Minimum size threshold (5px)
    if (screenRight - screenLeft < 5 || screenBottom - screenTop < 5) {
      this.currentRect.remove();
      this.currentRect = null;
      this.activePageIndex = -1;
      return;
    }

    // Convert screen coordinates to PDF coordinates
    const page = this.pages[this.activePageIndex];
    if (!page) { this.currentRect.remove(); this.currentRect = null; return; }

    const scaleX = page.pdfWidth / overlayRect.width;
    const scaleY = page.pdfHeight / overlayRect.height;

    // PDF coordinate system: origin bottom-left, Y goes up
    const pdfX1 = screenLeft * scaleX;
    const pdfX2 = screenRight * scaleX;
    const pdfY1 = page.pdfHeight - screenBottom * scaleY; // bottom
    const pdfY2 = page.pdfHeight - screenTop * scaleY;    // top

    this.regions.push({
      page: this.activePageIndex,
      rect: [
        Math.round(pdfX1),
        Math.round(pdfY1),
        Math.round(pdfX2),
        Math.round(pdfY2),
      ],
    });

    this.currentRect = null;
    this.activePageIndex = -1;
    this.redrawRegions();
  }

  private redrawRegions() {
    // Clear all overlay children except current drawing rect
    for (const overlay of this.overlays.values()) {
      const children = Array.from(overlay.children);
      for (const child of children) {
        if (child !== this.currentRect) child.remove();
      }
    }

    // Draw persisted regions
    for (const region of this.regions) {
      const overlay = this.overlays.get(region.page);
      const page = this.pages[region.page];
      if (!overlay || !page) continue;

      const overlayRect = overlay.getBoundingClientRect();
      const scaleX = overlayRect.width / page.pdfWidth;
      const scaleY = overlayRect.height / page.pdfHeight;

      const [x1, y1, x2, y2] = region.rect;
      const screenLeft = x1 * scaleX;
      const screenTop = (page.pdfHeight - y2) * scaleY;
      const screenWidth = (x2 - x1) * scaleX;
      const screenHeight = (y2 - y1) * scaleY;

      const el = document.createElement('div');
      el.className = 'redaction-rect';
      el.style.left = `${screenLeft}px`;
      el.style.top = `${screenTop}px`;
      el.style.width = `${screenWidth}px`;
      el.style.height = `${screenHeight}px`;
      overlay.appendChild(el);
    }
  }
}
