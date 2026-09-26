// Resize the approved artwork without redrawing it. Requires sharp.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const sharp = createRequire(import.meta.url)('sharp');
const source = fileURLToPath(new URL('../../src/ui/assets/cinematch-logo.png', import.meta.url));
for (const size of [16, 32, 48, 128]) {
  const target = fileURLToPath(new URL('../../public/icons/icon' + size + '.png', import.meta.url));
  await sharp(source).resize(size, size, { fit: 'contain' }).png().toFile(target);
  console.log('Generated icon: ' + size);
}
