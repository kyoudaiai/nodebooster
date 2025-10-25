const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("\n=== Deploying Node0Token V1 ===\n");
    console.log("Deploying with account:", deployer.address);
    
    // Get balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "AVAX");
    
    try {
        // Deploy V1 contract
        console.log("\nDeploying Node0TokenV1...");
        const Node0TokenV1 = await ethers.getContractFactory("Node0TokenV1");
        
        const proxy = await upgrades.deployProxy(
            Node0TokenV1,
            [
                "Node0",           // name
                "Node0",           // symbol
                ethers.parseEther("5000000") // initial supply (5M tokens)
            ],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        
        await proxy.waitForDeployment();
        const proxyAddress = await proxy.getAddress();

        console.log("\n✅ Node0TokenV1 deployed successfully!");
        console.log("Proxy address:", proxyAddress);
        
        // Get implementation address
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
        console.log("Implementation address:", implementationAddress);
        
        // Verify deployment
        const token = await ethers.getContractAt("Node0TokenV1", proxyAddress);
        const name = await token.name();
        const symbol = await token.symbol();
        const totalSupply = await token.totalSupply();
        const owner = await token.owner();
        const version = await token.version();
        
        console.log("\n=== Deployment Verification ===");
        console.log("Name:", name);
        console.log("Symbol:", symbol);
        console.log("Total Supply:", ethers.formatEther(totalSupply));
        console.log("Owner:", owner);
        console.log("Version:", version);
        console.log("Deployer is minter:", await token.minters(deployer.address));
        
        console.log("\n=== Deployment Summary ===");
        console.log(`Network: ${hre.network.name}`);
        console.log(`Proxy Address: ${proxyAddress}`);
        console.log(`Implementation: ${implementationAddress}`);
        console.log(`Deployer: ${deployer.address}`);
        console.log(`Gas Used: Check transaction receipts`);
        
        return {
            proxy: proxyAddress,
            implementation: implementationAddress,
            deployer: deployer.address
        };
        
    } catch (error) {
        console.error("\n❌ Deployment failed:");
        console.error(error.message);
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
        process.exit(1);
    }
}

// Execute deployment
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;