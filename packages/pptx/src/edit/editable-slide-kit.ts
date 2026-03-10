/**
 * EditableSlideKit — PPTX editing API.
 *
 * Opens a PPTX file, builds a mutable model, provides edit operations,
 * and saves back to valid PPTX bytes via surgical XML patching.
 *
 * Unlike SlideKit (browser-only renderer), this class is Node.js-compatible
 * and focused on data manipulation rather than rendering.
 *
 * Usage:
 * ```ts
 * const kit = new EditableSlideKit();
 * const info = await kit.load(pptxArrayBuffer);
 *
 * // Move a shape
 * kit.moveElement('slide1::42', 914400, 0); // shift 1 inch right
 *
 * // Save
 * const bytes = await kit.save();
 * ```
 */

import { OpcPackageReader } from '@opendockit/core/opc';
import { REL_OFFICE_DOCUMENT } from '@opendockit/core/opc';
import type {
  EditablePresentation,
  EditableElement,
  EditableParagraph,
} from '@opendockit/core';
import type { SlideIR } from '../model/index.js';
import { parsePresentation } from '../parser/presentation.js';
import { parseSlide } from '../parser/slide.js';
import { buildEditablePresentation } from './editable-builder.js';
import { savePptx } from './save-pipeline.js';

/** Result returned from {@link EditableSlideKit.load}. */
export interface EditableLoadResult {
  /** Number of slides in the presentation. */
  slideCount: number;
  /** Slide width in EMU. */
  slideWidth: number;
  /** Slide height in EMU. */
  slideHeight: number;
}

/**
 * EditableSlideKit — PPTX editing API.
 *
 * Opens a PPTX file, builds a mutable model, provides edit operations,
 * and saves back to valid PPTX bytes via surgical XML patching.
 *
 * Unlike SlideKit (browser-only renderer), this class is Node.js-compatible
 * and focused on data manipulation rather than rendering.
 */
export class EditableSlideKit {
  private _pkg: OpcPackageReader | undefined;
  private _presentation: EditablePresentation | undefined;
  private _presentationPartUri: string | undefined;
  private _slideWidth = 0;
  private _slideHeight = 0;

  /**
   * Load a PPTX file for editing.
   *
   * Parses the OPC package, extracts slide metadata, and builds the
   * mutable EditablePresentation model.
   *
   * @param data - Raw PPTX file bytes.
   * @returns Slide dimensions and count.
   */
  async load(data: ArrayBuffer | Uint8Array | Blob): Promise<EditableLoadResult> {
    // 1. Open OPC package
    this._pkg = await OpcPackageReader.open(data);

    // 2. Parse presentation (handles all the OPC navigation internally)
    const presIR = await parsePresentation(this._pkg);

    // Store presentation part URI for save
    const rootRels = await this._pkg.getRootRelationships();
    const presRel = rootRels.getByType(REL_OFFICE_DOCUMENT)[0];
    if (!presRel) throw new Error('No presentation relationship found');
    this._presentationPartUri = presRel.target;

    this._slideWidth = presIR.slideWidth;
    this._slideHeight = presIR.slideHeight;

    // 3. Parse all slides with their layout/master chains
    const slideData: Array<{ ir: SlideIR; partUri: string }> = [];

    for (const slideRef of presIR.slides) {
      const slideXml = await this._pkg.getPartXml(slideRef.partUri);

      const slideTheme = presIR.masterThemes?.[slideRef.masterPartUri] ?? presIR.theme;
      const slideIR = parseSlide(
        slideXml,
        slideRef.partUri,
        slideRef.layoutPartUri,
        slideRef.masterPartUri,
        slideTheme
      );

      slideData.push({ ir: slideIR, partUri: slideRef.partUri });
    }

    // 4. Build editable presentation
    this._presentation = await buildEditablePresentation(slideData, this._pkg);

    return {
      slideCount: presIR.slides.length,
      slideWidth: presIR.slideWidth,
      slideHeight: presIR.slideHeight,
    };
  }

  /** Get the editable presentation model (for advanced access). */
  get presentation(): EditablePresentation {
    if (!this._presentation) throw new Error('No presentation loaded');
    return this._presentation;
  }

  /** Slide width in EMU. */
  get slideWidth(): number {
    return this._slideWidth;
  }

  /** Slide height in EMU. */
  get slideHeight(): number {
    return this._slideHeight;
  }

  /** Get an element by its composite ID. */
  getElement(id: string): EditableElement | undefined {
    return this.presentation.getElement(id);
  }

  /**
   * Move an element by a delta in EMU.
   *
   * @param id - Composite element ID (`partUri::shapeId`).
   * @param dx - Horizontal delta in EMU (positive = right).
   * @param dy - Vertical delta in EMU (positive = down).
   */
  moveElement(id: string, dx: number, dy: number): void {
    this.presentation.moveElement(id, dx, dy);
  }

  /**
   * Resize an element to new dimensions.
   *
   * @param id - Composite element ID.
   * @param width - New width in EMU.
   * @param height - New height in EMU.
   */
  resizeElement(id: string, width: number, height: number): void {
    this.presentation.resizeElement(id, width, height);
  }

  /**
   * Set text content for a shape element.
   *
   * @param id - Composite element ID (must be a shape with text).
   * @param paragraphs - New paragraph content.
   */
  setText(id: string, paragraphs: EditableParagraph[]): void {
    this.presentation.setText(id, paragraphs);
  }

  /**
   * Delete an element from its slide.
   *
   * @param id - Composite element ID to delete.
   */
  deleteElement(id: string): void {
    this.presentation.deleteElement(id);
  }

  /**
   * Reorder slides by moving one slide to a new position.
   *
   * @param fromIndex - Current zero-based index.
   * @param toIndex - Target zero-based index.
   */
  reorderSlides(fromIndex: number, toIndex: number): void {
    this.presentation.reorderSlides(fromIndex, toIndex);
  }

  /**
   * Delete a slide.
   *
   * @param index - Zero-based index of the slide to delete.
   */
  deleteSlide(index: number): void {
    this.presentation.deleteSlide(index);
  }

  /**
   * Save the edited presentation as PPTX bytes.
   *
   * Only dirty parts are reconstituted; unchanged parts are copied
   * as raw bytes from the source package.
   *
   * @returns PPTX file as a Uint8Array.
   */
  async save(): Promise<Uint8Array> {
    if (!this._pkg || !this._presentation || !this._presentationPartUri) {
      throw new Error('No presentation loaded');
    }
    return savePptx(this._presentation, this._pkg, this._presentationPartUri);
  }
}
