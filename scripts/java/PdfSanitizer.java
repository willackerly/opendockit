import java.io.File;
import java.io.IOException;
import java.util.Iterator;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;

/**
 * Utility that loads a PDF, removes any null-key dictionary entries (which can
 * crash PDFBox's signer), and writes the sanitized document back out.
 *
 * This mirrors the scrub logic inside PatchedSignature but stops before
 * signing so we can hand the sanitized file to the official CreateSignature
 * example for parity comparisons.
 */
public final class PdfSanitizer {
  private PdfSanitizer() {}

  private static void scrubDocument(PDDocument document) throws IOException {
    COSDictionary trailer = document.getDocument().getTrailer();
    scrubCOSBase(trailer);
  }

  private static void scrubCOSBase(COSBase base) throws IOException {
    if (base == null) {
      return;
    }

    if (base instanceof COSDictionary dict) {
      Iterator<Map.Entry<COSName, COSBase>> iterator = dict.entrySet().iterator();
      while (iterator.hasNext()) {
        Map.Entry<COSName, COSBase> entry = iterator.next();
        COSName key = entry.getKey();
        if (key == null) {
          System.out.println("Removing null key dictionary entry: " + dict);
          iterator.remove();
          continue;
        }
        scrubCOSBase(entry.getValue());
      }
    } else if (base instanceof COSArray array) {
      for (int i = 0; i < array.size(); i++) {
        scrubCOSBase(array.getObject(i));
      }
    }
  }

  public static void main(String[] args) throws IOException {
    if (args.length < 2) {
      System.err.println("Usage: java PdfSanitizer <input.pdf> <output.pdf>");
      System.exit(1);
    }

    File input = new File(args[0]);
    File output = new File(args[1]);

    try (PDDocument doc = Loader.loadPDF(input)) {
      scrubDocument(doc);
      doc.getDocument().setIsXRefStream(false);
      doc.getDocument().setVersion(1.4f);
      doc.save(output);
    }
  }
}
