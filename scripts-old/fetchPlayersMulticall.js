const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");


//example USAGE
// npx hardhat run scripts/fetchPlayersMulticall.js --network mainnet
// npx hardhat run scripts/fetchPlayersMulticall.js --network bsc
// npx hardhat run scripts/fetchPlayersMulticall.js --network polygonmainnet
// npx hardhat run scripts/fetchPlayersMulticall.js --network optimism
// npx hardhat run scripts/fetchPlayersMulticall.js --network sepolia
// npx hardhat run scripts/fetchPlayersMulticall.js --network optimismSepolia

// Configuration
const BATCH_SIZE = 100; // Number of players to fetch in each multicall batch

// Network configurations
const NETWORK_CONFIG = {
    mainnet: {
        contractAddress: "YOUR_MAINNET_CONTRACT_ADDRESS",
        name: "Ethereum Mainnet"
    },
    bsc: {
        contractAddress: "YOUR_BSC_CONTRACT_ADDRESS", 
        name: "Binance Smart Chain"
    },
    polygonmainnet: {
        contractAddress: "0xaa7e573491C85abc4b2d2D875064618aC19e5412",
        name: "Polygon Mainnet"
    },
    optimism: {
        contractAddress: "0xaa7e573491C85abc4b2d2D875064618aC19e5412",
        name: "Optimism Mainnet"
    }
};

async function fetchPlayersBatch(contract, startIndex, endIndex) {
    const calls = [];
    
    // Prepare multicall data
    for (let i = startIndex; i < endIndex; i++) {
        calls.push(contract.interface.encodeFunctionData("playersList", [i]));
    }
    
    try {
        // Execute multicall
        const results = await contract.callStatic.mc(calls);
        
        // Decode results
        const players = results.map(result => 
            contract.interface.decodeFunctionResult("playersList", result)[0]
        );
        
        return players;
    } catch (error) {
        console.warn(`Multicall failed, falling back to individual calls for batch ${startIndex}-${endIndex}`);
        
        // Fallback to individual calls
        const players = [];
        for (let i = startIndex; i < endIndex; i++) {
            try {
                const player = await contract.playersList(i);
                players.push(player);
            } catch (err) {
                console.error(`Error fetching player at index ${i}:`, err.message);
                break;
            }
        }
        return players;
    }
}

async function main() {
    const networkName = network.name;
    const config = NETWORK_CONFIG[networkName];
    
    if (!config) {
        console.error(`Network ${networkName} not configured. Available networks: ${Object.keys(NETWORK_CONFIG).join(", ")}`);
        return;
    }
    
    console.log(`Connecting to ${config.name} (${networkName})`);
    console.log(`Using batch size: ${BATCH_SIZE}`);
    
    // Replace with your contract name
    const contractName = "contracts/DailyEthRoi-v1.sol:DailyEthRoiV1";
    
    // Get the contract factory and attach to deployed contract
    const Contract = await ethers.getContractFactory(contractName);
    const contract = Contract.attach(config.contractAddress);
    
    console.log("Fetching players from contract:", config.contractAddress);
    
    try {
        // Get the total number of players
        const playersCount = await contract.getPlayersCount();
        console.log(`Total players: ${playersCount.toString()}`);
        
        const results = {
            network: config.name,
            networkKey: networkName,
            contractAddress: config.contractAddress,
            timestamp: new Date().toISOString(),
            playersCount: playersCount.toString(),
            batchSize: BATCH_SIZE,
            players: []
        };
        
        if (playersCount.toString() === "0") {
            console.log("No players found in the contract.");
        } else {
            const totalPlayers = parseInt(playersCount.toString());
            const batches = Math.ceil(totalPlayers / BATCH_SIZE);
            
            console.log(`Fetching ${totalPlayers} players in ${batches} batches...`);
            
            // Fetch players in batches
            for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
                const startIndex = batchIndex * BATCH_SIZE;
                const endIndex = Math.min(startIndex + BATCH_SIZE, totalPlayers);
                
                console.log(`Fetching batch ${batchIndex + 1}/${batches} (players ${startIndex + 1}-${endIndex})...`);
                
                const batchPlayers = await fetchPlayersBatch(contract, startIndex, endIndex);
                results.players.push(...batchPlayers);
                
                console.log(`Batch ${batchIndex + 1} completed: ${batchPlayers.length} players fetched`);
            }
        }
        
        // Create filename with network and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `players-multicall-${networkName}-${timestamp}.json`;
        const filepath = path.join(__dirname, '..', 'output', filename);
        
        // Ensure output directory exists
        const outputDir = path.dirname(filepath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Write results to file
        fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
        console.log(`\nResults saved to: ${filepath}`);
        console.log(`Total players fetched: ${results.players.length}`);
        
    } catch (error) {
        console.error("Error fetching players:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
