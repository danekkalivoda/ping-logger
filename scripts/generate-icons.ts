import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dir, '..');
const OUT = join(ROOT, 'assets/images');
const SOURCE = readFileSync(join(ROOT, 'assets/icon-source.svg'), 'utf-8');

const EMERALD = '#6EE7B7';
const WHITE = '#FFFFFF';
const BG_DARK = '#152024';

const ICON = 1024;
const CONTENT = 580;

function recolor(svg: string, color: string): string {
  return svg.replaceAll('#212121', color);
}

async function rasterize(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 1600 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function composeIcon(opts: {
  svg: string;
  contentSize: number;
  canvasSize?: number;
  bg: string | null;
  out: string;
}) {
  const canvas = opts.canvasSize ?? ICON;
  const content = await rasterize(opts.svg, opts.contentSize);
  const base = sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: opts.bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  await base.composite([{ input: content, gravity: 'center' }]).png().toFile(opts.out);
  console.log(`wrote ${opts.out}`);
}

const emerald = recolor(SOURCE, EMERALD);
const white = recolor(SOURCE, WHITE);

await composeIcon({ svg: emerald, contentSize: CONTENT, bg: BG_DARK, out: join(OUT, 'icon.png') });
await composeIcon({ svg: emerald, contentSize: CONTENT, bg: null, out: join(OUT, 'android-icon-foreground.png') });
await composeIcon({ svg: white, contentSize: CONTENT, bg: null, out: join(OUT, 'android-icon-monochrome.png') });

await sharp({ create: { width: ICON, height: ICON, channels: 4, background: BG_DARK } })
  .png()
  .toFile(join(OUT, 'android-icon-background.png'));
console.log(`wrote ${join(OUT, 'android-icon-background.png')}`);

await composeIcon({ svg: emerald, contentSize: 620, bg: null, out: join(OUT, 'splash-icon.png') });
await composeIcon({ svg: emerald, contentSize: 36, canvasSize: 48, bg: BG_DARK, out: join(OUT, 'favicon.png') });
