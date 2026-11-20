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
  float tauCanvasG = max(0.0, uG) * clamp(uTauCanvas, 0.0, 1.0);
  float tauBase = tauCanvasG * tauP;

  vec3 tDir = tauBase * exp(-A * (alpha + muS) * d);
  vec3 tScat = tauBase * exp(-A * alpha * d) * (1.0 - exp(-A * muS * d)) * 0.5;
  vec3 tScatBlurred = tScat;

  if (uScatterRadiusTex > 0.001 && muS > 0.0) {
    vec2 radiusUv = uScatterRadiusTex * uTexelSize;
    vec2 poissonDisk[12];
    poissonDisk[0] = vec2(-0.326, -0.406);
    poissonDisk[1] = vec2(-0.840, -0.074);
    poissonDisk[2] = vec2(-0.696, 0.457);
    poissonDisk[3] = vec2(-0.203, 0.621);
    poissonDisk[4] = vec2(0.962, -0.195);
    poissonDisk[5] = vec2(0.473, -0.480);
    poissonDisk[6] = vec2(0.519, 0.767);
    poissonDisk[7] = vec2(0.185, -0.893);
    poissonDisk[8] = vec2(0.507, 0.064);
    poissonDisk[9] = vec2(0.896, 0.412);
    poissonDisk[10] = vec2(-0.322, -0.933);
    poissonDisk[11] = vec2(-0.792, -0.598);

    vec3 scatAcc = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      vec2 suv = clamp(uv + poissonDisk[i] * radiusUv, vec2(0.0), vec2(1.0));
      float sh = clamp(texture2D(uHeight, suv).r, 0.0, 1.0);
      float stauP = clamp(texture2D(uOpacity, suv).r, 0.0, 1.0);
      float sd = max(0.0, uMinMm + sh * (uMaxMm - uMinMm));
      scatAcc += stauP * exp(-A * alpha * sd) * (1.0 - exp(-A * muS * sd));
    }
    tScatBlurred = tauCanvasG * (scatAcc / 12.0) * 0.5;
  }

  vec3 T = tDir + tScatBlurred;

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
