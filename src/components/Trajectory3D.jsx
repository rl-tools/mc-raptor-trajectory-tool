import React, { useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line, Grid } from '@react-three/drei';
import * as THREE from 'three';

// FLU coordinate frame: X=Forward, Y=Left, Z=Up
// Camera positioned to view from front-right-above

// Single trajectory line
function TrajectoryLine({ points, color, lineWidth = 2 }) {
  if (!points || points.length < 2) return null;
  
  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
    />
  );
}

// Current position marker
function PositionMarker({ position, color = "#ef4444" }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Axis labels and grid
function AxisHelper({ size = 2 }) {
  return (
    <group>
      {/* X axis (forward) - red */}
      <Line points={[[0, 0, 0], [size, 0, 0]]} color="#ef4444" lineWidth={2} />
      {/* Y axis (left) - green */}
      <Line points={[[0, 0, 0], [0, size, 0]]} color="#22c55e" lineWidth={2} />
      {/* Z axis (up) - blue */}
      <Line points={[[0, 0, 0], [0, 0, size]]} color="#3b82f6" lineWidth={2} />
    </group>
  );
}

// Generate color for trajectory sample
function getTrajectoryColor(index, total) {
  const hue = (index * 360 / total) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

// The 3D scene content
function Scene({ trajectoryData, currentTime, isStochastic }) {
  const nSamples = trajectoryData.length;
  
  // Convert trajectory data to 3D points
  const trajectoryPoints = useMemo(() => {
    return trajectoryData.map(traj => 
      traj.map(p => [p.x, p.y, p.z || 0])
    );
  }, [trajectoryData]);
  
  // Find current position (from first trajectory)
  const currentPosition = useMemo(() => {
    if (!trajectoryData.length || !trajectoryData[0].length) return [0, 0, 0];
    const traj = trajectoryData[0];
    let closest = traj[0];
    let minDiff = Math.abs(traj[0].t - currentTime);
    for (const p of traj) {
      const diff = Math.abs(p.t - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }
    return [closest.x, closest.y, closest.z || 0];
  }, [trajectoryData, currentTime]);
  
  // Calculate bounds for camera
  const bounds = useMemo(() => {
    let maxDist = 1;
    for (const traj of trajectoryData) {
      for (const p of traj) {
        const dist = Math.sqrt(p.x * p.x + p.y * p.y + (p.z || 0) * (p.z || 0));
        if (dist > maxDist) maxDist = dist;
      }
    }
    return maxDist;
  }, [trajectoryData]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[-5, -5, 10]} />  {/* Light matching camera angle */}
      
      {/* Grid on XY plane (ground plane in FLU) - rotate 90° around X to lay flat */}
      <Grid
        args={[10, 10]}
        cellSize={0.5}
        cellColor="#555555"
        sectionSize={1}
        sectionColor="#888888"
        fadeDistance={30}
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      
      {/* Axis helper */}
      <AxisHelper size={Math.max(1, bounds * 0.5)} />
      
      {/* Trajectory lines */}
      {trajectoryPoints.map((points, idx) => (
        <TrajectoryLine
          key={idx}
          points={points}
          color={isStochastic ? getTrajectoryColor(idx, nSamples) : "#2563eb"}
          lineWidth={isStochastic ? 1 : 2}
        />
      ))}
      
      {/* Current position marker */}
      <PositionMarker position={currentPosition} />
      
      {/* Camera controls - Z is up in FLU frame */}
      <OrbitControls 
        makeDefault
        enableDamping
        dampingFactor={0.05}
        up={[0, 0, 1]}
      />
    </>
  );
}

// Main 3D plot component
export function Trajectory3D({ trajectoryData, currentTime, isStochastic }) {
  if (!trajectoryData || trajectoryData.length === 0) {
    return (
      <div className="plot-3d-empty">
        No trajectory data
      </div>
    );
  }

  return (
    <div className="plot-3d-container">
      <Canvas
        camera={{ 
          position: [-3, -3, 2],  // Rotated 90° CW around Z: X points right, Y points left from viewer
          fov: 50,
          up: [0, 0, 1]  // Z is up
        }}
        style={{ background: '#1e293b' }}
        onCreated={({ camera }) => {
          camera.up.set(0, 0, 1);
          camera.lookAt(0, 0, 0);
        }}
      >
        <Scene
          trajectoryData={trajectoryData}
          currentTime={currentTime}
          isStochastic={isStochastic}
        />
      </Canvas>
      <div className="plot-3d-legend">
        <span><span className="axis-dot" style={{background: '#ef4444'}}></span> X (forward)</span>
        <span><span className="axis-dot" style={{background: '#22c55e'}}></span> Y (left)</span>
        <span><span className="axis-dot" style={{background: '#3b82f6'}}></span> Z (up)</span>
      </div>
    </div>
  );
}

export default Trajectory3D;

