/* Underwater background — fullscreen WebGL shader.
   Adapted from the Shadertoy "underwater" reference (CC BY-NC-SA 3.0):
   https://www.shadertoy.com/view/4ljXWh — terrain caustics godrays bubbles. */
(function () {
  if (window.__underwaterBgInit) return;
  window.__underwaterBgInit = true;

  const canvas = document.createElement("canvas");
  canvas.id = "underwater-bg";
  Object.assign(canvas.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    zIndex: "-2",
    display: "block",
    pointerEvents: "none",
  });
  document.body.prepend(canvas);
  // Make page transparent so the canvas (fixed, z=-2) shows through.
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";

  const gl =
    canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    }) ||
    canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true });
  if (!gl) {
    canvas.remove();
    return;
  }

  const VS = `
    attribute vec2 a_pos;
    varying vec2 vUv;
    void main() {
      vUv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const USER_SHADER = `
    #define TAU 6.28318530718
    #define MAX_ITER 5

    float speck(vec2 pos, vec2 uv, float radius) {
      pos.y += 0.05;
      float color = distance(pos, uv);
      vec3 tex  = texture2D(iChannel0, sin(vec2(uv)*10.1)).xyz;
      vec3 tex2 = texture2D(iChannel0, sin(vec2(pos)*10.1)).xyz;
      color = clamp((1.0 - pow(color * (5.0 / radius), pow(radius,0.9))), 0.0, 1.0);
      color *= clamp(mix(sin(tex.y)+0.1,cos(tex.x),0.5)*sin(tex2.x)+0.2,0.0,1.0);
      return color;
    }

    vec3 caustic(vec2 uv) {
      vec2 p = mod(uv*TAU, TAU)-250.0;
      float time = iGlobalTime * .5+23.0;
      vec2 i = vec2(p);
      float c = 1.0;
      float inten = .005;
      for (int n = 0; n < MAX_ITER; n++) {
        float t = time * (1.0 - (3.5 / float(n+1)));
        i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
        c += 1.0/length(vec2(p.x / (sin(i.x+t)/inten),p.y / (cos(i.y+t)/inten)));
      }
      c /= float(MAX_ITER);
      c = 1.17-pow(c, 1.4);
      vec3 color = vec3(pow(abs(c), 8.0));
      color = clamp(color + vec3(0.0, 0.35, 0.5), 0.0, 1.0);
      color = mix(color, vec3(1.0,1.0,1.0),0.3);
      return color;
    }

    float causticX(float x, float power, float gtime) {
      float p = mod(x*TAU, TAU)-250.0;
      float time = gtime * .5+23.0;
      float i = p;
      float c = 1.0;
      float inten = .005;
      for (int n = 0; n < MAX_ITER/2; n++) {
        float t = time * (1.0 - (3.5 / float(n+1)));
        i = p + cos(t - i) + sin(t + i);
        c += 1.0/length(p / (sin(i+t)/inten));
      }
      c /= float(MAX_ITER);
      c = 1.17-pow(c, power);
      return c;
    }

    float GodRays(vec2 uv) {
      float light = 0.0;
      light += pow(causticX((uv.x+0.08*uv.y)/1.7+0.5, 1.8, iGlobalTime*0.65),10.0)*0.05;
      light -= pow((1.0-uv.y)*0.3,2.0)*0.2;
      light += pow(causticX(sin(uv.x), 0.3,iGlobalTime*0.7),9.0)*0.4;
      light += pow(causticX(cos(uv.x*2.3), 0.3,iGlobalTime*1.3),4.0)*0.1;
      light -= pow((1.0-uv.y)*0.3,3.0);
      light = clamp(light,0.0,1.0);
      return light;
    }

    float noise(in vec2 p) {
      float height  = mix(texture2D(iChannel0, p / 80.0,  -100.0).x, 1.0, 0.85);
      float height2 = mix(texture2D(iChannel1, p / 700.0, -200.0).x, 0.0, -3.5);
      return height2 - height - 0.179;
    }

    float fBm(in vec2 p) {
      float sum = 0.0;
      float amp = 1.0;
      for(int i = 0; i < 4; i++) {
        sum += amp * noise(p);
        amp *= 0.5;
        p *= 2.5;
      }
      return sum * 0.5 + 0.15;
    }

    vec3 raymarchTerrain(in vec3 ro, in vec3 rd, in float tmin, in float tmax) {
      float t = tmin;
      vec3 res = vec3(-1.0);
      for (int i = 0; i < 110; i++) {
        vec3 p = ro + rd * t;
        res = vec3(vec2(0.0, p.y - fBm(p.xz)), t);
        float d = res.y;
        if (d < (0.001 * t) || t > tmax) break;
        t += 0.5 * d;
      }
      return res;
    }

    vec3 getTerrainNormal(in vec3 p) {
      float eps = 0.025;
      return normalize(vec3(
        fBm(vec2(p.x - eps, p.z)) - fBm(vec2(p.x + eps, p.z)),
        2.0 * eps,
        fBm(vec2(p.x, p.z - eps)) - fBm(vec2(p.x, p.z + eps))
      ));
    }

    void main() {
      vec3 skyColor       = vec3(0.3, 1.0, 1.0);
      vec3 sunLightColor  = vec3(1.7, 0.65, 0.65);
      vec3 skyLightColor  = vec3(0.8, 0.35, 0.15);
      vec3 horizonColor   = vec3(0.0, 0.05, 0.2);
      vec3 sunDirection   = normalize(vec3(0.8, 0.8, 0.6));

      vec2 p = ((vUv * 2.0) - 1.0) * vec2(iResolution.z, 1.0);

      vec3 eye = vec3(0.0, 1.25, 1.5);
      vec2 rot = 6.2831 * (
        vec2(-0.05 + iGlobalTime * 0.01, 0.0 - sin(iGlobalTime * 0.5) * 0.01) +
        vec2(1.0, 0.0) * (iMouse.xy - iResolution.xy * 0.25) / iResolution.x
      );
      eye.yz = cos(rot.y) * eye.yz + sin(rot.y) * eye.zy * vec2(-1.0, 1.0);
      eye.xz = cos(rot.x) * eye.xz + sin(rot.x) * eye.zx * vec2(1.0, -1.0);

      vec3 ro = eye;
      vec3 ta = vec3(0.5, 1.0, 0.0);
      vec3 cw = normalize(ta - ro);
      vec3 cu = normalize(cross(vec3(0.0, 1.0, 0.0), cw));
      vec3 cv = normalize(cross(cw, cu));
      mat3 cam = mat3(cu, cv, cw);
      vec3 rd = cam * normalize(vec3(p.xy, 1.0));

      vec3 color = skyColor;
      float sky = 0.0;

      float tmin = 0.1;
      float tmax = 20.0;
      vec3 res = raymarchTerrain(ro, rd, tmin, tmax);

      vec3 colorBubble = vec3(0.0);
      float bubble = 0.0;
      bubble += speck(vec2(sin(iGlobalTime*0.32), cos(iGlobalTime)*0.2+0.1), rd.xy, -0.08*rd.z);
      bubble += speck(vec2(sin(1.0-iGlobalTime*0.39)+0.5, cos(1.0-iGlobalTime*0.69)*0.2+0.15), rd.xy, 0.07*rd.z);
      bubble += speck(vec2(cos(1.0-iGlobalTime*0.5)-0.5, sin(1.0-iGlobalTime*0.36)*0.2+0.1), rd.xy, 0.12*rd.z);
      bubble += speck(vec2(sin(iGlobalTime*0.44)-1.0, cos(1.0-iGlobalTime*0.32)*0.2+0.15), rd.xy, -0.09*rd.z);
      bubble += speck(vec2(1.0-sin(1.0-iGlobalTime*0.6)-1.3, sin(1.0-iGlobalTime*0.82)*0.2+0.1), rd.xy, 0.15*rd.z);

      colorBubble = bubble * vec3(0.2, 0.7, 1.0);
      if (rd.z < 0.1) {
        for (float x = 0.39; x < 6.28; x += 0.39) {
          vec3 height = texture2D(iChannel0, vec2(x)).xyz;
          bubble = speck(
            vec2(sin(iGlobalTime+x)*0.5+0.2, cos(iGlobalTime*height.z*2.1+height.x*1.7)*0.2+0.2),
            rd.xy,
            (cos(iGlobalTime+height.y*2.3+rd.z*-1.0)*-0.01+0.25)
          );
          colorBubble += bubble * vec3(-0.1*rd.z, -0.5*rd.z, 1.0);
        }
      }

      float t = res.z;
      if (t < tmax) {
        vec3 pos = ro + rd * t;
        vec3 nor = getTerrainNormal(pos);
        nor = normalize(nor + 0.5 * getTerrainNormal(pos * 8.0));
        float sun = clamp(dot(sunDirection, nor), 0.0, 1.0);
        sky = clamp(0.5 + 0.5 * nor.y, 0.0, 1.0);
        vec3 diffuse = mix(
          texture2D(iChannel2, vec2(pos.x*pow(pos.y,0.01), pos.z*pow(pos.y,0.01))).xyz,
          vec3(1.0),
          clamp(1.1-pos.y, 0.0, 1.0)
        );
        diffuse *= caustic(vec2(mix(pos.x,pos.y,0.2), mix(pos.z,pos.y,0.2)) * 1.1);
        vec3 lightColor = 1.0 * sun * sunLightColor;
        lightColor += 0.7 * sky * skyLightColor;
        color *= 0.8 * diffuse * lightColor;
        color = mix(color, horizonColor, 1.0 - exp(-0.3 * pow(t, 1.0)));
      } else {
        sky = clamp(0.8 * (1.0 - 0.8 * rd.y), 0.0, 1.0);
        color = sky * skyColor;
        color += ((0.3*caustic(vec2(p.x,p.y*1.0))) + (0.3*caustic(vec2(p.x,p.y*2.7)))) * pow(p.y,4.0);
        color = mix(color, horizonColor, pow(1.0 - pow(rd.y,4.0), 20.0));
      }

      color += colorBubble;
      color += GodRays(p) * mix(float(skyColor.r), 1.0, p.y*p.y) * vec3(0.7, 1.0, 1.0);

      vec3 gamma = vec3(0.46);
      gl_FragColor = vec4(pow(color, gamma), 1.0);
    }
  `;

  const FS = `
    #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
    #endif
    precision highp float;
    varying vec2 vUv;
    uniform vec3 iResolution;
    uniform float iGlobalTime;
    uniform vec2 iMouse;
    uniform sampler2D iChannel0;
    uniform sampler2D iChannel1;
    uniform sampler2D iChannel2;
    ${USER_SHADER}
  `;

  function compile(src, type) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("[underwater-bg] shader error:", gl.getShaderInfoLog(sh));
      console.error(src);
      return null;
    }
    return sh;
  }

  const vs = compile(VS, gl.VERTEX_SHADER);
  const fs = compile(FS, gl.FRAGMENT_SHADER);
  if (!vs || !fs) {
    canvas.remove();
    return;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "a_pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("[underwater-bg] link error:", gl.getProgramInfoLog(prog));
    canvas.remove();
    return;
  }
  gl.useProgram(prog);

  const uRes = gl.getUniformLocation(prog, "iResolution");
  const uTime = gl.getUniformLocation(prog, "iGlobalTime");
  const uMouse = gl.getUniformLocation(prog, "iMouse");
  const uCh0 = gl.getUniformLocation(prog, "iChannel0");
  const uCh1 = gl.getUniformLocation(prog, "iChannel1");
  const uCh2 = gl.getUniformLocation(prog, "iChannel2");

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ---------- Procedural textures ----------
  function makeTexture(size, fill) {
    const data = new Uint8Array(size * size * 4);
    fill(data, size);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      size,
      size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }

  // Pseudo-random (deterministic)
  function rng(seed) {
    let s = seed | 0;
    return () => {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 0) % 65536) / 65536;
    };
  }

  // 2D value-noise via bilinear interp of integer-grid samples
  function valueNoise(size, cellSize, seed) {
    const r = rng(seed);
    const cells = Math.ceil(size / cellSize) + 2;
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    const sample = (x, y) => {
      const fx = x / cellSize;
      const fy = y / cellSize;
      const ix = Math.floor(fx) % cells;
      const iy = Math.floor(fy) % cells;
      const ix1 = (ix + 1) % cells;
      const iy1 = (iy + 1) % cells;
      const tx = fx - Math.floor(fx);
      const ty = fy - Math.floor(fy);
      const a = grid[iy * cells + ix];
      const b = grid[iy * cells + ix1];
      const c = grid[iy1 * cells + ix];
      const d = grid[iy1 * cells + ix1];
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      return a + (b - a) * sx + ((c - a) + ((d - c) - (b - a)) * sx) * sy;
    };
    return sample;
  }

  // Channel 0: fine white noise (smoothed)
  const tex0 = makeTexture(256, (data, n) => {
    const r = rng(1);
    for (let i = 0; i < n * n; i++) {
      const v = (r() * 255) | 0;
      data[i * 4 + 0] = v;
      data[i * 4 + 1] = (r() * 255) | 0;
      data[i * 4 + 2] = (r() * 255) | 0;
      data[i * 4 + 3] = 255;
    }
  });

  // Channel 1: low-frequency blobby heightmap, biased low (mean ~0.2)
  // so the shader's mix(tex,0,-3.5) = tex*4.5 lands around y~0.9 → fBm~0.17.
  const tex1 = makeTexture(256, (data, n) => {
    const s1 = valueNoise(n, 32, 7);
    const s2 = valueNoise(n, 8, 11);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let v = Math.max(0, Math.min(1, s1(x, y) * 0.7 + s2(x, y) * 0.3));
        v = Math.pow(v, 2.6); // skew toward dark (mean ~0.2)
        const i = (y * n + x) * 4;
        const b = (v * 255) | 0;
        data[i] = b;
        data[i + 1] = b;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
  });

  // Channel 2: rocky sandy diffuse texture
  const tex2 = makeTexture(256, (data, n) => {
    const s1 = valueNoise(n, 4, 23);
    const s2 = valueNoise(n, 16, 41);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = s1(x, y) * 0.55 + s2(x, y) * 0.45;
        const i = (y * n + x) * 4;
        // sandy beige with rocky speckle
        data[i + 0] = Math.min(255, (160 + (v - 0.5) * 90) | 0);
        data[i + 1] = Math.min(255, (140 + (v - 0.5) * 80) | 0);
        data[i + 2] = Math.min(255, (110 + (v - 0.5) * 70) | 0);
        data[i + 3] = 255;
      }
    }
  });

  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex0); gl.uniform1i(uCh0, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex1); gl.uniform1i(uCh1, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex2); gl.uniform1i(uCh2, 2);

  // ---------- Resize / render loop ----------
  // Shader uses (iMouse - iResolution*0.25) so neutral camera = iResolution*0.25.
  const mouse = { x: 0, y: 0 };
  let dprCache = 1;
  window.addEventListener("mousemove", (e) => {
    // Convert CSS px to canvas px and keep a gentle parallax (half the actual offset).
    const nx = e.clientX * dprCache;
    const ny = (window.innerHeight - e.clientY) * dprCache;
    const cx = canvas.width * 0.25;
    const cy = canvas.height * 0.25;
    mouse.x = cx + (nx - canvas.width * 0.5) * 0.15;
    mouse.y = cy + (ny - canvas.height * 0.5) * 0.15;
  });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25); // cap for perf
    dprCache = dpr;
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      // Reset mouse to neutral on resize.
      mouse.x = w * 0.25;
      mouse.y = h * 0.25;
    }
  }
  window.addEventListener("resize", resize);
  resize();

  const t0 = performance.now();
  let raf = 0;
  function frame() {
    const w = canvas.width, h = canvas.height;
    gl.uniform3f(uRes, w, h, w / h);
    gl.uniform1f(uTime, (performance.now() - t0) / 1000);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(frame);
    }
  });
  raf = requestAnimationFrame(frame);
})();
