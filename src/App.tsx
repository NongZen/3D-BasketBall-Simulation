import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- Physics & Court Constants ---
const GRAVITY = 9.8; // m/s^2
const BACKBOARD_Z = -13.3;
const HOOP_CENTER = new THREE.Vector3(0, 3.05, -12.85); 
// Virtual hoop is mirrored across the backboard for bank shot calculations
const VIRTUAL_HOOP_CENTER = new THREE.Vector3(0, 3.05, BACKBOARD_Z - (HOOP_CENTER.z - BACKBOARD_Z));

const BALL_MASS = 0.624; // kg
const PUSH_TIME = 0.2; // seconds

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // --- UI & Simulation State ---
  const [startX, setStartX] = useState<number>(0);
  const [startZ, setStartZ] = useState<number>(-2);
  const [startY, setStartY] = useState<number>(1.5); // Release Height
  
  const [yawAngle, setYawAngle] = useState<number>(0); // องศาซ้ายขวา (0 = เล็งตรงไปที่กลางห่วง)
  const [angle, setAngle] = useState<number>(50);      // องศาเงย (Pitch)
  const [force, setForce] = useState<number>(35);      // แรงยิง (Newtons)
  
  const [isDashed, setIsDashed] = useState<boolean>(true);
  const [isShooting, setIsShooting] = useState<boolean>(false);
  const [aimMode, setAimMode] = useState<'swish' | 'bank' | 'manual'>('manual');
  const [interactionMode, setInteractionMode] = useState<'camera' | 'shooter'>('camera');

  const stateRef = useRef({
    startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode,
    ballT: 0, hitBackboard: false, tHit: -1,
  });

  useEffect(() => {
    stateRef.current = { ...stateRef.current, startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode };
  }, [startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    // ล้าง Canvas เก่า
    containerRef.current.innerHTML = '';

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a35);
    scene.fog = new THREE.Fog(0x2a2a35, 20, 100);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 15, 8); 

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, -7); 
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.update();

    // --- Lights ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.target.position.set(0, 0, -7);
    scene.add(dirLight.target);

    // --- Environment Objects ---
    const floorGeo = new THREE.PlaneGeometry(15, 14);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xdaaa70, roughness: 0.8, metalness: 0.1 }); 
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -7);
    floor.receiveShadow = true;
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(15, 15, 0x000000, 0x000000);
    gridHelper.position.set(0, 0.005, -7);
    gridHelper.material.opacity = 0.1;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    const courtGroup = new THREE.Group();
    courtGroup.position.y = 0.01;
    scene.add(courtGroup);

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 });
    const boundaryGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-7.5, 0, 0), new THREE.Vector3(7.5, 0, 0),
      new THREE.Vector3(7.5, 0, -14), new THREE.Vector3(-7.5, 0, -14),
      new THREE.Vector3(-7.5, 0, 0),
    ]);
    const boundaryLine = new THREE.Line(boundaryGeo, lineMat);
    courtGroup.add(boundaryLine);

    const paintGeo = new THREE.PlaneGeometry(4.9, 5.8);
    const paintMat = new THREE.MeshStandardMaterial({ color: 0x993333, roughness: 0.8 });
    const paint = new THREE.Mesh(paintGeo, paintMat);
    paint.rotation.x = -Math.PI / 2;
    paint.position.set(0, 0, BACKBOARD_Z + 5.8 / 2);
    courtGroup.add(paint);

    const threePtGeo = new THREE.RingGeometry(6.75, 6.85, 64, 1, Math.PI, Math.PI);
    const threePtMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const threePt = new THREE.Mesh(threePtGeo, threePtMat);
    threePt.rotation.x = -Math.PI / 2;
    threePt.position.set(0, 0, HOOP_CENTER.z);
    courtGroup.add(threePt);

    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.05);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0, 3.05 / 2, -13.8);
    scene.add(pole);

    const boardGeo = new THREE.BoxGeometry(1.8, 1.05, 0.05);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xeef2ff, transparent: true, opacity: 0.75 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 3.55, BACKBOARD_Z);
    scene.add(board);

    const rimGeo = new THREE.TorusGeometry(0.22, 0.02, 16, 32);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xff4400, roughness: 0.5 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.copy(HOOP_CENTER);
    scene.add(rim);

    // สร้างคนยิงด้วยความสูง 1 unit (จะถูก scale ตาม startY ทีหลัง)
    const shooterGeo = new THREE.CylinderGeometry(0.3, 0.3, 1);
    const shooterMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    const shooter = new THREE.Mesh(shooterGeo, shooterMat);
    scene.add(shooter);

    const ballGeo = new THREE.SphereGeometry(0.12, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    scene.add(ball);

    // --- Trajectory Line ---
    const maxPoints = 200;
    const trajGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(maxPoints * 3);
    trajGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const solidLineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 3 });
    const dashedLineMat = new THREE.LineDashedMaterial({ color: 0x10b981, dashSize: 0.3, gapSize: 0.15 });
    const trajectoryLine = new THREE.Line(trajGeo, dashedLineMat);
    scene.add(trajectoryLine);

    const markerGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.visible = false;
    scene.add(marker);

    // --- Raycaster (Interaction) ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event: PointerEvent) => {
      if (stateRef.current.interactionMode !== 'shooter') return;
      if ((event.target as HTMLElement).closest('.ui-overlay')) return;
      if (stateRef.current.isShooting) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(floor);

      if (intersects.length > 0) {
        const pt = intersects[0].point;
        setStartX(parseFloat((Math.max(-7.5, Math.min(7.5, pt.x))).toFixed(2)));
        setStartZ(parseFloat((Math.max(-14, Math.min(0, pt.z))).toFixed(2)));
        setAimMode('manual');
      }
    };
    window.addEventListener('pointerdown', onPointerDown);

    // --- Helper Function: Get Direction Vector ---
    const getShootingDirection = (sx: number, sz: number, yawDeg: number) => {
      // หามุมพื้นฐานที่ชี้ตรงไปที่ห่วง
      const dxHoop = HOOP_CENTER.x - sx;
      const dzHoop = HOOP_CENTER.z - sz;
      const baseYaw = Math.atan2(dxHoop, dzHoop); 
      
      // นำองศาที่ผู้ใช้ปรับ (yawDeg) มาบวกเข้าไป
      const finalYawRad = baseYaw + (yawDeg * Math.PI / 180);
      
      return {
        dirX: Math.sin(finalYawRad),
        dirZ: Math.cos(finalYawRad)
      };
    };

    // --- Animation Loop ---
    let animationFrameId: number;
    let lastTime = 0;

    const updateTrajectory = () => {
      const { angle, force, startX, startZ, startY, yawAngle, isDashed } = stateRef.current;
      
      const { dirX, dirZ } = getShootingDirection(startX, startZ, yawAngle);
      const angleRad = angle * Math.PI / 180;
      const v0 = (force * PUSH_TIME) / BALL_MASS;
      
      const v0_y = v0 * Math.sin(angleRad);
      const v0_h = v0 * Math.cos(angleRad);
      const v0_x = v0_h * dirX;
      const v0_z = v0_h * dirZ;
      
      let hitBackboard = false;
      let tHit = -1;
      let ptCount = 0;
      
      for (let i = 0; i < maxPoints; i++) {
        const t = i * 0.02; 
        let x = startX + v0_x * t;
        const y = startY + v0_y * t - 0.5 * GRAVITY * t * t;
        let z = startZ + v0_z * t;
        
        if (y < 0) break; 
        
        if (!hitBackboard && v0_z < 0 && z <= BACKBOARD_Z && startZ > BACKBOARD_Z) {
          const tInt = (BACKBOARD_Z - startZ) / v0_z;
          const yInt = startY + v0_y * tInt - 0.5 * GRAVITY * tInt * tInt;
          const xInt = startX + v0_x * tInt;
          if (Math.abs(xInt) <= 0.9 && Math.abs(yInt - 3.55) <= 0.525) {
            hitBackboard = true;
            tHit = tInt;
            marker.position.set(xInt, yInt, BACKBOARD_Z + 0.03); 
          }
        }
        
        if (hitBackboard && t > tHit) z = BACKBOARD_Z + (BACKBOARD_Z - z);
        
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
      if (lastTime === 0) lastTime = time;
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      controls.enabled = stateRef.current.interactionMode === 'camera';
      
      // อัปเดตขนาดและตำแหน่งคนยิงตามความสูง startY
      shooter.scale.set(1, stateRef.current.startY, 1);
      shooter.position.set(stateRef.current.startX, stateRef.current.startY / 2, stateRef.current.startZ);

      if (stateRef.current.isShooting) {
        stateRef.current.ballT += dt * 1.2; 
        const t = stateRef.current.ballT;
        const { angle, force, startX, startZ, startY, yawAngle } = stateRef.current;
        
        const { dirX, dirZ } = getShootingDirection(startX, startZ, yawAngle);
        
        const v0 = (force * PUSH_TIME) / BALL_MASS;
        const v0_y = v0 * Math.sin(angle * Math.PI / 180);
        const v0_h = v0 * Math.cos(angle * Math.PI / 180);
        
        let x = startX + (v0_h * dirX) * t;
        const y = startY + v0_y * t - 0.5 * GRAVITY * t * t;
        let z = startZ + (v0_h * dirZ) * t;

        if (stateRef.current.hitBackboard && t > stateRef.current.tHit) {
          z = BACKBOARD_Z + (BACKBOARD_Z - z);
        }

        ball.position.set(x, y, z);
        if (y < 0.12) {
          ball.position.y = 0.12;
          setIsShooting(false);
        }
      } else {
        ball.position.set(stateRef.current.startX, stateRef.current.startY, stateRef.current.startZ);
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
      renderer.dispose();
    };
  }, []);

  // --- Logic คำนวณ Auto-Aim แบบรวมองศาซ้าย-ขวา ---
  const calculateAutoAim = (target: THREE.Vector3, mode: 'swish' | 'bank') => {
    // 1. คำนวณหามุมซ้ายขวา (Yaw) ที่ต้องใช้
    const dxHoop = HOOP_CENTER.x - startX;
    const dzHoop = HOOP_CENTER.z - startZ;
    const baseYaw = Math.atan2(dxHoop, dzHoop); // องศาที่ชี้ไปหาห่วงปกติ

    const dxTarget = target.x - startX;
    const dzTarget = target.z - startZ;
    const targetYaw = Math.atan2(dxTarget, dzTarget); // องศาที่ชี้ไปหาเป้าหมาย (อาจเป็นห่วงหรือเป้าชิ่ง)

    let requiredYawOffset = (targetYaw - baseYaw) * (180 / Math.PI);
    
    // จัดการ Normalize ให้ค่าองศาอยู่ในช่วง -180 ถึง 180
    if (requiredYawOffset > 180) requiredYawOffset -= 360;
    if (requiredYawOffset < -180) requiredYawOffset += 360;
    
    setYawAngle(parseFloat(requiredYawOffset.toFixed(2)));

    // 2. คำนวณหาแรง (Force) ที่ต้องใช้เพื่อยิงให้ถึงเป้าหมาย
    const dh = Math.sqrt(dxTarget * dxTarget + dzTarget * dzTarget);
    const dy = target.y - startY;
    
    const angleRad = angle * Math.PI / 180;
    const tanTheta = Math.tan(angleRad);
    const cosTheta = Math.cos(angleRad);
    const denom = dh * tanTheta - dy;
    
    if (denom <= 0) {
      alert("มุมต่ำเกินไปที่จะยิงถึงเป้าหมายจากระยะนี้ครับ ลองปรับองศาให้สูงขึ้น!");
      return;
    }
    
    const v0_sq = (0.5 * GRAVITY * dh * dh) / (cosTheta * cosTheta * denom);
    const requiredForce = (Math.sqrt(v0_sq) * BALL_MASS) / PUSH_TIME;
    
    setForce(parseFloat(requiredForce.toFixed(2)));
    setAimMode(mode);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#111827', overflow: 'hidden' }} className="font-sans">
      
      <div 
        ref={containerRef} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        className={interactionMode === 'shooter' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} 
      />

      {/* UI Overlay */}
      <div className="ui-overlay absolute top-4 left-4 bg-gray-900/85 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-gray-700 w-[340px] text-white select-none z-10 max-h-[95vh] overflow-y-auto">
        <h1 className="text-xl font-bold mb-3 text-blue-400">3D Hoops Sim</h1>
        
        <div className="flex bg-gray-800 p-1 rounded-lg mb-4 border border-gray-700">
          <button onClick={() => setInteractionMode('camera')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${interactionMode === 'camera' ? 'bg-blue-600 text-white shadow' : 'text-gray-400'}`}>🎥 หมุนกล้อง</button>
          <button onClick={() => setInteractionMode('shooter')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${interactionMode === 'shooter' ? 'bg-blue-600 text-white shadow' : 'text-gray-400'}`}>🏃 ย้ายจุดยิง</button>
        </div>
        
        <div className="space-y-3">
          
          {/* กล่อง: ตำแหน่งและความสูง */}
          <div className="space-y-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">📍 ตำแหน่ง & ความสูง</div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">ตำแหน่ง X</label><span className="text-xs text-blue-300">{startX}m</span></div>
              <input type="range" min="-7.5" max="7.5" step="0.1" value={startX} onChange={(e) => { setStartX(parseFloat(e.target.value)); setAimMode('manual'); setIsShooting(false); }} className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">ตำแหน่ง Z</label><span className="text-xs text-blue-300">{startZ}m</span></div>
              <input type="range" min="-14" max="0" step="0.1" value={startZ} onChange={(e) => { setStartZ(parseFloat(e.target.value)); setAimMode('manual'); setIsShooting(false); }} className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">ความสูงคนยิง (Height)</label><span className="text-xs text-blue-300">{startY}m</span></div>
              <input type="range" min="0.5" max="3" step="0.1" value={startY} onChange={(e) => { setStartY(parseFloat(e.target.value)); setAimMode('manual'); setIsShooting(false); }} className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>

          {/* กล่อง: การเล็งและแรง */}
          <div className="space-y-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">🎯 การเล็ง & แรง</div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-gray-300">องศาซ้าย-ขวา (Yaw)</label>
                <span className="text-xs text-emerald-400">{yawAngle > 0 ? `ขวา ${yawAngle}°` : yawAngle < 0 ? `ซ้าย ${Math.abs(yawAngle)}°` : 'ตรง 0°'}</span>
              </div>
              <input type="range" min="-60" max="60" step="0.1" value={yawAngle} onChange={(e) => { setYawAngle(parseFloat(e.target.value)); setAimMode('manual'); setIsShooting(false); }} className="w-full accent-emerald-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">องศาเงยยิง (Pitch)</label><span className="text-xs text-emerald-400">{angle}°</span></div>
              <input type="range" min="10" max="85" step="1" value={angle} onChange={(e) => { setAngle(parseFloat(e.target.value)); setAimMode('manual'); setIsShooting(false); }} className="w-full accent-emerald-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">แรงยิง (Force)</label><span className="text-xs text-emerald-400">{force} N</span></div>
              <input type="range" min="10" max="100" step="0.1" value={force} onChange={(e) => { setForce(parseFloat(e.target.value)); setAimMode('manual'); setIsShooting(false); }} className="w-full accent-emerald-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>

          <div className="flex items-center space-x-2 px-1">
            <input type="checkbox" id="lineStyle" checked={isDashed} onChange={(e) => setIsDashed(e.target.checked)} className="w-4 h-4 accent-emerald-500 rounded cursor-pointer" />
            <label htmlFor="lineStyle" className="text-sm text-gray-300 cursor-pointer">เส้นวิถีแบบประ</label>
          </div>

          <div className="space-y-2 pt-2">
            <button onClick={() => calculateAutoAim(HOOP_CENTER, 'swish')} className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm transition-colors flex justify-between items-center">
              <span>🎯 Auto-Aim (ยิงลงห่วงตรง)</span>{aimMode === 'swish' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </button>
            <button onClick={() => calculateAutoAim(VIRTUAL_HOOP_CENTER, 'bank')} className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm transition-colors flex justify-between items-center">
              <span>📐 Auto-Aim (ยิงชิ่งแป้น)</span>{aimMode === 'bank' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </button>
            <button onClick={() => setIsShooting(true)} disabled={isShooting} className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-gray-400 rounded-lg text-base font-bold shadow-lg transition-colors mt-2">
              {isShooting ? 'กำลังยิง...' : '🏀 ยิง (SHOOT)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}