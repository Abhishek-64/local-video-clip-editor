/**
 * GPU WebGL / WebGL2 Shader Pipeline
 * Hardware-accelerated video frame processing for crop, zoom, color grading, visual presets,
 * fast background blur, and overlay compositing.
 */

import { renderTextOverlay } from './videoProcessingEngine';

const VERTEX_SHADER_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  
  // Color controls
  uniform float u_brightness; // 0.5 to 1.5 (default 1.0)
  uniform float u_contrast;   // 0.5 to 1.8 (default 1.0)
  uniform float u_saturation; // 0.0 to 2.0 (default 1.0)
  uniform float u_sepia;      // 0.0 to 1.0
  uniform float u_grayscale;  // 0.0 to 1.0
  uniform float u_invert;     // 0.0 to 1.0
  uniform float u_fadeAlpha;  // 0.0 to 1.0 (black overlay)

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);

    // 1. Invert
    if (u_invert > 0.0) {
      color.rgb = mix(color.rgb, vec3(1.0) - color.rgb, u_invert);
    }

    // 2. Brightness
    color.rgb = color.rgb * u_brightness;

    // 3. Contrast
    color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

    // 4. Grayscale / Luminance
    float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    if (u_grayscale > 0.0) {
      color.rgb = mix(color.rgb, vec3(lum), u_grayscale);
    }

    // 5. Saturation
    if (u_saturation != 1.0) {
      color.rgb = mix(vec3(lum), color.rgb, u_saturation);
    }

    // 6. Sepia
    if (u_sepia > 0.0) {
      vec3 sepiaColor;
      sepiaColor.r = dot(color.rgb, vec3(0.393, 0.769, 0.189));
      sepiaColor.g = dot(color.rgb, vec3(0.349, 0.686, 0.168));
      sepiaColor.b = dot(color.rgb, vec3(0.272, 0.534, 0.131));
      color.rgb = mix(color.rgb, sepiaColor, u_sepia);
    }

    // 7. Fade In/Out Black Overlay
    if (u_fadeAlpha > 0.0) {
      color.rgb = mix(color.rgb, vec3(0.0), u_fadeAlpha);
    }

    gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
  }
`;

export class WebGLEffectsPipeline {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.uniforms = {};
    this.isContextLost = false;

    // Fast 2D overlay context if supported on canvas
    this.overlayCanvas = null;
    this.overlayCtx = null;

    this.init();
  }

  init() {
    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        desynchronized: true
      }) || this.canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        desynchronized: true
      });

      if (!gl) {
        console.warn('WebGL not available on canvas, will fallback to 2D canvas');
        return;
      }

      this.gl = gl;

      // Compile Shaders
      const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fragShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
      const program = gl.createProgram();

      gl.attachShader(program, vertShader);
      gl.attachShader(program, fragShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('WebGL Program link error: ' + gl.getProgramInfoLog(program));
      }

      this.program = program;
      gl.useProgram(program);

      // Uniforms
      this.uniforms = {
        image: gl.getUniformLocation(program, 'u_image'),
        brightness: gl.getUniformLocation(program, 'u_brightness'),
        contrast: gl.getUniformLocation(program, 'u_contrast'),
        saturation: gl.getUniformLocation(program, 'u_saturation'),
        sepia: gl.getUniformLocation(program, 'u_sepia'),
        grayscale: gl.getUniformLocation(program, 'u_grayscale'),
        invert: gl.getUniformLocation(program, 'u_invert'),
        fadeAlpha: gl.getUniformLocation(program, 'u_fadeAlpha')
      };

      // Full quad coordinates
      const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]);
      this.positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

      const posAttr = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posAttr);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      // Texture coordinate buffer
      this.texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      const texCoords = new Float32Array([
        0, 1,
        1, 1,
        0, 0,
        0, 0,
        1, 1,
        1, 0,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.DYNAMIC_DRAW);

      const texAttr = gl.getAttribLocation(program, 'a_texCoord');
      gl.enableVertexAttribArray(texAttr);
      gl.vertexAttribPointer(texAttr, 2, gl.FLOAT, false, 0, 0);

      // Main Texture
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } catch (err) {
      console.warn('WebGL init error:', err);
      this.gl = null;
    }
  }

  compileShader(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile error: ' + err);
    }
    return shader;
  }

  renderFrame({
    sourceElement,
    cropBox,
    bgSettings = {},
    effects = {},
    text = {},
    logo = {},
    logoImage = null,
    currentPos = 0,
    startTime = 0,
    endTime = 0,
    partNumber = 1
  }) {
    if (!this.gl || !sourceElement) {
      return false;
    }

    const gl = this.gl;
    const canvas = this.canvas;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // Calculate Fade In / Fade Out Alpha
    let fadeAlpha = 0.0;
    const clipElapsed = currentPos - startTime;
    const clipRemaining = endTime - currentPos;

    if (effects.fadeIn && clipElapsed < (effects.fadeInDuration || 0.5)) {
      fadeAlpha = Math.max(0.0, Math.min(1.0, 1.0 - (clipElapsed / (effects.fadeInDuration || 0.5))));
    } else if (effects.fadeOut && clipRemaining < (effects.fadeOutDuration || 0.5)) {
      fadeAlpha = Math.max(0.0, Math.min(1.0, 1.0 - (clipRemaining / (effects.fadeOutDuration || 0.5))));
    }

    // Set Uniforms
    gl.uniform1f(this.uniforms.brightness, (effects.brightness ?? 100) / 100);
    gl.uniform1f(this.uniforms.contrast, (effects.contrast ?? 100) / 100);
    gl.uniform1f(this.uniforms.saturation, (effects.saturation ?? 100) / 100);
    gl.uniform1f(this.uniforms.sepia, (effects.sepia ?? 0) / 100);
    gl.uniform1f(this.uniforms.grayscale, (effects.grayscale ?? 0) / 100);
    gl.uniform1f(this.uniforms.invert, (effects.invert ?? 0) / 100);
    gl.uniform1f(this.uniforms.fadeAlpha, fadeAlpha);

    // Upload Video/VideoFrame to GPU texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceElement);

    // 1. Draw Background Blur Layer if letterboxed
    const isFitLetterbox = cropBox.dx > 0 || cropBox.dy > 0 || cropBox.dWidth < canvas.width || cropBox.dHeight < canvas.height;
    if (isFitLetterbox && bgSettings.type === 'blur-video') {
      // Full screen cover UV coords
      const bgTexCoords = new Float32Array([
        0.1, 0.9,
        0.9, 0.9,
        0.1, 0.1,
        0.1, 0.1,
        0.9, 0.9,
        0.9, 0.1
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, bgTexCoords);

      // Render background with reduced brightness
      gl.uniform1f(this.uniforms.brightness, ((effects.brightness ?? 100) / 100) * ((bgSettings.opacity ?? 65) / 100));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // 2. Draw Main Sharp Video Frame
    const srcW = sourceElement.videoWidth || sourceElement.codedWidth || sourceElement.width || 1920;
    const srcH = sourceElement.videoHeight || sourceElement.codedHeight || sourceElement.height || 1080;

    const u0 = Math.max(0.0, cropBox.sx / srcW);
    const v0 = Math.max(0.0, cropBox.sy / srcH);
    const u1 = Math.min(1.0, (cropBox.sx + cropBox.sWidth) / srcW);
    const v1 = Math.min(1.0, (cropBox.sy + cropBox.sHeight) / srcH);

    const mainTexCoords = new Float32Array([
      u0, v1,
      u1, v1,
      u0, v0,
      u0, v0,
      u1, v1,
      u1, v0
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mainTexCoords);

    // Set viewport to exact destination bounds
    gl.viewport(cropBox.dx, canvas.height - (cropBox.dy + cropBox.dHeight), cropBox.dWidth, cropBox.dHeight);
    gl.uniform1f(this.uniforms.brightness, (effects.brightness ?? 100) / 100);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return true;
  }

  destroy() {
    if (!this.gl) return;
    const gl = this.gl;
    try {
      if (this.texture) gl.deleteTexture(this.texture);
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
      if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
      if (this.program) gl.deleteProgram(this.program);
      const loseContextExt = gl.getExtension('WEBGL_lose_context');
      if (loseContextExt) {
        loseContextExt.loseContext();
      }
    } catch (e) {}
    this.gl = null;
  }
}
