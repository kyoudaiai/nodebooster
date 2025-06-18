const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");


// example USAGE
// npx hardhat run scripts/fetchPlayers.js --network mainnet

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

async function main() {
    const networkName = network.name;
    const config = NETWORK_CONFIG[networkName];
    
    if (!config) {
        console.error(`Network ${networkName} not configured. Available networks: ${Object.keys(NETWORK_CONFIG).join(", ")}`);
        return;
    }
    
    console.log(`Connecting to ${config.name} (${networkName})`);
    
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
            players: []
        };
        
        if (playersCount.toString() === "0") {
            console.log("No players found in the contract.");
        } else {
            // Fetch all players
            for (let i = 0; i < playersCount; i++) {
                const player = await contract.playersList(i);
                results.players.push(player);
                console.log(`Player ${i + 1}: ${player}`);
            }
        }
        
        // Create filename with network and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `players-${networkName}-${timestamp}.json`;
        const filepath = path.join(__dirname, '..', 'players-output', filename);
        
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
