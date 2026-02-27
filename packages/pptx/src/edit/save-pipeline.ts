/**
 * Save Pipeline — orchestrates the save process for edited presentations.
 *
 * Only dirty parts are reconstituted (XML patched). Unchanged parts
 * are copied as raw bytes for byte-identical fidelity. The pipeline:
 *
 * 1. Patches dirty slide parts via surgical XML replacement
 * 2. Patches presentation.xml if slide order changed
 * 3. Removes deleted slide parts
 * 4. Builds the final ZIP
 * 5. Resets dirty state on success
 */

import { OpcPackageReader, OpcPackageWriter } from '@opendockit/core/opc';
import {
  EditablePresentation,
  patchPartXml,
  patchSlideIdList,
  parseXmlDom,
  serializeXmlDom,
} from '@opendockit/core';

/**
 * Save an edited presentation back to PPTX bytes.
 *
 * @param presentation - The mutable presentation model.
 * @param sourceReader - The original OPC package for copying unchanged parts.
 * @param presentationPartUri - URI of the presentation.xml part.
 * @returns PPTX file as a Uint8Array.
 */
export async function savePptx(
  presentation: EditablePresentation,
  sourceReader: OpcPackageReader,
  presentationPartUri: string
): Promise<Uint8Array> {
  const writer = new OpcPackageWriter(sourceReader);

  // 1. Patch dirty slide parts
  const dirtyParts = presentation.getDirtyParts();
  for (const partUri of dirtyParts) {
    const originalXml = presentation.originalPartXml.get(partUri);
    if (!originalXml) continue;

    const dirtyElements = presentation.getDirtyElementsForPart(partUri);
    const patchedXml = patchPartXml(dirtyElements, originalXml);
    writer.setPart(partUri, patchedXml);
  }

  // 2. Patch presentation.xml if slide order changed
  if (presentation.isSlideOrderDirty()) {
    const presXml = await sourceReader.getPartText(presentationPartUri);

    // Build new order from slide part URIs -> relationship IDs
    const presRels = await sourceReader.getPartRelationships(presentationPartUri);
    const partToRelId = new Map<string, string>();
    for (const rel of presRels.all()) {
      partToRelId.set(rel.target, rel.id);
    }

    const newOrder = presentation
      .getSlideOrder()
      .map((partUri) => partToRelId.get(partUri))
      .filter((id): id is string => id !== undefined);

    const presDoc = parseXmlDom(presXml);
    patchSlideIdList(presDoc, newOrder);
    writer.setPart(presentationPartUri, serializeXmlDom(presDoc));

    // Handle deleted slides — remove their parts
    const deletedSlides = presentation.getDeletedSlides();
    const slides = presentation.getSlides();
    for (const idx of deletedSlides) {
      const slide = slides[idx];
      if (slide) {
        writer.deletePart(slide.partUri);
      }
    }
  }

  // 3. Build final ZIP
  const bytes = await writer.build();

  // 4. Reset dirty state after successful save
  presentation.resetDirtyState();

  return bytes;
}
