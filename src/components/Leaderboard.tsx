import React from 'react';
import { BarChart3, Medal, Trophy } from 'lucide-react';

interface LeaderboardEntry {
  address: string;
  volume: number;
  games: number;
  wins: number;
  score: number;
}

interface LeaderboardProps {
  rows: LeaderboardEntry[];
}

const WEIGHTS = {
  volume: 90,
  games: 7,
  wins: 3,
};

function shortAddress(address: string) {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ rows }) => {
  return (
    <div className="bento-card h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(0,71,255,0.12)', border: '1px solid rgba(0,71,255,0.22)' }}
          >
            <Trophy size={15} style={{ color: '#4d7bff' }} />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-[0.12em] uppercase text-white">Leaderboard</h3>
            <p className="label mb-0">Ranked by weighted score</p>
          </div>
        </div>
        <div className="text-right">
          <p className="label mb-0">Players</p>
          <p className="text-sm font-black text-[#85a8ff]">{rows.length}</p>
        </div>
      </div>

      <div
        className="mb-3 rounded-xl p-3 text-[10px] uppercase tracking-wider font-bold"
        style={{ background: 'rgba(12,20,41,0.65)', border: '1px solid rgba(0,71,255,0.14)', color: '#8ca3cd' }}
      >
        Weights: Volume {WEIGHTS.volume}% · Games {WEIGHTS.games}% · Wins {WEIGHTS.wins}%
      </div>

      <div className="grid grid-cols-[46px_minmax(180px,1fr)_90px_75px_70px_70px] gap-2 px-2 pb-2 border-b border-[rgba(0,71,255,0.12)] text-[10px] uppercase tracking-widest font-black text-[#3d5080] shrink-0">
        <span>Rank</span>
        <span>Player</span>
        <span className="text-right">Volume</span>
        <span className="text-right">Games</span>
        <span className="text-right">Wins</span>
        <span className="text-right">Score</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pt-2 pr-1 scrollbar-thin">
        {rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <BarChart3 size={20} style={{ color: '#1e2d4e' }} />
            <p className="label text-center leading-relaxed" style={{ color: '#2d3f60' }}>
              No leaderboard data yet
            </p>
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.address}
              className="grid grid-cols-[46px_minmax(180px,1fr)_90px_75px_70px_70px] gap-2 items-center rounded-xl px-2 py-2"
              style={{ background: 'rgba(12,20,41,0.65)', border: '1px solid rgba(0,71,255,0.14)' }}
            >
              <div className="flex items-center gap-1.5">
                {index < 3 ? (
                  <Medal
                    size={13}
                    style={{ color: index === 0 ? '#fbbf24' : index === 1 ? '#cbd5e1' : '#f59e0b' }}
                  />
                ) : null}
                <span className="text-[11px] font-black text-[#9fb5dc]">#{index + 1}</span>
              </div>
              <span className="text-[12px] font-mono text-[#d5e4ff]">{shortAddress(row.address)}</span>
              <span className="text-right text-[11px] font-black text-[#85a8ff]">{row.volume.toFixed(2)}</span>
              <span className="text-right text-[11px] font-black text-[#b0c3e6]">{row.games}</span>
              <span className="text-right text-[11px] font-black text-[#b0c3e6]">{row.wins}</span>
              <span className="text-right text-[11px] font-black text-white">{row.score.toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
