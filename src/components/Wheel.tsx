import React, { useMemo } from 'react';
import * as d3 from 'd3';
import { motion } from 'motion/react';
import { Zap } from 'lucide-react';

interface Player {
  id: string;
  address: string;
  amount: number;
  color: string;
}

interface WheelProps {
  players: Player[];
  status: string;
  winningAngle: number;
  timer: number;
}

// Vibrantly synced color palette for the Neon Archer theme
const SLICE_COLORS = [
  '#0047FF', '#a855f7', '#06b6d4', '#f59e0b',
  '#10b981', '#ef4444', '#FF6B00', '#8b5cf6',
  '#ec4899', '#14b8a6',
];

export const Wheel: React.FC<WheelProps> = ({ players, status, winningAngle, timer }) => {
  const VB = 500;
  const R = VB / 2;
  const INNER_R = 75;

  const isSpinning = status === 'SPINNING' || status === 'FINISHED';

  const slices = useMemo(() => {
    if (players.length === 0) return null;
    const pie = d3.pie<Player>().value(d => d.amount).sort(null);
    return pie(players).map((d, i) => ({
      ...d,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    }));
  }, [players]);

  const arc = d3.arc<any>()
    .innerRadius(INNER_R)
    .outerRadius(R - 12)
    .padAngle(0.015)
    .cornerRadius(6);

  const arcText = d3.arc<any>()
    .innerRadius(INNER_R + (R - INNER_R) * 0.5)
    .outerRadius(INNER_R + (R - INNER_R) * 0.5);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none neon-orb-container">
      
      {/* ─── ENHANCED LASER RETICLE ─── */}
      <div className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none" style={{ top: '-15px' }}>
        <svg width="60" height="90" viewBox="0 0 60 90">
          <defs>
            <filter id="laser-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <linearGradient id="laserBeamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0047ff" stopOpacity="0" />
              <stop offset="100%" stopColor="#0047ff" stopOpacity="1" />
            </linearGradient>
          </defs>
          {/* Pulsing laser beam */}
          <line x1="30" y1="0" x2="30" y2="70" 
                stroke="url(#laserBeamGrad)" strokeWidth="3" 
                className="laser-beam-pulse" />
          {/* Main Pointer Body */}
          <path 
            d="M30 85 L12 40 L48 40 Z" 
            fill="white" 
            filter="url(#laser-glow)"
            className={isSpinning ? 'animate-pulse' : ''}
          />
          <circle cx="30" cy="40" r="5" fill="#0047ff" className="pointer-core" />
        </svg>
      </div>

      {/* ─── THE CYBER ORB (Main Wheel Container) ─── */}
      <motion.div
        className={`relative rounded-full ${isSpinning ? 'wheel-glow-spin' : 'wheel-glow'}`}
        style={{ width: '100%', height: '100%', aspectRatio: '1' }}
        animate={{ rotate: isSpinning ? winningAngle : 0 }}
        transition={{ 
          duration: 7.5, 
          ease: [0.2, 1, 0.3, 1], // Heavy mechanical deceleration
        }}
        initial={false}
      >
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="w-full h-full block overflow-visible"
        >
          <defs>
            {/* High-end gradients for the the Glass Orb */}
            <radialGradient id="glassGrad" cx="50%" cy="50%" r="50%">
               <stop offset="0%" stopColor="#0d1830" />
               <stop offset="70%" stopColor="#070d1c" />
               <stop offset="100%" stopColor="#03060f" />
            </radialGradient>
            <linearGradient id="shineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
               <stop offset="0%" stopColor="white" stopOpacity="0.15" />
               <stop offset="50%" stopColor="white" stopOpacity="0.02" />
               <stop offset="100%" stopColor="white" stopOpacity="0.08" />
            </linearGradient>
            <filter id="neon-glow-slice" x="-20%" y="-20%" width="140%" height="140%">
               <feGaussianBlur stdDeviation="8" result="blur" />
               <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
               </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${R}, ${R})`}>
            {/* 1. Base Dark Surface */}
            <circle r={R} fill="url(#glassGrad)" />
            
            {/* 2. Atomic Deco Rings (Pulse along with the status) */}
            <circle r={R - 2} fill="none" stroke="rgba(0,71,255,0.2)" strokeWidth="1.5" />
            <circle r={R - 25} fill="none" stroke="rgba(0,71,255,0.1)" strokeWidth="0.5" strokeDasharray="4 8" className="animate-spin-slow" />

            {/* 3. The Sectors */}
            {slices?.map((slice, i) => (
              <g key={i}>
                {/* Glow layer (subtle glow based on sector color) */}
                <path d={arc(slice) || ''} fill={slice.color} opacity={isSpinning ? 0.2 : 0} filter="url(#neon-glow-slice)" />
                {/* Main sector */}
                <path d={arc(slice) || ''} fill={slice.color} opacity={0.85} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                {/* Visual Glass Sheen Overlay */}
                <path d={arc(slice) || ''} fill="url(#shineGrad)" />
                
                {/* Data Readout (Address) */}
                {((slice.endAngle - slice.startAngle) > 0.3) && (() => {
                  const [x, y] = arcText.centroid(slice);
                  return (
                    <text x={x} y={y} fill="white" fontSize="11" fontWeight="900" textAnchor="middle" dominantBaseline="middle" opacity="0.7" style={{ fontFamily: 'var(--font-mono)' }}>
                      {slice.data.address.slice(0, 4).toUpperCase()}
                    </text>
                  );
                })()}
              </g>
            ))}

            {/* 4. Clean Center Hub */}
            <circle r={INNER_R} fill="#0d1830" stroke="rgba(0,71,255,0.4)" strokeWidth="2" />
            <circle r={INNER_R - 5} fill="url(#shineGrad)" />
            
            {status === 'WAITING' || status === 'READY' ? (
              <text y="4" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="38" fontWeight="900" style={{ filter: 'drop-shadow(0 0 10px rgba(0,71,255,0.8))' }}>
                {timer}
              </text>
            ) : status === 'IDLE' ? null : (
               <circle r={8} fill="#0047ff" filter="url(#laser-glow)" />
            )}
          </g>
        </svg>
      </motion.div>

      {/* Static Visual Polish (Non-rotating outer structure) */}
      <div className="absolute inset-[-10px] rounded-full border-[12px] border-white/5 pointer-events-none" />
      <div className="absolute inset-[25px] rounded-full border border-[rgba(0,71,255,0.15)] pointer-events-none border-dashed" />
    </div>
  );
};
