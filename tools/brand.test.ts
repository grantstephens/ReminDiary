import fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PNG } = require('pngjs') as { PNG: { sync: { read: (b: Buffer) => { width: number; height: number; data: Buffer } } } };
import path from 'path';

import { contrastRatio } from '../src/contrast';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/** PNG IHDR: width@16, height@20 (big-endian), colour type@25. */
function png(p: string) {
  const b = fs.readFileSync(path.join(root, p));
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

describe('icon config', () => {
  const app = JSON.parse(read('app.json')).expo;

  test('adaptive icon background is the icon olive', () => {
    expect(app.android.adaptiveIcon.backgroundColor).toBe('#6B7B4E');
  });
  test('splash background is the icon olive (charcoal dropped)', () => {
    expect(app.splash.backgroundColor).toBe('#6B7B4E');
  });
});

describe('icon assets', () => {
  test.each([
    ['assets/icon.png', 1024],
    ['assets/android-icon-foreground.png', 1024],
    ['assets/android-icon-monochrome.png', 1024],
    ['assets/splash-icon.png', 1024],
    ['assets/favicon.png', 48],
    ['fastlane/metadata/android/en-US/images/icon.png', 512],
  ])('%s is %i square', (file, size) => {
    const { width, height } = png(file);
    expect([width, height]).toEqual([size, size]);
  });

  test.each(['assets/android-icon-foreground.png', 'assets/android-icon-monochrome.png'])(
    '%s is transparent RGBA so the launcher mask shows no square',
    (file) => {
      expect(png(file).colorType).toBe(6);
    },
  );

  test('icon.svg uses the olive background and has no card/numeral leftovers', () => {
    const svg = read('assets/icon.svg');
    expect(svg).toContain('#6B7B4E');
    expect(svg.toLowerCase()).not.toMatch(/numeral|card/);
  });
});

describe('adaptive icon layers', () => {
  // Android's adaptive-icon safe zone is a 66dp circle of the 108dp canvas: r = 313 on 1024.
  test.each(['assets/android-icon-foreground.png', 'assets/android-icon-monochrome.png'])(
    '%s is transparent at the corners and its artwork stays inside the safe zone',
    (file) => {
      const img = PNG.sync.read(fs.readFileSync(path.join(root, file)));
      expect(img.data[3]).toBe(0); // top-left pixel alpha
      let far = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (img.data[(y * img.width + x) * 4 + 3] > 8) {
            far = Math.max(far, Math.hypot(x + 0.5 - img.width / 2, y + 0.5 - img.height / 2));
          }
        }
      }
      expect(far).toBeLessThanOrEqual(313);
    },
  );
});

describe('contrastRatio', () => {
  test('cream on icon olive is about 4.0:1', () => {
    expect(Math.abs(contrastRatio('#F4EFE6', '#6B7B4E') - 4.0)).toBeLessThan(0.05);
  });
});

describe('theme discipline', () => {
  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && e.name !== 'palette.ts' ? [full] : [];
    });
  }

  test('no hardcoded colours in src/ bypass the theme', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(root, 'src'))) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bMD3(Light|Dark)Theme\b/.test(line)) {
            offenders.push(`${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe('marketing site', () => {
  const pages = ['site/index.html', 'site/privacy/index.html', 'site/import/index.html'];

  function vars(block: string): Record<string, string> {
    return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
  }
  function tokens(html: string) {
    const light = html.match(/:root\s*{([^}]*)}/)![1];
    const dark = html.match(/prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{([^}]*)}/)![1];
    return { light: vars(light), dark: vars(dark) };
  }

  test.each(pages)('%s uses the brand tokens and no leftover blue/charcoal hero', (page) => {
    const html = read(page);
    expect(html).not.toMatch(/#0a84ff/i);
    expect(html).not.toMatch(/--hero:\s*#2e2a26/i);
    const { light, dark } = tokens(html);
    expect(light['--accent']).toBe('#55633C');
    expect(dark['--accent']).toBe('#B7C4A0');
    expect(light['--bg']).toBe('#FBF7EF');
    expect(dark['--bg']).toBe('#221F1B');
    expect(html).toContain('<link rel="icon" href="/favicon.png">');
  });

  test.each(pages)('%s text, muted text and links keep their contrast in both modes', (page) => {
    const { light, dark } = tokens(read(page));
    for (const t of [light, dark]) {
      expect(contrastRatio(t['--text'], t['--bg'])).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t['--text-muted'], t['--bg'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['--text-muted'], t['--surface'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['--accent'], t['--bg'])).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('home page hero is deep olive with readable text', () => {
    const html = read('site/index.html');
    const { light } = tokens(html);
    expect(light['--hero']).toBe('#55633C');
    expect(contrastRatio(light['--hero-text'], light['--hero'])).toBeGreaterThanOrEqual(4.5);
    const pColour = html.match(/\.hero p\s*{[^}]*color:\s*(#[0-9a-fA-F]{6})/)![1];
    expect(contrastRatio(pColour, light['--hero'])).toBeGreaterThanOrEqual(4.5);
  });

  test('site favicon exists and is 48 square', () => {
    const { width, height } = png('site/favicon.png');
    expect([width, height]).toEqual([48, 48]);
  });
});
