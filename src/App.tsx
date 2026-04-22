import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './lib/contract';
import socket from './lib/socket';
import { Wheel } from './components/Wheel';
import { History } from './components/History';
import { Toaster, toast } from 'sonner';
import { useWallet } from './hooks/useWallet';
import { Zap, Users, Trophy, Wallet } from 'lucide-react';

interface Player {
  id: string;
  address: string;
  amount: number;
  color: string;
}

interface RoundState {
  players: Player[];
  status: 'IDLE' | 'WAITING' | 'READY' | 'SPINNING' | 'FINISHED';
  timer: number;
  winnerId: string | null;
  totalPool: number;
  winningAngle: number;
  roundId: number;
}

interface RoundHistory {
  roundId?: number;
  winner: string;
  amount: number;
  timestamp: number;
  txHash?: string;
}

function normalizeHistory(items: any[]): RoundHistory[] {
  const seen = new Set<string>();
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.winner === 'string')
    .map((item) => ({
      roundId: typeof item.roundId === 'number' ? item.roundId : undefined,
      winner: item.winner,
      amount: Number(item.amount ?? 0),
      timestamp: Number(item.timestamp ?? Date.now()),
      txHash: typeof item.txHash === 'string' ? item.txHash : undefined,
    }))
    .filter((item) => {
      const key = item.txHash || (item.roundId !== undefined ? `round-${item.roundId}` : `${item.winner}-${item.timestamp}-${item.amount}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const STATUS_LABEL: Record<string, string> = {
  IDLE:     'Awaiting Players',
  WAITING:  'Round Starting',
  SPINNING: 'Spinning!',
  FINISHED: 'Round Over',
};

export default function App() {
  const { address, connect, disconnect, provider, balance, isOnArcTestnet } = useWallet();
  const [state, setState] = useState<RoundState>({
    players: [],
    status: 'IDLE', 
    timer: 20,
    winnerId: null,
    totalPool: 0,
    winningAngle: 0,
    roundId: 0,
  });
  const [history, setHistory] = useState<RoundHistory[]>([]);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(10);

  // 1. ATOMIC SYNC: Decoupled blockchain data from visual state
  const syncState = async (readContract: ethers.Contract, forceSkipGating = false) => {
    try {
      const [playersRaw, totalPoolRaw, roundIdRaw, startTimeRaw] = await Promise.all([
        readContract.getPlayers(),
        readContract.totalPool(),
        readContract.roundId(),
        readContract.roundStartTime()
      ]);

      const roundId = Number(roundIdRaw);
      const startTime = Number(startTimeRaw);
      const rawEntriesCount = playersRaw.length;
      const now = Math.floor(Date.now() / 1000);

      // DATA MAPPING (aggregate repeated deposits by the same wallet)
      const playerTotals = new Map<string, number>();
      for (const p of playersRaw) {
        const wallet = String(p.wallet).toLowerCase();
        const amount = Number(ethers.formatEther(p.amount));
        playerTotals.set(wallet, (playerTotals.get(wallet) ?? 0) + amount);
      }

      const fetchedPlayers = Array.from(playerTotals.entries())
        .slice(0, 10)
        .map(([address, amount], i) => ({
          id: address,
          address,
          amount,
          color: ['#0047FF', '#a855f7', '#06b6d4', '#f59e0b', '#10b981', '#ef4444'][i % 6],
        }));
      const playersCount = fetchedPlayers.length;
      const totalPool = Number(ethers.formatEther(totalPoolRaw));

      setState(prev => {
        if (!forceSkipGating && (prev.status === 'READY' || prev.status === 'SPINNING')) return prev;

        const elapsed = startTime > 0 ? now - startTime : 0;
        const blockchainTimer = startTime > 0 ? Math.max(0, 20 - elapsed) : 20;
        const timer = Math.abs(prev.timer - blockchainTimer) > 2 ? blockchainTimer : prev.timer;

        let status: RoundState['status'] = 'IDLE';
        if (rawEntriesCount >= 2) {
          status = blockchainTimer <= 0 ? 'READY' : 'WAITING';
        }

        const preserveResolutionFrame = !forceSkipGating && (prev.status === 'SPINNING' || prev.status === 'FINISHED');
        if (preserveResolutionFrame) {
          status = prev.status;
        }

        const shouldClearBoard = playersCount === 0 && status === 'IDLE';
        const nextPlayers = playersCount > 0 ? fetchedPlayers : (shouldClearBoard ? [] : prev.players);
        const nextPool = playersCount > 0 ? totalPool : (shouldClearBoard ? 0 : prev.totalPool);

        return {
          ...prev,
          players: nextPlayers,
          totalPool: nextPool,
          roundId,
          status,
          timer
        };
      });
    } catch(err) {
      console.error("Sync failed:", err);
    }
  };

  // 2. SMOTTH VISUAL TICKER
  useEffect(() => {
    if ((state.status === 'WAITING' || state.status === 'READY') && state.timer > 0) {
      const ticker = setInterval(() => {
        setState(prev => ({ 
          ...prev, 
          timer: Math.max(0, prev.timer - 1),
        }));
      }, 1000);
      return () => clearInterval(ticker);
    }
  }, [state.status]);

  // 3. HEARTBEAT & EVENT ENGINE
  useEffect(() => {
    const rpcProvider = new ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
    const readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rpcProvider);

    syncState(readContract, true);
    const heartbeat = setInterval(() => syncState(readContract), 3000);

    // 1. WebSocket Listeners (Optimistic/Real-time)
    socket.on('state_update', (newState) => {
      setState(prev => {
        // VISUAL LOCKDOWN: Never let optimistic updates break a resolution phase
        if (prev.status === 'READY' || prev.status === 'SPINNING') return prev;
        
        // Merge socket state with local roundId (chain is still master of ID)
        return { 
          ...prev, 
          ...newState, 
          roundId: prev.roundId,
          players: newState.players.map((p: any) => ({
            ...p,
            color: ['#0047FF', '#a855f7', '#06b6d4', '#f59e0b', '#10b981', '#ef4444'][newState.players.indexOf(p) % 6]
          }))
        };
      });
    });

    socket.on('history', (historyData) => {
      setHistory(normalizeHistory(historyData));
    });

    // 2. Blockchain Resolution Listener (Finality)
    const onResolved = (roundId: bigint, winner: string, amount: bigint, winningRandom: bigint) => {
      const winAmount = Number(ethers.formatEther(amount));
      const randVal = Number(ethers.formatEther(winningRandom));
      
      const landingDegree = (randVal / Number(ethers.formatEther(amount))) * 360;
      const winningAngle = (360 * 5) + (360 - landingDegree);

      setState(prev => ({ ...prev, status: 'SPINNING', winnerId: winner, winningAngle, roundId: Number(roundId) + 1, timer: 0 }));
      
      setTimeout(() => {
        toast.success(`🎉 ${winner.slice(0, 6)}…${winner.slice(-4)} won!`, {
          description: `Swept ${winAmount.toFixed(2)} USDC from the pool.`,
          duration: 8000,
        });

        setState(prev => ({ ...prev, status: 'FINISHED' }));

        setTimeout(() => {
          syncState(readContract, true); // FINAL CLEANUP
        }, 4000);
      }, 7500); 
    };

    // 3. Immediate Deposit Listener (Bypasses heartbeat)
    const onDeposit = () => syncState(readContract);

    readContract.on('RoundResolved', onResolved);
    readContract.on('Deposit', onDeposit);

    return () => {
      clearInterval(heartbeat);
      socket.off('state_update');
      socket.off('history');
      readContract.removeAllListeners();
    };
  }, []); 

  // Stable Fallback Logic (Handles the 5s signing grace period)
  useEffect(() => {
    const isReady = state.status === 'READY';
    if (!isReady) return;

    const lastPlayer = state.players[state.players.length - 1];
    const isMyTurnToSpin = address && lastPlayer && lastPlayer.address.toLowerCase() === address.toLowerCase();

    if (isMyTurnToSpin) {
      const fallbackTimer = setTimeout(() => {
        toast.info("Automated Dealer timed out. Please sign manually to spin!");
        handleResolve();
      }, 5000);

      return () => clearTimeout(fallbackTimer);
    }
  }, [state.status === 'READY', state.roundId, address, state.players]);

  const handleDeposit = async () => {
    if (!provider) return;
    try {
      const signer = await provider.getSigner();
      const writeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      const tx = await writeContract.deposit({ value: ethers.parseEther(depositAmount.toString()) });
      toast.info("Transaction submitted to mempool, waiting for block...");
      setShowDepositModal(false);
      
      await tx.wait();
      toast.success(`Succesfully deposited ${depositAmount} USDC on-chain!`);
    } catch (err: any) {
      toast.error('Transaction Failed', { description: err.reason || err.message });
    }
  };

  const handleResolve = async () => {
    if (!provider) return;
    try {
      const signer = await provider.getSigner();
      const writeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      const tx = await writeContract.resolveRound();
      toast.info("Spinning... waiting for on-chain resolution!");
      await tx.wait();
    } catch (err: any) {
      toast.error('Spin Failed', { description: err.reason || err.message });
    }
  };

  const userPlayer = state.players.find(p => p.address.toLowerCase() === address?.toLowerCase());
  const userChance =
    userPlayer && state.totalPool > 0
      ? ((userPlayer.amount / state.totalPool) * 100).toFixed(1)
      : '--';

  /* Status pill style */
  const pillStyle = {
    IDLE:     { bg: 'rgba(17,30,56,0.9)',   border: 'rgba(61,80,128,0.5)',  text: '#6b7fa8', label: 'Awaiting Players' },
    WAITING:  { bg: 'rgba(20,15,5,0.9)',    border: 'rgba(245,158,11,0.5)', text: '#f59e0b', label: `Rolling in ${state.timer}s` },
    READY:    { bg: 'rgba(20,15,5,0.9)',    border: 'rgba(245,158,11,0.5)', text: '#f59e0b', label: 'Ready to Spin!' },
    SPINNING: { bg: 'rgba(0,20,5,0.9)',     border: 'rgba(16,185,129,0.5)', text: '#10b981', label: 'Spinning on-chain!' },
    FINISHED: { bg: 'rgba(0,10,35,0.9)',    border: 'rgba(0,71,255,0.5)',   text: '#4d7bff', label: 'Round Complete' },
  }[(state.status as string) || 'IDLE'] || { bg: 'black', border: 'black', text: 'white', label: '' };

  return (
    <div
      style={{ height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' }}
      className="flex flex-col bg-[#03060f] relative"
    >
      <Toaster position="top-right" theme="dark" richColors />

      {/* ─── DEPOSIT MODAL ─── */}
      {showDepositModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bento-card w-full max-w-sm flex flex-col gap-5 p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-black text-lg tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>DEPOSIT</h2>
              <button onClick={() => setShowDepositModal(false)} className="text-[#6b7fa8] hover:text-white">&times;</button>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="label">Amount (USDC)</span>
                <span className="text-xl font-black text-[#0047ff]">{depositAmount.toFixed(2)}</span>
              </div>
              
              <input 
                type="range" 
                min="1" 
                max={Math.max(1, Math.floor(balance))} 
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="w-full accent-[#0047ff] h-2 rounded-lg appearance-none cursor-pointer"
                style={{ background: 'rgba(0,71,255,0.2)' }}
              />
              <div className="flex justify-between items-center text-[10px] text-[#6b7fa8] font-mono">
                <span>Min: 1</span>
                <span>Max: {balance.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handleDeposit}
              className="mt-2 bg-[#0047ff] hover:bg-[#1a5fff] text-white font-black uppercase tracking-widest text-sm py-3.5 rounded-xl shadow-[0_4px_20px_rgba(0,71,255,0.4)] transition-all"
            >
              Confirm Deposit
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────── HEADER ─── */}
      <header
        className="shrink-0 flex items-center justify-between px-4 md:px-6
                   border-b border-[rgba(0,71,255,0.12)]
                   bg-[rgba(7,13,28,0.85)] backdrop-blur-xl z-50"
        style={{ height: '52px' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0047ff] to-[#003dd6]
                          flex items-center justify-center
                          shadow-[0_0_16px_rgba(0,71,255,0.4)]">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-[0.12em] text-white uppercase leading-none">
              Archer
            </h1>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6">
          <Stat label="" value={state.totalPool.toFixed(2)} unit="USDC" accent />
          <div className="w-px h-7 bg-[rgba(0,71,255,0.15)]" />
          <Stat label="" value={state.players.length.toString()} unit="/10" />
        </div>

        <div className="flex items-center gap-2.5">
          {address ? (
            <div className="flex items-center gap-3">
              {!isOnArcTestnet ? (
                <button
                  onClick={connect}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-white font-bold uppercase tracking-widest text-[10px] px-3 h-8 lg:h-10 rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all animate-pulse"
                >
                  Switch to Arc Testnet
                </button>
              ) : (
                <div className="hidden sm:flex flex-col items-end">
                  <span className="label" style={{ color: '#3d5080' }}>Arc Testnet</span>
                  <span className="text-[11px] font-bold text-slate-300 font-mono tracking-tight">
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </span>
                </div>
              )}
              <button
                onClick={disconnect}
                className="bg-[rgba(12,20,41,0.5)] hover:bg-[rgba(20,30,56,0.8)] border border-[rgba(0,71,255,0.2)] hover:border-[rgba(0,71,255,0.5)] text-[#6b7fa8] hover:text-white font-bold uppercase tracking-widest text-[10px] px-3 h-8 lg:h-10 rounded-lg transition-all"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="bg-[#0047ff] hover:bg-[#1a5fff] text-white font-bold uppercase tracking-widest text-[10px] lg:text-xs px-4 lg:px-6 h-8 lg:h-10 rounded-lg shadow-[0_4px_15px_rgba(0,71,255,0.5)] flex items-center gap-1.5 transition-all"
            >
              <Wallet size={14} />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <main
        className="flex-1 min-h-0 overflow-hidden
                   grid gap-2 p-2
                   grid-cols-1
                   md:grid-cols-12"
      >
        <aside className="hidden lg:flex lg:col-span-3 flex-col min-h-0 overflow-hidden">
          <div className="bento-card flex-1 min-h-0 flex flex-col overflow-hidden">
            <History history={history} />
          </div>
        </aside>

        <section
          className="col-span-1 md:col-span-7 lg:col-span-6
                     flex flex-col gap-2 min-h-0 overflow-hidden"
        >
          <div
            className="bento-card flex-1 min-h-0 flex flex-col
                       items-center justify-center relative overflow-hidden"
            style={{ 
              background: 'radial-gradient(circle at 50% 50%, rgba(0,71,255,0.08) 0%, transparent 70%)',
              padding: '10px'
            }}
          >
            {/* Status Indicator Ring */}
            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${state.status === 'READY' ? 'opacity-100' : 'opacity-0'}`}
                 style={{ 
                   background: 'radial-gradient(circle at 50% 50%, rgba(245,158,11,0.05) 0%, transparent 60%)' 
                 }} />

            <div
              className="flex-1 min-h-0 w-full flex items-center justify-center"
              style={{ padding: '0px' }}
            >
              <div
                style={{
                  height: '92%',
                  aspectRatio: '1 / 1',
                  maxWidth: '100%',
                  position: 'relative',
                }}
              >
                <Wheel
                  players={state.players}
                  status={state.status}
                  winningAngle={state.winningAngle}
                  timer={state.timer}
                />
              </div>
            </div>
          </div>
        </section>

        <aside
          className="col-span-1 md:col-span-5 lg:col-span-3
                     flex flex-col gap-2 min-h-0 overflow-hidden"
        >
          <div
            className="bento-card shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(7,13,28,0.95), rgba(0,30,80,0.15))',
              borderColor: 'rgba(0,71,255,0.22)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="label" style={{ color: 'rgba(0,71,255,0.55)' }}>My Position</p>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="label mb-1">Win Chance</p>
                <p
                  className="text-3xl font-black tracking-tighter leading-none"
                  style={{ color: '#0047ff' }}
                >
                  {userChance}
                  <span className="text-base ml-0.5" style={{ color: 'rgba(0,71,255,0.6)' }}>%</span>
                </p>
              </div>
              <div className="text-right">
                <p className="label mb-1">Deposited</p>
                <p className="text-base font-black text-white">
                  {userPlayer ? userPlayer.amount.toFixed(2) : '0.00'}
                  <span className="text-xs ml-1" style={{ color: '#3d5080' }}>USDC</span>
                </p>
              </div>
            </div>
            
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => {
                  if (!address) connect();
                  else setShowDepositModal(true);
                }}
                disabled={address && !isOnArcTestnet}
                className={`w-full text-white font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 ${
                  address && !isOnArcTestnet 
                    ? 'bg-gray-800 cursor-not-allowed opacity-50' 
                    : 'bg-[#0047ff] hover:bg-[#1a5fff] shadow-[0_4px_15px_rgba(0,71,255,0.4)]'
                }`}
              >
                {address && !isOnArcTestnet ? 'Wrong Network' : (address ? 'DEPOSIT' : 'CONNECT WALLET')}
              </button>
            </div>
          </div>

          <div className="bento-card flex-1 min-h-0 flex flex-col overflow-hidden">
            <PoolParticipants players={state.players} totalPool={state.totalPool} />
          </div>
        </aside>
      </main>

      <footer
        className="shrink-0 flex items-center justify-between px-4 md:px-6
                   border-t border-[rgba(0,71,255,0.08)]
                   bg-[rgba(7,13,28,0.6)]"
        style={{ height: '32px' }}
      >
        <p className="label" style={{ color: '#1e2d4e' }}>
          Archer Protocol · v2.1.0 · Arc Testnet
        </p>
        <div className="flex items-center gap-4">
          <FooterTag dot="#10b981" label="Network OK" />
          <FooterTag dot="#0047ff" label="Live" pulse />
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div className="text-center">
      {label && <p className="label">{label}</p>}
      <p className="text-[20px] font-black leading-tight" style={{ color: accent ? '#4d7bff' : '#f0f4ff' }}>
        {value}
        {unit && <span className="text-xs font-bold ml-1" style={{ color: '#3d5080' }}>{unit}</span>}
      </p>
    </div>
  );
}

function FooterTag({ dot, label, pulse }: { dot: string; label: string; pulse?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: dot,
          boxShadow: pulse ? `0 0 6px ${dot}` : undefined,
          animation: pulse ? 'pulse 2s infinite' : undefined,
        }}
      />
      <span className="label" style={{ color: '#2d3f60' }}>{label}</span>
    </span>
  );
}

function PoolParticipants({ players, totalPool }: { players: any[]; totalPool: number }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 mb-2.5 shrink-0">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'rgba(0,71,255,0.1)', border: '1px solid rgba(0,71,255,0.2)' }}
        >
          <Users size={12} style={{ color: '#4d7bff' }} />
        </div>
        <p className="label" style={{ color: '#4d7bff' }}>Live Entries</p>
        <span
          className="ml-auto text-[10px] font-black"
          style={{ color: '#3d5080' }}
        >
          {players.length}/10
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
        {players.map((p: any, i: number) => {
          const pct = totalPool > 0 ? ((p.amount / totalPool) * 100).toFixed(1) : '0';
          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-2.5 py-2 rounded-xl
                         transition-colors duration-150"
              style={{
                background: 'rgba(12,20,41,0.7)',
                border: `1px solid rgba(${hexToRgb(p.color)},0.18)`,
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center
                             text-[9px] font-black"
                  style={{
                    border: `1.5px solid ${p.color}`,
                    color: p.color,
                    background: `${p.color}18`,
                  }}
                >
                  {i + 1}
                </div>
                <span className="text-[11px] font-medium font-mono"
                      style={{ color: '#94aac8' }}>
                  {p.address.slice(0, 6)}…{p.address.slice(-4)}
                </span>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black" style={{ color: p.color }}>{pct}%</p>
                <p className="label leading-tight">{p.amount.toFixed(0)} USDC</p>
              </div>
            </div>
          );
        })}

        {players.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-6">
            <Trophy size={20} style={{ color: '#1e2d4e', opacity: 0.5 }} />
            <p className="label text-center leading-loose" style={{ color: '#1e2d4e' }}>
              Waiting for<br />first entry…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}
