import * as THREE from 'three';

/**
 * Foliage Vertex Shader
 * Implements the Dual-Position System (Chaos vs Formed)
 */
export const foliageVertexShader = `
  uniform float uTime;
  uniform float uProgress; // 0.0 = Tree (Formed), 1.0 = Chaos (Unleashed)
  uniform float uSize;
  
  attribute vec3 aTargetPos; // The Tree shape
  attribute vec3 aChaosPos;  // The Random sphere shape
  attribute float aRandom;   // Random seed per particle
  
  varying float vRatio;      // Vertical height ratio for gradient
  varying float vAlpha;      // Fade out edges
  varying float vRandom;     // Pass random to fragment

  // Cubic Ease Out for smoother popping
  float easeOutCubic(float x) {
    return 1.0 - pow(1.0 - x, 3.0);
  }

  void main() {
    vRandom = aRandom;

    // 1. Interpolate Position
    float mixFactor = easeOutCubic(uProgress);
    
    // Mix position
    vec3 pos = mix(aTargetPos, aChaosPos, mixFactor);
    
    // 2. Add "Breathing" life
    // Finer movement for smaller particles
    float sway = sin(uTime * 1.5 + pos.y * 2.0) * 0.03 * (1.0 - mixFactor); 
    float floaty = sin(uTime + aRandom * 20.0) * 0.15 * mixFactor;     
    
    pos.x += sway + floaty;
    pos.y += floaty;
    pos.z += floaty;

    // 3. Size Calculation
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Calculate vertical ratio (0 at bottom, 1 at top)
    vRatio = (aTargetPos.y + 3.0) / 6.0;
    
    // Distance attenuation
    // We add variation based on aRandom so particles aren't all uniform size
    float sizeVar = 0.5 + 1.5 * aRandom; 
    gl_PointSize = (uSize * sizeVar) * (15.0 / -mvPosition.z);
    
    // Hide particles that are too close to camera
    vAlpha = smoothstep(1.5, 3.5, -mvPosition.z);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Foliage Fragment Shader
 * Renders "Magical Light" particles
 * Updated: Significantly increased brightness (values > 1.0 for Bloom)
 */
export const foliageFragmentShader = `
  uniform float uTime;
  varying float vRatio;
  varying float vAlpha;
  varying float vRandom;
  
  void main() {
    // 1. Circular Soft Shape
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float r = length(xy);
    if (r > 0.5) discard;

    // Soft glow gradient from center (Gaussian-ish)
    float glow = 1.0 - smoothstep(0.0, 0.5, r);
    glow = pow(glow, 1.5); 

    // 2. Magical Palette (Boosted for Bloom)
    // Values > 1.0 trigger stronger glow in post-processing
    
    vec3 colorDeep = vec3(0.6, 0.2, 1.8);    // Neon Deep Purple
    vec3 colorMid = vec3(0.4, 1.2, 3.0);     // Electric Blue
    vec3 colorTop = vec3(2.0, 1.8, 0.8);     // Bright Gold/White
    
    // Gradient logic
    vec3 finalColor = mix(colorDeep, colorMid, smoothstep(0.0, 0.5, vRatio));
    finalColor = mix(finalColor, colorTop, smoothstep(0.6, 1.0, vRatio));

    // 3. Sparkle Effect
    float twinkleSpeed = 2.0 + vRandom * 6.0;
    float twinkle = sin(uTime * twinkleSpeed + vRandom * 100.0);
    
    // Threshold for sparkle
    if (twinkle > 0.5) {
        // Super bright diamond core
        float intensity = (twinkle - 0.5) * 4.0;
        finalColor += vec3(2.0, 2.0, 2.5) * intensity; 
    }

    // 4. Alpha Composition
    float alpha = glow * vAlpha; 

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Text Vertex Shader
 * Sharper, more stable particles for legibility
 */
export const textVertexShader = `
  uniform float uTime;
  uniform float uProgress;
  
  attribute vec3 aTargetPos;
  attribute vec3 aChaosPos;
  attribute float aRandom;
  
  varying float vAlpha;
  varying float vRandom;

  float easeOutCubic(float x) {
    return 1.0 - pow(1.0 - x, 3.0);
  }

  void main() {
    vRandom = aRandom;

    float mixFactor = easeOutCubic(uProgress);
    vec3 pos = mix(aTargetPos, aChaosPos, mixFactor);
    
    // Minimal float for text to keep it readable
    // Only sway slightly
    float sway = sin(uTime + pos.x) * 0.02 * (1.0 - mixFactor);
    pos.y += sway;
    
    // Add some random jitter only in chaos mode
    if (mixFactor > 0.01) {
       pos += (vec3(aRandom) - 0.5) * mixFactor * 5.0; 
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Smaller, sharper points for high density text
    gl_PointSize = (2.5 * (0.8 + 0.4 * aRandom)) * (10.0 / -mvPosition.z);
    
    vAlpha = smoothstep(1.0, 5.0, -mvPosition.z);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Text Fragment Shader
 * Distinct Gold Glitter
 */
export const textFragmentShader = `
  uniform float uTime;
  varying float vAlpha;
  varying float vRandom;

  void main() {
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float r = length(xy);
    
    if (r > 0.5) discard;

    float glow = 1.0 - smoothstep(0.3, 0.5, r);

    // Rich Gold Palette
    vec3 gold = vec3(1.5, 0.9, 0.2); 
    vec3 brightGold = vec3(2.0, 1.5, 0.8); 
    
    float twinkleSpeed = 3.0 + vRandom * 5.0;
    float twinkle = sin(uTime * twinkleSpeed + vRandom * 100.0);
    
    vec3 color = mix(gold, brightGold, smoothstep(0.0, 1.0, twinkle));
    
    if (twinkle > 0.8) {
       color += vec3(1.0); 
    }

    gl_FragColor = vec4(color, glow * vAlpha);
  }
`;