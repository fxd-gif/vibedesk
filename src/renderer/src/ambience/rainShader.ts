// Regen auf einer Fensterscheibe – eigener WebGL2-Shader.
// Prinzip: Tropfen (stehend + ablaufend mit Spur) liefern pro Pixel einen Brechungs-Offset und eine Maske.
// In Tropfen wird die scharfe Szene verschoben/gespiegelt gesampelt (Linse), außerhalb die unscharfe,
// beschlagene Szene; ablaufende Tropfen wischen den Beschlag in ihrer Spur weg.

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSharp;
uniform sampler2D uBlur;
uniform vec2 uRes;
uniform float uTime;
uniform float uRain;    // 0..1
uniform float uBlurAmt; // 0..1
in vec2 vUv;
out vec4 outColor;

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 h31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

// Kleine stehende Tröpfchen. Rückgabe: xy = Offset, z = Maske
vec3 staticDrops(vec2 p, float t, float density) {
  vec2 grid = vec2(34.0);
  vec2 st = p * grid;
  vec2 id = floor(st);
  vec2 gv = fract(st) - 0.5;
  vec3 n = h31(id.x * 107.45 + id.y * 3543.654);
  vec2 c = (n.xy - 0.5) * 0.4;
  vec2 d = gv - c;
  float r = 0.08 + n.z * 0.2;
  float life = fract(t * 0.05 + n.z * 13.0);
  float fade = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.85, life);
  float exists = step(h11(n.x * 91.7 + n.y), density);
  float m = smoothstep(r, r * 0.55, length(d)) * fade * exists;
  return vec3(d / r * m, m);
}

// Ablaufende Tropfen mit Spur. Rückgabe: xy = Offset, z = Maske, w = Beschlag weggewischt
vec4 runningDrops(vec2 p, float t, float scale, float aspect) {
  vec2 grid = vec2(8.0, 2.0) * scale;
  vec2 st = p * grid;
  float col = floor(st.x);
  float colN = h11(col * 13.17 + scale * 7.0);
  st.y -= t * (0.18 + colN * 0.12);          // Gitter wandert nach unten
  st.y += colN * 3.0;
  vec2 id = floor(st);
  vec3 n = h31(id.x * 35.2 + id.y * 2376.1 + scale * 13.0);
  vec2 gv = fract(st) - 0.5;

  // Stick-Slip: der Tropfen hängt kurz und rutscht dann
  float ti = fract(t * 0.35 + n.z) * 6.2831;
  float y = -sin(ti + sin(ti + sin(ti) * 0.5)) * 0.34;
  float x = (n.x - 0.5) * 0.3 + sin(p.y * 22.0 + n.y * 6.0) * 0.06;
  // Abstand in isotropen Einheiten
  vec2 du = vec2((gv.x - x) / grid.x, (gv.y - y) / grid.y);
  du.y *= 1.0 + 0.25 * smoothstep(0.0, 1.0, gv.y - y); // leicht tropfenförmig
  float r = (0.024 + n.y * 0.018) / scale;
  float exists = step(0.25, n.x * 0.5 + n.y * 0.5);
  float m = smoothstep(r, r * 0.6, length(du)) * exists;

  // Spur aus kleinen Resttropfen oberhalb
  float above = smoothstep(-0.02, 0.08, y - gv.y);
  float tRow = floor(gv.y * 9.0 * scale);
  float tn = h11(id.y * 9.1 + id.x * 3.7 + tRow);
  float tY = fract(gv.y * 9.0 * scale) - 0.5 + (tn - 0.5) * 0.5;
  vec2 tu = vec2((gv.x - x + (tn - 0.5) * 0.06) / grid.x, tY / (grid.y * 9.0 * scale));
  float tr = r * (0.18 + tn * 0.2);
  float trailFade = above * smoothstep(0.5, y, gv.y) * exists;
  float tm = smoothstep(tr, tr * 0.5, length(tu)) * trailFade * step(0.72, tn) * smoothstep(0.0, 0.5, 1.0 - (y - gv.y));

  // Beschlag-freie Bahn
  float upDist = clamp((y - gv.y), 0.0, 1.0);
  float clear = smoothstep(r * 0.7, r * 0.15, abs(du.x)) * above * (1.0 - smoothstep(0.0, 0.85, upDist)) * smoothstep(-0.5, -0.3, gv.y) * exists;

  vec2 off = du / r * m + tu / tr * tm;
  return vec4(off, max(m, tm), clear);
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(vUv.x * aspect, vUv.y);
  float t = uTime;
  float rain = uRain;

  vec3 s = staticDrops(p, t, rain * 0.32);
  vec4 r1 = rain > 0.02 ? runningDrops(p, t, 1.0, aspect) : vec4(0.0);
  vec4 r2 = rain > 0.35 ? runningDrops(p * 1.0 + vec2(1.37, 0.0), t * 1.1, 1.85, aspect) : vec4(0.0);
  r2 *= smoothstep(0.35, 0.7, rain);
  r1 *= smoothstep(0.02, 0.25, rain);

  float mask = clamp(max(s.z, max(r1.z, r2.z)), 0.0, 1.0);
  vec2 off = s.xy * 0.6 + r1.xy + r2.xy;
  float clearFog = clamp(r1.w + r2.w, 0.0, 1.0);

  // Hintergrund: beschlagene, unscharfe Scheibe – in Wischspuren klarer
  float blurMix = clamp(uBlurAmt * (1.0 - clearFog * 0.45), 0.0, 1.0);
  vec3 sharp = texture(uSharp, vUv).rgb;
  vec3 blurred = texture(uBlur, vUv).rgb;
  vec3 bg = mix(sharp, blurred, blurMix);
  bg = mix(bg, bg * 0.92 + vec3(0.025, 0.03, 0.04), uBlurAmt * (1.0 - clearFog)); // Kondensat

  // Tropfen: Linse zeigt die Szene scharf, verschoben und gespiegelt
  vec2 lensUv = vUv - vec2(off.x / aspect, off.y) * 0.045 + vec2(0.0, 0.0);
  vec3 drop = mix(texture(uSharp, lensUv).rgb, texture(uBlur, lensUv).rgb, 0.45) * 1.25 + 0.015;
  float rim = smoothstep(0.55, 1.0, length(off)) * mask;
  drop *= 1.0 - rim * 0.3;
  float spec = smoothstep(0.32, 0.0, length(off - vec2(-0.32, -0.42))) * mask;

  vec3 col = mix(bg, drop, mask) + spec * 0.12;
  // Vignette
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  outColor = vec4(col, 1.0);
}`
