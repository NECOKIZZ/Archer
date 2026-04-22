import React, { useMemo, useState } from 'react';
import { Clock, Trophy, X } from 'lucide-react';

interface RoundResult {
  roundId?: number;
  winner: string;
  amount: number;
  timestamp: number;
  txHash?: string;
}

interface HistoryProps {
  history: RoundResult[];
}

interface RankedRound extends RoundResult {
  displayId: number;
}

export const History: React.FC<HistoryProps> = ({ history }) => {
  const [selected, setSelected] = useState<RankedRound | null>(null);
  const txUrl = (hash?: string) => (hash ? `https://testnet.arcscan.app/tx/${hash}` : null);
  const orderedHistory = useMemo(() => {
    // 1) Rank by timestamp from oldest to newest so first-ever session gets ID=1.
    const oldestFirst = [...history].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      const aRound = a.roundId ?? Number.MAX_SAFE_INTEGER;
      const bRound = b.roundId ?? Number.MAX_SAFE_INTEGER;
      return aRound - bRound;
    });

    const withDisplayIds: RankedRound[] = oldestFirst.map((item, index) => ({
      ...item,
      displayId: index + 1,
    }));

    // 2) Show most recent at the top.
    return withDisplayIds.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
      return b.displayId - a.displayId;
    });
  }, [history]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center border"
               style={{ background: 'rgba(0,71,255,0.1)', borderColor: 'rgba(0,71,255,0.2)' }}>
            <Trophy size={13} style={{ color: '#4d7bff' }} />
          </div>
          <h3 className="label" style={{ color: '#f0f4ff' }}>Round History</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
               style={{ background: 'rgba(12,20,41,0.5)', border: '1px solid rgba(0,71,255,0.15)' }}>
            <div className="w-1.5 h-1.5 rounded-full pulse-ring" style={{ background: '#10b981' }} />
            <span className="label" style={{ color: '#6b7fa8', marginBottom: 0 }}>Live</span>
          </div>
          <span className="label" style={{ color: '#6b7fa8', marginBottom: 0 }}>
            Sessions: {history.length}
          </span>
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto space-y-2.5 scrollbar-thin pr-1">
        {history.length > 0 ? (
          orderedHistory.map((h, i) => {
            return (
            <button
              type="button"
              key={h.txHash || h.displayId || i}
              onClick={() => setSelected(h)}
              className="block group relative w-full min-h-[74px] p-3.5 rounded-xl border transition-all duration-200 overflow-hidden hover:border-[rgba(0,71,255,0.28)]"
              style={{
                background: 'rgba(12,20,41,0.6)',
                borderColor: 'rgba(0,71,255,0.12)',
              }}
            >
              <div className="absolute inset-y-0 left-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-xl"
                   style={{ background: '#0047ff' }} />

              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-mono text-[#6b7fa8] group-hover:text-[#85a8ff] transition-colors shrink-0"
                       style={{ background: 'linear-gradient(135deg, rgba(7,13,28,0.8), rgba(12,20,41,0.9))', border: '1px solid rgba(0,71,255,0.1)' }}>
                    {h.displayId}
                  </div>
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="text-[12px] font-bold leading-tight text-[#b4c6e4] group-hover:text-white transition-colors truncate">
                      {h.winner.slice(0, 6)}...{h.winner.slice(-4)}
                    </span>
                    <span className="text-[9px] text-[#4d7bff] flex items-center gap-1 uppercase font-mono">
                      <Clock size={9} className="shrink-0" />
                      {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[9px] text-[#3d5080] font-mono uppercase tracking-wider truncate">
                      {h.txHash ? `${h.txHash.slice(0, 14)}...` : 'Tx Pending'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0 pr-0.5">
                  <p className="text-[15px] font-black leading-tight" style={{ color: '#85a8ff' }}>+{h.amount.toFixed(2)}</p>
                  <p className="text-[9px] text-[#3d5080] font-mono uppercase font-bold tracking-widest mt-0.5">USDC</p>
                </div>
              </div>
            </button>
          )})
        ) : (
          <div className="flex flex-col items-center justify-center h-full space-y-2 py-8">
            <Clock size={20} style={{ color: '#1a2d4e' }} />
            <p className="label tracking-widest text-center leading-loose" style={{ color: '#1a2d4e' }}>
              No rounds<br />completed yet
            </p>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="bento-card w-full max-w-md flex flex-col gap-4 p-5"
            style={{ borderColor: 'rgba(0,71,255,0.28)' }}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-white font-black tracking-wider uppercase text-sm">Session Details</h4>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[#6b7fa8] hover:text-white transition-colors"
                aria-label="Close session details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="label mb-1">Round Number</p>
                <p className="text-sm font-bold text-white">#{selected.displayId}</p>
              </div>
              <div>
                <p className="label mb-1">Round Winner</p>
                <p className="text-sm font-bold text-white break-all">{selected.winner}</p>
              </div>
              <div>
                <p className="label mb-1">Round TXN Hash</p>
                {txUrl(selected.txHash) ? (
                  <a
                    href={txUrl(selected.txHash)!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] font-mono text-[#85a8ff] hover:text-white break-all underline"
                  >
                    {selected.txHash}
                  </a>
                ) : (
                  <p className="text-sm font-bold text-[#6b7fa8]">Not available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
