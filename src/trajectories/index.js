// Trajectory registry - exports all available trajectory types

import { lissajous } from './lissajous.js';
import { langevin } from './langevin.js';

// All available trajectories
export const trajectories = {
  lissajous,
  langevin,
};

// Ordered list for dropdown
export const trajectoryList = [
  lissajous,
  langevin,
];

// Get trajectory by ID
export function getTrajectory(id) {
  return trajectories[id] || null;
}

// Compute statistics over multiple trajectories at each time step
// Returns { t, mean, std, min, max } for speed and acceleration
export function computeStats(trajectoryData) {
  if (!trajectoryData || trajectoryData.length === 0) return [];
  
  const nSamples = trajectoryData.length;
  const nSteps = trajectoryData[0].length;
  
  if (nSamples === 1) {
    // Single trajectory - no statistics needed
    return trajectoryData[0].map(point => ({
      t: point.t,
      x: point.x,
      y: point.y,
      speed: point.speed,
      speedMin: point.speed,
      speedMax: point.speed,
      speedMean: point.speed,
      speedStd: 0,
      accel: point.accel,
      accelMin: point.accel,
      accelMax: point.accel,
      accelMean: point.accel,
      accelStd: 0,
    }));
  }
  
  const stats = [];
  
  for (let i = 0; i < nSteps; i++) {
    const t = trajectoryData[0][i].t;
    
    // Collect values at this time step
    const speeds = [];
    const accels = [];
    
    for (let n = 0; n < nSamples; n++) {
      if (trajectoryData[n][i]) {
        speeds.push(trajectoryData[n][i].speed);
        accels.push(trajectoryData[n][i].accel);
      }
    }
    
    // Compute statistics
    const speedMean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const speedMin = Math.min(...speeds);
    const speedMax = Math.max(...speeds);
    const speedVariance = speeds.reduce((sum, v) => sum + (v - speedMean) ** 2, 0) / speeds.length;
    const speedStd = Math.sqrt(speedVariance);
    
    const accelMean = accels.reduce((a, b) => a + b, 0) / accels.length;
    const accelMin = Math.min(...accels);
    const accelMax = Math.max(...accels);
    const accelVariance = accels.reduce((sum, v) => sum + (v - accelMean) ** 2, 0) / accels.length;
    const accelStd = Math.sqrt(accelVariance);
    
    stats.push({
      t,
      speedMin,
      speedMax,
      speedMean,
      speedStd,
      speedLower: speedMean - speedStd,
      speedUpper: speedMean + speedStd,
      accelMin,
      accelMax,
      accelMean,
      accelStd,
      accelLower: accelMean - accelStd,
      accelUpper: accelMean + accelStd,
    });
  }
  
  return stats;
}

export default trajectories;

