import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- Physics & Court Constants ---
const GRAVITY = 9.8; // m/s^2
const START_Y = 1.5; // Shooter's release height
const BACKBOARD_Z = -13.3; // Z coordinate of the backboard plane
const HOOP_CENTER = new THREE.Vector3(0, 3.05, -12.85); // Standard hoop height is 3.05m
// Virtual hoop is mirrored across the backboard for bank shot calculations
const VIRTUAL_HOOP_CENTER = new THREE.Vector3(
  0, 
  3.05, 
  BACKBOARD_Z - (HOOP_CENTER.z - BACKBOARD_Z)
);

const BALL_MASS = 0.624; // kg
const PUSH_TIME = 0.2; // seconds

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // --- UI & Simulation State ---
  const [angle, setAngle] = useState<number>(50);
  const [force, setForce] = useState<number>(35); // Newtons
  const [startX, setStartX] = useState<number>(0);
  const [startZ, setStartZ] = useState<number>(-2);
  const [isDashed, setIsDashed] = useState<boolean>(true);
  const [isShooting, setIsShooting] = useState<boolean>(false);
  const [aimMode, setAimMode] = useState<'swish' | 'bank'>('swish');
  const [interactionMode, setInteractionMode] = useState<'camera' | 'shooter'>('camera');

  // Mutable state ref for the animation loop to avoid dependency issues
  const stateRef = useRef({
    angle,
    force,
    startX,
    startZ,
    isDashed,
    isShooting,
    aimMode,
    interactionMode,
    ballT: 0,
    hitBackboard: false,
    tHit: -1,
  });

  // Sync React state to mutable ref
  useEffect(() => {
    stateRef.current = { ...stateRef.current, angle, force, startX, startZ, isDashed, isShooting, aimMode, interactionMode };
  }, [angle, force, startX, startZ, isDashed, isShooting, aimMode, interactionMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a35); // Dark modern background
    scene.fog = new THREE.Fog(0x2a2a35, 20, 100);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 12, 15); // Adjusted to see the whole half-court

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, -7); // Look at the center of the half-court
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // --- Lights ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // --- Environment Objects ---
    // Floor (Half Court) - 15m wide, 14m deep
    const floorGeo = new THREE.PlaneGeometry(15, 14);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xc19a6b, roughness: 0.7 }); // Hardwood color
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -7);
    floor.receiveShadow = true;
    scene.add(floor);

    // Court Markings Group
    const courtGroup = new THREE.Group();
    courtGroup.position.y = 0.01; // Slightly above floor to prevent z-fighting
    scene.add(courtGroup);

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });

    // Outer Boundary Lines
    const boundaryGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-7.5, 0, 0),
      new THREE.Vector3(7.5, 0, 0),
      new THREE.Vector3(7.5, 0, -14),
      new THREE.Vector3(-7.5, 0, -14),
      new THREE.Vector3(-7.5, 0, 0),
    ]);
    const boundaryLine = new THREE.Line(boundaryGeo, lineMat);
    courtGroup.add(boundaryLine);

    // Paint area (Key)
    const paintGeo = new THREE.PlaneGeometry(4.9, 5.8);
    const paintMat = new THREE.MeshBasicMaterial({ color: 0xbf4040 });
    const paint = new THREE.Mesh(paintGeo, paintMat);
    paint.rotation.x = -Math.PI / 2;
    paint.position.set(0, 0, BACKBOARD_Z + 5.8 / 2);
    courtGroup.add(paint);

    // 3-Point Line (Arc)
    const threePtGeo = new THREE.RingGeometry(6.75, 6.85, 64, 1, Math.PI, Math.PI);
    const threePtMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const threePt = new THREE.Mesh(threePtGeo, threePtMat);
    threePt.rotation.x = -Math.PI / 2;
    threePt.position.set(0, 0, HOOP_CENTER.z);
    courtGroup.add(threePt);

    // Free throw circle
    const ftCircleGeo = new THREE.RingGeometry(1.75, 1.85, 32);
    const ftCircle = new THREE.Mesh(ftCircleGeo, threePtMat);
    ftCircle.rotation.x = -Math.PI / 2;
    ftCircle.position.set(0, 0, BACKBOARD_Z + 5.8);
    courtGroup.add(ftCircle);

    // Hoop Pole
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.05);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, 3.05 / 2, -13.8);
    pole.castShadow = true;
    scene.add(pole);

    // Backboard (Glass)
    const boardGeo = new THREE.BoxGeometry(1.8, 1.05, 0.05);
    const boardMat = new THREE.MeshStandardMaterial({ 
      color: 0xddddff, 
      transparent: true, 
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.2
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 3.55, BACKBOARD_Z);
    board.castShadow = true;
    scene.add(board);

    // Backboard Border (White)
    const borderGeo = new THREE.BoxGeometry(1.9, 1.15, 0.03);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.set(0, 3.55, BACKBOARD_Z - 0.01);
    scene.add(border);

    // Backboard inner square
    const innerBoardGeo = new THREE.PlaneGeometry(0.6, 0.45);
    const innerBoardMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    // Create a frame for the inner board instead of a solid block
    const innerBoardTop = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.05), innerBoardMat);
    innerBoardTop.position.set(0, 3.525, BACKBOARD_Z + 0.026);
    scene.add(innerBoardTop);
    
    const innerBoardBottom = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.05), innerBoardMat);
    innerBoardBottom.position.set(0, 3.075, BACKBOARD_Z + 0.026);
    scene.add(innerBoardBottom);

    const innerBoardLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.45), innerBoardMat);
    innerBoardLeft.position.set(-0.275, 3.3, BACKBOARD_Z + 0.026);
    scene.add(innerBoardLeft);

    const innerBoardRight = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.45), innerBoardMat);
    innerBoardRight.position.set(0.275, 3.3, BACKBOARD_Z + 0.026);
    scene.add(innerBoardRight);

    // Rim
    const rimGeo = new THREE.TorusGeometry(0.22, 0.02, 16, 32);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xff4400 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.copy(HOOP_CENTER);
    rim.castShadow = true;
    scene.add(rim);

    // Shooter representation
    const shooterGeo = new THREE.CylinderGeometry(0.3, 0.3, START_Y);
    const shooterMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    const shooter = new THREE.Mesh(shooterGeo, shooterMat);
    shooter.castShadow = true;
    scene.add(shooter);

    // --- Dynamic Objects ---
    // Ball
    const ballGeo = new THREE.SphereGeometry(0.12, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.castShadow = true;
    scene.add(ball);

    // Trajectory Line
    const maxPoints = 200;
    const trajGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(maxPoints * 3);
    trajGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const solidLineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 });
    const dashedLineMat = new THREE.LineDashedMaterial({ color: 0x10b981, dashSize: 0.3, gapSize: 0.15 });
    
    const trajectoryLine = new THREE.Line(trajGeo, dashedLineMat);
    scene.add(trajectoryLine);

    // Bank Shot Marker
    const markerGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.visible = false;
    scene.add(marker);

    // --- Interactive Positioning (Raycaster) ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event: PointerEvent) => {
      if (stateRef.current.interactionMode !== 'shooter') return;
      // Prevent clicking through the UI overlay
      if ((event.target as HTMLElement).closest('.ui-overlay')) return;
      if (stateRef.current.isShooting) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(floor);

      if (intersects.length > 0) {
        const pt = intersects[0].point;
        // Clamp to court boundaries
        const newX = Math.max(-7.5, Math.min(7.5, pt.x));
        const newZ = Math.max(-14, Math.min(0, pt.z));
        setStartX(parseFloat(newX.toFixed(2)));
        setStartZ(parseFloat(newZ.toFixed(2)));
      }
    };
    window.addEventListener('pointerdown', onPointerDown);

    // --- Animation & Physics Loop ---
    let animationFrameId: number;
    let lastTime = 0;

    const updateTrajectory = () => {
      const { angle, force, startX, startZ, isDashed, aimMode } = stateRef.current;
      
      // Calculate directional vector (yaw) towards the target
      const target = aimMode === 'bank' ? VIRTUAL_HOOP_CENTER : HOOP_CENTER;
      const dx = target.x - startX;
      const dz = target.z - startZ;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      
      const dirX = dx / horizontalDist;
      const dirZ = dz / horizontalDist;

      const angleRad = angle * Math.PI / 180;
      
      // Physics: v0 = (Force * PUSH_TIME) / BALL_MASS
      const v0 = (force * PUSH_TIME) / BALL_MASS;
      
      const v0_y = v0 * Math.sin(angleRad);
      const v0_h = v0 * Math.cos(angleRad);
      const v0_x = v0_h * dirX;
      const v0_z = v0_h * dirZ;
      
      let hitBackboard = false;
      let tHit = -1;
      let ptCount = 0;
      
      for (let i = 0; i < maxPoints; i++) {
        const t = i * 0.02; // Time step
        let x = startX + v0_x * t;
        const y = START_Y + v0_y * t - 0.5 * GRAVITY * t * t;
        let z = startZ + v0_z * t;
        
        if (y < 0) break; // Hit floor
        
        // Check backboard intersection
        // If shooting towards the backboard (negative Z direction) and crosses the plane
        if (!hitBackboard && v0_z < 0 && z <= BACKBOARD_Z && startZ > BACKBOARD_Z) {
          const tInt = (BACKBOARD_Z - startZ) / v0_z;
          const yInt = START_Y + v0_y * tInt - 0.5 * GRAVITY * tInt * tInt;
          const xInt = startX + v0_x * tInt;
          
          // Check if within backboard physical bounds
          if (Math.abs(xInt) <= 0.9 && Math.abs(yInt - 3.55) <= 0.525) {
            hitBackboard = true;
            tHit = tInt;
            marker.position.set(xInt, yInt, BACKBOARD_Z + 0.03); // Slightly in front of backboard
          }
        }
        
        // Reflect trajectory after hitting backboard
        if (hitBackboard && t > tHit) {
          z = BACKBOARD_Z + (BACKBOARD_Z - z); // Reflect Z
        }
        
        positions[ptCount * 3] = x;
        positions[ptCount * 3 + 1] = y;
        positions[ptCount * 3 + 2] = z;
        ptCount++;
      }
      
      trajGeo.setDrawRange(0, ptCount);
      trajGeo.attributes.position.needsUpdate = true;
      trajectoryLine.material = isDashed ? dashedLineMat : solidLineMat;
      if (isDashed) trajectoryLine.computeLineDistances();
      
      marker.visible = hitBackboard;
      stateRef.current.hitBackboard = hitBackboard;
      stateRef.current.tHit = tHit;
    };

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);
      
      // Custom delta time calculation
      if (lastTime === 0) lastTime = time;
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // Update controls state
      controls.enabled = stateRef.current.interactionMode === 'camera';

      // Update shooter position
      shooter.position.set(stateRef.current.startX, START_Y / 2, stateRef.current.startZ);

      if (stateRef.current.isShooting) {
        // Animate ball
        stateRef.current.ballT += dt * 1.2; // Slightly speed up time for better game feel
        const t = stateRef.current.ballT;
        
        const { angle, force, startX, startZ, aimMode } = stateRef.current;
        const target = aimMode === 'bank' ? VIRTUAL_HOOP_CENTER : HOOP_CENTER;
        const dx = target.x - startX;
        const dz = target.z - startZ;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        
        const dirX = dx / horizontalDist;
        const dirZ = dz / horizontalDist;

        const angleRad = angle * Math.PI / 180;
        
        // Physics: v0 = (Force * PUSH_TIME) / BALL_MASS
        const v0 = (force * PUSH_TIME) / BALL_MASS;
        
        const v0_y = v0 * Math.sin(angleRad);
        const v0_h = v0 * Math.cos(angleRad);
        const v0_x = v0_h * dirX;
        const v0_z = v0_h * dirZ;
        
        let x = startX + v0_x * t;
        const y = START_Y + v0_y * t - 0.5 * GRAVITY * t * t;
        let z = startZ + v0_z * t;

        // Apply reflection if it hit the backboard
        if (stateRef.current.hitBackboard && t > stateRef.current.tHit) {
          z = BACKBOARD_Z + (BACKBOARD_Z - z);
        }

        ball.position.set(x, y, z);

        // Stop if it hits the floor
        if (y < 0.12) {
          ball.position.y = 0.12;
          setIsShooting(false);
        }
      } else {
        // Reset ball to shooter's hand and update trajectory
        ball.position.set(stateRef.current.startX, START_Y, stateRef.current.startZ);
        stateRef.current.ballT = 0;
        updateTrajectory();
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      containerRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // --- UI Handlers & Math Logic ---
  const handleShoot = () => {
    setIsShooting(true);
  };

  const calculateAutoAim = (target: THREE.Vector3, mode: 'swish' | 'bank') => {
    const dx = target.x - startX;
    const dz = target.z - startZ;
    const dh = Math.sqrt(dx * dx + dz * dz); // Horizontal distance to target
    const dy = target.y - START_Y; // Vertical distance to target
    
    const angleRad = angle * Math.PI / 180;
    const tanTheta = Math.tan(angleRad);
    const cosTheta = Math.cos(angleRad);
    
    // Kinematic equation solved for v0^2:
    // y = x * tan(theta) - (g * x^2) / (2 * v0^2 * cos^2(theta))
    const denom = dh * tanTheta - dy;
    
    if (denom <= 0) {
      alert("Angle is too low to reach the target from this distance! Please increase the angle.");
      return;
    }
    
    const v0_sq = (0.5 * GRAVITY * dh * dh) / (cosTheta * cosTheta * denom);
    const requiredV0 = Math.sqrt(v0_sq);
    
    // Convert required v0 back to Force (Newtons)
    // Force = (v0 * BALL_MASS) / PUSH_TIME
    const requiredForce = (requiredV0 * BALL_MASS) / PUSH_TIME;
    
    setForce(parseFloat(requiredForce.toFixed(2)));
    setAimMode(mode);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900 font-sans">
      {/* 3D Canvas Container */}
      <div 
        ref={containerRef} 
        className={`absolute inset-0 ${interactionMode === 'shooter' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`} 
      />

      {/* UI Overlay */}
      <div className="ui-overlay absolute top-6 left-6 bg-gray-900/85 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-gray-700 w-80 text-white select-none">
        <h1 className="text-2xl font-bold mb-2 text-blue-400">3D Hoops Sim</h1>
        
        {/* Interaction Mode Toggle */}
        <div className="flex bg-gray-800 p-1 rounded-lg mb-6 border border-gray-700">
          <button
            onClick={() => setInteractionMode('camera')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              interactionMode === 'camera' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            🎥 Camera Mode
          </button>
          <button
            onClick={() => setInteractionMode('shooter')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              interactionMode === 'shooter' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            🏃 Move Shooter
          </button>
        </div>
        
        <div className="space-y-5">
          {/* Position Sliders */}
          <div className="space-y-3 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-400">Position X</label>
                <span className="text-xs font-mono text-blue-300">{startX}m</span>
              </div>
              <input 
                type="range" min="-7.5" max="7.5" step="0.1" 
                value={startX} 
                onChange={(e) => { setStartX(parseFloat(e.target.value)); setIsShooting(false); }}
                className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-400">Position Z</label>
                <span className="text-xs font-mono text-blue-300">{startZ}m</span>
              </div>
              <input 
                type="range" min="-14" max="0" step="0.1" 
                value={startZ} 
                onChange={(e) => { setStartZ(parseFloat(e.target.value)); setIsShooting(false); }}
                className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* Angle Slider */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">Shooting Angle</label>
              <span className="text-sm font-mono text-emerald-400">{angle}°</span>
            </div>
            <input 
              type="range" min="10" max="85" step="1" 
              value={angle} 
              onChange={(e) => { setAngle(parseFloat(e.target.value)); setIsShooting(false); }}
              className="w-full accent-emerald-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Force Slider */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">Shooting Force</label>
              <span className="text-sm font-mono text-emerald-400">{force} N</span>
            </div>
            <input 
              type="range" min="10" max="100" step="0.1" 
              value={force} 
              onChange={(e) => { setForce(parseFloat(e.target.value)); setIsShooting(false); }}
              className="w-full accent-emerald-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Line Style Toggle */}
          <div className="flex items-center space-x-3 pt-1">
            <input 
              type="checkbox" 
              id="lineStyle"
              checked={isDashed}
              onChange={(e) => setIsDashed(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
            <label htmlFor="lineStyle" className="text-sm font-medium text-gray-300 cursor-pointer">
              Dashed Trajectory Line
            </label>
          </div>

          <hr className="border-gray-700 my-4" />

          {/* Action Buttons */}
          <div className="space-y-2">
            <button 
              onClick={() => calculateAutoAim(HOOP_CENTER, 'swish')}
              className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm font-medium transition-colors flex justify-between items-center"
            >
              <span>🎯 Auto-Aim (Swish)</span>
              {aimMode === 'swish' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </button>
            <button 
              onClick={() => calculateAutoAim(VIRTUAL_HOOP_CENTER, 'bank')}
              className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm font-medium transition-colors flex justify-between items-center"
            >
              <span>📐 Auto-Aim (Bank)</span>
              {aimMode === 'bank' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </button>
            <button 
              onClick={handleShoot}
              disabled={isShooting}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg text-base font-bold shadow-lg transition-colors mt-4"
            >
              {isShooting ? 'Shooting...' : '🏀 SHOOT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
