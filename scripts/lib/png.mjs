// Minimal dependency-free PNG toolkit for generating the committed brand
// assets (app icons and the social share card). Renders RGBA in memory,
// downsamples a 2x supersample for antialiasing, and emits a standard
// 8-bit RGBA PNG with zlib. Deliberately small: rounded rectangles, one
// scanline polygon fill and a blocky 5x7 bitmap font are all the brand
// assets need. Regenerate with `npm run brand:assets`.

import zlib from 'node:zlib';

// ---------------------------------------------------------------------------
// PNG encoding

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encode a Canvas as a PNG buffer (RGBA, 8-bit, no interlace). */
export function encodePng(canvas) {
  const { width, height, pixels } = canvas;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing

function hexToRgba(hex, alpha = 255) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

export class Canvas {
  constructor(width, height, background = '#00000000') {
    this.width = width;
    this.height = height;
    this.pixels = Buffer.alloc(width * height * 4);
    const [r, g, b, a] = typeof background === 'string' ? hexToRgba(background) : background;
    if (a > 0) {
      for (let i = 0; i < width * height; i += 1) {
        this.pixels[i * 4] = r;
        this.pixels[i * 4 + 1] = g;
        this.pixels[i * 4 + 2] = b;
        this.pixels[i * 4 + 3] = a;
      }
    }
  }

  /** Alpha-over blend a single pixel. Coordinates are clamped. */
  setPixel(x, y, [r, g, b, a]) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const dstA = this.pixels[i + 3] / 255;
    const srcA = a / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;
    const blend = (src, dst) => Math.round((src * srcA + dst * dstA * (1 - srcA)) / outA);
    this.pixels[i] = blend(r, this.pixels[i]);
    this.pixels[i + 1] = blend(g, this.pixels[i + 1]);
    this.pixels[i + 2] = blend(b, this.pixels[i + 2]);
    this.pixels[i + 3] = Math.round(outA * 255);
  }

  fillRect(x, y, w, h, color) {
    const [r, g, b, a] = Array.isArray(color) ? color : hexToRgba(color);
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, Math.ceil(y + h)); py += 1) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, Math.ceil(x + w)); px += 1) {
        this.setPixel(px, py, [r, g, b, a]);
      }
    }
  }

  fillRoundedRect(x, y, w, h, radius, color) {
    const [r, g, b, a] = hexToRgba(color);
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
      for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) {
        const dx = Math.max(Math.abs(px + 0.5 - cx) - (w / 2 - radius), 0);
        const dy = Math.max(Math.abs(py + 0.5 - cy) - (h / 2 - radius), 0);
        if (dx * dx + dy * dy <= radius * radius) this.setPixel(px, py, [r, g, b, a]);
      }
    }
  }

  /** Even-odd scanline fill of a closed polygon ([[x, y], ...]). */
  fillPolygon(points, color) {
    const [r, g, b, a] = hexToRgba(color);
    const ys = points.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y += 1) {
      const cy = y + 0.5;
      const crossings = [];
      for (let i = 0; i < points.length; i += 1) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
          crossings.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
        }
      }
      crossings.sort((m, n) => m - n);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.ceil(crossings[k] - 0.5));
        const to = Math.min(this.width - 1, Math.floor(crossings[k + 1] - 0.5));
        for (let px = from; px <= to; px += 1) this.setPixel(px, y, [r, g, b, a]);
      }
    }
  }

  fillCircle(cx, cy, radius, color) {
    const [r, g, b, a] = hexToRgba(color);
    for (let py = Math.floor(cy - radius); py <= Math.ceil(cy + radius); py += 1) {
      for (let px = Math.floor(cx - radius); px <= Math.ceil(cx + radius); px += 1) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        if (dx * dx + dy * dy <= radius * radius) this.setPixel(px, py, [r, g, b, a]);
      }
    }
  }

  /** Render at `factor` times the size, then box-downsample for antialiasing. */
  static supersampled(factor, width, height, background, draw) {
    const big = new Canvas(width * factor, height * factor, background);
    draw(big, factor);
    return big.downsample(factor);
  }

  downsample(factor) {
    const out = new Canvas(Math.floor(this.width / factor), Math.floor(this.height / factor));
    for (let y = 0; y < out.height; y += 1) {
      for (let x = 0; x < out.width; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < factor; sy += 1) {
          for (let sx = 0; sx < factor; sx += 1) {
            const i = ((y * factor + sy) * this.width + x * factor + sx) * 4;
            const alpha = this.pixels[i + 3] / 255;
            r += this.pixels[i] * alpha;
            g += this.pixels[i + 1] * alpha;
            b += this.pixels[i + 2] * alpha;
            a += alpha;
          }
        }
        const i = (y * out.width + x) * 4;
        if (a > 0) {
          out.pixels[i] = Math.round(r / a);
          out.pixels[i + 1] = Math.round(g / a);
          out.pixels[i + 2] = Math.round(b / a);
        }
        out.pixels[i + 3] = Math.round((a / (factor * factor)) * 255);
      }
    }
    return out;
  }

  toPng() {
    return encodePng(this);
  }
}

// ---------------------------------------------------------------------------
// Blocky 5x7 bitmap font (matches the squared-off favicon lettering)

const FONT_5X7 = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x11, 0x0a, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  0: [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  1: [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  2: [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  3: [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  4: [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  5: [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  6: [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  7: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  8: [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  9: [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  '-': [0x00, 0x00, 0x00, 0x0e, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  '\u00b7': [0x00, 0x00, 0x0c, 0x0c, 0x00, 0x00, 0x00],
};

/** Width in cells (5) plus tracking; spaces collapse to tracking + 4 cells. */
export function measureText(text, scale, tracking = 1) {
  const cells = [...String(text)].reduce(
    (sum) => sum + 5 + tracking,
    -tracking,
  );
  return cells * scale;
}

export function drawText(canvas, text, x, y, scale, color, tracking = 1) {
  let cursor = x;
  for (const char of String(text).toUpperCase()) {
    const glyph = FONT_5X7[char];
    if (glyph) {
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (glyph[row] & (0x10 >> col)) {
            canvas.fillRect(cursor + col * scale, y + row * scale, scale, scale, color);
          }
        }
      }
    }
    cursor += (5 + tracking) * scale;
  }
  return cursor - tracking * scale;
}
