import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read ABI and Address generated from deployment
const contractPath = path.resolve(__dirname, '../src/lib/contract.ts');
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../src/lib/contract';

async function main() {
    console.log("Starting Archer Wheel Bot...");
    console.log("Listening to Arc Testnet at:", CONTRACT_ADDRESS);

    const wssUrl = "wss://rpc.testnet.arc.network";
    const provider = new ethers.WebSocketProvider(wssUrl);
    
    // The funded deployer key
    const PRIVATE_KEY = "0xeb4dbc4b8bbdd24530df3f7fa2239f0a3d3fdf062e88d6af4c94593dff138d66";
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

    let roundTimer: NodeJS.Timeout | null = null;
    let isResolving = false; // The new Spin-Lock

    async function checkAndSpin() {
        try {
            const players = await contract.getPlayers();
            if (players.length >= 2) {
                console.log("2+ Drivers detected. Initiating automated spin sequence...");
                const tx = await contract.resolveRound();
                console.log("Tx broadcasted. Hash:", tx.hash);
                await tx.wait();
                console.log("Round resolved successfully!");
            }
        } catch(err: any) {
            const msg = err.message.toLowerCase();
            if (msg.includes("already known") || msg.includes("reverted")) {
                // Ignore silent noise - the round was likely already picked up
                return;
            }
            console.error("Resolve failed:", err.message);
        }
    }

    // Loop to check if we should trigger the spin
    setInterval(async () => {
        if (isResolving) return; // Wait for current transaction to finish

        try {
            const players = await contract.getPlayers();
            if (players.length < 2) return;

            const startTimeRaw = await contract.roundStartTime();
            const startTime = Number(startTimeRaw);
            if (startTime === 0) return;

            const now = Math.floor(Date.now() / 1000);
            const elapsed = now - startTime;

            if (elapsed >= 20) {
                console.log(`Timer expired on-chain (${elapsed}s elapsed). Initiating spin-lock...`);
                isResolving = true;
                try {
                    await checkAndSpin();
                } finally {
                    isResolving = false;
                }
            }
        } catch (err) {
            // Silence noise
        }
    }, 2000);

    contract.on("RoundResolved", (roundId, winner, amount, winningRandom) => {
        console.log(`=== SPIN CONCLUDED ===`);
        console.log(`Winner: ${winner}`);
        console.log(`Amount: ${ethers.formatEther(amount)} USDC`);
        console.log(`Landing Point: ${ethers.formatEther(winningRandom)} / ${ethers.formatEther(amount)}\n`);
    });

}

main().catch(console.error);
