import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './src/lib/contract';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POOL_DURATION = 20;
const RESET_DURATION = 10;
const PLAYER_CAP = 10;

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
}

interface RoundHistoryItem {
  roundId: number;
  winner: string;
  amount: number;
  timestamp: number;
  txHash: string;
}

const colors = [
  '#3B82F6', '#60A5FA', '#93C5FD', '#1D4ED8', '#1E40AF',
  '#0EA5E9', '#38BDF8', '#7DD3FC', '#0369A1', '#075985',
];

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  const allowedOrigin = process.env.APP_URL ?? 'http://localhost:3000';
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
    },
  });

  let state: RoundState = {
    players: [],
    status: 'IDLE',
    timer: POOL_DURATION,
    winnerId: null,
    totalPool: 0,
    winningAngle: 0,
  };

  let history: RoundHistoryItem[] = [];
  let timerInterval: NodeJS.Timeout | null = null;

  const provider = new ethers.JsonRpcProvider('https://rpc.testnet.arc.network');
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  function broadcastState() {
    io.emit('state_update', state);
  }

  function dedupeHistory(items: RoundHistoryItem[]): RoundHistoryItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.txHash || `round-${item.roundId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function broadcastHistory() {
    io.emit('history', history);
  }

  function resetRound() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    state = {
      players: [],
      status: 'IDLE',
      timer: POOL_DURATION,
      winnerId: null,
      totalPool: 0,
      winningAngle: 0,
    };

    broadcastState();
  }

  async function syncFromChain() {
    try {
      const [playersRaw, totalPoolRaw, startTimeRaw] = await Promise.all([
        contract.getPlayers(),
        contract.totalPool(),
        contract.roundStartTime(),
      ]);

      const now = Math.floor(Date.now() / 1000);
      const startTime = Number(startTimeRaw);
      const timer = startTime > 0 ? Math.max(0, POOL_DURATION - (now - startTime)) : POOL_DURATION;

      const playerTotals = new Map<string, number>();
      for (const player of playersRaw) {
        const address = String(player.wallet).toLowerCase();
        const amount = Number(ethers.formatEther(player.amount));
        playerTotals.set(address, (playerTotals.get(address) ?? 0) + amount);
      }

      const mappedPlayers = Array.from(playerTotals.entries())
        .slice(0, PLAYER_CAP)
        .map(([address, amount], index) => ({
          id: address,
          address,
          amount,
          color: colors[index % colors.length],
        }));

      state.players = mappedPlayers;
      state.totalPool = Number(ethers.formatEther(totalPoolRaw));
      state.timer = timer;

      if (mappedPlayers.length >= 2) {
        state.status = timer <= 0 ? 'READY' : 'WAITING';
      } else {
        state.status = 'IDLE';
      }

      broadcastState();
    } catch (error) {
      console.error('[SYNC] Failed to sync state from chain:', error);
    }
  }

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.emit('state_update', state);
    socket.emit('history', history);

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  contract.on('Deposit', async () => {
    await syncFromChain();
  });

  contract.on('RoundResolved', async (roundId, winner, amount, winningRandom, event) => {
    console.log(`[ON-CHAIN] Round ${roundId} resolved. Winner: ${winner}`);

    const total = Number(ethers.formatEther(amount));
    const randomVal = Number(ethers.formatEther(winningRandom));
    const landingDegree = total > 0 ? (randomVal / total) * 360 : 0;

    state.status = 'SPINNING';
    state.winnerId = String(winner).toLowerCase();
    state.totalPool = total;
    state.winningAngle = (360 * 5) + (360 - landingDegree);
    state.timer = 0;
    broadcastState();

    setTimeout(async () => {
      state.status = 'FINISHED';
      const resolvedRoundId = Number(roundId);
      const txHash = String(event?.log?.transactionHash ?? event?.transactionHash ?? '');
      const roundEntry: RoundHistoryItem = {
        roundId: resolvedRoundId,
        winner: String(winner).toLowerCase(),
        amount: total,
        timestamp: Date.now(),
        txHash,
      };

      history = dedupeHistory([
        roundEntry,
        ...history.filter((item) => item.roundId !== resolvedRoundId && (!txHash || item.txHash !== txHash)),
      ]).slice(0, 20);

      broadcastHistory();
      broadcastState();

      setTimeout(async () => {
        await syncFromChain();
        if (state.players.length === 0) {
          resetRound();
        }
      }, RESET_DURATION * 1000);
    }, 6000);
  });

  await syncFromChain();
  if (!timerInterval) {
    timerInterval = setInterval(syncFromChain, 3000);
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
