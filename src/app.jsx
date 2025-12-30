import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';

// Mathematically identical to the C++ implementation:
// time_velocity, ramp_time, progress, d_progress
// x = A*sin(a*progress), y = B*sin(b*progress), z = C*sin(c*progress)
// v = [A*cos(a*progress)*a*d_progress, ...]
function evalXYZ(time, params) {
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

  const x = params.A * Math.sin(params.a * progress);
  const y = params.B * Math.sin(params.b * progress);
  const z = params.C * Math.sin(params.c * progress);

  const vx = params.A * Math.cos(params.a * progress) * params.a * d_progress;
  const vy = params.B * Math.cos(params.b * progress) * params.b * d_progress;
  const vz = params.C * Math.cos(params.c * progress) * params.c * d_progress;

  const speed = Math.hypot(vx, vy, vz);

  return { x, y, z, vx, vy, vz, speed, progress, time_velocity };
}

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
  // German-style decimal comma, always 2 digits.
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pow10(x) {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  return Math.pow(10, Math.floor(Math.log10(x)));
}

// Clean ticks: step is a pure power-of-ten (… 0.01, 0.1, 1, 10, …)
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
    if (Math.abs(vv) < step * 1e-9) vv = 0; // avoid -0
    ticks.push(vv);
  }

  if (min <= 0 && max >= 0 && !ticks.some((x) => x === 0)) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }

  return ticks;
}

const PARAM_SLIDERS = {
  A: { min: 0, max: 3, step: 0.05 },
  B: { min: 0, max: 3, step: 0.05 },
  C: { min: 0, max: 3, step: 0.05 },
  a: { min: 0, max: 10, step: 0.25 },
  b: { min: 0, max: 10, step: 0.25 },
  c: { min: 0, max: 10, step: 0.25 },
  duration: { min: 0.1, max: 60, step: 0.25 },
  ramp_duration: { min: 0, max: 30, step: 0.25 },
};

function formatParam(key, val) {
  const cfg = PARAM_SLIDERS[key];
  const dec = cfg ? Math.min(6, decimalsFromStep(cfg.step)) : 3;
  return Number.isFinite(val) ? val.toFixed(dec) : String(val);
}

function LissajousTuner() {
  // Defaults match the provided C++ struct.
  const [params, setParams] = useState({
    A: 0.5,
    B: 1.0,
    C: 0.0,
    a: 2.0,
    b: 1.0,
    c: 1.0,
    duration: 10.0,
    ramp_duration: 3.0,
  });

  // Dynamic amplitude slider max (shared between A and B, as requested).
  const [ampMax, setAmpMax] = useState(PARAM_SLIDERS.A.max);

  // Match the UI time-range to the earlier request: [0, duration + ramp_duration]
  // (The math inside evalXYZ matches C++ exactly; this is only the plotted horizon.)
  const plotTime = useMemo(() => {
    if (!(params.duration > 0)) return 0;
    return Math.max(0, params.ramp_duration) + params.duration;
  }, [params.duration, params.ramp_duration]);

  // Width of the scanning "speed bar" in seconds.
  const timeBarHalf = useMemo(() => {
    if (!(plotTime > 0)) return 0.01;
    const w = plotTime / 600;
    return Math.min(0.25, Math.max(0.01, w));
  }, [plotTime]);

  const [t, setT] = useState(0.0);

  useEffect(() => {
    setT((prev) => Math.min(prev, plotTime));
  }, [plotTime]);

  const handleChange = (key) => (e) => {
    const baseCfg =
      PARAM_SLIDERS[key] ?? { step: 0.01, min: -Infinity, max: Infinity };

    const isAmpAB = key === "A" || key === "B";
    const cfg = isAmpAB ? { ...baseCfg, max: ampMax } : baseCfg;

    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;

    const v0 = snapToStep(raw, cfg.step);

    let maxForClamp = cfg.max;
    if (isAmpAB && e.target.type === "number" && v0 > ampMax) {
      maxForClamp = v0;
      setAmpMax(v0);
    }

    const v = Math.min(maxForClamp, Math.max(cfg.min, v0));
    setParams((prev) => ({ ...prev, [key]: v }));
  };

  const handleTime = (e) => {
    const raw = parseFloat(e.target.value);
    if (!Number.isFinite(raw)) return;
    const v = snapToStep(raw, 0.01);
    setT(Math.min(Math.max(0, v), plotTime));
  };

  const trajectory = useMemo(() => {
    const data = [];
    if (!(params.duration > 0) || plotTime <= 0) return data;

    // Keep density roughly constant with duration.
    const steps = Math.min(12000, Math.max(2000, Math.round(plotTime * 300)));

    for (let i = 0; i < steps; i++) {
      const time = (i / (steps - 1)) * plotTime;
      const { x, y, speed } = evalXYZ(time, params);
      data.push({ t: time, x, y, speed });
    }

    return data;
  }, [params, plotTime]);

  const cur = useMemo(() => {
    if (!(params.duration > 0))
      return {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 0,
        progress: 0,
        time_velocity: 0,
      };
    return evalXYZ(t, params);
  }, [t, params]);

  const bounds = useMemo(() => {
    if (!trajectory.length) {
      return {
        xDomain: [-1, 1],
        yDomain: [-1, 1],
      };
    }

    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity;

    for (const p of trajectory) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
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
  }, [trajectory]);

  const xyTicks = useMemo(() => {
    return {
      xTicks: makePow10Ticks(bounds.xDomain, 9),
      yTicks: makePow10Ticks(bounds.yDomain, 9),
    };
  }, [bounds]);

  return (
    <div className="container">
      <h1 className="title">Lissajous XY Trajectory Tuner</h1>

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
          const baseCfg = PARAM_SLIDERS[key] ?? { min: 0, max: 5, step: 0.01 };
          const isAmpAB = key === "A" || key === "B";
          const cfg = isAmpAB ? { ...baseCfg, max: ampMax } : baseCfg;

          return (
            <div key={key} className="card-sm flex-col">
              <label className="label-sm">{key}</label>
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
                  step={cfg.step}
                  value={params[key]}
                  onChange={handleChange(key)}
                  onInput={handleChange(key)}
                  className="number-input"
                />
              </div>
              <span className="text-muted">{formatParam(key, params[key])}</span>
            </div>
          );
        })}
      </div>

      {/* XY plot (display rotated: x forward is up, y left is left) */}
      <div className="card">
        <div className="chart-container">
          <ResponsiveContainer width="100%" aspect={1}>
            <LineChart
              data={trajectory}
              margin={{ top: 10, right: 52, bottom: 28, left: 44 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="y"
                type="number"
                domain={bounds.yDomain}
                ticks={xyTicks.yTicks}
                allowDataOverflow
                axisLine
                tickLine
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
                axisLine
                tickLine
                tickFormatter={fmt2}
                label={{ value: "x (forward) [m]", angle: 90, position: "right", offset: 18 }}
              />
              <ReferenceLine x={0} strokeOpacity={0.35} />
              <ReferenceLine y={0} strokeOpacity={0.35} />
              <Tooltip
                formatter={(value, name) => [`${fmt2(value)} m`, name]}
                labelFormatter={() => ""}
              />
              <Line
                type="linear"
                dataKey="x"
                name="x (forward)"
                stroke="#2563eb"
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={cur.y}
                y={cur.x}
                r={6}
                fill="#ef4444"
                stroke="#991b1b"
                isFront
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Velocity plot */}
      <div className="card mt-6">
        <div className="section-label">Speed over time</div>
        <div className="chart-container-wide">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={trajectory}
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
              <ReferenceArea
                x1={Math.max(0, t - timeBarHalf)}
                x2={Math.min(plotTime, t + timeBarHalf)}
                fill="#ef4444"
                fillOpacity={0.12}
              />
              <ReferenceLine x={t} strokeOpacity={0.35} />
              <ReferenceDot
                x={t}
                y={cur.speed}
                r={4}
                fill="#ef4444"
                stroke="#991b1b"
                isFront
              />
              <Tooltip
                formatter={(value, name) => [`${fmt2(value)} m/s`, name]}
                labelFormatter={(label) => `t=${fmt2(label)} s`}
              />
              <Line
                type="linear"
                dataKey="speed"
                stroke="#2563eb"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <footer className="footer">
        Lissajous Trajectory Tuner • Static GitHub Pages App
      </footer>
    </div>
  );
}

// Mount the app
const root = createRoot(document.getElementById("root"));
root.render(<LissajousTuner />);
