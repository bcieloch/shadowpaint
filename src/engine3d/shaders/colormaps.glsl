vec3 turboColormap(float t) {
  float x = clamp(t, 0.0, 1.0);
  vec4 v4 = vec4(1.0, x, x * x, x * x * x);
  vec2 v2 = v4.zw * v4.z;
  float r = dot(v4, vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234)) +
            dot(v2, vec2(-152.94239396, 59.28637943));
  float g = dot(v4, vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333)) +
            dot(v2, vec2(4.27729857, 2.82956604));
  float b = dot(v4, vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771)) +
            dot(v2, vec2(-89.90310912, 27.34824973));
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 topoColormap(float t) {
  float x = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.08, 0.19, 0.36);
  vec3 c1 = vec3(0.13, 0.45, 0.52);
  vec3 c2 = vec3(0.32, 0.68, 0.42);
  vec3 c3 = vec3(0.85, 0.78, 0.42);
  vec3 c4 = vec3(0.76, 0.41, 0.24);
  vec3 c5 = vec3(0.96, 0.95, 0.94);

  if (x < 0.2) return mix(c0, c1, x / 0.2);
  if (x < 0.45) return mix(c1, c2, (x - 0.2) / 0.25);
  if (x < 0.68) return mix(c2, c3, (x - 0.45) / 0.23);
  if (x < 0.86) return mix(c3, c4, (x - 0.68) / 0.18);
  return mix(c4, c5, (x - 0.86) / 0.14);
}
