/**
 * PreviewRenderer — Dedicated WebGL2 GPU Preview Stage
 *
 * Renders the live video preview stage using hardware-accelerated WebGL2 texture quads:
 *   - Quad 1 (Background): Source video cover-cropped to stage + multi-tap GPU blur
 *   - Quad 2 (Foreground): Source video placed at exact destination coordinates (FIT/FILL)
 *
 * Consumes logical placement from resolveVideoPlacement() as the single source of truth.
 * Preserves DPR-aware physical backing resolution while separating preview from export.
 * Includes automatic Canvas2D fallback if WebGL2 is not supported.
 */

// ── WebGL2 Shaders ──

const VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec2 a_unitPos; // [0, 1] x [0, 1]

uniform vec4 u_destRect;   // [x, y, width, height] in stage pixels
uniform vec2 u_stageSize;  // [stageWidth, stageHeight]
uniform vec4 u_srcRect;    // [sx, sy, sWidth, sHeight] in source pixels
uniform vec2 u_sourceSize; // [sourceWidth, sourceHeight]

out vec2 v_texCoord;

void main() {
    // Map unit position to logical stage pixel coordinates
    vec2 stagePixel = u_destRect.xy + a_unitPos * u_destRect.zw;

    // Convert stage pixel (0,0 top-left) to WebGL NDC [-1, 1] (Y goes up)
    vec2 ndc;
    ndc.x = (stagePixel.x / u_stageSize.x) * 2.0 - 1.0;
    ndc.y = 1.0 - (stagePixel.y / u_stageSize.y) * 2.0;
    gl_Position = vec4(ndc, 0.0, 1.0);

    // Compute source UV coordinates [0, 1]
    vec2 srcPixel = u_srcRect.xy + a_unitPos * u_srcRect.zw;
    v_texCoord = srcPixel / u_sourceSize;
}
`;

// Foreground shader: renders razor-sharp video with color filter effects
const FOREGROUND_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;

uniform float u_brightness; // default 1.0
uniform float u_contrast;   // default 1.0
uniform float u_saturation; // default 1.0
uniform float u_sepia;      // default 0.0
uniform float u_grayscale;  // default 0.0
uniform float u_invert;     // default 0.0

out vec4 fragColor;

void main() {
    vec2 coord = clamp(v_texCoord, 0.0, 1.0);
    vec4 tex = texture(u_texture, coord);
    vec3 color = tex.rgb;

    // Brightness
    color *= u_brightness;

    // Contrast
    color = (color - 0.5) * u_contrast + 0.5;

    // Saturation
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(gray), color, u_saturation);

    // Grayscale
    if (u_grayscale > 0.0) {
        color = mix(color, vec3(gray), u_grayscale);
    }

    // Sepia
    if (u_sepia > 0.0) {
        vec3 sepiaColor = vec3(
            dot(color, vec3(0.393, 0.769, 0.189)),
            dot(color, vec3(0.349, 0.686, 0.168)),
            dot(color, vec3(0.272, 0.534, 0.131))
        );
        color = mix(color, sepiaColor, u_sepia);
    }

    // Invert
    if (u_invert > 0.0) {
        color = mix(color, vec3(1.0) - color, u_invert);
    }

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

// Background blur shader: 13-tap weighted Poisson/Gaussian kernel
const BLUR_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_blurRadius; // normalized radius
uniform float u_brightness; // backdrop brightness
uniform float u_opacity;    // backdrop opacity

out vec4 fragColor;

void main() {
    const vec2 offsets[13] = vec2[](
        vec2(0.0, 0.0),
        vec2(-0.326212, -0.405805),
        vec2(-0.840144, -0.073580),
        vec2(-0.695914,  0.457137),
        vec2(-0.203345,  0.620716),
        vec2( 0.962340, -0.194983),
        vec2( 0.473434, -0.480026),
        vec2( 0.519456,  0.767022),
        vec2( 0.185461, -0.893124),
        vec2( 0.507431,  0.064425),
        vec2( 0.896420,  0.412458),
        vec2(-0.321940, -0.932615),
        vec2(-0.791559, -0.597705)
    );

    vec4 color = vec4(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < 13; ++i) {
        float dist = length(offsets[i]);
        float weight = exp(-dist * dist * 2.0);
        vec2 sampleCoord = clamp(v_texCoord + offsets[i] * u_blurRadius, 0.001, 0.999);
        color += texture(u_texture, sampleCoord) * weight;
        totalWeight += weight;
    }

    color /= totalWeight;
    color.rgb *= u_brightness;
    fragColor = vec4(color.rgb, u_opacity);
}
`;

export class PreviewRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.ctx2d = null;
    this.isWebGL2 = false;

    // WebGL Objects
    this.quadVAO = null;
    this.quadVBO = null;
    this.fgProgram = null;
    this.blurProgram = null;
    this.videoTexture = null;
    this.bgImageTexture = null;
    this.bgImageUrl = null;

    // Stage dimensions
    this.stageWidth = 1080;
    this.stageHeight = 1920;
    this.displayWidth = 0;
    this.displayHeight = 0;
    this.dpr = 1;

    // Cached render params for re-renders on resize
    this.lastRenderParams = null;
    this.isContextLost = false;

    this.boundOnContextLost = this.onContextLost.bind(this);
    this.boundOnContextRestored = this.onContextRestored.bind(this);

    this.init();
  }

  init() {
    this.canvas.addEventListener('webglcontextlost', this.boundOnContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.boundOnContextRestored, false);

    // Try WebGL2 first
    try {
      this.gl = this.canvas.getContext('webgl2', {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        powerPreference: 'high-performance'
      });
      if (this.gl) {
        this.isWebGL2 = true;
        this.initWebGL2();
        return;
      }
    } catch (e) {
      console.warn('WebGL2 initialization failed, falling back to 2D context', e);
    }

    // Fallback: 2D Canvas context
    try {
      this.ctx2d = this.canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
      });
    } catch (e) {
      console.error('All rendering contexts failed', e);
    }
  }

  initWebGL2() {
    const gl = this.gl;
    if (!gl) return;

    // 1. Compile Shaders & Link Programs
    this.fgProgram = this.createProgram(VERTEX_SHADER_SOURCE, FOREGROUND_FRAGMENT_SHADER_SOURCE);
    this.blurProgram = this.createProgram(VERTEX_SHADER_SOURCE, BLUR_FRAGMENT_SHADER_SOURCE);

    // 2. Setup Unit Quad VBO ([0,0] to [1,1])
    const quadVertices = new Float32Array([
      // Triangle 1
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      // Triangle 2
      0.0, 1.0,
      1.0, 0.0,
      1.0, 1.0
    ]);

    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    // 3. Create Video Texture
    this.videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }
    return shader;
  }

  createProgram(vsSource, fsSource) {
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link error: ${info}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  onContextLost(e) {
    e.preventDefault();
    this.isContextLost = true;
    console.warn('PreviewRenderer: WebGL context lost');
  }

  onContextRestored() {
    console.info('PreviewRenderer: WebGL context restored, re-initializing');
    this.isContextLost = false;
    this.initWebGL2();
    if (this.lastRenderParams) {
      this.render(this.lastRenderParams);
    }
  }

  /**
   * Resizes preview stage backing resolution according to container display size and DPR.
   */
  resize(displayWidth, displayHeight, dpr = 1, stageWidth = 1080, stageHeight = 1920) {
    if (!displayWidth || !displayHeight) return;

    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.dpr = Math.min(dpr, 2); // Cap at 2 to avoid memory blowup on 3x screens
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;

    const targetBackingW = Math.max(2, Math.round(displayWidth * this.dpr));
    const targetBackingH = Math.max(2, Math.round(displayHeight * this.dpr));

    if (this.canvas.width !== targetBackingW || this.canvas.height !== targetBackingH) {
      this.canvas.width = targetBackingW;
      this.canvas.height = targetBackingH;

      if (this.gl && !this.isContextLost) {
        this.gl.viewport(0, 0, targetBackingW, targetBackingH);
      }
    }
  }

  /**
   * Main render call: Composites background and foreground quads in a single pass.
   */
  render({
    video,
    placement,
    bgSettings = {},
    effectsSettings = {}
  }) {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || !placement) {
      return;
    }

    this.lastRenderParams = { video, placement, bgSettings, effectsSettings };

    if (this.isWebGL2 && this.gl && !this.isContextLost) {
      this.renderWebGL2({ video, placement, bgSettings, effectsSettings });
    } else if (this.ctx2d) {
      this.renderCanvas2D({ video, placement, bgSettings, effectsSettings });
    }
  }

  renderWebGL2({ video, placement, bgSettings, effectsSettings }) {
    const gl = this.gl;
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const sW = this.stageWidth;
    const sH = this.stageHeight;

    // Upload current video frame to texture
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Clear canvas
    const bgColor = bgSettings?.color || '#000000';
    const rgb = this.parseColorToRGB(bgColor);
    gl.clearColor(rgb[0], rgb[1], rgb[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindVertexArray(this.quadVAO);

    const isLetterbox = placement.destinationY > 0 || placement.destinationX > 0;
    const bgType = bgSettings?.type || 'blur-video';

    // ── 1. BACKGROUND LAYER ──
    if (isLetterbox) {
      if (bgType === 'blur-video') {
        gl.useProgram(this.blurProgram);

        // Compute cover coordinates for the background
        const vAspect = vW / vH;
        const sAspect = sW / sH;
        let bgSrcW = vW;
        let bgSrcH = vH;
        let bgSrcX = 0;
        let bgSrcY = 0;

        if (vAspect > sAspect) {
          bgSrcW = vH * sAspect;
          bgSrcX = (vW - bgSrcW) / 2;
        } else {
          bgSrcH = vW / sAspect;
          bgSrcY = (vH - bgSrcH) / 2;
        }

        // Slight 1.06x overscan to ensure blur never fringes against edges
        const overscan = 1.06;
        const destW = sW * overscan;
        const destH = sH * overscan;
        const destX = (sW - destW) / 2;
        const destY = (sH - destH) / 2;

        gl.uniform4f(gl.getUniformLocation(this.blurProgram, 'u_destRect'), destX, destY, destW, destH);
        gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'u_stageSize'), sW, sH);
        gl.uniform4f(gl.getUniformLocation(this.blurProgram, 'u_srcRect'), bgSrcX, bgSrcY, bgSrcW, bgSrcH);
        gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'u_sourceSize'), vW, vH);

        const blurStrength = (bgSettings?.blur ?? 20) / 100;
        const normBlur = Math.max(0.005, blurStrength * 0.04);
        const opacity = (bgSettings?.opacity ?? 65) / 100;

        gl.uniform1f(gl.getUniformLocation(this.blurProgram, 'u_blurRadius'), normBlur);
        gl.uniform1f(gl.getUniformLocation(this.blurProgram, 'u_brightness'), opacity);
        gl.uniform1f(gl.getUniformLocation(this.blurProgram, 'u_opacity'), 1.0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
        gl.uniform1i(gl.getUniformLocation(this.blurProgram, 'u_texture'), 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    // ── 2. FOREGROUND LAYER ──
    gl.useProgram(this.fgProgram);

    gl.uniform4f(
      gl.getUniformLocation(this.fgProgram, 'u_destRect'),
      placement.destinationX,
      placement.destinationY,
      placement.destinationWidth,
      placement.destinationHeight
    );
    gl.uniform2f(gl.getUniformLocation(this.fgProgram, 'u_stageSize'), sW, sH);

    gl.uniform4f(
      gl.getUniformLocation(this.fgProgram, 'u_srcRect'),
      placement.sourceX,
      placement.sourceY,
      placement.sourceWidth,
      placement.sourceHeight
    );
    gl.uniform2f(gl.getUniformLocation(this.fgProgram, 'u_sourceSize'), vW, vH);

    // Apply color effects
    const brightness = (effectsSettings?.brightness ?? 100) / 100;
    const contrast = (effectsSettings?.contrast ?? 100) / 100;
    const saturation = (effectsSettings?.saturation ?? 100) / 100;
    const sepia = (effectsSettings?.sepia ?? 0) / 100;
    const grayscale = (effectsSettings?.grayscale ?? 0) / 100;
    const invert = (effectsSettings?.invert ?? 0) / 100;

    gl.uniform1f(gl.getUniformLocation(this.fgProgram, 'u_brightness'), brightness);
    gl.uniform1f(gl.getUniformLocation(this.fgProgram, 'u_contrast'), contrast);
    gl.uniform1f(gl.getUniformLocation(this.fgProgram, 'u_saturation'), saturation);
    gl.uniform1f(gl.getUniformLocation(this.fgProgram, 'u_sepia'), sepia);
    gl.uniform1f(gl.getUniformLocation(this.fgProgram, 'u_grayscale'), grayscale);
    gl.uniform1f(gl.getUniformLocation(this.fgProgram, 'u_invert'), invert);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.uniform1i(gl.getUniformLocation(this.fgProgram, 'u_texture'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
  }

  /**
   * Canvas2D Fallback for devices without WebGL2 support.
   */
  renderCanvas2D({ video, placement, bgSettings, effectsSettings }) {
    const ctx = this.ctx2d;
    const scaleX = this.canvas.width / this.stageWidth;
    const scaleY = this.canvas.height / this.stageHeight;

    ctx.save();
    ctx.scale(scaleX, scaleY);

    // Background solid fill
    ctx.fillStyle = bgSettings?.color || '#000000';
    ctx.fillRect(0, 0, this.stageWidth, this.stageHeight);

    // Blurred Background
    const isLetterbox = placement.destinationY > 0 || placement.destinationX > 0;
    const bgType = bgSettings?.type || 'blur-video';

    if (isLetterbox && bgType === 'blur-video') {
      const vW = video.videoWidth;
      const vH = video.videoHeight;
      const vAspect = vW / vH;
      const sAspect = this.stageWidth / this.stageHeight;
      let bgSrcW = vW, bgSrcH = vH, bgSrcX = 0, bgSrcY = 0;

      if (vAspect > sAspect) {
        bgSrcW = vH * sAspect;
        bgSrcX = (vW - bgSrcW) / 2;
      } else {
        bgSrcH = vW / sAspect;
        bgSrcY = (vH - bgSrcH) / 2;
      }

      ctx.save();
      const blurPx = Math.round((bgSettings?.blur ?? 20) * 0.5);
      const opacity = (bgSettings?.opacity ?? 65) / 100;
      ctx.filter = `blur(${blurPx}px) brightness(${opacity})`;
      ctx.drawImage(video, bgSrcX, bgSrcY, bgSrcW, bgSrcH, -20, -20, this.stageWidth + 40, this.stageHeight + 40);
      ctx.restore();
    }

    // Foreground video
    ctx.drawImage(
      video,
      placement.sourceX,
      placement.sourceY,
      placement.sourceWidth,
      placement.sourceHeight,
      placement.destinationX,
      placement.destinationY,
      placement.destinationWidth,
      placement.destinationHeight
    );

    ctx.restore();
  }

  parseColorToRGB(hex) {
    if (!hex || typeof hex !== 'string') return [0, 0, 0];
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return [0, 0, 0];
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255
    ];
  }

  renderCurrent() {
    if (this.lastRenderParams) {
      this.render(this.lastRenderParams);
    }
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.boundOnContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.boundOnContextRestored);

    if (this.gl) {
      const gl = this.gl;
      if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
      if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
      if (this.fgProgram) gl.deleteProgram(this.fgProgram);
      if (this.blurProgram) gl.deleteProgram(this.blurProgram);
      if (this.videoTexture) gl.deleteTexture(this.videoTexture);
      if (this.bgImageTexture) gl.deleteTexture(this.bgImageTexture);
    }
    this.gl = null;
    this.ctx2d = null;
  }
}
