import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { trajectoryList, computeStats } from './trajectories/index.js';
import { Trajectory3D } from './components/Trajectory3D.jsx';

function decimalsFromStep(step) {
  const s = String(step);
  if (s.includes("e-")) return parseInt(s.split("e-")[1], 10) || 0;
  const i = s.indexOf(".");
  return i >= 0 ? s.length - i - 1 : 0;
}

function snapToStep(v, step) {
  if (!Number.isFinite(v) || !Number.isFinite(step) || step <= 0) return v;
  const snapped = Math.round(v / step) * step;
  const dec = Math.min(8, decimalsFromStep(step));
  return parseFloat(snapped.toFixed(dec));
}

function fmt2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pow10(x) {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  return Math.pow(10, Math.floor(Math.log10(x)));
}

function makePow10Ticks(domain, maxTicks = 9) {
  if (!domain || domain.length !== 2) return [];
  let [min, max] = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max < min) [min, max] = [max, min];

  const range = max - min;
  if (!(range > 0)) return [min];

  let step = pow10(range / Math.max(1, maxTicks - 1));
  let count = Math.floor(range / step) + 1;
  while (count > maxTicks) {
    step *= 10;
    count = Math.floor(range / step) + 1;
  }

  const start = Math.ceil(min / step) * step;
  const end = Math.floor(max / step) * step;

  const ticks = [];
  for (let v = start; v <= end + step * 0.5; v += step) {
    let vv = parseFloat(v.toFixed(12));
    if (Math.abs(vv) < step * 1e-9) vv = 0;
    ticks.push(vv);
  }

  if (min <= 0 && max >= 0 && !ticks.some((x) => x === 0)) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }

  return ticks;
}

// Generate distinct colors for trajectory samples
function getTrajectoryColor(index, total, alpha = 1) {
  const hue = (index * 360 / total) % 360;
  return `hsla(${hue}, 70%, 50%, ${alpha})`;
}

function TrajectoryTuner() {
  // Currently selected trajectory type
  const [trajectoryId, setTrajectoryId] = useState(trajectoryList[0].id);
  
  // Get the current trajectory definition
  const trajectory = useMemo(() => {
    return trajectoryList.find(t => t.id === trajectoryId) || trajectoryList[0];
  }, [trajectoryId]);
  
  // Parameters for the current trajectory
  const [params, setParams] = useState(() => ({ ...trajectory.defaultParams }));
  
  // Number of samples for stochastic trajectories
  const [nSamples, setNSamples] = useState(10);
  
  // Integration time step
  const [dt, setDt] = useState(0.02);
  
  // Current time for marker
  const [t, setT] = useState(0.0);
  
  // Clipboard feedback
  const [copied, setCopied] = useState(false);
  
  // 3D view mode
  const [show3D, setShow3D] = useState(false);
  
  // Reset parameters when trajectory type changes
  useEffect(() => {
    setParams({ ...trajectory.defaultParams });
    setT(0);
  }, [trajectory]);
  
  // Plot time based on trajectory
  const plotTime = useMemo(() => {
    return trajectory.getPlotTime(params);
  }, [trajectory, params]);
  
  // Clamp time when plot time changes
  useEffect(() => {
    setT((prev) => Math.min(prev, plotTime));
  }, [plotTime]);
  
  // Width of the scanning time bar
  const timeBarHalf = useMemo(() => {
    if (!(plotTime > 0)) return 0.01;
    const w = plotTime / 600;
    return Math.min(0.25, Math.max(0.01, w));
  }, [plotTime]);
  
  // Simulate trajectories
  const trajectoryData = useMemo(() => {
    if (plotTime <= 0) return [];
    const n = trajectory.isStochastic ? nSamples : 1;
    return trajectory.simulate(params, dt, n);
  }, [trajectory, params, dt, nSamples, plotTime]);
  
  // Compute statistics for speed/acceleration
  const stats = useMemo(() => {
    return computeStats(trajectoryData);
  }, [trajectoryData]);
  
  // Find current state at time t
  const curStats = useMemo(() => {
    if (!stats.length) return null;
    // Find closest time step
    let closest = stats[0];
    let minDiff = Math.abs(stats[0].t - t);
    for (const s of stats) {
      const diff = Math.abs(s.t - t);
      if (diff < minDiff) {
        minDiff = diff;
        closest = s;
      }
    }
    return closest;
  }, [stats, t]);
  
  // Singularity detection
  const hasSingularity = useMemo(() => {
    return trajectory.hasSingularity ? trajectory.hasSingularity(params) : false;
  }, [trajectory, params]);
  
  // XY bounds for the trajectory plot
  const bounds = useMemo(() => {
    if (!trajectoryData.length || !trajectoryData[0].length) {
      return { xDomain: [-1, 1], yDomain: [-1, 1] };
    }

    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    for (const traj of trajectoryData) {
      for (const p of traj) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
    }

    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const range = Math.max(xMax - xMin, yMax - yMin);
    const pad = range > 0 ? range * 0.06 : 0.1;
    const half = range / 2 + pad;

    return {
      xDomain: [cx - half, cx + half],
      yDomain: [cy - half, cy + half],
    };
  }, [trajectoryData]);

  const xyTicks = useMemo(() => ({
    xTicks: makePow10Ticks(bounds.xDomain, 9),
    yTicks: makePow10Ticks(bounds.yDomain, 9),
  }), [bounds]);
  
  // Parameter change handler
  const handleChange = useCallback((key) => (e) => {
    const cfg = trajectory.paramConfig[key] ?? { step: 0.01, min: -Infinity, max: Infinity };
    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;
    const v0 = snapToStep(raw, cfg.step);
    const v = Math.min(cfg.max, Math.max(cfg.min, v0));
    setParams((prev) => ({ ...prev, [key]: v }));
  }, [trajectory]);

  const handleTime = (e) => {
    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;
    const v = snapToStep(raw, 0.01);
    setT(Math.min(Math.max(0, v), plotTime));
  };
  
  const handleNSamples = (e) => {
    const raw = parseInt(e.target.value, 10);
    if (!Number.isFinite(raw) || raw < 1) return;
    setNSamples(Math.min(100, Math.max(1, raw)));
  };
  
  // Mavlink command
  const mavlinkCommand = useMemo(() => {
    return trajectory.getCommand ? trajectory.getCommand(params) : '';
  }, [trajectory, params]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(mavlinkCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Find current position for marker (use first trajectory for marker position)
  const curPosition = useMemo(() => {
    if (!trajectoryData.length || !trajectoryData[0].length) return { x: 0, y: 0 };
    const traj = trajectoryData[0];
    let closest = traj[0];
    let minDiff = Math.abs(traj[0].t - t);
    for (const p of traj) {
      const diff = Math.abs(p.t - t);
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    }
    return closest;
  }, [trajectoryData, t]);

  return (
    <div className="container">
      {/* Trajectory type selector */}
      <div className="card mb-6">
        <div className="row">
          <div className="label">Trajectory Type</div>
          <select
            value={trajectoryId}
            onChange={(e) => setTrajectoryId(e.target.value)}
            className="select-input"
          >
            {trajectoryList.map((traj) => (
              <option key={traj.id} value={traj.id}>
                {traj.name} {traj.isStochastic ? '(stochastic)' : ''}
              </option>
            ))}
          </select>
        </div>
        
        {/* Number of samples for stochastic trajectories */}
        {trajectory.isStochastic && (
          <div className="row mt-4">
            <div className="label">N Samples</div>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={nSamples}
              onChange={handleNSamples}
              className="range-input"
            />
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={nSamples}
              onChange={handleNSamples}
              className="number-input-sm"
            />
          </div>
        )}
      </div>
      
      {/* Time slider */}
      <div className="card mb-6">
        <div className="row">
          <div className="label">time</div>
          <input
            type="range"
            min={0}
            max={plotTime}
            step={0.01}
            value={t}
            onChange={handleTime}
            onInput={handleTime}
            className="range-input"
          />
          <div className="time-display">{t.toFixed(2)} s</div>
        </div>
      </div>

      {/* Parameter sliders */}
      <div className="grid-2">
        {Object.keys(params).map((key) => {
          const cfg = trajectory.paramConfig[key] ?? { min: 0, max: 5, step: 0.01, label: key };
          return (
            <div key={key} className="card-sm flex-col">
              <label className="label-sm">{cfg.label || key}</label>
              <div className="row">
                <input
                  type="range"
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  value={params[key]}
                  onChange={handleChange(key)}
                  onInput={handleChange(key)}
                  className="range-input"
                />
                <input
                  type="number"
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  value={params[key]}
                  onChange={handleChange(key)}
                  onInput={handleChange(key)}
                  className="number-input"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Trajectory plot */}
      <div className="card">
        <div className="section-label-row">
          <div className="section-label">
            {show3D ? '3D' : 'XY'} Trajectory
            {trajectory.isStochastic && <span className="sample-badge">{nSamples} samples</span>}
          </div>
          <label className="toggle-switch">
            <span className="toggle-label">3D</span>
            <input
              type="checkbox"
              checked={show3D}
              onChange={(e) => setShow3D(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        {show3D ? (
          <Suspense fallback={<div className="plot-3d-loading">Loading 3D view...</div>}>
            <Trajectory3D
              trajectoryData={trajectoryData}
              currentTime={t}
              isStochastic={trajectory.isStochastic}
            />
          </Suspense>
        ) : (
          <div className="chart-container">
            <ResponsiveContainer width="100%" aspect={1}>
              <LineChart margin={{ top: 10, right: 52, bottom: 28, left: 44 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="y"
                  type="number"
                  domain={bounds.yDomain}
                  ticks={xyTicks.yTicks}
                  allowDataOverflow
                  reversed
                  tickFormatter={fmt2}
                  label={{ value: "y (left) [m]", position: "insideBottomRight", offset: -8 }}
                />
                <YAxis
                  dataKey="x"
                  type="number"
                  domain={bounds.xDomain}
                  ticks={xyTicks.xTicks}
                  orientation="right"
                  allowDataOverflow
                  tickFormatter={fmt2}
                  label={{ value: "x (forward) [m]", angle: 90, position: "right", offset: 18 }}
                />
                <ReferenceLine x={0} strokeOpacity={0.35} />
                <ReferenceLine y={0} strokeOpacity={0.35} />
                <Tooltip
                  formatter={(value, name) => [`${fmt2(value)} m`, name]}
                  labelFormatter={() => ""}
                />
                {trajectoryData.map((traj, idx) => (
                  <Line
                    key={idx}
                    data={traj}
                    type="linear"
                    dataKey="x"
                    name={`Trajectory ${idx + 1}`}
                    stroke={trajectory.isStochastic 
                      ? getTrajectoryColor(idx, nSamples, 0.5)
                      : "#2563eb"}
                    strokeWidth={trajectory.isStochastic ? 1 : 2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
                <ReferenceDot
                  x={curPosition.y}
                  y={curPosition.x}
                  r={6}
                  fill="#ef4444"
                  stroke="#991b1b"
                  isFront
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Speed plot */}
      <div className="card mt-6">
        <div className="section-label">
          Speed over time
          {trajectory.isStochastic && <span className="stat-badge">min/max + mean±σ</span>}
        </div>
        <div className="chart-container-wide">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={stats}
              margin={{ top: 10, right: 44, bottom: 28, left: 44 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, plotTime]}
                allowDataOverflow
                tickFormatter={fmt2}
                label={{ value: "time [s]", position: "insideBottomRight", offset: -8 }}
              />
              <YAxis
                type="number"
                tickFormatter={fmt2}
                label={{ value: "speed [m/s]", angle: -90, position: "insideLeft", offset: -10 }}
              />
              
              {/* Min-max range (light fill) */}
              {trajectory.isStochastic && (
                <Area
                  type="linear"
                  dataKey="speedMax"
                  stroke="none"
                  fill="#2563eb"
                  fillOpacity={0.1}
                  isAnimationActive={false}
                />
              )}
              {trajectory.isStochastic && (
                <Area
                  type="linear"
                  dataKey="speedMin"
                  stroke="none"
                  fill="#ffffff"
                  fillOpacity={1}
                  isAnimationActive={false}
                />
              )}
              
              {/* Mean ± std range */}
              {trajectory.isStochastic && (
                <Area
                  type="linear"
                  dataKey="speedUpper"
                  stroke="none"
                  fill="#2563eb"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
              )}
              {trajectory.isStochastic && (
                <Area
                  type="linear"
                  dataKey="speedLower"
                  stroke="none"
                  fill="#ffffff"
                  fillOpacity={1}
                  isAnimationActive={false}
                />
              )}
              
              {/* Min/max lines */}
              {trajectory.isStochastic && (
                <Line
                  type="linear"
                  dataKey="speedMin"
                  stroke="#93c5fd"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {trajectory.isStochastic && (
                <Line
                  type="linear"
                  dataKey="speedMax"
                  stroke="#93c5fd"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              
              {/* Mean line */}
              <Line
                type="linear"
                dataKey={trajectory.isStochastic ? "speedMean" : "speedMean"}
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              
              <ReferenceArea
                x1={Math.max(0, t - timeBarHalf)}
                x2={Math.min(plotTime, t + timeBarHalf)}
                fill="#ef4444"
                fillOpacity={0.12}
              />
              <ReferenceLine x={t} strokeOpacity={0.35} />
              {curStats && (
                <ReferenceDot
                  x={t}
                  y={curStats.speedMean}
                  r={4}
                  fill="#ef4444"
                  stroke="#991b1b"
                  isFront
                />
              )}
              <Tooltip
                formatter={(value, name) => {
                  const labels = {
                    speedMean: 'Mean',
                    speedMin: 'Min',
                    speedMax: 'Max',
                    speedUpper: 'Mean+σ',
                    speedLower: 'Mean-σ',
                  };
                  return [`${fmt2(value)} m/s`, labels[name] || name];
                }}
                labelFormatter={(label) => `t=${fmt2(label)} s`}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Acceleration plot */}
      <div className="card mt-6">
        <div className="section-label">
          Acceleration over time
          {hasSingularity && (
            <span className="singularity-badge">⚠ Singularity at t=0</span>
          )}
          {trajectory.isStochastic && <span className="stat-badge">min/max + mean±σ</span>}
        </div>
        <div className="chart-container-wide">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart
              data={stats}
              margin={{ top: 10, right: 44, bottom: 28, left: 44 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, plotTime]}
                allowDataOverflow
                tickFormatter={fmt2}
                label={{ value: "time [s]", position: "insideBottomRight", offset: -8 }}
              />
              <YAxis
                type="number"
                tickFormatter={fmt2}
                label={{ value: "accel [m/s²]", angle: -90, position: "insideLeft", offset: -10 }}
              />
              
              {hasSingularity && (
                <ReferenceLine
                  x={0}
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  label={{
                    value: "∞",
                    position: "top",
                    fill: "#dc2626",
                    fontSize: 18,
                    fontWeight: "bold",
                  }}
                />
              )}
              
              {/* Min-max range */}
              {trajectory.isStochastic && (
                <Area
                  type="linear"
                  dataKey="accelMax"
                  stroke="none"
                  fill="#16a34a"
                  fillOpacity={0.1}
                  isAnimationActive={false}
                />
              )}
              {trajectory.isStochastic && (
                <Area
                  type="linear"
                  dataKey="accelMin"
                  stroke="none"
                  fill="#ffffff"
                  fillOpacity={1}
                  isAnimationActive={false}
                />
              )}
              
              {/* Mean ± std range */}
              {trajectory.isStochastic && (
                <Area
                  type="linear"
                  dataKey="accelUpper"
                  stroke="none"
                  fill="#16a34a"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
              )}
              {trajectory.isStochastic && (
                <Area
                  type="linear"
                  dataKey="accelLower"
                  stroke="none"
                  fill="#ffffff"
                  fillOpacity={1}
                  isAnimationActive={false}
                />
              )}
              
              {/* Min/max lines */}
              {trajectory.isStochastic && (
                <Line
                  type="linear"
                  dataKey="accelMin"
                  stroke="#86efac"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {trajectory.isStochastic && (
                <Line
                  type="linear"
                  dataKey="accelMax"
                  stroke="#86efac"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              
              {/* Mean line */}
              <Line
                type="linear"
                dataKey={trajectory.isStochastic ? "accelMean" : "accelMean"}
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              
              <ReferenceArea
                x1={Math.max(0, t - timeBarHalf)}
                x2={Math.min(plotTime, t + timeBarHalf)}
                fill="#ef4444"
                fillOpacity={0.12}
              />
              <ReferenceLine x={t} strokeOpacity={0.35} />
              {curStats && (
                <ReferenceDot
                  x={t}
                  y={curStats.accelMean}
                  r={4}
                  fill="#ef4444"
                  stroke="#991b1b"
                  isFront
                />
              )}
              <Tooltip
                formatter={(value, name) => {
                  const labels = {
                    accelMean: 'Mean',
                    accelMin: 'Min',
                    accelMax: 'Max',
                    accelUpper: 'Mean+σ',
                    accelLower: 'Mean-σ',
                  };
                  return [`${fmt2(value)} m/s²`, labels[name] || name];
                }}
                labelFormatter={(label) => `t=${fmt2(label)} s`}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Mavlink command output */}
      <div className="card mt-6">
        <div className="section-label">Mavlink Shell Command</div>
        <div className="command-row">
          <code className="command-output">{mavlinkCommand}</code>
          <button
            onClick={copyToClipboard}
            className="copy-button"
            title="Copy to clipboard"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Mount the app
const root = createRoot(document.getElementById("root"));
root.render(<TrajectoryTuner />);
