import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureInterface;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

import java.io.*;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Calendar;
import java.util.TimeZone;

import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.*;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;

import java.util.Collections;

/**
 * Creates a PDF with a visual digital signature using Java PDFBox.
 * This serves as a reference to compare against pdfbox-ts output.
 */
public class VisualSignature implements SignatureInterface {
    private PrivateKey privateKey;
    private Certificate[] certChain;

    public VisualSignature(KeyStore keyStore, String alias, char[] password) throws Exception {
        this.privateKey = (PrivateKey) keyStore.getKey(alias, password);
        this.certChain = keyStore.getCertificateChain(alias);
    }

    @Override
    public byte[] sign(InputStream content) throws IOException {
        try {
            CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
            X509Certificate cert = (X509Certificate) certChain[0];
            ContentSigner sha256Signer = new JcaContentSignerBuilder("SHA256withRSA").build(privateKey);
            gen.addSignerInfoGenerator(
                new JcaSignerInfoGeneratorBuilder(
                    new JcaDigestCalculatorProviderBuilder().build()
                ).build(sha256Signer, cert)
            );
            gen.addCertificates(new JcaCertStore(Collections.singletonList(cert)));

            CMSProcessableInputStream msg = new CMSProcessableInputStream(content);
            CMSSignedData signedData = gen.generate(msg, false);
            return signedData.getEncoded();
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.err.println("Usage: java VisualSignature <p12file> <password> <output.pdf>");
            System.exit(1);
        }

        String p12Path = args[0];
        String password = args[1];
        String outputPath = args[2];

        // Load keystore
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream fis = new FileInputStream(p12Path)) {
            ks.load(fis, password.toCharArray());
        }
        String alias = ks.aliases().nextElement();

        VisualSignature signer = new VisualSignature(ks, alias, password.toCharArray());

        // Step 1: Create a simple PDF document and save to temp file
        File tempFile = File.createTempFile("visual-sig-base", ".pdf");
        tempFile.deleteOnExit();

        try (PDDocument createDoc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            createDoc.addPage(page);

            PDPageContentStream cs = new PDPageContentStream(createDoc, page);
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 24);
            cs.newLineAtOffset(50, 700);
            cs.showText("Visual Signature Reference (Java PDFBox)");
            cs.endText();
            cs.close();

            createDoc.save(tempFile);
        }

        // Step 2: Reload from file and sign incrementally (as PDFBox requires)
        PDDocument doc = Loader.loadPDF(tempFile);
        PDPage page = doc.getPage(0);

        // Create signature with visible appearance
        PDSignature sig = new PDSignature();
        sig.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
        sig.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
        sig.setName("pdfbox-ts Fixture");
        sig.setLocation("San Francisco, CA");
        sig.setReason("Visual signature test");

        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        cal.set(2024, 0, 1, 0, 0, 0);
        cal.set(Calendar.MILLISECOND, 0);
        sig.setSignDate(cal);

        // Create visible signature options with a rectangle
        SignatureOptions options = new SignatureOptions();
        options.setPreferredSignatureSize(18944);
        options.setPage(0);

        // Create a visible signature appearance template
        options.setVisualSignature(createVisualSignatureTemplate(doc, page));

        doc.addSignature(sig, signer, options);

        // Save incrementally
        try (FileOutputStream fos = new FileOutputStream(outputPath)) {
            doc.saveIncremental(fos);
        }
        doc.close();
        tempFile.delete();

        System.out.println("Visual signature PDF written to: " + outputPath);
    }

    /**
     * Creates a visual signature template (appearance stream).
     */
    private static InputStream createVisualSignatureTemplate(PDDocument doc, PDPage page) throws Exception {
        // Create a template document with a signature field that has an appearance
        PDDocument template = new PDDocument();
        PDPage templatePage = new PDPage(page.getMediaBox());
        template.addPage(templatePage);

        PDAcroForm acroForm = new PDAcroForm(template);
        template.getDocumentCatalog().setAcroForm(acroForm);

        PDSignatureField sigField = new PDSignatureField(acroForm);
        PDSignature templateSig = new PDSignature();
        sigField.setValue(templateSig);

        // Set widget annotation with visual bounds
        var widget = sigField.getWidgets().get(0);
        widget.setRectangle(new PDRectangle(350, 50, 200, 80));
        widget.setPage(templatePage);

        // Create appearance with blue background (simulating an image)
        var appearance = new org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary();
        var normalStream = new org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream(template);
        normalStream.setResources(new org.apache.pdfbox.pdmodel.PDResources());
        normalStream.setBBox(new PDRectangle(200, 80));

        var contentStream = new PDPageContentStream(template, normalStream);
        // Draw a blue rectangle as visual signature
        contentStream.setNonStrokingColor(0.0f, 0.0f, 0.8f);
        contentStream.addRect(0, 0, 200, 80);
        contentStream.fill();
        // Add text
        contentStream.beginText();
        contentStream.setNonStrokingColor(1.0f, 1.0f, 1.0f);
        contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
        contentStream.newLineAtOffset(10, 30);
        contentStream.showText("Digitally Signed");
        contentStream.endText();
        contentStream.close();

        appearance.setNormalAppearance(normalStream);
        widget.setAppearance(appearance);

        templatePage.getAnnotations().add(widget);
        acroForm.getFields().add(sigField);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        template.save(baos);
        template.close();

        return new ByteArrayInputStream(baos.toByteArray());
    }

    // Helper class for CMS signing
    static class CMSProcessableInputStream implements CMSTypedData {
        private final InputStream in;
        public CMSProcessableInputStream(InputStream is) { this.in = is; }
        @Override public org.bouncycastle.asn1.ASN1ObjectIdentifier getContentType() {
            return org.bouncycastle.asn1.cms.CMSObjectIdentifiers.data;
        }
        @Override public Object getContent() { return in; }
        @Override public void write(OutputStream out) throws IOException {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }
}
