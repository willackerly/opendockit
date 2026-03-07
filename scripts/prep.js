import fs from 'fs';
import path from 'path';
const src = path.resolve('test-pdfs/chrome-google-docs/complex-presentation-google-docs.pdf');
const dest = path.resolve('tmp/google-docs-presentation-large/prepared.pdf');
fs.copyFileSync(src, dest);
console.log('Copied', src, 'to', dest);
