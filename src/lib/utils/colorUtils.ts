const FIXED_PALETTE = [
  '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3',
  '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'
];

export function generateVibrantColor(index: number): string {
  // 1. If the index is within your curated list, return that exact color.
  if (index < FIXED_PALETTE.length) {
    return FIXED_PALETTE[index];
  }

  // 2. If we run out of fixed colors, generate new ones that MATCH the style.
  // We offset the hue to ensure we don't repeat the first color immediately.
  const goldenRatioConjugate = 0.618033988749895;
  
  // Start calculating from the end of the array to maintain spacing
  const adjustedIndex = index - FIXED_PALETTE.length;
  const h = (adjustedIndex * goldenRatioConjugate * 360) % 360;

  // Use fixed constants that mimic the visual weight of your palette
  const s = 60; // Matches the average saturation of your list
  const l = 70; // Matches the average lightness of your list
  
  return hslToHex(h, s, l);
}

/**
 * Converts HSL components to a Hex color string.
 */
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  
  return `#${f(0)}${f(8)}${f(4)}`;
}
