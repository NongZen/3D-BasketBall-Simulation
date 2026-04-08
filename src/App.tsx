import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- Physics & Court Constants ---
const GRAVITY = 9.8; 
const BACKBOARD_Z = -13.3;
const HOOP_CENTER = new THREE.Vector3(0, 3.05, -12.85); 

const BACKBOARD_COR_Z = 0.75; 
const BACKBOARD_COR_XY = 0.90; 
const RIM_COR = 0.6; 

const VIRTUAL_HOOP_CENTER = new THREE.Vector3(0, 3.05, BACKBOARD_Z - (HOOP_CENTER.z - BACKBOARD_Z) / BACKBOARD_COR_Z);

const BALL_MASS = 0.624; 
const PUSH_TIME = 0.2; 
const BALL_RADIUS = 0.12;
const TUBE_RADIUS = 0.02; 

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // --- UI & Simulation State ---
  const [startX, setStartX] = useState<number>(0);
  const [startZ, setStartZ] = useState<number>(-5.6);
  const [startY, setStartY] = useState<number>(1.5);
  
  const [yawAngle, setYawAngle] = useState<number>(0);
  const [angle, setAngle] = useState<number>(55);
  const [force, setForce] = useState<number>(29.5);
  
  const [isDashed, setIsDashed] = useState<boolean>(true); 
  const [isShooting, setIsShooting] = useState<boolean>(false);
  const [aimMode, setAimMode] = useState<'swish' | 'bank' | 'manual'>('manual');
  const [interactionMode, setInteractionMode] = useState<'camera' | 'shooter'>('camera');

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [scrubPercent, setScrubPercent] = useState<number>(0);
  const [isUIVisible, setIsUIVisible] = useState<boolean>(true);
  
  const [scorePopup, setScorePopup] = useState<{show: boolean, text: string, id: number}>({show: false, text: '', id: 0});

  const stateRef = useRef({
    startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode,
    playbackSpeed, scrubPercent,
    ballT: 0, 
    trajectoryPoints: [] as THREE.Vector3[],
    hitBackboard: false,
    hitRim: false,
    scoreDetected: false,
    scorePointIndex: -1,
    hasTriggeredScore: false 
  });

  useEffect(() => {
    stateRef.current = { ...stateRef.current, startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode, playbackSpeed, scrubPercent };
  }, [startX, startZ, startY, yawAngle, angle, force, isDashed, isShooting, aimMode, interactionMode, playbackSpeed, scrubPercent]);

  useEffect(() => {
    const handleScore = (e: any) => {
      setScorePopup({ show: true, text: e.detail.text, id: Date.now() });
      setTimeout(() => setScorePopup(prev => ({ ...prev, show: false })), 2000); 
    };
    window.addEventListener('score-effect', handleScore);
    return () => window.removeEventListener('score-effect', handleScore);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.target.position.set(0, 0, -7);
    scene.add(dirLight.target);

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

    // --- ระบบตาข่าย (Net Physics) ---
    const netGeo = new THREE.CylinderGeometry(0.22, 0.15, 0.35, 16, 4, true);
    const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6 });
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(HOOP_CENTER.x, HOOP_CENTER.y - 0.175, HOOP_CENTER.z);
    scene.add(netMesh);

    const shooterGeo = new THREE.CylinderGeometry(0.3, 0.3, 1);
    const shooterMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
    const shooter = new THREE.Mesh(shooterGeo, shooterMat);
    scene.add(shooter);

    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    scene.add(ball);

    const maxInst = 500; 
    const trajGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.7, 16, 16); 
    const trajMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }); 
    const trajMesh = new THREE.InstancedMesh(trajGeo, trajMat, maxInst);
    
    const colorDefault = new THREE.Color(0x10b981); 
    const colorScore = new THREE.Color(0xfbbf24);   
    
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

    // --- PHYSICS ENGINE ---
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
      const maxSteps = 4000; 
      const generatedPoints = [pos.clone()];
      
      let hitMarker = false;
      let hitRimTracker = false;
      let scoreDetected = false;
      let scorePointIndex = -1;

      for (let i = 0; i < maxSteps; i++) {
        vel.y -= GRAVITY * simDt;
        let nextPos = pos.clone().addScaledVector(vel, simDt);

        if (!scoreDetected && vel.y < 0 && pos.y > HOOP_CENTER.y && nextPos.y <= HOOP_CENTER.y) {
          let dx = nextPos.x - HOOP_CENTER.x;
          let dz = nextPos.z - HOOP_CENTER.z;
          if (Math.sqrt(dx*dx + dz*dz) < 0.22) { 
            scoreDetected = true;
            scorePointIndex = generatedPoints.length; 
          }
        }

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
             
             if (distToRing > 0.0001 && distToRing < BALL_RADIUS + TUBE_RADIUS) {
               let normal = new THREE.Vector3().subVectors(nextPos, closestRingPoint).normalize();
               let dot = vel.dot(normal);
               
               if (dot < 0) { 
                 vel.sub(normal.clone().multiplyScalar((1 + RIM_COR) * dot)); 
                 let overlap = (BALL_RADIUS + TUBE_RADIUS) - distToRing;
                 nextPos.add(normal.clone().multiplyScalar(overlap + 0.005));
                 hitRimTracker = true; 
               }
             }
          }
        }

        // กระทบพื้น - หยุดวิถีลูกบอลทันที
        if (nextPos.y <= BALL_RADIUS) {
          let fraction = (pos.y - BALL_RADIUS) / (pos.y - nextPos.y);
          nextPos.lerpVectors(pos, nextPos, fraction);
          pos.copy(nextPos);
          generatedPoints.push(pos.clone());
          break; // จบการคำนวณทันที ลูกจะไม่เด้งต่อ
        }

        pos.copy(nextPos);
        if (i % 4 === 0) generatedPoints.push(pos.clone());
      }

      stateRef.current.trajectoryPoints = generatedPoints;
      stateRef.current.hitBackboard = hitMarker;
      stateRef.current.hitRim = hitRimTracker;
      stateRef.current.scoreDetected = scoreDetected;
      stateRef.current.scorePointIndex = scorePointIndex;
      marker.visible = hitMarker;

      trajMesh.visible = isDashed;
      if (isDashed) {
        const stepSkip = Math.max(1, Math.floor(generatedPoints.length / maxInst)); 
        const drawCount = Math.min(maxInst, Math.floor(generatedPoints.length / stepSkip));
        
        trajMesh.count = drawCount;
        for (let i = 0; i < drawCount; i++) {
           let pointIndex = i * stepSkip;
           dummy.position.copy(generatedPoints[pointIndex]);
           dummy.updateMatrix();
           trajMesh.setMatrixAt(i, dummy.matrix);
           
           if (scoreDetected && Math.abs(pointIndex - scorePointIndex) < 18) {
             trajMesh.setColorAt(i, colorScore);
           } else {
             trajMesh.setColorAt(i, colorDefault);
           }
        }
        trajMesh.instanceMatrix.needsUpdate = true;
        if (trajMesh.instanceColor) trajMesh.instanceColor.needsUpdate = true;
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

      // --- อนิเมชันตาข่ายบาสเกตบอล ---
      let ballDy = HOOP_CENTER.y - ball.position.y;
      let ballDist = Math.sqrt(Math.pow(ball.position.x - HOOP_CENTER.x, 2) + Math.pow(ball.position.z - HOOP_CENTER.z, 2));
      
      if (ballDy > 0 && ballDy < 0.6 && ballDist < 0.22) {
          let stretch = Math.sin((ballDy / 0.6) * Math.PI); 
          netMesh.scale.y = 1.0 + stretch * 0.5;
          netMesh.position.y = (HOOP_CENTER.y - 0.175) - (stretch * 0.08);
      } else {
          netMesh.scale.y = THREE.MathUtils.lerp(netMesh.scale.y, 1.0, 0.15);
          netMesh.position.y = THREE.MathUtils.lerp(netMesh.position.y, HOOP_CENTER.y - 0.175, 0.15);
      }

      if (stateRef.current.isShooting) {
        const prevY = ball.position.y;
        
        stateRef.current.ballT += dt * stateRef.current.playbackSpeed; 
        const pts = stateRef.current.trajectoryPoints;
        const simDt = 0.005 * 4; 
        
        if (pts.length > 0) {
          const indexExact = stateRef.current.ballT / simDt;
          const indexFloor = Math.floor(indexExact);
          
          if (indexFloor >= pts.length - 1) {
            ball.position.copy(pts[pts.length - 1]);
            setIsShooting(false); // อนิเมชันจบที่พื้นพอดี
          } else {
            const p1 = pts[indexFloor];
            const p2 = pts[indexFloor + 1];
            const fraction = indexExact - indexFloor;
            ball.position.lerpVectors(p1, p2, fraction);
          }
        } else {
          setIsShooting(false);
        }

        // โชว์คะแนนตอนทะลุห่วง
        const currY = ball.position.y;
        if (prevY > HOOP_CENTER.y && currY <= HOOP_CENTER.y) {
          let dx = ball.position.x - HOOP_CENTER.x;
          let dz = ball.position.z - HOOP_CENTER.z;
          if (Math.sqrt(dx*dx + dz*dz) < 0.22) {
            if (!stateRef.current.hasTriggeredScore) {
              stateRef.current.hasTriggeredScore = true;
              let text = '🔥 SCORE!';
              if (!stateRef.current.hitRim && !stateRef.current.hitBackboard) {
                  text = '💦 SWISH!'; 
              } else if (stateRef.current.hitBackboard) {
                  text = '💥 BANK SHOT!';
              }
              window.dispatchEvent(new CustomEvent('score-effect', { detail: { text } }));
            }
          }
        }

      } else {
        updateTrajectoryPhysics();
        const pts = stateRef.current.trajectoryPoints;
        if (pts.length > 0) {
          const maxIndex = pts.length - 1;
          const targetIndex = Math.floor((stateRef.current.scrubPercent / 100) * maxIndex);
          ball.position.copy(pts[targetIndex]); 
        } else {
          ball.position.set(stateRef.current.startX, stateRef.current.startY, stateRef.current.startZ);
        }
        stateRef.current.ballT = 0; 
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

  const calculateAutoAim = (mode: 'swish' | 'bank') => {
    const target = mode === 'bank' ? VIRTUAL_HOOP_CENTER : HOOP_CENTER;
    
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

    const finalYawRad = baseYaw + (requiredYawOffset * Math.PI / 180);
    const dirX = Math.sin(finalYawRad);
    const dirZ = Math.cos(finalYawRad);

    let dh = 0;
    if (mode === 'swish') {
       dh = Math.sqrt(dxTarget * dxTarget + dzTarget * dzTarget);
    } else {
       let tToBoard = (BACKBOARD_Z - startZ) / dirZ;
       let hitX = startX + tToBoard * dirX;
       let dist1 = Math.sqrt(Math.pow(hitX - startX, 2) + Math.pow(BACKBOARD_Z - startZ, 2));
       let dist2 = Math.sqrt(Math.pow(HOOP_CENTER.x - hitX, 2) + Math.pow(HOOP_CENTER.z - BACKBOARD_Z, 2));
       dh = dist1 + dist2;
    }

    const dy = HOOP_CENTER.y - startY;
    
    const minAngleDeg = Math.atan2(dy, dh) * 180 / Math.PI;
    if (angle <= minAngleDeg + 1) {
      alert(`❌ มุมการยิง ${angle}° ต่ำเกินไป! ไม่มีทางถึงห่วงได้จากระยะนี้\n(กรุณาปรับองศาขึ้นเป็น ${Math.ceil(minAngleDeg) + 5}° ขึ้นไปครับ)`);
      return;
    }

    const angleRad = angle * Math.PI / 180;
    let finalForce = force;

    if (mode === 'swish') {
       const tanTheta = Math.tan(angleRad);
       const cosTheta = Math.cos(angleRad);
       const denom = dh * tanTheta - dy;
       const v0_sq = (0.5 * GRAVITY * dh * dh) / (cosTheta * cosTheta * denom);
       finalForce = (Math.sqrt(v0_sq) * BALL_MASS) / PUSH_TIME;
    } 
    else {
       let minF = 1;
       let maxF = 150;
       for (let i = 0; i < 50; i++) {
          let testF = (minF + maxF) / 2;
          let v0 = (testF * PUSH_TIME) / BALL_MASS;
          let vel = new THREE.Vector3(v0 * Math.cos(angleRad) * dirX, v0 * Math.sin(angleRad), v0 * Math.cos(angleRad) * dirZ);
          let pos = new THREE.Vector3(startX, startY, startZ);
          let simDt = 0.005;

          let traveledDist = 0;
          let reachedHeight = false;
          let exactDist = 0;

          for (let step = 0; step < 3000; step++) {
              vel.y -= GRAVITY * simDt;
              let nextPos = pos.clone().addScaledVector(vel, simDt);

              if (vel.z < 0 && pos.z > BACKBOARD_Z && nextPos.z <= BACKBOARD_Z) {
                   nextPos.z = BACKBOARD_Z + (BACKBOARD_Z - nextPos.z) * BACKBOARD_COR_Z;
                   vel.z *= -BACKBOARD_COR_Z;
                   vel.x *= BACKBOARD_COR_XY;
                   vel.y *= BACKBOARD_COR_XY;
              }

              let stepDist = Math.sqrt(Math.pow(nextPos.x - pos.x, 2) + Math.pow(nextPos.z - pos.z, 2));
              traveledDist += stepDist;

              if (vel.y < 0 && pos.y >= HOOP_CENTER.y && nextPos.y < HOOP_CENTER.y) {
                  let fraction = (pos.y - HOOP_CENTER.y) / (pos.y - nextPos.y);
                  exactDist = traveledDist - stepDist + (stepDist * fraction);
                  reachedHeight = true;
                  break;
              }
              if (nextPos.y < BALL_RADIUS) break;
              pos.copy(nextPos);
          }

          if (!reachedHeight) {
              minF = testF; 
          } else {
              if (exactDist < dh) minF = testF; 
              else maxF = testF; 
          }
          finalForce = testF;
       }
    }

    setForce(parseFloat(finalForce.toFixed(2)));
    setAimMode(mode);
    setScrubPercent(0); 
  };

  const handleScrubChange = (val: number) => {
    if (isShooting) setIsShooting(false); 
    setScrubPercent(val);
  };

  const resetScrubber = () => {
    setScrubPercent(0);
    setIsShooting(false);
    setAimMode('manual');
  };

  const triggerShoot = () => {
    stateRef.current.hasTriggeredScore = false; 
    setIsShooting(true);
    setScrubPercent(0);
  };

  const distanceToHoop = Math.sqrt(Math.pow(startX - HOOP_CENTER.x, 2) + Math.pow(startZ - HOOP_CENTER.z, 2)).toFixed(2);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#111827', overflow: 'hidden' }} className="font-sans">
      
      <style>{`
        @keyframes popScore {
          0% { transform: scale(0.5) translateY(20px); opacity: 0; filter: drop-shadow(0 0 10px rgba(251,191,36,0.8)); }
          20% { transform: scale(1.2) translateY(-10px); opacity: 1; filter: drop-shadow(0 0 25px rgba(251,191,36,1)); }
          80% { transform: scale(1) translateY(0); opacity: 1; filter: drop-shadow(0 0 15px rgba(251,191,36,0.8)); }
          100% { transform: scale(0.8) translateY(-20px); opacity: 0; }
        }
        .animate-score {
          animation: popScore 2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>

      <div 
        ref={containerRef} 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        className={interactionMode === 'shooter' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'} 
      />

      {scorePopup.show && (
        <div key={scorePopup.id} className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <h2 className="animate-score text-7xl md:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-orange-500 to-red-600 uppercase">
            {scorePopup.text}
          </h2>
        </div>
      )}

      <button
        onClick={() => setIsUIVisible(!isUIVisible)}
        className="absolute top-4 right-4 z-[60] bg-gray-900/90 hover:bg-gray-700 backdrop-blur-md border border-gray-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-2xl transition-all cursor-pointer text-xl"
        title={isUIVisible ? "ซ่อนเมนู" : "ตั้งค่า"}
      >
        {isUIVisible ? '✖️' : '⚙️'}
      </button>

      <div className={`ui-overlay absolute top-4 left-4 bg-gray-900/85 backdrop-blur-md p-4 pb-8 rounded-2xl shadow-2xl border border-gray-700 w-[340px] text-white select-none z-50 max-h-[calc(100vh-2rem)] overflow-y-auto transition-all duration-300 ease-in-out ${isUIVisible ? 'translate-x-0 opacity-100' : '-translate-x-[120%] opacity-0 pointer-events-none'}`}>
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

          <div className="space-y-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">⏱️ ควบคุมเวลา & อนิเมชัน</div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-gray-300">ความเร็วการยิง (Speed)</label>
                <span className="text-xs text-purple-400">{playbackSpeed.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.1" max="3" step="0.1" value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className="w-full accent-purple-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
            </div>
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
            <button onClick={() => calculateAutoAim('swish')} className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm transition-colors flex justify-between items-center">
              <span>🎯 Auto-Aim (ยิงลงห่วงตรง)</span>{aimMode === 'swish' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </button>
            <button onClick={() => calculateAutoAim('bank')} className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm transition-colors flex justify-between items-center">
              <span>📐 Auto-Aim (ยิงชิ่งแป้น)</span>{aimMode === 'bank' && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </button>
            <button onClick={triggerShoot} disabled={isShooting} className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-gray-400 rounded-lg text-base font-bold shadow-lg transition-colors mt-2 mb-2">
              {isShooting ? 'กำลังยิง...' : '🏀 ยิง (SHOOT)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}