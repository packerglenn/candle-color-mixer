const D65 = Object.freeze({ x: 0.95047, y: 1, z: 1.08883 });
const ACHROMATIC_CHROMA_THRESHOLD = 5;
const degrees = (radians) => radians * 180 / Math.PI;
const radians = (angle) => angle * Math.PI / 180;

export function normalizeHex(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
  if (!match) throw new TypeError("Enter a six-digit HEX color.");
  return `#${match[1].toLowerCase()}`;
}

export function hexToRgb(value) {
  const hex = normalizeHex(value).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const channel = (value) => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function hsvToRgb(hue, saturation, value) {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, saturation));
  const v = Math.max(0, Math.min(1, value));
  const chroma = v * s;
  const segment = h / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let prime;
  if (segment < 1) prime = [chroma, x, 0];
  else if (segment < 2) prime = [x, chroma, 0];
  else if (segment < 3) prime = [0, chroma, x];
  else if (segment < 4) prime = [0, x, chroma];
  else if (segment < 5) prime = [x, 0, chroma];
  else prime = [chroma, 0, x];
  const m = v - chroma;
  return { r: (prime[0] + m) * 255, g: (prime[1] + m) * 255, b: (prime[2] + m) * 255 };
}

export function rgbToHsv({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { h: hue, s: maximum === 0 ? 0 : delta / maximum, v: maximum };
}

export function srgbToLab(value) {
  const { r, g, b } = typeof value === "string" ? hexToRgb(value) : value;
  const linearize = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const red = linearize(r);
  const green = linearize(g);
  const blue = linearize(b);
  const x = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = red * 0.0193339 + green * 0.119192 + blue * 0.9503041;
  const f = (component) => component > 216 / 24389
    ? Math.cbrt(component)
    : (841 / 108) * component + 4 / 29;
  const fx = f(x / D65.x);
  const fy = f(y / D65.y);
  const fz = f(z / D65.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE00(lab1, lab2) {
  const c1 = Math.hypot(lab1.a, lab1.b);
  const c2 = Math.hypot(lab2.a, lab2.b);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1Prime = (1 + g) * lab1.a;
  const a2Prime = (1 + g) * lab2.a;
  const c1Prime = Math.hypot(a1Prime, lab1.b);
  const c2Prime = Math.hypot(a2Prime, lab2.b);
  const hue = (b, a) => {
    if (a === 0 && b === 0) return 0;
    const angle = degrees(Math.atan2(b, a));
    return angle >= 0 ? angle : angle + 360;
  };
  const h1Prime = hue(lab1.b, a1Prime);
  const h2Prime = hue(lab2.b, a2Prime);
  const deltaLPrime = lab2.l - lab1.l;
  const deltaCPrime = c2Prime - c1Prime;
  let deltaHuePrime = 0;
  if (c1Prime * c2Prime !== 0) {
    const difference = h2Prime - h1Prime;
    if (Math.abs(difference) <= 180) deltaHuePrime = difference;
    else if (difference > 180) deltaHuePrime = difference - 360;
    else deltaHuePrime = difference + 360;
  }
  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(radians(deltaHuePrime / 2));
  const lBarPrime = (lab1.l + lab2.l) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;
  let hBarPrime = h1Prime + h2Prime;
  if (c1Prime * c2Prime !== 0) {
    const difference = Math.abs(h1Prime - h2Prime);
    if (difference <= 180) hBarPrime = (h1Prime + h2Prime) / 2;
    else if (h1Prime + h2Prime < 360) hBarPrime = (h1Prime + h2Prime + 360) / 2;
    else hBarPrime = (h1Prime + h2Prime - 360) / 2;
  }
  const t = 1
    - 0.17 * Math.cos(radians(hBarPrime - 30))
    + 0.24 * Math.cos(radians(2 * hBarPrime))
    + 0.32 * Math.cos(radians(3 * hBarPrime + 6))
    - 0.20 * Math.cos(radians(4 * hBarPrime - 63));
  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBarPrime ** 7 / (cBarPrime ** 7 + 25 ** 7));
  const sl = 1 + 0.015 * ((lBarPrime - 50) ** 2) / Math.sqrt(20 + ((lBarPrime - 50) ** 2));
  const sc = 1 + 0.045 * cBarPrime;
  const sh = 1 + 0.015 * cBarPrime * t;
  const rt = -Math.sin(radians(2 * deltaTheta)) * rc;
  const lTerm = deltaLPrime / sl;
  const cTerm = deltaCPrime / sc;
  const hTerm = deltaHPrime / sh;
  return Math.sqrt(lTerm ** 2 + cTerm ** 2 + hTerm ** 2 + rt * cTerm * hTerm);
}

export function findNearestScreenTemplate(hex, templates) {
  const targetLab = srgbToLab(hex);
  const targetChroma = Math.hypot(targetLab.a, targetLab.b);
  const anchored = templates.filter((template) => template.screenAnchorHex);
  const targetIsAchromatic = targetChroma < ACHROMATIC_CHROMA_THRESHOLD;
  const candidates = anchored.filter((template) => {
    const anchorLab = srgbToLab(template.screenAnchorHex);
    const anchorIsAchromatic = Math.hypot(anchorLab.a, anchorLab.b) < ACHROMATIC_CHROMA_THRESHOLD;
    return anchorIsAchromatic === targetIsAchromatic;
  });
  return (candidates.length ? candidates : anchored)
    .map((template) => ({
      template,
      deltaE00: deltaE00(targetLab, srgbToLab(template.screenAnchorHex)),
    }))
    .sort((left, right) => left.deltaE00 - right.deltaE00 || left.template.id.localeCompare(right.template.id))[0];
}
