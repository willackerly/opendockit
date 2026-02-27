/**
 * Presentation patcher — patches `<p:sldIdLst>` in presentation.xml.
 *
 * Handles slide reorder and deletion by rearranging `<p:sldId>` elements
 * within `<p:sldIdLst>` to match the desired order.
 */

/**
 * Reorder `<p:sldId>` elements in `<p:sldIdLst>` to match the new order.
 *
 * Slides whose r:id is not in `newOrder` are removed (deleted).
 * The numeric `id` attributes on each `<p:sldId>` are preserved.
 *
 * @param doc - parsed presentation.xml DOM
 * @param newOrder - array of relationship IDs (r:id values) in desired order
 */
export function patchSlideIdList(
  doc: Document,
  newOrder: string[]
): void {
  // Find <p:sldIdLst>
  const allElements = doc.getElementsByTagName('*');
  let sldIdLst: Element | null = null;
  for (let i = 0; i < allElements.length; i++) {
    if (allElements[i].localName === 'sldIdLst') {
      sldIdLst = allElements[i];
      break;
    }
  }
  if (!sldIdLst) return;

  // Collect existing <p:sldId> elements indexed by r:id
  const sldIdMap = new Map<string, Element>();
  const existingIds: Element[] = [];
  for (let i = 0; i < sldIdLst.childNodes.length; i++) {
    const child = sldIdLst.childNodes[i];
    if (child.nodeType === 1 && (child as Element).localName === 'sldId') {
      const el = child as Element;
      // Try standard namespace lookup first, then prefixed attribute
      const rId =
        el.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'id'
        ) || el.getAttribute('r:id');
      if (rId) {
        sldIdMap.set(rId, el);
      }
      existingIds.push(el);
    }
  }

  // Remove all existing sldId elements
  for (const el of existingIds) {
    sldIdLst.removeChild(el);
  }

  // Re-add in new order (deleted slides are omitted)
  for (const rId of newOrder) {
    const el = sldIdMap.get(rId);
    if (el) {
      sldIdLst.appendChild(el);
    }
  }
}
