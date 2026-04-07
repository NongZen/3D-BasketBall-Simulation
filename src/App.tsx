import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- Physics & Court Constants ---
const GRAVITY = 9.8; // m/s^2
const BACKBOARD_Z = -13.3;
const HOOP_CENTER = new THREE.Vector3(0, 3.05, -12.85); 

// การสูญเสียพลังงานเมื่อกระทบ (Restitution) เพื่อความสมจริง
const BACKBOARD_COR_Z = 0.75; 
const BACKBOARD_COR_XY = 0.90; 
const RIM_COR = 0.6; 

// ปรับเป้าหมายจำลองให้ชดเชยกับการสูญเสียพลังงานของแป้นบาส
const VIRTUAL_HOOP_CENTER = new THREE.Vector3(0, 3.05, BACKBOARD_Z - (HOOP_CENTER.z - BACKBOARD_Z) / BACKBOARD_COR_Z);

const BALL_MASS = 0.624; // kg
const PUSH_TIME = 0.2; // seconds
const BALL_RADIUS = 0.12;
const TUBE_RADIUS = 0.02; // ความหนาของเหล็กห่วง

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // --- UI & Simulation State ---
  const [startX, setStartX] = useState<number>(0);
  const [startZ, setStartZ] = useState<number>(-2);
  const [startY, setStartY] = useState<number>(1.5);
  
  const [yawAngle, setYawAngle] = useState<number>(0);
  const [angle, setAngle] = useState<number>(50);
  const [force, setForce] = useState<number>(35);
  
  const [isDashed, setIsDashed] = useState<boolean>(true); 
  const [isShooting, setIsShooting] = useState<boolean>(false);
  const [aimMode, setAimMode] = useState<'swish' | 'bank' | 'manual'>('manual');
  const [interactionMode, setInteractionMode] = useState<'camera' | 'shooter'>('camera');

  // --- New Time Control States ---
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [scrubPercent, setScrubPercent] = useState<number>(0);

  const stateRef = useRef({
    startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode,
    playbackSpeed, scrubPercent,
    ballT: 0, 
    trajectoryPoints: [] as THREE.Vector3[],
  });

  useEffect(() => {
    stateRef.current = { ...stateRef.current, startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode, playbackSpeed, scrubPercent };
  }, [startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode, playbackSpeed, scrubPercent]);

  useEffect(() => {
    if (!containerRef.current) return;
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

    const ftLineGeo = new THREE.PlaneGeometry(4.9, 0.08);
    const ftLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const ftLine = new THREE.Mesh(ftLineGeo, ftLineMat);
    ftLine.rotation.x = -Math.PI/2;
    ftLine.position.set(0, 0.015, BACKBOARD_Z + 5.8);
    courtGroup.add(ftLine);

    const ftCircleGeo = new THREE.RingGeometry(1.8, 1.88, 64);
    const ftCircleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const ftCircle = new THREE.Mesh(ftCircleGeo, ftCircleMat);
    ftCircle.rotation.x = -Math.PI / 2;
    ftCircle.position.set(0, 0.015, BACKBOARD_Z + 5.8);
    courtGroup.add(ftCircle);

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

    const innerBoxMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 4 });
    const innerBoxGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.3, 3.05, BACKBOARD_Z + 0.03),
      new THREE.Vector3(0.3, 3.05, BACKBOARD_Z + 0.03),
      new THREE.Vector3(0.3, 3.5, BACKBOARD_Z + 0.03),
      new THREE.Vector3(-0.3, 3.5, BACKBOARD_Z + 0.03),
      new THREE.Vector3(-0.3, 3.05, BACKBOARD_Z + 0.03),
    ]);
    const innerBox = new THREE.Line(innerBoxGeo, innerBoxMat);
    scene.add(innerBox);

    const rimGeo = new THREE.TorusGeometry(0.22, TUBE_RADIUS, 16, 32);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xff4400, roughness: 0.5 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.copy(HOOP_CENTER);
    scene.add(rim);

    const shooterGeo = new THREE.CylinderGeometry(0.3, 0.3, 1);
    const shooterMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    const shooter = new THREE.Mesh(shooterGeo, shooterMat);
    scene.add(shooter);

    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    scene.add(ball);

    const maxInst = 300; 
    const trajGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.9, 16, 16);
    const trajMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.25 });
    const trajMesh = new THREE.InstancedMesh(trajGeo, trajMat, maxInst);
    scene.add(trajMesh);
    const dummy = new THREE.Object3D(); 

    const markerGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.visible = false;
    scene.add(marker);

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
        setScrubPercent(0);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);

    const getShootingDirection = (sx: number, sz: number, yawDeg: number) => {
      const dxHoop = HOOP_CENTER.x - sx;
      const dzHoop = HOOP_CENTER.z - sz;
      const baseYaw = Math.atan2(dxHoop, dzHoop); 
      const finalYawRad = baseYaw + (yawDeg * Math.PI / 180);
      return { dirX: Math.sin(finalYawRad), dirZ: Math.cos(finalYawRad) };
    };

    const updateTrajectoryPhysics = () => {
      const { angle, force, startX, startZ, startY, yawAngle, isDashed } = stateRef.current;
      
      const { dirX, dirZ } = getShootingDirection(startX, startZ, yawAngle);
      const v0 = (force * PUSH_TIME) / BALL_MASS;
      
      let pos = new THREE.Vector3(startX, startY, startZ);
      let vel = new THREE.Vector3(
        (v0 * Math.cos(angle * Math.PI / 180)) * dirX,
        v0 * Math.sin(angle * Math.PI / 180),
        (v0 * Math.cos(angle * Math.PI / 180)) * dirZ
      );
      
      const simDt = 0.005; 
      const maxSteps = 2500;
      const generatedPoints = [pos.clone()];
      let hitMarker = false;

      for (let i = 0; i < maxSteps; i++) {
        vel.y -= GRAVITY * simDt;
        let nextPos = pos.clone().addScaledVector(vel, simDt);

        if (vel.z < 0 && pos.z > BACKBOARD_Z && nextPos.z <= BACKBOARD_Z) {
          if (nextPos.x >= -0.9 && nextPos.x <= 0.9 && nextPos.y >= 3.025 && nextPos.y <= 4.075) {
            nextPos.z = BACKBOARD_Z + (BACKBOARD_Z - nextPos.z) * BACKBOARD_COR_Z;
            vel.z *= -BACKBOARD_COR_Z;
            vel.x *= BACKBOARD_COR_XY;
            vel.y *= BACKBOARD_COR_XY;
            if (!hitMarker) {
              marker.position.set(nextPos.x, nextPos.y, BACKBOARD_Z + 0.03);
              hitMarker = true;
            }
          }
        }

        if (Math.abs(nextPos.y - HOOP_CENTER.y) < BALL_RADIUS + TUBE_RADIUS) {
          let dx = nextPos.x - HOOP_CENTER.x;
          let dz = nextPos.z - HOOP_CENTER.z;
          let horizDist = Math.sqrt(dx*dx + dz*dz);

          if (Math.abs(horizDist - 0.22) < BALL_RADIUS + TUBE_RADIUS) {
             let closestRingPoint = new THREE.Vector3(
               HOOP_CENTER.x + (dx/horizDist) * 0.22,
               HOOP_CENTER.y,
               HOOP_CENTER.z + (dz/horizDist) * 0.22
             );
             let distToRing = nextPos.distanceTo(closestRingPoint);
             
             if (distToRing < BALL_RADIUS + TUBE_RADIUS) {
               let normal = new THREE.Vector3().subVectors(nextPos, closestRingPoint).normalize();
               let dot = vel.dot(normal);
               if (dot < 0) {
                 vel.sub(normal.multiplyScalar((1 + RIM_COR) * dot)); 
                 let overlap = (BALL_RADIUS + TUBE_RADIUS) - distToRing;
                 nextPos.add(normal.multiplyScalar(overlap + 0.001));
               }
             }
          }
        }

        if (nextPos.y <= BALL_RADIUS) {
          let fraction = (pos.y - BALL_RADIUS) / (pos.y - nextPos.y);
          nextPos.lerpVectors(pos, nextPos, fraction);
          pos.copy(nextPos);
          generatedPoints.push(pos.clone());
          break; 
        }

        pos.copy(nextPos);
        if (i % 4 === 0) generatedPoints.push(pos.clone());
      }

      stateRef.current.trajectoryPoints = generatedPoints;
      marker.visible = hitMarker;

      trajMesh.visible = isDashed;
      if (isDashed) {
        const stepSkip = Math.max(1, Math.floor(generatedPoints.length / maxInst)); 
        const drawCount = Math.min(maxInst, Math.floor(generatedPoints.length / stepSkip));
        
        trajMesh.count = drawCount;
        for (let i = 0; i < drawCount; i++) {
           dummy.position.copy(generatedPoints[i * stepSkip]);
           dummy.updateMatrix();
           trajMesh.setMatrixAt(i, dummy.matrix);
        }
        trajMesh.instanceMatrix.needsUpdate = true;
      }
    };

    let animationFrameId: number;
    let lastTime = 0;

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);
      if (lastTime === 0) lastTime = time;
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      controls.enabled = stateRef.current.interactionMode === 'camera';
      shooter.scale.set(1, stateRef.current.startY, 1);
      shooter.position.set(stateRef.current.startX, stateRef.current.startY / 2, stateRef.current.startZ);

      if (stateRef.current.isShooting) {
        // นำค่า Playback Speed มาคูณกับระยะเวลาเพื่อเร่ง/ลดความเร็วอนิเมชัน
        stateRef.current.ballT += dt * stateRef.current.playbackSpeed; 
        
        const pts = stateRef.current.trajectoryPoints;
        const simDt = 0.005 * 4; 
        
        if (pts.length > 0) {
          const indexExact = stateRef.current.ballT / simDt;
          const indexFloor = Math.floor(indexExact);
          
          if (indexFloor >= pts.length - 1) {
            ball.position.copy(pts[pts.length - 1]);
            setIsShooting(false);
          } else {
            const p1 = pts[indexFloor];
            const p2 = pts[indexFloor + 1];
            const fraction = indexExact - indexFloor;
            ball.position.lerpVectors(p1, p2, fraction);
          }
        } else {
          setIsShooting(false);
        }
      } else {
        // กรณีไม่ได้กำลังกดยิง (ดูภาพนิ่ง หรือ เลื่อน Scrubber)
        updateTrajectoryPhysics();
        const pts = stateRef.current.trajectoryPoints;
        if (pts.length > 0) {
          const maxIndex = pts.length - 1;
          const targetIndex = Math.floor((stateRef.current.scrubPercent / 100) * maxIndex);
          ball.position.copy(pts[targetIndex]); // อัปเดตตำแหน่งลูกบอลตาม% ของแถบเลื่อนเวลา
        } else {
          ball.position.set(stateRef.current.startX, stateRef.current.startY, stateRef.current.startZ);
        }
        stateRef.current.ballT = 0; // เคลียร์เวลาสำหรับตอนกดยิงจริงๆ
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

  const calculateAutoAim = (target: THREE.Vector3, mode: 'swish' | 'bank') => {
    const dxHoop = HOOP_CENTER.x - startX;
    const dzHoop = HOOP_CENTER.z - startZ;
    const baseYaw = Math.atan2(dxHoop, dzHoop);

    const dxTarget = target.x - startX;
    const dzTarget = target.z - startZ;
    const targetYaw = Math.atan2(dxTarget, dzTarget);

    let requiredYawOffset = (targetYaw - baseYaw) * (180 / Math.PI);
    if (requiredYawOffset > 180) requiredYawOffset -= 360;
    if (requiredYawOffset < -180) requiredYawOffset += 360;
    
    setYawAngle(parseFloat(requiredYawOffset.toFixed(2)));

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
    setScrubPercent(0); // รีเซ็ตสไลเดอร์เวลาเมื่อกด Auto-Aim
  };

  const handleScrubChange = (val: number) => {
    if (isShooting) setIsShooting(false); // ยกเลิกอนิเมชันถ้าผู้ใช้ดึงสไลเดอร์เวลา
    setScrubPercent(val);
  };

  const resetScrubber = () => {
    setScrubPercent(0);
    setIsShooting(false);
    setAimMode('manual');
  };

  const distanceToHoop = Math.sqrt(Math.pow(startX - HOOP_CENTER.x, 2) + Math.pow(startZ - HOOP_CENTER.z, 2)).toFixed(2);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#111827', overflow: 'hidden' }} className="font-sans">
      
      <div 
        ref={containerRef} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        className={interactionMode === 'shooter' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} 
      />

      <div className="ui-overlay absolute top-4 left-4 bg-gray-900/85 backdrop-blur-md p-4 pb-8 rounded-2xl shadow-2xl border border-gray-700 w-[340px] text-white select-none z-10 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <h1 className="text-xl font-bold mb-3 text-blue-400">3D Hoops Sim</h1>
        
        <div className="flex bg-gray-800 p-1 rounded-lg mb-4 border border-gray-700">
          <button onClick={() => setInteractionMode('camera')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${interactionMode === 'camera' ? 'bg-blue-600 text-white shadow' : 'text-gray-400'}`}>🎥 หมุนกล้อง</button>
          <button onClick={() => setInteractionMode('shooter')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${interactionMode === 'shooter' ? 'bg-blue-600 text-white shadow' : 'text-gray-400'}`}>🏃 ย้ายจุดยิง</button>
        </div>
        
        <div className="space-y-3">
          
          <div className="space-y-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">📍 ตำแหน่ง & ความสูง</div>
            
            <div className="mb-2 pb-2 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <label className="text-xs text-yellow-500 font-bold">📏 ระยะห่างจากแป้นบนพื้น</label>
                <span className="text-sm text-yellow-400 font-mono bg-gray-900 px-2 py-0.5 rounded">{distanceToHoop} m</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">ตำแหน่ง X</label><span className="text-xs text-blue-300">{startX}m</span></div>
              <input type="range" min="-7.5" max="7.5" step="0.1" value={startX} onChange={(e) => { setStartX(parseFloat(e.target.value)); resetScrubber(); }} className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">ตำแหน่ง Z</label><span className="text-xs text-blue-300">{startZ}m</span></div>
              <input type="range" min="-14" max="0" step="0.1" value={startZ} onChange={(e) => { setStartZ(parseFloat(e.target.value)); resetScrubber(); }} className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">ความสูงคนยิง (Height)</label><span className="text-xs text-blue-300">{startY}m</span></div>
              <input type="range" min="0.5" max="3" step="0.1" value={startY} onChange={(e) => { setStartY(parseFloat(e.target.value)); resetScrubber(); }} className="w-full accent-blue-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>

          <div className="space-y-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">🎯 การเล็ง & แรง</div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-gray-300">องศาซ้าย-ขวา (Yaw)</label>
                <span className="text-xs text-emerald-400">{yawAngle > 0 ? `ขวา ${yawAngle}°` : yawAngle < 0 ? `ซ้าย ${Math.abs(yawAngle)}°` : 'ตรง 0°'}</span>
              </div>
              <input type="range" min="-60" max="60" step="0.1" value={yawAngle} onChange={(e) => { setYawAngle(parseFloat(e.target.value)); resetScrubber(); }} className="w-full accent-emerald-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">องศาเงยยิง (Pitch)</label><span className="text-xs text-emerald-400">{angle}°</span></div>
              <input type="range" min="10" max="85" step="1" value={angle} onChange={(e) => { setAngle(parseFloat(e.target.value)); resetScrubber(); }} className="w-full accent-emerald-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs text-gray-300">แรงยิง (Force)</label><span className="text-xs text-emerald-400">{force} N</span></div>
              <input type="range" min="10" max="100" step="0.1" value={force} onChange={(e) => { setForce(parseFloat(e.target.value)); resetScrubber(); }} className="w-full accent-emerald-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>

          {/* New Box: Time & Animation Control */}
          <div className="space-y-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">⏱️ ควบคุมเวลา & อนิเมชัน</div>
            
            {/* สไลเดอร์ความเร็ว Playback */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-gray-300">ความเร็วการยิง (Speed)</label>
                <span className="text-xs text-purple-400">{playbackSpeed.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.1" max="3" step="0.1" value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className="w-full accent-purple-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>

            {/* สไลเดอร์เลื่อนเวลา */}
            <div className="pt-1">
              <div className="flex justify-between mb-1">
                <label className="text-xs text-gray-300">เลื่อนดูเวลา (Scrub Time)</label>
                <span className="text-xs text-orange-400">{scrubPercent}%</span>
              </div>
              <input type="range" min="0" max="100" step="1" value={scrubPercent} onChange={(e) => handleScrubChange(parseFloat(e.target.value))} className="w-full accent-orange-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          </div>

          <div className="flex items-center space-x-2 px-1">
            <input type="checkbox" id="lineStyle" checked={isDashed} onChange={(e) => setIsDashed(e.target.checked)} className="w-4 h-4 accent-emerald-500 rounded cursor-pointer" />
            <label htmlFor="lineStyle" className="text-sm text-gray-300 cursor-pointer">เปิดวิถีลูกบอลผี (Ghost Trail)</label>
          </div>

          <div className="space-y-2 pt-2">
            <button onClick={() => calculateAutoAim(HOOP_CENTER, 'swish')} className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm transition-colors flex justify-between items-center">
              <span>🎯 Auto-Aim (ยิงลงห่วงตรง)</span>{aimMode === 'swish' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </button>
            <button onClick={() => calculateAutoAim(VIRTUAL_HOOP_CENTER, 'bank')} className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm transition-colors flex justify-between items-center">
              <span>📐 Auto-Aim (ยิงชิ่งแป้น)</span>{aimMode === 'bank' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </button>
            <button onClick={() => { setIsShooting(true); setScrubPercent(0); }} disabled={isShooting} className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-gray-400 rounded-lg text-base font-bold shadow-lg transition-colors mt-2 mb-2">
              {isShooting ? 'กำลังยิง...' : '🏀 ยิง (SHOOT)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}