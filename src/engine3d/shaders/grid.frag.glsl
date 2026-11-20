uniform float uGridEnabled;
uniform float uGridSpacingCm;
uniform float uGridSubdivisions;
uniform vec3 uGridColor;
uniform float uGridOpacity;
uniform vec2 uGridCanvasCm;

float spGridLineMask(vec2 posCm, float stepCm, float lineWidthPx) {
  vec2 coord = posCm / max(stepCm, 1e-4);
  vec2 deriv = max(fwidth(coord), vec2(1e-5));
  vec2 dist = abs(fract(coord - 0.5) - 0.5) / deriv;
  float d = min(dist.x, dist.y);
  return 1.0 - clamp(d / max(lineWidthPx, 0.5), 0.0, 1.0);
}

float computeGridOverlayAlpha(vec2 uv) {
  if (uGridEnabled < 0.5 || uGridOpacity <= 0.001) {
    return 0.0;
  }
  vec2 posCm = uv * uGridCanvasCm;
  float majorAlpha = spGridLineMask(posCm, uGridSpacingCm, 1.35);
  float minorAlpha = 0.0;
  if (uGridSubdivisions > 1.5) {
    float minorStepCm = uGridSpacingCm / uGridSubdivisions;
    minorAlpha = spGridLineMask(posCm, minorStepCm, 0.9) * 0.42;
  }
  return clamp(max(majorAlpha, minorAlpha), 0.0, 1.0) * clamp(uGridOpacity, 0.0, 1.0);
}
