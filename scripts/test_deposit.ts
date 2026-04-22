import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../src/lib/contract';

async function main() {
    const provider = new ethers.JsonRpcProvider(
        "https://rpc.testnet.arc.network",
        { chainId: 5042002, name: 'arc-testnet' },
        { staticNetwork: true }
    );
    
    // The funded deployer account acting as a second player
    const PRIVATE_KEY = "0xeb4dbc4b8bbdd24530df3f7fa2239f0a3d3fdf062e88d6af4c94593dff138d66";
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

    console.log("Simulating 'Player 2' deposit of 5 USDC...");
    const tx = await contract.deposit({ value: ethers.parseEther("5") });
    console.log("Deposit submitted. Tx:", tx.hash);
    await tx.wait();
    console.log("Player 2 successfully entered the pool!");
}

main().catch(console.error);
