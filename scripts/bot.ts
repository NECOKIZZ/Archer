import 'dotenv/config';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../src/lib/contract';

const ARC_NETWORK = { chainId: 5042002, name: 'arc-testnet' } as const;
const BOT_RPC_URL = process.env.BOT_RPC_URL ?? 'https://rpc.testnet.arc.network';
const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY;
const ROUND_SECONDS = 20;
const POLL_MS = Number(process.env.BOT_POLL_INTERVAL_MS ?? 2000);
const ERROR_LOG_COOLDOWN_MS = 8000;

function isKnownSoftError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? '').toLowerCase();
  return msg.includes('already known') || msg.includes('reverted') || msg.includes('nonce too low');
}

async function main() {
  if (!BOT_PRIVATE_KEY) {
    throw new Error('Missing BOT_PRIVATE_KEY in environment.');
  }

  console.log('[BOT] Starting Archer resolver bot...');
  console.log('[BOT] Contract:', CONTRACT_ADDRESS);
  console.log('[BOT] RPC:', BOT_RPC_URL);

  const provider = new ethers.JsonRpcProvider(BOT_RPC_URL, ARC_NETWORK, { staticNetwork: true });
  const wallet = new ethers.Wallet(BOT_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  let isResolving = false;
  let inTick = false;
  let lastErrorLogAt = 0;

  const logError = (scope: string, err: unknown) => {
    const now = Date.now();
    if (now - lastErrorLogAt < ERROR_LOG_COOLDOWN_MS) return;
    lastErrorLogAt = now;
    console.error(`[BOT] ${scope}:`, (err as any)?.message ?? err);
  };

  const tryResolve = async () => {
    const players = await contract.getPlayers();
    if (players.length < 2) return;

    const startTime = Number(await contract.roundStartTime());
    if (startTime === 0) return;

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - startTime;
    if (elapsed < ROUND_SECONDS) return;

    console.log(`[BOT] Timer expired (${elapsed}s). Resolving round...`);
    isResolving = true;
    try {
      const tx = await contract.resolveRound();
      console.log('[BOT] Resolve tx broadcast:', tx.hash);
      const receipt = await tx.wait();
      console.log('[BOT] Round resolved in block:', receipt?.blockNumber ?? 'unknown');
    } finally {
      isResolving = false;
    }
  };

  const interval = setInterval(async () => {
    if (inTick || isResolving) return;
    inTick = true;
    try {
      await tryResolve();
    } catch (err) {
      if (!isKnownSoftError(err)) logError('tick failed', err);
    } finally {
      inTick = false;
    }
  }, POLL_MS);

  const shutdown = async (signal: string) => {
    clearInterval(interval);
    console.log(`[BOT] ${signal} received. Shutting down...`);
    try {
      await provider.destroy();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  console.log('[BOT] Ready.');
}

main().catch((err) => {
  console.error('[BOT] Fatal startup error:', err);
  process.exit(1);
});
