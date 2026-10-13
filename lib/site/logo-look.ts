/**
 * Whether a partner logo needs a light plate behind it on the dark site. Only a logo with a transparent border whose
 * visible part has almost nothing light in it (black or navy lettering) gets one. A logo with a dark body but a
 * bright outline, light lettering or a coloured mark (an orange ring, white text) shows fine on black as it is.
 * `data` is RGBA of an n×n thumbnail (canvas getImageData).
 */
export function logoNeedsLightPlate(data: ArrayLike<number>, n: number): boolean {
  let edge = 0;
  let clearEdge = 0;
  let weight = 0;
  let bright = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const a = data[i + 3] / 255;
      if (x === 0 || y === 0 || x === n - 1 || y === n - 1) {
        edge++;
        if (a < 0.6) clearEdge++;
      }
      weight += a;
      // Its brightest channel: a saturated orange or a white letter reads on black; navy and black do not.
      if (Math.max(data[i], data[i + 1], data[i + 2]) > 140) bright += a;
    }
  }
  if (edge === 0 || weight === 0) return false;
  const transparentBorder = clearEdge / edge > 0.5;
  return transparentBorder && bright / weight < 0.12;
}
