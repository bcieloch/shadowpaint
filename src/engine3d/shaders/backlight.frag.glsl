uniform sampler2D uHeight;
uniform sampler2D uOpacity;
uniform float uMinMm;
uniform float uMaxMm;
uniform float uMuA;
uniform float uMuS;
uniform float uKTint;
uniform float uTauCanvas;
uniform float uKAtt;
uniform float uG;
uniform vec3 uBackPos;
uniform vec3 uBackColor;
uniform float uBackIntensity;
uniform int uBackType;
uniform float uBackScale;
uniform float uScatterRadiusTex;
varying vec3 vPaintWorldPos;

vec3 computeBackLightContribution(vec2 uv, vec3 baseColorLinear, vec3 worldPos) {
  if (uBackScale <= 0.0 || uBackIntensity <= 0.0 || uG <= 0.0) {
    return vec3(0.0);
  }
  float h = clamp(texture2D(uHeight, uv).r, 0.0, 1.0);
  float tauP = clamp(texture2D(uOpacity, uv).r, 0.0, 1.0);
  if (tauP <= 0.0 || uTauCanvas <= 0.0) {
    return vec3(0.0);
  }

  float d = max(0.0, uMinMm + h * (uMaxMm - uMinMm));
  vec3 alpha = max(
    vec3(0.0),
    uMuA * mix(vec3(1.0), vec3(1.0) - 0.95 * clamp(baseColorLinear, 0.0, 1.0), clamp(uKTint, 0.0, 1.0))
  );
  float muS = max(0.0, uMuS);
  float A = max(0.0, uKAtt);
  float tauBase = max(0.0, uG) * clamp(uTauCanvas, 0.0, 1.0) * tauP;

  vec3 tDir = tauBase * exp(-A * (alpha + muS) * d);
  vec3 tScat = tauBase * exp(-A * alpha * d) * (1.0 - exp(-A * muS * d)) * 0.5;
  vec3 T = tDir + tScat;

  vec3 E = max(0.0, uBackIntensity) * uBackColor;
  if (uBackType == 0) {
    vec3 dir = worldPos - uBackPos;
    float distSq = max(1e-4, dot(dir, dir));
    float zb = max(0.01, abs(uBackPos.z));
    float cosTheta = max(0.0, dir.z / sqrt(distSq));
    E *= ((zb * zb) / distSq) * cosTheta;
  }

  return E * T * uBackScale;
}
