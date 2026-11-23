import * as THREE from 'three';

/** Uniforms shared by every world material (time, wind, night glow). */
export const shared = {
  uTime: { value: 0 },
  uWind: { value: 0.15 },
  uGlow: { value: 0.2 },
};

/**
 * Lambert material with vertex colours, wind sway (aSway) and emissive glow (aGlow).
 * Used by terrain, flora, creatures and landmarks so the whole world reads as one style.
 */
export function createWorldMaterial(opts = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uWind = shared.uWind;
    sh.uniforms.uGlow = shared.uGlow;
    sh.vertexShader = 'attribute float aSway;\nattribute float aGlow;\nvarying float vGlow;\nuniform float uTime;\nuniform float uWind;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlow = aGlow;
        if (aSway > 0.0) {
          vec4 wpS = modelMatrix * vec4(transformed, 1.0);
          float ph = uTime * 1.7 + wpS.x * 0.21 + wpS.z * 0.17;
          transformed.x += sin(ph) * aSway * uWind;
          transformed.z += cos(ph * 0.83) * aSway * uWind * 0.6;
        }`);
    sh.fragmentShader = 'varying float vGlow;\nuniform float uGlow;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vColor.rgb * vGlow * uGlow;`);
  };
  m.customProgramCacheKey = () => 'froopy-world-' + (opts.side ?? 0);
  return m;
}

const HSV = `
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
`;

export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSky: { value: new THREE.Color('#9fd4ff') }, uLake: { value: new THREE.Color('#5aa0d8') },
      uDay: { value: 1 }, uCam: { value: new THREE.Vector3() }, uHue: { value: 0 }, uSat: { value: 1 }, uFlowMul: { value: 1 },
    }]),
    vertexShader: `
      attribute float aRiver; attribute vec2 aFlow;
      varying float vRiver; varying vec2 vFlow; varying vec3 vWorld;
      uniform float uTime;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.3 + uTime * 1.5) * 0.05 + cos(wp.z * 0.27 + uTime * 1.2) * 0.05;
        vWorld = wp.xyz; vRiver = aRiver; vFlow = aFlow;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSky; uniform vec3 uLake; uniform float uDay; uniform vec3 uCam;
      uniform float uHue; uniform float uSat; uniform float uFlowMul;
      varying float vRiver; varying vec2 vFlow; varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${HSV}
      void main() {
        float a = abs(vRiver);
        float riverMask = 1.0 - smoothstep(1.0, 1.6, a);
        vec2 fl = normalize(vFlow + vec2(1e-4));
        float along = dot(vWorld.xz, fl);
        float t = uTime * uFlowMul;
        float hue = fract(vRiver * 0.4 + 0.5 + uHue + sin(along * 0.05 - t * 0.5) * 0.04);
        vec3 rainbow = hsv2rgb(vec3(hue, 0.72 * uSat, 1.0));
        float streak = smoothstep(0.75, 1.0, sin(along * 0.7 - t * 5.0 + vRiver * 2.0 + sin(vWorld.x * 0.3) ) * 0.5 + 0.5);
        rainbow += streak * 0.3;
        vec3 lake = uLake + 0.12 * sin(vec3(0.0, 2.0, 4.0) + vWorld.x * 0.05 + vWorld.z * 0.04 + uTime * 0.3);
        vec3 col = mix(lake, rainbow, riverMask);
        vec3 V = normalize(uCam - vWorld);
        float fres = pow(1.0 - max(V.y, 0.0), 3.0);
        col = mix(col, uSky, fres * mix(0.12, 0.4, uDay));
        vec2 sc = vWorld.xz * 1.5;
        float sh = hash13(vec3(floor(sc), floor(uTime * 2.0)));
        float sparkle = step(0.985, sh) * smoothstep(0.35, 0.0, length(fract(sc) - 0.5)) * mix(0.4, 0.9, uDay);
        col *= mix(0.3, 1.0, uDay);
        col += sparkle;
        col += rainbow * riverMask * 0.35 * (1.0 - uDay);
        gl_FragColor = vec4(col, mix(0.8, 0.93, riverMask));
        #include <fog_fragment>
      }`,
  });
}

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunColor: { value: new THREE.Color(1, 0.9, 0.7) }, uNight: { value: 0 }, uTime: { value: 0 },
      uSeam: { value: 0.2 }, uSeamColor: { value: new THREE.Color('#7fffe0') }, uBlink: { value: 1 }, uOvercast: { value: 0 },
      uFlash: { value: 0 }, uMoonLook: { value: new THREE.Vector2() },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uMoonDir, uSunColor, uSeamColor;
      uniform float uNight, uTime, uSeam, uBlink, uOvercast, uFlash; uniform vec2 uMoonLook;
      varying vec3 vDir;
      ${HSV}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.6, h));
        col = mix(col, uBottom, smoothstep(0.0, -0.3, h));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 10.0) * 0.3) * (1.0 - uOvercast * 0.85);
        // stars
        if (uNight > 0.01 && h > -0.05) {
          vec3 sp = d * 260.0;
          vec3 cell = floor(sp);
          float r = hash13(cell);
          float star = step(0.986, r) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5));
          float tw = 0.6 + 0.4 * sin(uTime * 3.0 + r * 100.0);
          col += hsv2rgb(vec3(r * 7.0, 0.35, 1.0)) * star * tw * uNight * (1.0 - uOvercast);
        }
        // the moon is an eye
        float md = dot(d, uMoonDir);
        if (md > 0.99) {
          vec3 mU = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.001)));
          vec3 mV = cross(mU, uMoonDir);
          vec2 p = vec2(dot(d, mU), dot(d, mV)) / 0.075;
          float rr = length(p);
          if (rr < 1.0) {
            vec3 moon = vec3(0.95, 0.93, 0.85) - 0.12 * step(0.8, hash13(floor(vec3(p * 6.0, 1.0))));
            float lid = 0.42 * (1.0 - p.x * p.x) * uBlink;
            if (abs(p.y) < lid) {
              moon = vec3(1.0, 0.98, 0.96);
              float ir = length(p - uMoonLook * 0.35);
              if (ir < 0.3) moon = mix(vec3(0.9, 0.3, 0.6), vec3(0.4, 0.1, 0.5), ir / 0.3);
              if (ir < 0.12) moon = vec3(0.02);
            }
            float vis = smoothstep(1.0, 0.95, rr) * smoothstep(-0.1, 0.05, uMoonDir.y);
            col = mix(col, moon * (0.5 + 0.5 * uNight), vis * (1.0 - uOvercast * 0.7));
          } else {
            col += vec3(0.6, 0.5, 0.8) * smoothstep(1.6, 1.0, rr) * 0.15 * uNight;
          }
        }
        // the sky has seams: this is a constructed place
        float lon = atan(d.z, d.x) * 7.6394; // 24 / pi
        float lat = asin(clamp(d.y, -1.0, 1.0)) * 7.6394;
        float gl = max(smoothstep(0.035, 0.0, abs(fract(lon) - 0.5) - 0.465), smoothstep(0.035, 0.0, abs(fract(lat) - 0.5) - 0.465));
        float shimmer = 0.5 + 0.5 * sin(uTime * 0.7 + lon * 0.5 + lat);
        col += uSeamColor * gl * uSeam * shimmer * smoothstep(-0.02, 0.15, h) * (1.0 - smoothstep(0.55, 0.85, h));
        col = mix(col, vec3(dot(col, vec3(0.33))) * 0.9, uOvercast * 0.6);
        col += vec3(0.8, 0.85, 1.0) * uFlash;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function createBoundaryMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color('#6effd8') } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uPlayer; uniform vec3 uColor; varying vec3 vW;
      void main(){
        float a = atan(vW.z, vW.x) * 120.0;
        vec2 g = vec2(a, vW.y * 0.25);
        vec2 f = abs(fract(g) - 0.5);
        float line = smoothstep(0.44, 0.5, max(f.x, f.y));
        float d = distance(vW.xz, uPlayer.xz);
        float near = smoothstep(140.0, 10.0, d);
        float scan = smoothstep(0.96, 1.0, sin(vW.y * 0.1 - uTime * 1.5) * 0.5 + 0.5);
        float fadeUp = smoothstep(260.0, 60.0, vW.y - uPlayer.y) ;
        float alpha = (line * 0.65 + 0.06 + scan * 0.4) * (near * 0.9 + 0.1) * fadeUp;
        gl_FragColor = vec4(uColor * alpha, alpha);
      }`,
  });
}

export function createPortalMaterial(hue = 0.75) {
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { uTime: shared.uTime, uHue: { value: hue } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform float uHue; varying vec2 vUv;
      ${HSV}
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float sw = sin(a * 5.0 + r * 14.0 - uTime * 4.0);
        vec3 c = hsv2rgb(vec3(fract(uHue + r * 0.3 + sw * 0.05 + uTime * 0.05), 0.7, 1.0));
        c = mix(c, vec3(0.05, 0.0, 0.1), smoothstep(0.2, 0.0, r));
        float alpha = smoothstep(1.0, 0.85, r) * (0.75 + 0.25 * sw);
        gl_FragColor = vec4(c, alpha);
      }`,
  });
}

/** Camera-relative precipitation particles (rain, snow, glitter) animated fully on the GPU. */
export function createPrecipMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uKind: { value: 0 }, uAmount: { value: 0 }, uSize: { value: 1 }, uBox: { value: new THREE.Vector3(60, 40, 60) }, uWind: { value: new THREE.Vector2(0, 0) } },
    vertexShader: `
      uniform float uTime; uniform vec3 uCam; uniform float uKind; uniform float uAmount; uniform float uSize; uniform vec3 uBox; uniform vec2 uWind;
      attribute float aRand; varying float vR; varying float vA;
      void main(){
        float speed = uKind < 0.5 ? 26.0 : (uKind < 1.5 ? 2.2 : 3.5);
        vec3 p = position;
        p.y -= uTime * speed * (0.8 + aRand * 0.4);
        p.xz += uWind * uTime * (uKind < 0.5 ? 1.0 : 2.0);
        if (uKind > 0.5) { p.x += sin(uTime * 1.3 + aRand * 30.0) * 1.2; p.z += cos(uTime * 1.1 + aRand * 20.0) * 1.2; }
        vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
        vec3 w = uCam + rel;
        vR = aRand; vA = step(aRand, uAmount);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        float base = uKind < 0.5 ? 2.5 : (uKind < 1.5 ? 4.0 : 3.5);
        gl_PointSize = base * uSize * (40.0 / max(1.0, -mv.z)) * vA;
      }`,
    fragmentShader: `
      uniform float uKind; uniform float uTime; varying float vR; varying float vA;
      ${HSV}
      void main(){
        if (vA < 0.5) discard;
        vec2 c = gl_PointCoord - 0.5;
        float a;
        vec3 col;
        if (uKind < 0.5) { a = smoothstep(0.08, 0.0, abs(c.x)) * smoothstep(0.5, 0.2, abs(c.y)); col = vec3(0.75, 0.85, 1.0); a *= 0.55; }
        else if (uKind < 1.5) { a = smoothstep(0.5, 0.2, length(c)); col = vec3(1.0); a *= 0.9; }
        else { a = smoothstep(0.5, 0.0, length(c)); col = hsv2rgb(vec3(fract(vR * 5.0 + uTime * 0.2), 0.6, 1.0)) * (1.0 + 0.8 * sin(uTime * 8.0 + vR * 50.0)); }
        if (a < 0.02) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
}
