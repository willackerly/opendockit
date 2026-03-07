import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.UnrecoverableKeyException;
import java.security.cert.CertificateException;
import java.util.Calendar;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSObjectKey;
import org.apache.pdfbox.cos.COSNull;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.examples.signature.CreateSignatureBase;
import org.apache.pdfbox.examples.signature.SigUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdfwriter.compress.COSWriterCompressionPool;
import org.apache.pdfbox.pdfwriter.compress.COSWriterObjectStream;
import org.apache.pdfbox.pdfwriter.compress.CompressParameters;
import org.apache.pdfbox.io.RandomAccessRead;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.pdfwriter.COSWriter;

public class PatchedSignature extends CreateSignatureBase {
  private final Set<COSBase> scrubVisited = Collections.newSetFromMap(new IdentityHashMap<>());
  private final Path runModePath;
  private final boolean verbose;
  private final Path verboseLogPath;
  private byte[] deterministicId;

  static {
    System.setProperty("org.apache.pdfbox.pdfwriter.COSWriter.enableXRefStream", "false");
  }

  public PatchedSignature(KeyStore keystore, char[] pin)
      throws KeyStoreException, UnrecoverableKeyException, NoSuchAlgorithmException,
             CertificateException, IOException {
    super(keystore, pin);
    String modePath = System.getenv("PDFBOX_TS_MODE_PATH");
    this.runModePath = (modePath != null && !modePath.isEmpty()) ? Path.of(modePath) : null;
    String verboseEnv = System.getenv("PDFBOX_TS_VERBOSE");
    this.verbose = verboseEnv != null && !verboseEnv.isEmpty() && !"0".equals(verboseEnv);
    String verbosePathEnv = System.getenv("PDFBOX_TS_VERBOSE_PATH");
    this.verboseLogPath =
        (verbosePathEnv != null && !verbosePathEnv.isEmpty())
            ? Path.of(verbosePathEnv)
            : Path.of("java-trace.log");
  }

  private void scrubDocument(PDDocument document) throws IOException {
    scrubVisited.clear();
    COSDictionary trailer = document.getDocument().getTrailer();
    scrubCOSBase(trailer);
    for (COSObjectKey key : document.getDocument().getXrefTable().keySet()) {
      COSObject cosObject = document.getDocument().getObjectFromPool(key);
      if (cosObject != null) {
        scrubCOSBase(cosObject.getObject());
      }
    }
  }

  private void sanitizeAllObjects(PDDocument document) throws IOException {
    // Remove any orphaned COSObjects with null keys and strip references to them.
    Set<COSObject> nullKeyObjects = Collections.newSetFromMap(new IdentityHashMap<>());
    for (COSObjectKey key : document.getDocument().getXrefTable().keySet()) {
      COSObject cosObject = document.getDocument().getObjectFromPool(key);
      if (cosObject != null && cosObject.getKey() == null) {
        nullKeyObjects.add(cosObject);
      }
    }

    for (COSObjectKey key : document.getDocument().getXrefTable().keySet()) {
      COSObject cosObject = document.getDocument().getObjectFromPool(key);
      if (cosObject == null) {
        continue;
      }
      COSBase base = cosObject.getObject();
      if (base instanceof COSDictionary dict) {
        removeNullKeys(dict);
        removeNullKeyRefs(dict, nullKeyObjects);
      } else if (base == null && nullKeyObjects.contains(cosObject)) {
        cosObject.setToNull();
      }
      // If the object still has no key, assign one so COSWriter won't choke.
      if (cosObject.getKey() == null) {
        long next = document.getDocument().getHighestXRefObjectNumber() + 1;
        document.getDocument().setHighestXRefObjectNumber(next);
        COSObjectKey newKey = new COSObjectKey(next, 0);
        cosObject.getClass(); // dummy to avoid unused warning
        document.getDocument().getXrefTable().put(newKey, Long.valueOf(-1));
        try {
          // COSObject has no setter; stash key via reflection as a last resort.
          var f = COSObject.class.getDeclaredField("key");
          f.setAccessible(true);
          f.set(cosObject, newKey);
        } catch (Exception ignored) {
        }
      }
    }
  }

  private void removeNullKeys(COSDictionary dict) {
    Iterator<Map.Entry<COSName, COSBase>> iterator = dict.entrySet().iterator();
    while (iterator.hasNext()) {
      Map.Entry<COSName, COSBase> entry = iterator.next();
      if (entry.getKey() == null) {
        iterator.remove();
      } else {
        COSBase value = entry.getValue();
        if (value instanceof COSDictionary childDict) {
          removeNullKeys(childDict);
        } else if (value instanceof COSArray array) {
          for (int i = 0; i < array.size(); i++) {
            COSBase v = array.getObject(i);
            if (v instanceof COSDictionary nested) {
              removeNullKeys(nested);
            }
          }
        }
      }
    }
  }

  private void removeNullKeyRefs(COSDictionary dict, Set<COSObject> nullKeyObjects) {
    Iterator<Map.Entry<COSName, COSBase>> iterator = dict.entrySet().iterator();
    while (iterator.hasNext()) {
      Map.Entry<COSName, COSBase> entry = iterator.next();
      COSBase value = entry.getValue();
      if (value instanceof COSObject cosObject && nullKeyObjects.contains(cosObject)) {
        COSBase inner = cosObject.getObject();
        if (inner != null) {
          entry.setValue(inner);
        } else {
          iterator.remove();
        }
      } else if (value instanceof COSDictionary childDict) {
        removeNullKeyRefs(childDict, nullKeyObjects);
      } else if (value instanceof COSArray array) {
        for (int i = 0; i < array.size(); i++) {
          COSBase v = array.getObject(i);
          if (v instanceof COSObject cosObj && nullKeyObjects.contains(cosObj)) {
            COSBase inner = cosObj.getObject();
            if (inner != null) {
              array.set(i, inner);
            } else {
              array.set(i, COSNull.NULL);
            }
          } else if (v instanceof COSDictionary nested) {
            removeNullKeyRefs(nested, nullKeyObjects);
          }
        }
      }
    }
  }

  private void scrubCOSBase(COSBase base) throws IOException {
    if (base == null || scrubVisited.contains(base)) {
      return;
    }
    scrubVisited.add(base);

    if (base instanceof COSDictionary dict) {
      // Collect keys to remove first (entrySet may be unmodifiable)
      java.util.List<COSName> keysToRemove = new java.util.ArrayList<>();
      for (Map.Entry<COSName, COSBase> entry : dict.entrySet()) {
        COSName key = entry.getKey();
        if (key == null) {
          keysToRemove.add(key);
          continue;
        }
        COSBase value = entry.getValue();
        if (value instanceof COSObject cosObj && cosObj.getObject() == null) {
          System.out.println("Removing orphan reference: /" + key.getName() + " -> " + cosObj);
          keysToRemove.add(key);
        }
      }
      for (COSName key : keysToRemove) {
        dict.removeItem(key);
      }
      // Now recurse into remaining entries
      for (Map.Entry<COSName, COSBase> entry : dict.entrySet()) {
        if (entry.getKey() != null) {
          scrubCOSBase(entry.getValue());
        }
      }
    } else if (base instanceof COSArray array) {
      for (int i = array.size() - 1; i >= 0; i--) {
        COSBase item = array.get(i);
        if (item instanceof COSObject cosObj && cosObj.getObject() == null) {
          System.out.println("Removing orphan array element: " + cosObj);
          array.remove(i);
        } else {
          scrubCOSBase(array.getObject(i));
        }
      }
    } else if (base instanceof COSObject cosObject) {
      COSBase deref = cosObject.getObject();
      if (deref == null) {
        System.out.println("Encountered orphan COSObject with null reference: " + cosObject);
      } else {
        scrubCOSBase(deref);
      }
    }
  }

  public void sign(File inFile, File outFile, String tsaUrl)
      throws IOException {
    if (inFile == null || !inFile.exists()) {
      throw new IOException("Document for signing does not exist");
    }

    setTsaUrl(tsaUrl);
    byte[] originalBytes = Files.readAllBytes(inFile.toPath());
    byte[] deterministicId = computeDeterministicId(originalBytes);
    this.deterministicId = deterministicId;

    boolean usedFullSave = false;
    try (PDDocument doc = Loader.loadPDF(inFile)) {
      scrubDocument(doc);
      sanitizeAllObjects(doc);
      doc.getDocument().setIsXRefStream(false);
      ensureDeterministicDocumentId(doc, deterministicId);
      File tmpOut = File.createTempFile("pdfbox-ts-signed", ".pdf");
      tmpOut.deleteOnExit();
      usedFullSave = signDetached(doc, tmpOut, outFile, deterministicId, inFile);
      Files.move(tmpOut.toPath(), outFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
    } finally {
      recordRunMode(usedFullSave);
    }
  }

  public boolean signDetached(PDDocument document, File outFile, File logTargetFile, byte[] deterministicId, File originalFile)
      throws IOException {
    int accessPermissions = SigUtils.getMDPPermission(document);
    if (accessPermissions == 1) {
      throw new IllegalStateException("No changes to the document are permitted due to DocMDP transform parameters dictionary");
    }

    PDSignature signature = new PDSignature();
    signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
    signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
    signature.setName("pdfbox-ts Fixture");
    signature.setReason("pdfbox-ts parity test");
    signature.setLocation("Automation Harness");
    signature.setSignDate(deterministicSignDate());
    boolean existingApproval = hasPreexistingSignatures(document);
    if (accessPermissions == 0 && !existingApproval) {
      SigUtils.setMDPPermission(document, signature, 2);
    } else if (existingApproval) {
      System.out.println("Skipping DocMDP transform because an approval signature already exists.");
    }

    if (isExternalSigning()) {
      throw new UnsupportedOperationException("External signing not supported in patched signer");
    }

    SignatureOptions signatureOptions = new SignatureOptions();
    signatureOptions.setPreferredSignatureSize(SignatureOptions.DEFAULT_SIGNATURE_SIZE * 2);
    document.addSignature(signature, this, signatureOptions);
    ensureDeterministicDocumentId(document, deterministicId);

    boolean usedFullSave = false;
    File logBase = (logTargetFile != null) ? logTargetFile : outFile;
    try (PrintWriter logWriter = verbose ? createVerboseLog(logBase) : null) {
      if (verbose) {
        logWriter.println("[VERBOSE] PDFBOX_TS_VERBOSE enabled");
        logCompressionPlan(document, logWriter);
      }
      try (java.io.OutputStream output = new FileOutputStream(outFile, false);
           RandomAccessRead rar = new RandomAccessReadBufferedFile(originalFile)) {
        LoggingCOSWriter writer = new LoggingCOSWriter(output, rar, logWriter, verbose);
        writer.write(document, this);
        rewriteDocumentId(outFile, deterministicId);
      } catch (RuntimeException ex) {
        System.err.println("Incremental save failed (" + ex.getClass().getSimpleName() + ": " + ex.getMessage() + "), aborting.");
        if (verbose && logWriter != null) {
          ex.printStackTrace(logWriter);
          logWriter.flush();
        }
        throw ex;
      }
      return usedFullSave;
    }
  }

  private boolean hasPreexistingSignatures(PDDocument document) {
    List<PDSignature> signatures = document.getSignatureDictionaries();
    if (signatures != null) {
      for (PDSignature sig : signatures) {
        if (sig != null && sig.getCOSObject() != null) {
          return true;
        }
      }
    }

    PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
    if (acroForm != null) {
      for (PDField field : acroForm.getFields()) {
        if (field instanceof PDSignatureField sigField) {
          PDSignature existing = sigField.getSignature();
          if (existing != null && existing.getCOSObject() != null) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public static void main(String[] args)
      throws IOException, GeneralSecurityException {
    if (args.length < 3) {
      System.err.println("usage: java PatchedSignature <pkcs12_keystore> <password> <pdf_to_sign>");
      System.exit(1);
    }

    String tsaUrl = null;
    boolean externalSig = false;
    for (int i = 0; i < args.length; i++) {
      if ("-tsa".equals(args[i])) {
        i++;
        tsaUrl = args[i];
      } else if ("-e".equals(args[i])) {
        externalSig = true;
      }
    }

    KeyStore keystore = KeyStore.getInstance("PKCS12");
    char[] password = args[1].toCharArray();
    try (InputStream is = new FileInputStream(args[0])) {
      keystore.load(is, password);
    }

    PatchedSignature signing = new PatchedSignature(keystore, password);
    signing.setExternalSigning(externalSig);

    File inFile = new File(args[2]);
    File outFile = new File(inFile.getParent(), inFile.getName() + "_patched_signed.pdf");
    signing.sign(inFile, outFile, tsaUrl);
  }

  private static void ensureDeterministicDocumentId(PDDocument document, byte[] deterministicId) {
    COSArray deterministic = createDeterministicIdArray(deterministicId);
    document.getDocument().setDocumentID(deterministic);
  }

  private static COSArray createDeterministicIdArray(byte[] deterministicId) {
    COSArray array = new COSArray();
    COSString first = new COSString(deterministicId);
    first.setForceHexForm(true);
    COSString second = new COSString(deterministicId);
    second.setForceHexForm(true);
    array.add(first);
    array.add(second);
    return array;
  }

  private static byte[] computeDeterministicId(byte[] data) {
    byte[] id = new byte[16];
    long accumulator = 0x811c9dc5L;
    for (int i = 0; i < data.length; i++) {
      accumulator = (accumulator + (data[i] & 0xFF) + (i & 0xFF)) & 0xFFFFFFFFL;
      int index = i & 0x0F;
      int value = (int) (accumulator & 0xFF);
      id[index] = (byte) ((id[index] ^ value) & 0xFF);
    }
    return id;
  }

  private static Calendar deterministicSignDate() {
    Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
    calendar.set(2024, Calendar.JANUARY, 1, 0, 0, 0);
    calendar.set(Calendar.MILLISECOND, 0);
    return calendar;
  }

  private static void rewriteDocumentId(File file, byte[] deterministicId) throws IOException {
    String hex = bytesToHex(deterministicId);
    String content = Files.readString(file.toPath(), StandardCharsets.ISO_8859_1);
    int idIndex = content.lastIndexOf("/ID [<");
    if (idIndex < 0) {
      return;
    }
    int firstStart = content.indexOf('<', idIndex);
    int firstEnd = content.indexOf('>', firstStart);
    int secondStart = content.indexOf('<', firstEnd);
    int secondEnd = content.indexOf('>', secondStart);
    if (firstStart < 0 || firstEnd < 0 || secondStart < 0 || secondEnd < 0) {
      return;
    }
    StringBuilder builder = new StringBuilder(content);
    builder.replace(firstStart + 1, firstEnd, hex);
    builder.replace(secondStart + 1, secondEnd, hex);
    Files.writeString(file.toPath(), builder.toString(), StandardCharsets.ISO_8859_1);
  }

  private static String bytesToHex(byte[] data) {
    StringBuilder builder = new StringBuilder(data.length * 2);
    for (byte b : data) {
      builder.append(String.format("%02X", b & 0xFF));
    }
    return builder.toString();
  }

  private PrintWriter createVerboseLog(File outFile) throws IOException {
    Path path = verboseLogPath.isAbsolute()
        ? verboseLogPath
        : outFile.toPath().getParent().resolve(verboseLogPath);
    Files.createDirectories(path.getParent());
    return new PrintWriter(Files.newBufferedWriter(path, StandardCharsets.UTF_8));
  }

  private void logCompressionPlan(PDDocument document, PrintWriter log) {
    try {
      CompressParameters params = CompressParameters.DEFAULT_COMPRESSION;
      COSWriterCompressionPool pool = new COSWriterCompressionPool(document, params);
      List<COSObjectKey> topLevel = pool.getTopLevelObjects();
      List<COSObjectKey> objStreamObjects = pool.getObjectStreamObjects();
      log.println("[VERBOSE] CompressionPool top-level count=" + topLevel.size());
      log.println("[VERBOSE] CompressionPool top-level keys=" + formatKeys(topLevel));
      log.println("[VERBOSE] CompressionPool objstm candidates count=" + objStreamObjects.size());
      log.println("[VERBOSE] CompressionPool objstm candidates=" + formatKeys(objStreamObjects));
      // Force logging without consuming objects (no createObjectStreams to avoid side-effects)
      log.println("[VERBOSE] CompressionPool highest object number=" + pool.getHighestXRefObjectNumber());
    } catch (Exception ex) {
      log.println("[VERBOSE] CompressionPool logging failed: " + ex.getClass().getSimpleName() + ": " + ex.getMessage());
    }
    log.flush();
  }

  private String formatKeys(List<COSObjectKey> keys) {
    StringBuilder builder = new StringBuilder();
    builder.append("[");
    for (int i = 0; i < keys.size(); i++) {
      COSObjectKey key = keys.get(i);
      builder.append(key.getNumber()).append(" ").append(key.getGeneration());
      if (i + 1 < keys.size()) {
        builder.append(", ");
      }
    }
    builder.append("]");
    return builder.toString();
  }

  private static class LoggingCOSWriter extends COSWriter {
    private final PrintWriter log;
    private final boolean verbose;

    LoggingCOSWriter(java.io.OutputStream output, RandomAccessRead rar, PrintWriter log, boolean verbose) throws IOException {
      super(output, rar);
      this.log = log;
      this.verbose = verbose;
      if (this.verbose && this.log != null) {
        this.log.println("[VERBOSE] LoggingCOSWriter initialized");
        this.log.flush();
      }
    }

    @Override
    public void doWriteObject(COSObjectKey key, COSBase object) throws IOException {
      if (verbose && log != null) {
        if (key != null) {
          log.println("[VERBOSE] doWriteObject key=" + key.getNumber() + " " + key.getGeneration() + " type=" + safeType(object));
        } else {
          log.println("[VERBOSE] doWriteObject direct type=" + safeType(object));
        }
        log.flush();
      }
      super.doWriteObject(key, object);
    }

    private String safeType(COSBase object) {
      return (object == null) ? "null" : object.getClass().getSimpleName();
    }
  }

  private void recordRunMode(boolean usedFullSave) {
    if (runModePath == null) {
      return;
    }
    try {
      Files.createDirectories(runModePath.getParent());
      Files.writeString(runModePath, usedFullSave ? "full-save" : "incremental");
    } catch (IOException ex) {
      System.err.println("Failed to write run mode file: " + ex.getMessage());
    }
  }

  @Override
  public byte[] sign(InputStream content) throws IOException {
    try {
      byte[] data = content.readAllBytes();
      if (deterministicId != null) {
        data = rewriteDocumentIdBytes(data, deterministicId);
      }
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(data);
      String capturePath = System.getenv("PDFBOX_TS_CAPTURE_DATA");
      if (capturePath != null && !capturePath.isEmpty()) {
        try {
          Files.createDirectories(new File(capturePath).getParentFile().toPath());
          Files.write(new File(capturePath).toPath(), data);
        } catch (IOException ex) {
          System.err.println("Failed to capture dataToSign: " + ex.getMessage());
        }
      }
      return super.sign(new java.io.ByteArrayInputStream(data));
    } catch (NoSuchAlgorithmException e) {
      throw new IOException("SHA-256 not available", e);
    }
  }

  private byte[] rewriteDocumentIdBytes(byte[] data, byte[] deterministicId) {
    String hex = bytesToHex(deterministicId);
    String content = new String(data, StandardCharsets.ISO_8859_1);
    int idIndex = content.lastIndexOf("/ID [<");
    if (idIndex < 0) {
      return data;
    }
    int firstStart = content.indexOf('<', idIndex);
    int firstEnd = content.indexOf('>', firstStart);
    int secondStart = content.indexOf('<', firstEnd);
    int secondEnd = content.indexOf('>', secondStart);
    if (firstStart < 0 || firstEnd < 0 || secondStart < 0 || secondEnd < 0) {
      return data;
    }
    StringBuilder builder = new StringBuilder(content);
    builder.replace(firstStart + 1, firstEnd, hex);
    builder.replace(secondStart + 1, secondEnd, hex);
    return builder.toString().getBytes(StandardCharsets.ISO_8859_1);
  }
}
