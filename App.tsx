import React, { Suspense, useRef, useState } from 'react';
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
  // Adjusted Default: Z=18, Y=1.5
  const currentPos = useRef(new THREE.Vector3(0, 1.5, 18));
  const targetPos = useRef(new THREE.Vector3(0, 1.5, 18));

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
      // Range: 10 (Close) to 35 (Far)
      const distance = THREE.MathUtils.mapLinear(zInput, 0.05, 0.35, 35, 10);

      // Convert Spherical to Cartesian
      targetPos.current.set(
        distance * Math.sin(azimuth),
        elevation,
        distance * Math.cos(azimuth)
      );

      // Lerp camera position for smoothness
      currentPos.current.lerp(targetPos.current, delta * 3); // Fast response
      
      camera.position.copy(currentPos.current);
      // Look slightly higher (Y=1.5) to center the Tree + Text composition
      camera.lookAt(0, 1.5, 0); 
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Optimized helper to compress images using ObjectURL (Much faster on iOS than FileReader)
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      // Create a temporary URL pointing to the file blob
      // This avoids reading the entire file into a base64 string before processing
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      
      img.onload = () => {
        // Clean up memory immediately
        URL.revokeObjectURL(objectUrl);

        const canvas = document.createElement('canvas');
        const MAX_SIZE = 512; 
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio
        if (width > height) {
           if (width > MAX_SIZE) {
             height *= MAX_SIZE / width;
             width = MAX_SIZE;
           }
        } else {
           if (height > MAX_SIZE) {
             width *= MAX_SIZE / height;
             height = MAX_SIZE;
           }
        }
        
        canvas.width = MAX_SIZE;
        canvas.height = MAX_SIZE;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Center crop logic
          const sSize = Math.min(img.width, img.height);
          const sx = (img.width - sSize) / 2;
          const sy = (img.height - sSize) / 2;
          ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, MAX_SIZE, MAX_SIZE);
          
          // Use 0.6 quality for faster compression on mobile
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } else {
          resolve(objectUrl); // Fallback (shouldn't happen)
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(""); // Return empty on error to filter out later
      };

      img.src = objectUrl;
    });
  };

  const onConfirmUpload = () => {
    setShowPrivacyModal(false);
    // Trigger the hidden file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setIsProcessing(true);
      
      // Use setTimeout to allow the UI to re-render and show the "Processing" state
      // before the main thread gets busy with image compression.
      setTimeout(async () => {
        try {
          const fileList = Array.from(files) as File[];
          const compressedPhotos = await Promise.all(
            fileList.map((file) => compressImage(file))
          );
          // Filter out failed loads
          const validPhotos = compressedPhotos.filter(p => p.length > 0);
          addUserPhotos(validPhotos);
        } catch (err) {
          console.error("Error processing photos:", err);
        } finally {
          setIsProcessing(false);
          // Reset input value so same files can be selected again if needed
          event.target.value = '';
        }
      }, 100);
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#020205]">
      
      {/* Hidden File Input */}
      <input 
        ref={fileInputRef}
        type="file" 
        multiple 
        accept="image/*" 
        className="hidden" 
        onChange={handleFileUpload} 
      />

      {/* Upload Button Area - Increased bottom padding for mobile safe area (bottom-12) */}
      <div className="absolute bottom-12 right-8 z-50 flex flex-col items-end gap-1">
         <button 
           onClick={() => !isProcessing && setShowPrivacyModal(true)}
           disabled={isProcessing}
           className={`group outline-none focus:outline-none`}
         >
           <div className={`
             flex items-center gap-3 px-6 py-3 backdrop-blur-xl border rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.5)]
             ${isProcessing 
                ? 'bg-amber-500/20 border-amber-400/50 cursor-wait' 
                : 'bg-white/5 border-white/20 hover:bg-white/20 hover:border-amber-400/50 group-hover:shadow-[0_0_20px_rgba(255,200,100,0.3)]'
             }
           `}>
              {isProcessing ? (
                // Loading Spinner
                <svg className="animate-spin h-5 w-5 text-amber-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                // Upload Icon
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-200 group-hover:text-amber-100 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
              
              <span className={`font-mono text-xs tracking-widest transition-colors ${isProcessing ? 'text-amber-400' : 'text-amber-100/80 group-hover:text-white'}`}>
                {isProcessing ? "OPTIMIZING..." : "UPLOAD MEMORIES"}
              </span>
           </div>
         </button>
         
         {/* Helper Text */}
         <div className="flex flex-col items-end gap-1 pr-2">
           {isProcessing && (
             <span className="text-[10px] text-amber-300/80 font-mono animate-pulse">
               Adding photos...
             </span>
           )}
           <span className="text-[9px] text-white/20 font-mono tracking-wider transition-colors cursor-help">
             🔒 PRIVATE • LOCAL ONLY
           </span>
         </div>
      </div>

      {/* 2. Vision Logic (Webcam) */}
      <VisionManager />

      {/* 3. 3D Scene */}
      <Canvas
        dpr={[1, 2]} 
        gl={{ antialias: false, toneMappingExposure: 1.2 }} 
        shadows
      >
        <PerspectiveCamera makeDefault position={[0, 1.5, 18]} fov={50} />
        
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

      {/* --- Privacy & Confirmation Modal --- */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1a1a20] border border-white/10 p-6 rounded-2xl max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
             
             {/* Decorative shine */}
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"></div>

             <h3 className="text-amber-100 font-serif text-xl mb-4 tracking-wide flex items-center gap-2">
               <span className="text-2xl">🔒</span> 
               100% Secure & Local
             </h3>
             
             <div className="space-y-4">
               {/* Security Points */}
               <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/10">
                  <div className="flex gap-3 items-start">
                     <span className="text-emerald-400 text-lg mt-0.5">🛡️</span>
                     <div>
                        <h4 className="text-white text-sm font-bold">Local Storage Only</h4>
                        <p className="text-xs text-gray-400 leading-relaxed mt-1">
                          Photos stay on your device. Nothing is uploaded or saved to any server.
                        </p>
                     </div>
                  </div>
                  
                  <div className="flex gap-3 items-start">
                     <span className="text-amber-400 text-lg mt-0.5">💥</span>
                     <div>
                        <h4 className="text-white text-sm font-bold">Session Only</h4>
                        <p className="text-xs text-gray-400 leading-relaxed mt-1">
                          Everything is <strong>deleted instantly</strong> when you close the app.
                        </p>
                     </div>
                  </div>
               </div>

               {/* Wait Warning */}
               <div className="bg-amber-900/20 border border-amber-700/30 p-3 rounded-xl flex gap-3 items-center">
                  <span className="text-amber-400 text-xl">⏳</span>
                  <p className="text-amber-200/90 text-xs font-medium leading-relaxed">
                     When you finish selection, it will take around <strong>5 seconds</strong> to process.<br/>
                     Please do not exit.
                  </p>
               </div>
             </div>

             <div className="flex gap-3 mt-6">
               <button 
                 onClick={() => setShowPrivacyModal(false)}
                 className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5 transition-colors text-xs font-mono"
               >
                 CANCEL
               </button>
               <button 
                 onClick={onConfirmUpload}
                 className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-700 to-amber-600 border border-amber-500/50 text-white hover:brightness-110 transition-all text-xs font-mono tracking-wider font-bold shadow-lg shadow-amber-900/20"
               >
                 SELECT PHOTOS
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;