"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import { Component, Suspense, useRef, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";
function CapsuleModel() {
  const group = useRef<THREE.Group>(null);
  const reduced = useReducedMotion();
  useFrame((state, delta) => { if (!group.current || reduced) return; group.current.rotation.y += delta * .22; group.current.rotation.z = Math.sin(state.clock.elapsedTime * .28) * .06; });
  return <group ref={group} rotation={[.18,0,-.42]}>
    <mesh castShadow receiveShadow><cylinderGeometry args={[.72,.72,1.7,64,1,true]}/><meshPhysicalMaterial color="#8deaff" metalness={.16} roughness={.12} transmission={.86} thickness={.42} transparent opacity={.42} clearcoat={1} clearcoatRoughness={.1} side={THREE.DoubleSide}/></mesh>
    <mesh position={[0,.92,0]}><sphereGeometry args={[.72,48,24,0,Math.PI*2,0,Math.PI/2]}/><meshPhysicalMaterial color="#b7f3ff" metalness={.55} roughness={.22} clearcoat={1} emissive="#217b9d" emissiveIntensity={.12}/></mesh>
    <mesh position={[0,-.92,0]} rotation={[Math.PI,0,0]}><sphereGeometry args={[.72,48,24,0,Math.PI*2,0,Math.PI/2]}/><meshPhysicalMaterial color="#9b88ff" metalness={.48} roughness={.24} clearcoat={1} emissive="#33216f" emissiveIntensity={.25}/></mesh>
    <mesh position={[0,.24,0]}><cylinderGeometry args={[.727,.727,.075,64]}/><meshStandardMaterial color="#81e9ff" metalness={.84} roughness={.22} emissive="#44c8f4" emissiveIntensity={.62}/></mesh>
    <mesh position={[0,-.24,0]}><cylinderGeometry args={[.727,.727,.075,64]}/><meshStandardMaterial color="#a28aff" metalness={.8} roughness={.24} emissive="#7156ea" emissiveIntensity={.54}/></mesh>
    <mesh position={[0,0,.02]}><cylinderGeometry args={[.35,.35,1.3,32]}/><meshStandardMaterial color="#0c2035" metalness={.6} roughness={.32} emissive="#247ea6" emissiveIntensity={.36}/></mesh>
    <mesh position={[0,0,.38]}><torusGeometry args={[.47,.018,8,48]}/><meshBasicMaterial color="#b6f5ff"/></mesh>
  </group>;
}
function Fallback() { return <div className="scene-fallback" aria-label="A glowing glass capsule"><div className="fallback-capsule"/></div>; }
class SceneErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error){console.warn("3D capsule scene unavailable",error.message);}
  render(){return this.state.failed?<Fallback/>:this.props.children;}
}
export function CapsuleScene(){const reduced=useReducedMotion();return <SceneErrorBoundary><Canvas dpr={[1,1.6]} camera={{position:[0,0,5.1],fov:39}} gl={{alpha:true,antialias:true,powerPreference:"low-power"}} fallback={<Fallback/>} aria-label="A 3D glass time capsule"><ambientLight intensity={1.1}/><pointLight position={[3,2,3]} intensity={34} color="#6de8ff"/><pointLight position={[-3,-2,1]} intensity={24} color="#9878ff"/><spotLight position={[0,4,2]} intensity={28} angle={.6} penumbra={1} color="#d4f7ff"/><Suspense fallback={null}><Float speed={reduced?0:1.15} rotationIntensity={reduced?0:.1} floatIntensity={reduced?0:.3}><CapsuleModel/></Float><Sparkles count={36} scale={4.6} size={1.7} speed={reduced?0:.2} opacity={.45} color="#a8eaff"/></Suspense></Canvas></SceneErrorBoundary>;}
