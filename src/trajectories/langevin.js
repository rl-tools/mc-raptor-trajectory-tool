// Langevin dynamics - stochastic harmonic oscillator with noise
// Implements: v_next = v_prev + (-gamma * v_prev - omega^2 * x_prev) * dt + sigma * dW
//             x_next = x_prev + v_next * dt
// With exponential smoothing for output

// Box-Muller transform for normal distribution sampling
function normalRandom() {
  let u1, u2;
  do {
    u1 = Math.random();
  } while (u1 === 0);
  u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export const langevin = {
  id: 'langevin',
  name: 'Langevin Dynamics',
  isStochastic: true,
  
  // Default parameter values
  defaultParams: {
    gamma: 0.5,       // Damping coefficient
    omega: 1.0,       // Natural frequency
    sigma: 0.3,       // Noise intensity
    alpha: 0.1,       // Smoothing factor (0-1, higher = less smoothing)
    duration: 20.0,   // Total simulation time
  },
  
  // Slider configuration for each parameter
  paramConfig: {
    gamma: { min: 0, max: 5, step: 0.1, label: 'γ (damping)' },
    omega: { min: 0.1, max: 5, step: 0.1, label: 'ω (frequency)' },
    sigma: { min: 0, max: 2, step: 0.05, label: 'σ (noise)' },
    alpha: { min: 0.01, max: 1, step: 0.01, label: 'α (smoothing)' },
    duration: { min: 1, max: 60, step: 1, label: 'Duration' },
  },
  
  // Get the total plot time for this trajectory
  getPlotTime(params) {
    return params.duration > 0 ? params.duration : 0;
  },
  
  // Simulate trajectory using Euler-Maruyama integration
  // Returns array of N trajectories (stochastic - each sample is different)
  simulate(params, dt, nSamples = 1) {
    const plotTime = this.getPlotTime(params);
    if (plotTime <= 0) return [];
    
    const { gamma, omega, sigma, alpha } = params;
    const omega2 = omega * omega;
    const sqrt_dt = Math.sqrt(dt);
    const steps = Math.max(1, Math.floor(plotTime / dt));
    
    const trajectories = [];
    
    for (let n = 0; n < nSamples; n++) {
      const data = [];
      
      // Initial state for raw (unsmoothed) dynamics - always start at origin
      const pos_raw = [0, 0, 0];
      const vel_raw = [0, 0, 0];
      
      // Initial state for smoothed output - always start at origin
      const pos = [0, 0, 0];
      const vel = [0, 0, 0];
      
      // Store initial point
      data.push({
        t: 0,
        x: pos[0], y: pos[1], z: pos[2],
        vx: vel[0], vy: vel[1], vz: vel[2],
        speed: 0,
        ax: 0, ay: 0, az: 0,
        accel: 0,
      });
      
      for (let i = 1; i <= steps; i++) {
        const t = Math.min(i * dt, plotTime);
        
        // Store previous velocities for acceleration calculation
        const vel_prev = [...vel];
        
        // Update each dimension
        for (let dim = 0; dim < 3; dim++) {
          const x_prev = pos_raw[dim];
          const v_prev = vel_raw[dim];
          
          // Brownian noise
          const dW = sqrt_dt * normalRandom();
          
          // Langevin dynamics: damped harmonic oscillator + noise
          const v_next = v_prev + (-gamma * v_prev - omega2 * x_prev) * dt + sigma * dW;
          const x_next = x_prev + v_next * dt;
          
          pos_raw[dim] = x_next;
          vel_raw[dim] = v_next;
          
          // Exponential smoothing
          const v_smooth = alpha * v_next + (1 - alpha) * vel[dim];
          const x_smooth = pos[dim] + v_smooth * dt;
          
          pos[dim] = x_smooth;
          vel[dim] = v_smooth;
        }
        
        const speed = Math.hypot(vel[0], vel[1], vel[2]);
        
        // Acceleration from velocity difference
        const ax = (vel[0] - vel_prev[0]) / dt;
        const ay = (vel[1] - vel_prev[1]) / dt;
        const az = (vel[2] - vel_prev[2]) / dt;
        const accel = Math.hypot(ax, ay, az);
        
        data.push({
          t,
          x: pos[0], y: pos[1], z: pos[2],
          vx: vel[0], vy: vel[1], vz: vel[2],
          speed,
          ax, ay, az,
          accel,
        });
      }
      
      trajectories.push(data);
    }
    
    return trajectories;
  },
  
  // No analytical evaluation for stochastic trajectories
  evaluate(time, params) {
    throw new Error('Langevin dynamics requires simulation, not point evaluation');
  },
  
  // Stochastic trajectories don't have simple singularities
  hasSingularity(params) {
    return false;
  },
  
  // Generate Mavlink command
  getCommand(params) {
    return `mc_raptor intref langevin ${params.gamma} ${params.omega} ${params.sigma} ${params.alpha} ${params.duration}`;
  },
};

export default langevin;

