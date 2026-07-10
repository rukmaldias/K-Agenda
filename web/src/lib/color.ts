// Picks readable text color (near-black or white) against a given fill,
// by WCAG relative luminance -- used so badges filled with the user's own
// org-todo-keyword-faces color (arbitrary, not chosen for contrast) still
// read clearly regardless of how light or dark that color is.

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const value = Number.parseInt(clean, 16);
  if (Number.isNaN(value)) return null;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const l = relativeLuminance(rgb);
  const contrastWithBlack = contrastRatio(l, 0);
  const contrastWithWhite = contrastRatio(l, 1);
  return contrastWithBlack >= contrastWithWhite ? "#14141a" : "#ffffff";
}
