import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

interface LeaderboardEntry {
  address: string;
  volume: number;
  games: number;
  wins: number;
  score: number;
}

interface RoundHistoryRow {
  round_id: number;
  winner: string;
  amount: number;
  timestamp: number;
  tx_hash: string | null;
}

const colors = [
  '#3B82F6', '#60A5FA', '#93C5FD', '#1D4ED8', '#1E40AF',
  '#0EA5E9', '#38BDF8', '#7DD3FC', '#0369A1', '#075985',
];
const SCORE_WEIGHTS = {
  volume: 0.9,
  games: 0.07,
  wins: 0.03,
};

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
  let leaderboard: LeaderboardEntry[] = [];
  const leaderboardBase = new Map<string, Omit<LeaderboardEntry, 'score'>>();
  let timerInterval: NodeJS.Timeout | null = null;

  const provider = new ethers.JsonRpcProvider('https://rpc.testnet.arc.network');
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase: SupabaseClient | null =
    supabaseUrl && supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey)
      : null;

  if (!supabase) {
    console.warn('[SUPABASE] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Using in-memory round history.');
  } else {
    console.log('[SUPABASE] Connected. Round history persistence enabled.');
  }

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

  function broadcastLeaderboard() {
    io.emit('leaderboard', leaderboard);
  }

  function ensureLeaderboardEntry(address: string) {
    const normalized = address.toLowerCase();
    const existing = leaderboardBase.get(normalized);
    if (existing) return existing;
    const created = { address: normalized, volume: 0, games: 0, wins: 0 };
    leaderboardBase.set(normalized, created);
    return created;
  }

  function recomputeLeaderboard() {
    const rows = Array.from(leaderboardBase.values());
    const maxVolume = Math.max(1, ...rows.map((row) => row.volume));
    const maxGames = Math.max(1, ...rows.map((row) => row.games));
    const maxWins = Math.max(1, ...rows.map((row) => row.wins));

    leaderboard = rows
      .map((row) => {
        const volumeComponent = (row.volume / maxVolume) * SCORE_WEIGHTS.volume;
        const gamesComponent = (row.games / maxGames) * SCORE_WEIGHTS.games;
        const winsComponent = (row.wins / maxWins) * SCORE_WEIGHTS.wins;
        const score = (volumeComponent + gamesComponent + winsComponent) * 100;

        return {
          ...row,
          score: Number(score.toFixed(2)),
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.volume !== a.volume) return b.volume - a.volume;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.games - a.games;
      });
  }

  async function bootstrapLeaderboardFromChain() {
    try {
      const [depositLogs, resolvedLogs] = await Promise.all([
        contract.queryFilter(contract.filters.Deposit()),
        contract.queryFilter(contract.filters.RoundResolved()),
      ]);

      leaderboardBase.clear();

      for (const log of depositLogs) {
        const player = String((log as any).args?.player ?? '').toLowerCase();
        const amountRaw = (log as any).args?.amount ?? 0n;
        if (!player) continue;

        const row = ensureLeaderboardEntry(player);
        row.volume += Number(ethers.formatEther(amountRaw));
        row.games += 1;
      }

      for (const log of resolvedLogs) {
        const winner = String((log as any).args?.winner ?? '').toLowerCase();
        if (!winner) continue;
        const row = ensureLeaderboardEntry(winner);
        row.wins += 1;
      }

      recomputeLeaderboard();
      console.log(`[LEADERBOARD] Computed ${leaderboard.length} player rows from chain history.`);
    } catch (error) {
      console.error('[LEADERBOARD] Failed to bootstrap from chain logs:', error);
    }
  }

  function mapRowToHistory(row: RoundHistoryRow): RoundHistoryItem {
    return {
      roundId: Number(row.round_id),
      winner: row.winner,
      amount: Number(row.amount),
      timestamp: Number(row.timestamp),
      txHash: row.tx_hash ?? '',
    };
  }

  async function loadHistoryFromDatabase() {
    if (!supabase) return;

    const pageSize = 1000;
    let offset = 0;
    const allRows: RoundHistoryRow[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('round_history')
        .select('round_id, winner, amount, timestamp, tx_hash')
        .order('round_id', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('[SUPABASE] Failed to load history:', error.message);
        return;
      }

      const rows = (data ?? []) as RoundHistoryRow[];
      allRows.push(...rows);

      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    history = dedupeHistory(allRows.map(mapRowToHistory));
    console.log(`[SUPABASE] Loaded ${history.length} persisted round history rows.`);
  }

  async function upsertHistoryRow(item: RoundHistoryItem) {
    if (!supabase) return;

    const { error } = await supabase
      .from('round_history')
      .upsert(
        {
          round_id: item.roundId,
          winner: item.winner,
          amount: item.amount,
          timestamp: item.timestamp,
          tx_hash: item.txHash || null,
        },
        { onConflict: 'round_id' },
      );

    if (error) {
      console.error('[SUPABASE] Failed to persist history row:', error.message);
      return;
    }

    console.log(`[SUPABASE] Persisted round #${item.roundId}${item.txHash ? ` (${item.txHash.slice(0, 10)}...)` : ''}`);
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
    socket.emit('leaderboard', leaderboard);

    socket.on('request_history', () => {
      socket.emit('history', history);
    });
    socket.on('request_leaderboard', () => {
      socket.emit('leaderboard', leaderboard);
    });

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

  contract.on('Deposit', async (player, amount) => {
    const row = ensureLeaderboardEntry(String(player));
    row.volume += Number(ethers.formatEther(amount));
    row.games += 1;
    recomputeLeaderboard();
    broadcastLeaderboard();

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

    const winnerRow = ensureLeaderboardEntry(String(winner));
    winnerRow.wins += 1;
    recomputeLeaderboard();
    broadcastLeaderboard();

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

      await upsertHistoryRow(roundEntry);

      history = dedupeHistory([
        roundEntry,
        ...history.filter((item) => item.roundId !== resolvedRoundId && (!txHash || item.txHash !== txHash)),
      ]);

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
  await loadHistoryFromDatabase();
  await bootstrapLeaderboardFromChain();
  broadcastHistory();
  broadcastLeaderboard();
  if (!timerInterval) {
    timerInterval = setInterval(syncFromChain, 3000);
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
