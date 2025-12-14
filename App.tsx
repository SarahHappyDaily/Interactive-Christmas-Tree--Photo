import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { OrbitControls, Environment, PerspectiveCamera, Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import LuxuryTree from './components/ParticleTree'; 
import VisionManager from './components/VisionManager';
import { useTreeStore } from './store';

// --- Camera Controller Component ---
const GestureController = () => {
  const { camera } = useThree();
  const { handX, handY, handZ, isTracking } = useTreeStore();
  
  // Smooth damped values
  // Initial position matches the screenshot: Centered [0], slightly up [2], distance [14]
  const currentPos = useRef(new THREE.Vector3(0, 2, 14));
  const targetPos = useRef(new THREE.Vector3(0, 2, 14));

  useFrame((state, delta) => {
    // Enable gesture control whenever a hand is tracked (Open or Closed)
    if (isTracking) {
      // Mapping Hand Gestures to Camera Position
      
      // 1. Azimuth (Orbit Left/Right)
      const azimuth = (handX - 0.5) * 2.5; 
      
      // 2. Elevation (Orbit Up/Down)
      const elevation = THREE.MathUtils.lerp(8, -2, handY);
      
      // 3. Distance (Zoom/Push/Pull)
      const zInput = THREE.MathUtils.clamp(handZ, 0.05, 0.35);
      const distance = THREE.MathUtils.mapLinear(zInput, 0.05, 0.35, 22, 6);

      // Convert Spherical to Cartesian
      targetPos.current.set(
        distance * Math.sin(azimuth),
        elevation,
        distance * Math.cos(azimuth)
      );

      // Lerp camera position for smoothness
      currentPos.current.lerp(targetPos.current, delta * 3); // Fast response
      
      camera.position.copy(currentPos.current);
      camera.lookAt(0, 3, 0); // Look at tree center
    } else {
       // When not tracking, we leave the camera where it is.
       // Sync ref to current camera pos so it doesn't jump when hand returns
       currentPos.current.copy(camera.position);
    }
  });

  return null;
};

const App: React.FC = () => {
  const { addUserPhotos, isTracking } = useTreeStore();

  // Helper function to compress images
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 512; 
          let width = img.width;
          let height = img.height;

          if (width > height) {
             width = height; 
          } else {
             height = width;
          }
          canvas.width = MAX_SIZE;
          canvas.height = MAX_SIZE;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            const sSize = Math.min(img.width, img.height);
            const sx = (img.width - sSize) / 2;
            const sy = (img.height - sSize) / 2;
            ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, MAX_SIZE, MAX_SIZE);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          } else {
            resolve(img.src); 
          }
        };
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileList = Array.from(files) as File[];
      
      try {
        const compressedPhotos = await Promise.all(
          fileList.map((file) => compressImage(file))
        );
        addUserPhotos(compressedPhotos);
      } catch (err) {
        console.error("Error processing photos:", err);
      }
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#020205]">
      
      {/* Upload Button Area */}
      <div className="absolute bottom-8 right-8 z-50 flex flex-col items-end gap-2">
         <label className="cursor-pointer group">
           <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
           <div className="flex items-center gap-3 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/20 rounded-full hover:bg-white/20 hover:border-amber-400/50 transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.5)] group-hover:shadow-[0_0_20px_rgba(255,200,100,0.3)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-200 group-hover:text-amber-100 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-amber-100/80 font-mono text-xs tracking-widest group-hover:text-white transition-colors">UPLOAD MEMORIES</span>
           </div>
         </label>
      </div>

      {/* 2. Vision Logic (Webcam) */}
      <VisionManager />

      {/* 3. 3D Scene */}
      <Canvas
        dpr={[1, 2]} 
        gl={{ antialias: false, toneMappingExposure: 1.2 }} 
        shadows
      >
        <PerspectiveCamera makeDefault position={[0, 2, 14]} fov={50} />
        
        {/* Gesture Controller */}
        <GestureController />

        {/* Dark Starry Background */}
        <color attach="background" args={['#020005']} />
        
        {/* Environment: Stars & Dust */}
        <Stars radius={100} depth={50} count={7000} factor={6} saturation={0} fade speed={0.5} />
        <Sparkles count={800} scale={15} size={4} speed={0.3} opacity={0.6} color="#ffd700" />
        
        {/* Warm Magical Lighting */}
        <ambientLight intensity={0.2} color="#503060" /> 
        <spotLight 
          position={[10, 20, 10]} 
          angle={0.5} 
          penumbra={1} 
          intensity={2.8} 
          color="#ffaa55" 
          castShadow 
          shadow-bias={-0.0001}
        />
        <pointLight position={[-8, 6, -8]} intensity={2} color="#cc33ff" distance={20} /> 
        <pointLight position={[0, -2, 5]} intensity={1} color="#ff3333" distance={10} /> 
        
        <Environment preset="city" blur={0.8} />

        <Suspense fallback={null}>
          <LuxuryTree />
          
          <EffectComposer enableNormalPass={false}>
            <Bloom luminanceThreshold={0.8} mipmapBlur intensity={1.5} radius={0.5} />
            <Vignette eskil={false} offset={0.1} darkness={0.8} />
            <Noise opacity={0.02} />
          </EffectComposer>
        </Suspense>

        {/* Controls: Disabled when tracking active to prevent conflict */}
        <OrbitControls 
          enabled={!isTracking}
          enableZoom={true} 
          enablePan={false} 
          autoRotate={false}
          maxPolarAngle={Math.PI / 1.6}
          minPolarAngle={Math.PI / 3}
        />
      </Canvas>
      
      <div className="absolute bottom-6 w-full text-center text-amber-500/20 text-[10px] tracking-[0.5em] pointer-events-none font-mono">
        MERRY CHRISTMAS • 2024
      </div>
    </div>
  );
};

export default App;