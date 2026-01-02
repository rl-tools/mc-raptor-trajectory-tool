// Lissajous trajectory - deterministic parametric curve
// x = A*sin(a*progress), y = B*sin(b*progress), z = C*sin(c*progress)

// Helper: Greatest Common Divisor for floats (with tolerance)
function gcd(a, b, tol = 1e-9) {
  a = Math.abs(a);
  b = Math.abs(b);
  if (a < tol) return b;
  if (b < tol) return a;
  while (b > tol) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

// Helper: GCD of multiple numbers
function gcdMultiple(nums) {
  return nums.reduce((acc, n) => gcd(acc, n), 0);
}

// Calculate the duration for one complete cycle of the Lissajous curve
// considering all active frequency components (where amplitude > 0)
function calculateCycleDuration(params) {
  const activeFreqs = [];
  if (params.A > 0 && params.a > 0) activeFreqs.push(params.a);
  if (params.B > 0 && params.b > 0) activeFreqs.push(params.b);
  if (params.C > 0 && params.c > 0) activeFreqs.push(params.c);
  
  if (activeFreqs.length === 0) return params.duration;
  
  // The curve closes when all components complete integer cycles
  // This happens when t * freq_i = integer for all i
  // Minimum t = 1 / GCD(all frequencies)
  // Duration for one closed cycle = baseDuration / GCD(frequencies)
  // where baseDuration is the time for progress to go 0 to 2π
  const freqGcd = gcdMultiple(activeFreqs);
  if (freqGcd < 1e-9) return params.duration;
  
  // Number of base cycles needed for one complete closed figure
  const cycleMultiplier = 1 / freqGcd;
  return params.duration * cycleMultiplier;
}

export const lissajous = {
  id: 'lissajous',
  name: 'Lissajous Curve',
  isStochastic: false,
  
  // Default parameter values
  defaultParams: {
    A: 0.5,
    B: 1.0,
    C: 0.0,
    a: 2.0,
    b: 1.0,
    c: 1.0,
    duration: 10.0,
    ramp_duration: 3.0,
  },
  
  // Slider configuration for each parameter
  paramConfig: {
    A: { min: 0, max: 3, step: 0.05, label: 'A (x amplitude)' },
    B: { min: 0, max: 3, step: 0.05, label: 'B (y amplitude)' },
    C: { min: 0, max: 3, step: 0.05, label: 'C (z amplitude)' },
    a: { min: 0, max: 10, step: 0.25, label: 'a (x frequency)' },
    b: { min: 0, max: 10, step: 0.25, label: 'b (y frequency)' },
    c: { min: 0, max: 10, step: 0.25, label: 'c (z frequency)' },
    duration: { min: 0.1, max: 60, step: 0.25, label: 'Duration' },
    ramp_duration: { min: 0, max: 30, step: 0.25, label: 'Ramp Duration' },
  },
  
  // Get the total plot time for this trajectory
  // Considers all active frequency components (a, b, c) to determine
  // when the full Lissajous cycle completes
  getPlotTime(params) {
    if (!(params.duration > 0)) return 0;
    const cycleDuration = calculateCycleDuration(params);
    return Math.max(0, params.ramp_duration) + cycleDuration;
  },
  
  // Get the cycle duration (without ramp)
  getCycleDuration(params) {
    return calculateCycleDuration(params);
  },
  
  // Evaluate position, velocity, acceleration at a given time
  evaluate(time, params) {
    const time_velocity =
      params.ramp_duration > 0
        ? Math.min(time, params.ramp_duration) / params.ramp_duration
        : 1.0;

    const ramp_time = time_velocity * Math.min(time, params.ramp_duration) / 2.0;
    const progress =
      (ramp_time + Math.max(0, time - params.ramp_duration)) *
      (2 * Math.PI) /
      params.duration;

    const d_progress = (2 * Math.PI * time_velocity) / params.duration;
    
    // Second derivative of progress with respect to time
    const dd_progress =
      params.ramp_duration > 0 && time < params.ramp_duration
        ? (2 * Math.PI) / (params.ramp_duration * params.duration)
        : 0;

    const x = params.A * Math.sin(params.a * progress);
    const y = params.B * Math.sin(params.b * progress);
    const z = params.C * Math.sin(params.c * progress);

    const vx = params.A * Math.cos(params.a * progress) * params.a * d_progress;
    const vy = params.B * Math.cos(params.b * progress) * params.b * d_progress;
    const vz = params.C * Math.cos(params.c * progress) * params.c * d_progress;

    const speed = Math.hypot(vx, vy, vz);

    // Acceleration
    const ax = params.A * params.a * (
      -params.a * Math.sin(params.a * progress) * d_progress * d_progress +
      Math.cos(params.a * progress) * dd_progress
    );
    const ay = params.B * params.b * (
      -params.b * Math.sin(params.b * progress) * d_progress * d_progress +
      Math.cos(params.b * progress) * dd_progress
    );
    const az = params.C * params.c * (
      -params.c * Math.sin(params.c * progress) * d_progress * d_progress +
      Math.cos(params.c * progress) * dd_progress
    );

    const accel = Math.hypot(ax, ay, az);

    return { x, y, z, vx, vy, vz, speed, ax, ay, az, accel };
  },
  
  // Simulate trajectory - for deterministic, just evaluate at each time step
  // Returns array of N trajectories (for deterministic, all N are identical)
  simulate(params, dt, nSamples = 1) {
    const plotTime = this.getPlotTime(params);
    if (plotTime <= 0) return [];
    
    const steps = Math.max(1, Math.floor(plotTime / dt));
    const trajectories = [];
    
    for (let n = 0; n < nSamples; n++) {
      const data = [];
      for (let i = 0; i <= steps; i++) {
        const t = Math.min(i * dt, plotTime);
        const state = this.evaluate(t, params);
        data.push({ t, ...state });
      }
      trajectories.push(data);
    }
    
    return trajectories;
  },
  
  // Check for singularities (infinite acceleration)
  hasSingularity(params) {
    if (params.ramp_duration > 0) return false;
    const d_progress = (2 * Math.PI) / params.duration;
    const v0x = params.A * params.a * d_progress;
    const v0y = params.B * params.b * d_progress;
    const v0z = params.C * params.c * d_progress;
    return Math.hypot(v0x, v0y, v0z) > 1e-9;
  },
  
  // Generate Mavlink command
  getCommand(params) {
    return `mc_raptor intref lissajous ${params.A} ${params.B} ${params.C} ${params.a} ${params.b} ${params.c} ${params.duration} ${params.ramp_duration}`;
  },
};

export default lissajous;

