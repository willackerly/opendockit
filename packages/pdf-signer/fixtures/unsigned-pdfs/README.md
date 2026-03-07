# Unsigned PDF Corpus

This directory mirrors the canonical input PDFs we use in the parity harness.
Every file here is an *unsigned* source document pulled from `test-pdfs/`.
Keeping a flat corpus under `fixtures/unsigned-pdfs/` makes it easy to hand
samples to other repos (like `pdf-signer-web`) or run ad-hoc experiments
without hunting for the original paths.

Whenever you add a new parity fixture under `test-pdfs/`, drop the unsigned
source here as well so the dataset stays complete.
