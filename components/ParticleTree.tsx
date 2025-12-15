import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame, useLoader, extend, useThree } from '@react-three/fiber';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';
import { TextGeometry, FontLoader, MeshSurfaceSampler } from 'three-stdlib';
import { useTreeStore } from '../store';
import { foliageVertexShader, foliageFragmentShader, textVertexShader, textFragmentShader } from './TreeShaders';

// Extend for declarative use if needed, but we'll use imperative generation for points
extend({ TextGeometry });

/**
 * Constants & Helpers
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TREE_HEIGHT = 7;
const TREE_WIDTH = 3.5;

// Helper to generate chaos position (random sphere)
const getChaosPos = (scale = 10, minRatio = 0) => {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  
  // Uniform volume distribution shell
  const minVol = Math.pow(minRatio, 3);
  const rRandom = Math.random() * (1 - minVol) + minVol;
  const r = Math.cbrt(rRandom) * scale;
  
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  );
};

// Helper to generate tree position (Cone Shell)
const getTreePos = (t: number, theta: number, height: number, width: number) => {
  const y = height * t - height / 2;
  const radius = width * (1 - t);
  const x = radius * Math.cos(theta);
  const z = radius * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
};

/**
 * Sub-Component: The Holy Star
 */
const HolyStar = ({ progressRef }: { progressRef: React.MutableRefObject<number> }) => {
  const ref = useRef<THREE.Group>(null);
  const starShape = useMemo(() => {
    const shape = new THREE.Shape();
    const points = 5;
    const outerRadius = 0.5;
    const innerRadius = 0.2;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const a = (i / points) * Math.PI;
      const x = r * Math.sin(a);
      const y = r * Math.cos(a);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }, []);

  const extrudeSettings = useMemo(() => ({
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2
  }), []);

  useFrame((state, delta) => {
    if (ref.current) {
      const progress = progressRef.current;
      ref.current.rotation.y += delta * 0.5;
      ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 2) * 0.05;
      const targetScale = 1 + progress * 0.5; 
      const currentScale = ref.current.scale.x;
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, delta * 3);
      ref.current.scale.setScalar(newScale);
    }
  });

  return (
    <group ref={ref} position={[0, TREE_HEIGHT / 2 + 0.3, 0]}>
      <mesh>
        <extrudeGeometry args={[starShape, extrudeSettings]} />
        <meshStandardMaterial color="#ffddaa" emissive="#ffaa00" emissiveIntensity={2.0} roughness={0.1} metalness={1.0} />
      </mesh>
      <pointLight intensity={1.5} color="#ffaa00" distance={5} decay={2} />
    </group>
  );
};

/**
 * Sub-Component: 3D Particle Text
 */
const ParticleText = ({ text, position, size = 1.2, density = 2500, progressRef }: { text: string, position: [number, number, number], size?: number, density?: number, progressRef: React.MutableRefObject<number> }) => {
  const font = useLoader(FontLoader, 'https://cdn.jsdelivr.net/npm/three/examples/fonts/optimer_bold.typeface.json');
  const meshRef = useRef<THREE.Points>(null);
  
  const { geometry, uniforms } = useMemo(() => {
    if (!font) return { geometry: null, uniforms: null };

    const textConfig: any = {
      font: font,
      size: size,
      height: 0.2, 
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 3,
    };

    const textGeo = new TextGeometry(text, textConfig);
    
    textGeo.center(); 
    
    const tempMesh = new THREE.Mesh(textGeo, new THREE.MeshBasicMaterial());
    const sampler = new MeshSurfaceSampler(tempMesh).build();
    
    const count = density; 
    const aTargetPos = new Float32Array(count * 3);
    const aChaosPos = new Float32Array(count * 3);
    const aRandom = new Float32Array(count);
    
    const tempPos = new THREE.Vector3();
    
    for (let i = 0; i < count; i++) {
        sampler.sample(tempPos);
        aTargetPos[i * 3] = tempPos.x;
        aTargetPos[i * 3 + 1] = tempPos.y;
        aTargetPos[i * 3 + 2] = tempPos.z;
        
        // Text scatters MUCH more now
        const scatter = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5))
          .normalize()
          .multiplyScalar(Math.random() * 20 + 8); 
        
        aChaosPos[i * 3] = tempPos.x + scatter.x;
        aChaosPos[i * 3 + 1] = tempPos.y + scatter.y;
        aChaosPos[i * 3 + 2] = tempPos.z + scatter.z;
        
        aRandom[i] = Math.random();
    }
    
    const bufferGeo = new THREE.BufferGeometry();
    bufferGeo.setAttribute('position', new THREE.BufferAttribute(aTargetPos, 3));
    bufferGeo.setAttribute('aTargetPos', new THREE.BufferAttribute(aTargetPos, 3));
    bufferGeo.setAttribute('aChaosPos', new THREE.BufferAttribute(aChaosPos, 3));
    bufferGeo.setAttribute('aRandom', new THREE.BufferAttribute(aRandom, 1));
    
    const unis = {
        uTime: { value: 0 },
        uProgress: { value: 0 },
    };

    return { geometry: bufferGeo, uniforms: unis };
  }, [font, text, size, density]);

  useFrame((state) => {
    if (meshRef.current && uniforms) {
        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uProgress.value = THREE.MathUtils.lerp(uniforms.uProgress.value, progressRef.current, 0.1);
    }
  });

  if (!geometry) return null;

  return (
    <group position={position}>
       <points ref={meshRef} geometry={geometry}>
          <shaderMaterial 
             vertexShader={textVertexShader}
             fragmentShader={textFragmentShader}
             uniforms={uniforms}
             transparent
             depthWrite={false}
             blending={THREE.AdditiveBlending}
          />
       </points>
    </group>
  );
};

/**
 * Sub-Component: Dynamic Gifts (Scattering & Interior Filling)
 */
const DynamicGifts = ({ progressRef }: { progressRef: React.MutableRefObject<number> }) => {
  // Increased count significantly to fill upper interior
  const count = 140; 
  
  const gifts = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      // 50% Base Pile, 50% Interior Fill
      const isBase = i < count / 2;
      
      let targetPos;
      if (isBase) {
        // Base Pile distribution
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 2.2 + 1.2; 
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const y = -TREE_HEIGHT/2 + (Math.random() * 0.8) - 0.2; 
        targetPos = new THREE.Vector3(x, y, z);
      } else {
        // Interior Fill distribution
        // Distribute along height, bias towards bottom but reach top
        const t = Math.random() * 0.75; // Up to 75% height
        const y = TREE_HEIGHT * t - TREE_HEIGHT / 2;
        
        // Random placement INSIDE the cone at this height
        const maxR = (TREE_WIDTH * 0.85) * (1 - t);
        const r = Math.sqrt(Math.random()) * maxR; // Uniform disk
        const theta = Math.random() * Math.PI * 2;
        
        targetPos = new THREE.Vector3(
           r * Math.cos(theta),
           y,
           r * Math.sin(theta)
        );
      }

      // Chaos Position for Scatter
      const chaosPos = getChaosPos(25, 0.2); 

      const scale = Math.random() * 0.4 + 0.3;
      const palettes = [
          { box: '#b30000', ribbon: '#ffbf00' }, 
          { box: '#005500', ribbon: '#b30000' }, 
          { box: '#f0f0f0', ribbon: '#b30000' }, 
          { box: '#b30000', ribbon: '#f0f0f0' }, 
          { box: '#002244', ribbon: '#c0c0c0' }, 
          { box: '#ffbf00', ribbon: '#f0f0f0' }, 
      ];
      const theme = palettes[Math.floor(Math.random() * palettes.length)];
      return { 
          target: targetPos,
          chaos: chaosPos,
          scale, 
          boxColor: theme.box, 
          ribbonColor: theme.ribbon,
          rot: new THREE.Euler(Math.random()*0.5, Math.random() * Math.PI * 2, Math.random()*0.5) 
      };
    });
  }, []);

  return (
    <group>
       {gifts.map((d, i) => (
         <GiftBox key={i} {...d} progressRef={progressRef} />
       ))}
    </group>
  );
}

const GiftBox = ({ target, chaos, scale, boxColor, ribbonColor, rot, progressRef }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  const currentPos = useRef(target.clone());
  
  // Reuse Geometries via useMemo? 
  // For simplicity keeping inside, but ideally should be outside.
  // Given low count (140), it's acceptable.
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const progress = progressRef.current;
    
    // Scatter Movement
    const dest = progress > 0.5 ? chaos : target;
    currentPos.current.lerp(dest, delta * 2.5);
    groupRef.current.position.copy(currentPos.current);
    
    // Rotation
    if (progress > 0.2) {
       // Spin in chaos
       groupRef.current.rotation.x += delta * 0.5;
       groupRef.current.rotation.y += delta * 0.5;
    } else {
       // Reset to initial random rotation
       groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, rot.x, delta * 5);
       groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, rot.y, delta * 5);
       groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, rot.z, delta * 5);
    }
    
    // Scale: slightly larger in chaos
    const s = scale * (1 + progress * 0.3);
    groupRef.current.scale.setScalar(s);
  });

  return (
    <group ref={groupRef}>
       <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={boxColor} roughness={0.3} />
       </mesh>
       <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1.02, 1.02, 0.15]} />
          <meshStandardMaterial color={ribbonColor} metalness={0.3} roughness={0.2} />
       </mesh>
       <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.15, 1.02, 1.02]} />
          <meshStandardMaterial color={ribbonColor} metalness={0.3} roughness={0.2} />
       </mesh>
       <mesh position={[0, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusKnotGeometry args={[0.22, 0.04, 64, 8, 2, 3]} /> 
            <meshStandardMaterial color={ribbonColor} metalness={0.3} roughness={0.2} />
       </mesh>
    </group>
  )
}

/**
 * Sub-Component: Foliage (Particle System)
 */
const Foliage = ({ progressRef }: { progressRef: React.MutableRefObject<number> }) => {
  const count = 9000;
  const meshRef = useRef<THREE.Points>(null);
  
  const { aTargetPos, aChaosPos, aRandom } = useMemo(() => {
    const target = new Float32Array(count * 3);
    const chaos = new Float32Array(count * 3);
    const random = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const t = 1 - Math.sqrt((i + 1) / (count + 1));
      const theta = i * GOLDEN_ANGLE;
      
      const tPos = getTreePos(t, theta, TREE_HEIGHT, TREE_WIDTH);
      const noiseAmp = 0.05;
      tPos.x += (Math.random() - 0.5) * noiseAmp;
      tPos.y += (Math.random() - 0.5) * noiseAmp;
      tPos.z += (Math.random() - 0.5) * noiseAmp;
      
      target[i * 3] = tPos.x;
      target[i * 3 + 1] = tPos.y;
      target[i * 3 + 2] = tPos.z;

      // Keep hollow shell for chaos
      const cPos = getChaosPos(25, 0.5);
      chaos[i * 3] = cPos.x;
      chaos[i * 3 + 1] = cPos.y;
      chaos[i * 3 + 2] = cPos.z;

      random[i] = Math.random();
    }
    return { aTargetPos: target, aChaosPos: chaos, aRandom: random };
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uSize: { value: 1.8 }, 
  }), []);

  useFrame((state) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = state.clock.elapsedTime;
      mat.uniforms.uProgress.value = THREE.MathUtils.lerp(mat.uniforms.uProgress.value, progressRef.current, 0.1);
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={aTargetPos} itemSize={3} />
        <bufferAttribute attach="attributes-aTargetPos" count={count} array={aTargetPos} itemSize={3} />
        <bufferAttribute attach="attributes-aChaosPos" count={count} array={aChaosPos} itemSize={3} />
        <bufferAttribute attach="attributes-aRandom" count={count} array={aRandom} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={foliageVertexShader}
        fragmentShader={foliageFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

/**
 * Sub-Component: Ornaments (Balls, Candy Canes, etc)
 */
const OrnamentLayer = ({ 
  count, 
  color, 
  geometry, 
  scaleBase,
  progressRef,
  emissiveIntensity = 0.3,
  interior = false 
}: { 
  count: number, 
  color: string, 
  geometry: THREE.BufferGeometry, 
  scaleBase: number,
  progressRef: React.MutableRefObject<number>,
  emissiveIntensity?: number,
  interior?: boolean
}) => {
  const data = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      // Determine Position
      let t, theta, rScale;
      
      if (interior) {
          // Interior: Random height, Random radius inside volume
          t = Math.random(); 
          theta = Math.random() * Math.PI * 2;
          // Sqrt for uniform disk distribution
          // 0.8 scale to ensure it's inside foliage
          rScale = Math.sqrt(Math.random()) * 0.8; 
      } else {
          // Surface: Golden Angle spiral on shell
          t = 1 - Math.sqrt((i + 1) / (count + 1));
          theta = i * GOLDEN_ANGLE * 13.0; 
          rScale = 1.0;
      }
      
      // Pass the scaled width directly to getTreePos
      const target = getTreePos(t, theta, TREE_HEIGHT, TREE_WIDTH * 0.9 * rScale);

      return {
        target: target,
        chaos: getChaosPos(20, 0.3),
        scale: Math.random() * 0.5 + 0.5,
        rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      }
    });
  }, [count, interior]);

  return (
    <Instances range={count} geometry={geometry}>
      <meshStandardMaterial 
        color={color} 
        roughness={0.2} 
        metalness={0.9} 
        emissive={color}
        emissiveIntensity={emissiveIntensity}
      />
      {data.map((d, i) => (
        <OrnamentInstance 
          key={i} 
          data={d} 
          scaleBase={scaleBase} 
          progressRef={progressRef} 
        />
      ))}
    </Instances>
  );
};

const OrnamentInstance = ({ data, scaleBase, progressRef }: any) => {
  const ref = useRef<any>(null);
  const { target, chaos, scale } = data;
  const currentPos = useRef(target.clone());

  useFrame((_, delta) => {
    if (!ref.current) return;
    
    const progress = progressRef.current;
    const dest = progress > 0.5 ? chaos : target;
    currentPos.current.lerp(dest, delta * 3);

    ref.current.position.copy(currentPos.current);
    
    const s = scaleBase * scale * (1 - progress * 0.3);
    ref.current.scale.set(s, s, s);
    
    // Continuous rotation
    ref.current.rotation.x += delta;
    ref.current.rotation.y += delta;
  });

  return <Instance ref={ref} />;
};

/**
 * Sub-Component: Photo Plane for Polaroids
 */
const PhotoPlane = ({ url }: { url: string }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) return;
    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false; 
      setTexture(tex);
    });
  }, [url]);

  if (!texture) return null;

  return (
    <mesh ref={meshRef} position={[0, 0.08, 0.011]} rotation={[0, 0, 0]}>
      <planeGeometry args={[0.7, 0.7]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} /> 
    </mesh>
  );
};

/**
 * Sub-Component: Polaroids
 */
const Polaroids = ({ progressRef }: { progressRef: React.MutableRefObject<number> }) => {
  const { userPhotos } = useTreeStore();
  const count = 48;
  const geometry = useMemo(() => new THREE.BoxGeometry(0.5, 0.625, 0.01), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ 
    color: '#ffffff', 
    roughness: 0.9,
    metalness: 0.0 
  }), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map((_, i) => {
      const t = 1 - Math.sqrt((i+1)/(count+1));
      const theta = i * GOLDEN_ANGLE;
      return {
        target: getTreePos(t, theta, TREE_HEIGHT, TREE_WIDTH * 1.1),
        chaos: getChaosPos(12, 0),
        // Random tilt for chaos mode (Angle in Radians)
        // x: lean back/forward, z: tilt left/right
        tilt: { 
            x: (Math.random() - 0.5) * 0.5, // +/- ~15 deg
            z: (Math.random() - 0.5) * 0.5  // +/- ~15 deg
        }
      }
    });
  }, [count]);

  return (
    <group>
      {data.map((d, i) => {
        const photoUrl = userPhotos.length > 0 ? userPhotos[i % userPhotos.length] : null;
        return (
          <SinglePolaroid 
            key={`${i}-${photoUrl || 'empty'}`} 
            data={d} 
            progressRef={progressRef} 
            geometry={geometry} 
            material={material}
            photoUrl={photoUrl}
          />
        );
      })}
    </group>
  );
};

const SinglePolaroid = ({ data, progressRef, geometry, material, photoUrl }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  const currentPos = useRef(data.target.clone());
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const progress = progressRef.current;
    
    const dest = progress > 0.5 ? data.chaos : data.target;
    currentPos.current.lerp(dest, delta * 2);
    groupRef.current.position.copy(currentPos.current);
    
    // Scale: Double size (2.0) when scattered
    const targetScale = progress > 0.5 ? 2.0 : 1.0;
    const currentScale = groupRef.current.scale.x;
    const newScale = THREE.MathUtils.lerp(currentScale, targetScale, delta * 3);
    groupRef.current.scale.setScalar(newScale);

    if (progress > 0.5) {
        // Chaos State (Open Hand):
        // 1. Look at camera
        groupRef.current.lookAt(state.camera.position);
        // 2. Apply random relaxed tilt (local axes)
        groupRef.current.rotateX(data.tilt.x);
        groupRef.current.rotateZ(data.tilt.z);
    } else {
        // Tree State: Strict upright facing outward
        const angle = Math.atan2(currentPos.current.x, currentPos.current.z);
        groupRef.current.rotation.set(0, angle, 0);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {photoUrl ? (
        <PhotoPlane url={photoUrl} />
      ) : (
        <mesh position={[0, 0.08, 0.011]}>
           <planeGeometry args={[0.5, 0.5]} />
           <meshStandardMaterial color="#111" roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}


/**
 * Main Component: LuxuryTree
 */
const LuxuryTree: React.FC = () => {
  const rotatingGroupRef = useRef<THREE.Group>(null);
  const { isHandOpen } = useTreeStore();
  const progressRef = useRef(0);
  const { viewport } = useThree(); // Access viewport for responsive logic

  // Responsive Check: Mobile is roughly when width < height (Portrait)
  const isMobile = viewport.width < viewport.height;
  
  // Geometries
  const ballGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);
  // Candy Cane Hook shape
  const candyGeo = useMemo(() => new THREE.TorusGeometry(0.5, 0.1, 8, 16, Math.PI), []);
  // Abstract Deer/Cone
  const deerGeo = useMemo(() => new THREE.ConeGeometry(0.2, 0.8, 4), []);

  useFrame((state, delta) => {
    const target = isHandOpen ? 1 : 0;
    progressRef.current = THREE.MathUtils.lerp(progressRef.current, target, delta * 2.0);

    if (rotatingGroupRef.current) {
       rotatingGroupRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group>
      <group ref={rotatingGroupRef}>
        <Foliage progressRef={progressRef} />

        {/* --- SURFACE ORNAMENTS --- */}
        <OrnamentLayer count={80} color="#ffcc00" geometry={ballGeo} scaleBase={0.15} progressRef={progressRef} emissiveIntensity={0.5} />
        <OrnamentLayer count={60} color="#800080" geometry={ballGeo} scaleBase={0.12} progressRef={progressRef} />
        <OrnamentLayer count={40} color="#ff0000" geometry={ballGeo} scaleBase={0.08} progressRef={progressRef} />
        
        {/* Lights */}
        <OrnamentLayer count={16} color="#ff0055" geometry={ballGeo} scaleBase={0.06} progressRef={progressRef} emissiveIntensity={3.5} />
        <OrnamentLayer count={16} color="#00ff55" geometry={ballGeo} scaleBase={0.06} progressRef={progressRef} emissiveIntensity={3.5} />
        <OrnamentLayer count={16} color="#0055ff" geometry={ballGeo} scaleBase={0.06} progressRef={progressRef} emissiveIntensity={3.5} />
        <OrnamentLayer count={16} color="#ffaa00" geometry={ballGeo} scaleBase={0.06} progressRef={progressRef} emissiveIntensity={3.5} />

        {/* New Decorations */}
        <OrnamentLayer count={40} color="#ff3333" geometry={candyGeo} scaleBase={0.15} progressRef={progressRef} />
        <OrnamentLayer count={25} color="#d4af37" geometry={deerGeo} scaleBase={0.3} progressRef={progressRef} emissiveIntensity={0.2} />


        {/* --- INTERIOR FILL (Doubling Density) --- */}
        {/* Interior Balls */}
        <OrnamentLayer count={80} color="#ffcc00" geometry={ballGeo} scaleBase={0.15} progressRef={progressRef} emissiveIntensity={0.5} interior={true} />
        <OrnamentLayer count={60} color="#800080" geometry={ballGeo} scaleBase={0.12} progressRef={progressRef} interior={true} />
        <OrnamentLayer count={40} color="#ff0000" geometry={ballGeo} scaleBase={0.08} progressRef={progressRef} interior={true} />
        
        {/* Interior Lights */}
        <OrnamentLayer count={16} color="#ff0055" geometry={ballGeo} scaleBase={0.06} progressRef={progressRef} emissiveIntensity={3.5} interior={true} />
        <OrnamentLayer count={16} color="#00ff55" geometry={ballGeo} scaleBase={0.06} progressRef={progressRef} emissiveIntensity={3.5} interior={true} />
        <OrnamentLayer count={16} color="#0055ff" geometry={ballGeo} scaleBase={0.06} progressRef={progressRef} emissiveIntensity={3.5} interior={true} />
        <OrnamentLayer count={16} color="#ffaa00" geometry={ballGeo} scaleBase={0.06} progressRef={progressRef} emissiveIntensity={3.5} interior={true} />

        {/* Interior Candy & Deer */}
        <OrnamentLayer count={40} color="#ff3333" geometry={candyGeo} scaleBase={0.15} progressRef={progressRef} interior={true} />
        <OrnamentLayer count={25} color="#d4af37" geometry={deerGeo} scaleBase={0.3} progressRef={progressRef} emissiveIntensity={0.2} interior={true} />

        <Polaroids progressRef={progressRef} />
        <HolyStar progressRef={progressRef} />
        <DynamicGifts progressRef={progressRef} />
      </group>
      
      {/* Responsive Text Layout with FURTHER REDUCED DENSITY (50% of previous) */}
      <ParticleText 
        text="MERRY" 
        position={isMobile ? [0, 5.8, 0] : [-6.5, 0, 0]} 
        size={isMobile ? 0.6 : 1.2} 
        density={isMobile ? 2000 : 4000} // Reduced significantly
        progressRef={progressRef} 
      />
      <ParticleText 
        text="CHRISTMAS" 
        position={isMobile ? [0, 4.8, 0] : [8.5, 0, 0]} 
        size={isMobile ? 0.6 : 1.2} 
        density={isMobile ? 2400 : 4800} // Reduced significantly
        progressRef={progressRef} 
      />

    </group>
  );
};

export default LuxuryTree;