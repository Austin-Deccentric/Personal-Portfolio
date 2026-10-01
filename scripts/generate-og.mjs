// Generates public/og-image.png from public/og-image.svg at build time.
// Source of truth stays the editable SVG; the PNG is what's served to crawlers
// (SVG has poor support as an og:image).
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public', 'og-image.svg');
const dest = join(root, 'public', 'og-image.png');

await sharp(src)
  .resize(1200, 630, { fit: 'fill' })
  .png()
  .toFile(dest);

console.log('og-image.png generated');
