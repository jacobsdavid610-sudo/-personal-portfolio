#!/usr/bin/env node
// Convert colors between hex, RGB, and HSL. No dependencies.

/**
 * Parses a hex color string ("#rgb", "#rrggbb", with or without the
 * leading #) into { r, g, b } (0-255 each).
 */
function hexToRgb(hex) {
  const clean = hex.replace(/^#/, "");
  let full;
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    full = clean.split("").map((c) => c + c).join("");
  } else if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    full = clean;
  } else {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function assertByte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must be an integer 0-255, got ${value}`);
  }
}

/**
 * Formats { r, g, b } (0-255 each) as a lowercase "#rrggbb" hex string.
 */
function rgbToHex({ r, g, b }) {
  assertByte(r, "r");
  assertByte(g, "g");
  assertByte(b, "b");
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts { r, g, b } (0-255 each) to { h, s, l } (h in degrees 0-360,
 * s and l as percentages 0-100).
 */
function rgbToHsl({ r, g, b }) {
  assertByte(r, "r");
  assertByte(g, "g");
  assertByte(b, "b");

  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Converts { h, s, l } (h in degrees, s/l as percentages) to { r, g, b }
 * (0-255 each, rounded).
 */
function hslToRgb({ h, s, l }) {
  const hn = ((h % 360) + 360) % 360;
  const sn = s / 100;
  const ln = l / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let rp, gp, bp;
  if (hn < 60) [rp, gp, bp] = [c, x, 0];
  else if (hn < 120) [rp, gp, bp] = [x, c, 0];
  else if (hn < 180) [rp, gp, bp] = [0, c, x];
  else if (hn < 240) [rp, gp, bp] = [0, x, c];
  else if (hn < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

module.exports = { hexToRgb, rgbToHex, rgbToHsl, hslToRgb };

if (require.main === module) {
  const [format, value] = process.argv.slice(2);
  const usage = () => {
    console.error("Usage: colorconvert.js <hex|rgb|hsl> <value>");
    console.error('  hex:  colorconvert.js hex "#3498db"');
    console.error('  rgb:  colorconvert.js rgb "52,152,219"');
    console.error('  hsl:  colorconvert.js hsl "204,70,53"');
    process.exit(2);
  };

  if (!format || !value) usage();

  try {
    let rgb;
    if (format === "hex") {
      rgb = hexToRgb(value);
    } else if (format === "rgb") {
      const [r, g, b] = value.split(",").map((n) => parseInt(n.trim(), 10));
      rgb = { r, g, b };
      assertByte(rgb.r, "r");
    } else if (format === "hsl") {
      const [h, s, l] = value.split(",").map((n) => parseInt(n.trim(), 10));
      rgb = hslToRgb({ h, s, l });
    } else {
      usage();
    }

    const hsl = rgbToHsl(rgb);
    console.log(`hex: ${rgbToHex(rgb)}`);
    console.log(`rgb: ${rgb.r}, ${rgb.g}, ${rgb.b}`);
    console.log(`hsl: ${hsl.h}, ${hsl.s}%, ${hsl.l}%`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
