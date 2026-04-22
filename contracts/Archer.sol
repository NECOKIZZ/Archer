// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ArcherPool
 * @dev A simple winner-takes-all lottery pool for the Arc Testnet. 
 *      Players deposit native USDC (gas token) into the pool. Once >= 2 players 
 *      have entered, anyone can call resolveRound() to pseudo-randomly pick a winner
 *      based on weighted deposits and transfer the total pool to them.
 */
contract ArcherPool {
    uint256 public constant MAX_PLAYERS = 10;
    
    struct Player {
        address wallet;
        uint256 amount;
    }

    Player[] public currentPlayers;
    uint256 public totalPool;
    uint256 public roundId;
    uint256 public roundStartTime;
    
    // Result memory for UI "Catch-up" replays
    address public lastWinner;
    uint256 public lastWinningRandom;
    
    // Events exactly what the frontend needs to sync
    event Deposit(address indexed player, uint256 amount, uint256 newTotalPool);
    event RoundResolved(uint256 indexed roundId, address indexed winner, uint256 amount, uint256 winningRandom);

    /**
     * @notice Deposit native gas token (USDC) into the pool.
     */
    function deposit() public payable {
        require(msg.value > 0, "Deposit must be greater than 0");
        require(currentPlayers.length < MAX_PLAYERS, "Pool is full");

        currentPlayers.push(Player({
            wallet: msg.sender,
            amount: msg.value
        }));
        
        totalPool += msg.value;

        // If this is the 2nd player, start the 20-second timer
        if (currentPlayers.length == 2) {
            roundStartTime = block.timestamp;
        }

        emit Deposit(msg.sender, msg.value, totalPool);
    }

    /**
     * @notice Resolves the wheel spin randomly, sending the entire pool to the winner.
     *         Requires at least 2 players to resolve.
     */
    function resolveRound() public {
        require(currentPlayers.length >= 2, "Need at least 2 entries to spin");
        require(roundStartTime > 0, "Round timer not started");
        require(block.timestamp >= roundStartTime + 20, "Round timer not finished");

        uint256 total = totalPool;
        require(total > 0, "Pool is empty");

        // Simple pseudo-random selection. (Appropriate for low-stakes Testnet).
        uint256 random = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender))) % total;

        uint256 cumulative = 0;
        address winner;

        for (uint256 i = 0; i < currentPlayers.length; i++) {
            cumulative += currentPlayers[i].amount;
            if (random < cumulative) {
                winner = currentPlayers[i].wallet;
                break;
            }
        }

        // Failsafe in case of rounding errors
        if (winner == address(0)) {
            winner = currentPlayers[currentPlayers.length - 1].wallet;
        }

        // Reset the state for the next round
        lastWinner = winner;
        lastWinningRandom = random;
        delete currentPlayers;
        totalPool = 0;
        roundStartTime = 0;
        uint256 resolvedRoundId = roundId;
        roundId++;

        // Transfer all USDC (native value) to the winner
        (bool success, ) = winner.call{value: total}("");
        require(success, "Transfer failed");

        emit RoundResolved(resolvedRoundId, winner, total, random);
    }

    /**
     * @notice Helper to get all current players and their amounts
     */
    function getPlayers() public view returns (Player[] memory) {
        return currentPlayers;
    }

    // Safety fallbacks for raw USDC transfers
    receive() external payable {
        revert("Use deposit() function to enter pool.");
    }

    fallback() external payable {
        revert("Invalid function call. Use dApp interface.");
    }
}
