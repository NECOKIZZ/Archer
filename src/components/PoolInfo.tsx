import React from 'react';
import { Users, Timer, Trophy } from 'lucide-react';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';

interface Player {
  id: string;
  address: string;
  amount: number;
  color: string;
}

interface PoolInfoProps {
  players: Player[];
  totalPool: number;
  timer: number;
  status: string;
  maxTime: number;
}

export const PoolInfo: React.FC<PoolInfoProps> = ({ players, totalPool, timer, status, maxTime }) => {
  const progress = (timer / maxTime) * 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card p-4 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Trophy className="text-blue-500" size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Total Pool</p>
            <p className="text-xl font-bold text-blue-100">{totalPool.toFixed(2)} SOL</p>
          </div>
        </div>

        <div className="glass-card p-4 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Users className="text-blue-500" size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">Players</p>
            <p className="text-xl font-bold text-blue-100">{players.length}</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Timer className="text-blue-500" size={18} />
            <span className="text-sm font-semibold text-slate-300">
              {status === 'IDLE' ? 'Waiting for players...' : 
               status === 'WAITING' ? 'Next Spin in...' : 
               status === 'SPINNING' ? 'Spinning...' : 'Winner Announced!'}
            </span>
          </div>
          {status === 'WAITING' && (
            <Badge variant="outline" className="font-mono text-blue-400 border-blue-500/20">
              {timer}s
            </Badge>
          )}
        </div>
        
        <Progress value={status === 'WAITING' ? progress : 0} className="h-2 bg-slate-800" />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-mono uppercase tracking-tighter text-slate-500 px-1">Participants</p>
        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-blue-500/20">
          {players.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between p-3 glass-card rounded-xl border-l-4" style={{ borderLeftColor: p.color }}>
              <div className="flex flex-col">
                <span className="text-xs font-mono text-slate-300">
                  {p.address.slice(0, 6)}...{p.address.slice(-4)}
                </span>
                <span className="text-xs text-blue-400/70">{(p.amount / totalPool * 100).toFixed(1)}% Chance</span>
              </div>
              <span className="font-bold text-slate-100">{p.amount} SOL</span>
            </div>
          ))}
          {players.length === 0 && (
            <div className="text-center py-10 text-slate-600 text-sm border-2 border-dashed border-slate-800 rounded-2xl">
              Be the first to join the pool!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
