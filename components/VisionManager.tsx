import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { useTreeStore } from '../store';
import { LoadingStatus } from '../types';

const VisionManager: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<LoadingStatus>(LoadingStatus.INITIALIZING);
  const setHandPosition = useTreeStore((state) => state.setHandPosition);
  
  // Refs for loop management
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    const setupVision = async () => {
      try {
        setStatus(LoadingStatus.LOADING_MODEL);
        
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });

        setStatus(LoadingStatus.READY);
        startWebcam();
      } catch (error) {
        console.error("Error initializing vision:", error);
        setStatus(LoadingStatus.ERROR);
      }
    };

    setupVision();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      }
    } catch (err) {
      console.error("Webcam access denied", err);
      setStatus(LoadingStatus.ERROR);
    }
  };

  /**
   * Simple logic to detect if hand is open.
   * We check if the finger tips are further from the wrist than the PIP joints (knuckles).
   * Landmarks:
   * 0: Wrist
   * Tips: 8 (Index), 12 (Middle), 16 (Ring), 20 (Pinky)
   * PIPs: 6, 10, 14, 18
   */
  const isHandOpen = (landmarks: NormalizedLandmark[]): boolean => {
    const wrist = landmarks[0];
    
    // Check 4 fingers (Index, Middle, Ring, Pinky)
    const distSq = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
      return Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
    };

    const fingerIndices = [
      { tip: 8, pip: 6 },   // Index
      { tip: 12, pip: 10 }, // Middle
      { tip: 16, pip: 14 }, // Ring
      { tip: 20, pip: 18 }  // Pinky
    ];

    let openFingers = 0;
    for (const finger of fingerIndices) {
      const distTip = distSq(wrist, landmarks[finger.tip]);
      const distPip = distSq(wrist, landmarks[finger.pip]);
      if (distTip > distPip) {
        openFingers++;
      }
    }

    // Heuristic: If 3 or more fingers are extended, it's an "Open Hand"
    return openFingers >= 3;
  };

  const predictWebcam = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (!video || !canvas || !landmarker) return;

    // Detection Loop
    const detect = () => {
      if (video.currentTime > 0) {
        const results = landmarker.detectForVideo(video, performance.now());
        
        // Clear canvas for debug drawing
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          
          // 1. Get Hand Position
          // Use Middle Finger MCP (9) as center anchor
          const center = landmarks[9];
          const wrist = landmarks[0];

          // X: Mirror the X coordinate (1 - x) because webcam is mirrored
          const handX = 1 - center.x; 
          
          // Y: Inverted for camera control (Moving hand UP on screen (y->0) means we want to look DOWN from above?)
          // Prompt: "Hand move UP, look from ABOVE". 
          // Screen Y 0 is Top. So Hand Up -> Y is small.
          const handY = center.y;

          // Z: Scale proxy. Distance from Wrist to Middle Finger MCP.
          // Close hand -> Large Dist. Far hand -> Small Dist.
          const dx = center.x - wrist.x;
          const dy = center.y - wrist.y;
          const handSize = Math.sqrt(dx*dx + dy*dy);
          // Normalize rough range: Far ~0.1, Close ~0.4?
          // We pass raw size, let App clamp/lerp it.
          
          // 2. Detect Gesture (Open vs Closed)
          const isOpen = isHandOpen(landmarks);

          // Update Zustand store
          setHandPosition(handX, handY, handSize, true, isOpen);

          // Draw landmarks for feedback
          if (ctx) {
            const drawingUtils = new DrawingUtils(ctx);
            drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
              color: isOpen ? "#00FFFF" : "#FF00FF", // Cyan for Open, Magenta for Closed
              lineWidth: 2
            });
            drawingUtils.drawLandmarks(landmarks, { 
              color: isOpen ? "#FFFFFF" : "#FF0000", 
              lineWidth: 1,
              radius: 3
            });
          }
        } else {
          // No hand detected
          // setHandPosition(0.5, 0.5, 0.2, false, false);
          // Keep last known or reset? Resetting is safer for UX to prevent stuck camera
          // But gentle return is better handled in App.tsx. 
          // We just flag isTracking = false
          useTreeStore.getState().setHandPosition(0.5, 0.5, 0.5, false, false);
        }
      }
      requestRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col items-end pointer-events-none">
      {/* UI Feedback Status */}
      <div className={`
        px-4 py-2 rounded-full mb-2 backdrop-blur-md border font-mono text-xs transition-all duration-500
        ${status === LoadingStatus.READY 
          ? 'bg-green-500/20 border-green-500/50 text-green-200' 
          : 'bg-blue-500/20 border-blue-500/50 text-blue-200'}
      `}>
        {status === LoadingStatus.READY ? "System Active" : "Initializing Vision..."}
      </div>

      {/* Hidden container for webcam processing, visible for debugging/feedback */}
      <div className="relative w-32 h-24 rounded-lg overflow-hidden border border-white/20 bg-black/50 backdrop-blur">
         {/* Helper message overlay */}
         {status === LoadingStatus.READY && (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] text-white/70 text-center px-1 z-10 font-mono leading-tight">
             <span>Open Hand</span>
             <span className="opacity-50 text-[8px] mt-1">Move to Orbit<br/>Push/Pull to Zoom</span>
           </div>
         )}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          style={{ transform: 'scaleX(-1)' }} 
        />
        <canvas 
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover z-20"
          style={{ transform: 'scaleX(-1)' }} 
        />
      </div>
    </div>
  );
};

export default VisionManager;