uniform sampler2D uColorMap;
uniform sampler2D uHeightMap;
uniform sampler2D uOpacityMap;
uniform int uMode; // 0=color, 1=heightGray, 2=heightHeat, 3=heightTopo, 4=opacity
uniform float uMinMm;
uniform float uMaxMm;
uniform float uContourStepMm;

varying vec2 vUv;

void main() {
  if (uMode == 0) {
    vec4 texel = texture2D(uColorMap, vUv);
    gl_FragColor = vec4(texel.rgb, 1.0);
    #include <colorspace_fragment>
    return;
  }

  if (uMode == 4) {
    float o = clamp(texture2D(uOpacityMap, vUv).r, 0.0, 1.0);
    gl_FragColor = vec4(vec3(o), 1.0);
    return;
  }

  float h = clamp(texture2D(uHeightMap, vUv).r, 0.0, 1.0);
  if (uMode == 1) {
    gl_FragColor = vec4(vec3(h), 1.0);
    return;
  }

  if (uMode == 2) {
    gl_FragColor = vec4(turboColormap(h), 1.0);
    return;
  }

  vec3 topo = topoColormap(h);
  float mm = mix(uMinMm, uMaxMm, h);
  float stepMm = max(0.05, uContourStepMm);
  float phase = mm / stepMm;
  float fw = max(fwidth(phase), 1e-4);
  float distToLine = abs(fract(phase - 0.5) - 0.5) / fw;
  float contour = 1.0 - smoothstep(0.0, 1.25, distToLine);
  topo = mix(topo, vec3(0.05, 0.05, 0.07), contour * 0.72);
  gl_FragColor = vec4(topo, 1.0);
}
