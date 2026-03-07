/**
 * Register all 14 standard font data files with StandardFontMetrics.
 *
 * Called lazily on first access to StandardFontMetrics.load() or isStandardFont().
 * This avoids eagerly pulling 1.1 MB of font metric data into bundles that
 * never use standard font measurement (e.g. sign-only or extraction-only usage).
 */

import { registerFont } from './StandardFontMetrics.js';

import { CourierMetrics } from './data/Courier.js';
import { Courier_BoldMetrics } from './data/Courier-Bold.js';
import { Courier_ObliqueMetrics } from './data/Courier-Oblique.js';
import { Courier_BoldObliqueMetrics } from './data/Courier-BoldOblique.js';
import { HelveticaMetrics } from './data/Helvetica.js';
import { Helvetica_BoldMetrics } from './data/Helvetica-Bold.js';
import { Helvetica_ObliqueMetrics } from './data/Helvetica-Oblique.js';
import { Helvetica_BoldObliqueMetrics } from './data/Helvetica-BoldOblique.js';
import { Times_RomanMetrics } from './data/Times-Roman.js';
import { Times_BoldMetrics } from './data/Times-Bold.js';
import { Times_ItalicMetrics } from './data/Times-Italic.js';
import { Times_BoldItalicMetrics } from './data/Times-BoldItalic.js';
import { SymbolMetrics } from './data/Symbol.js';
import { ZapfDingbatsMetrics } from './data/ZapfDingbats.js';

export function registerAllStandardFonts(): void {
  registerFont('Courier', () => CourierMetrics);
  registerFont('Courier-Bold', () => Courier_BoldMetrics);
  registerFont('Courier-Oblique', () => Courier_ObliqueMetrics);
  registerFont('Courier-BoldOblique', () => Courier_BoldObliqueMetrics);
  registerFont('Helvetica', () => HelveticaMetrics);
  registerFont('Helvetica-Bold', () => Helvetica_BoldMetrics);
  registerFont('Helvetica-Oblique', () => Helvetica_ObliqueMetrics);
  registerFont('Helvetica-BoldOblique', () => Helvetica_BoldObliqueMetrics);
  registerFont('Times-Roman', () => Times_RomanMetrics);
  registerFont('Times-Bold', () => Times_BoldMetrics);
  registerFont('Times-Italic', () => Times_ItalicMetrics);
  registerFont('Times-BoldItalic', () => Times_BoldItalicMetrics);
  registerFont('Symbol', () => SymbolMetrics);
  registerFont('ZapfDingbats', () => ZapfDingbatsMetrics);
}
