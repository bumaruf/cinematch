// Builds the logo assets from the brand sources in assets/brand without
// redrawing them: tightly framed SVGs for the UI and the toolbar PNG icons.
// Run with `npm run icons` after changing a brand file. Requires sharp.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const sharp = createRequire(import.meta.url)('sharp');
const path = (relative) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));

/** Bounding box of the drawn artwork, in the SVG's own coordinates. */
async function artworkBox(file) {
  const { info } = await sharp(file).trim().toBuffer({ resolveWithObject: true });
  return { x: -info.trimOffsetLeft, y: -info.trimOffsetTop, width: info.width, height: info.height };
}

/** Rewrites the SVG's frame (viewBox, width, height) around the artwork. */
function reframe(svg, { x, y, width, height }) {
  const box = [x, y, width, height].map((value) => Math.round(value)).join(' ');
  return svg.replace(/<svg([^>]*)>/, (_, attributes) => {
    const rest = attributes.replace(/\s(width|height|viewBox)="[^"]*"/g, '');
    return `<svg${rest} width="${Math.round(width)}" height="${Math.round(height)}" viewBox="${box}">`;
  });
}

mkdirSync(path('src/ui/assets'), { recursive: true });

// Full logo: the artwork plus a hairline margin, for headers.
const logoSource = path('assets/brand/cinematch-logo.svg');
const logo = await artworkBox(logoSource);
const logoMargin = logo.height * 0.04;
writeFileSync(
  path('src/ui/assets/cinematch-logo.svg'),
  reframe(readFileSync(logoSource, 'utf8'), {
    x: logo.x - logoMargin,
    y: logo.y - logoMargin,
    width: logo.width + 2 * logoMargin,
    height: logo.height + 2 * logoMargin,
  }),
);

// Icon: a square around the artwork, so it stays legible at 16 px.
const iconSource = path('assets/brand/cinematch-icon.svg');
const icon = await artworkBox(iconSource);
const side = Math.max(icon.width, icon.height) * 1.06;
const iconSvg = reframe(readFileSync(iconSource, 'utf8'), {
  x: icon.x - (side - icon.width) / 2,
  y: icon.y - (side - icon.height) / 2,
  width: side,
  height: side,
});
writeFileSync(path('src/ui/assets/cinematch-icon.svg'), iconSvg);

for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(iconSvg), { density: 300 }).resize(size, size).png().toFile(path(`public/icons/icon${size}.png`));
}
console.log('Logo e ícones gerados a partir de assets/brand.');
