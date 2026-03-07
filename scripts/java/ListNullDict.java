import java.io.File;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageTree;

public class ListNullDict {
  public static void main(String[] args) throws IOException {
    if (args.length != 1) {
      System.err.println("Usage: java ListNullDict <pdf>");
      System.exit(1);
    }
    try (PDDocument doc = Loader.loadPDF(new File(args[0]))) {
      AtomicInteger pageIndex = new AtomicInteger();
      PDPageTree pages = doc.getPages();
      for (int i = 0; i < pages.getCount(); i++) {
        var page = pages.get(i);
        if (page.getAnnotations() == null) continue;
        page.getAnnotations().forEach(annot -> {
          if (annot == null) {
            System.out.println("Null annotation on page " + pageIndex.get());
            return;
          }
          COSDictionary dict = annot.getCOSObject();
          dict.keySet().forEach(key -> {
            if (key == null) {
              System.out.println("Null key in annotation on page " + pageIndex.get());
            }
          });
        });
        pageIndex.incrementAndGet();
      }
      COSDictionary cosDoc = doc.getDocumentCatalog().getCOSObject();
      cosDoc.keySet().forEach(key -> {
        if (key == null) {
          System.out.println("Null key in catalog");
        }
      });
    }
  }
}
