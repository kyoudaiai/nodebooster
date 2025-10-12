const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("\n=== Upgrading Avax0Token V1 to V2 ===\n");
    console.log("Upgrading with account:", deployer.address);
    
    // Get balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "AVAX");
    
    // Get proxy address from command line args or environment variable
    let proxyAddress = process.env.PROXY_ADDRESS;
    
    // Try to get from command line arguments (skip first 2 args: node, script)
    const args = process.argv.slice(2);
    const addressArg = args.find(arg => arg.startsWith('0x') && arg.length === 42);
    if (addressArg) {
        proxyAddress = addressArg;
    }
    
    if (!proxyAddress) {
        console.error("\\n❌ Error: Please provide the proxy address");
        console.log("Method 1: Set environment variable:");
        console.log("  PROXY_ADDRESS=0x1234... npx hardhat run scripts/upgrade-avax0-v1-to-v2.js --network <network>");
        console.log("Method 2: Add to command (after network):");
        console.log("  npx hardhat run scripts/upgrade-avax0-v1-to-v2.js --network <network> 0x1234...");
        console.log("Example: npx hardhat run scripts/upgrade-avax0-v1-to-v2.js --network fuji 0x1234...");
        process.exit(1);
    }
    
    if (!ethers.isAddress(proxyAddress)) {
        console.error("❌ Error: Invalid proxy address provided");
        process.exit(1);
    }
    
    console.log("Proxy address:", proxyAddress);
    
    try {
        // Verify current state
        console.log("\n=== Verifying Current V1 State ===");
        const tokenV1 = await ethers.getContractAt("Avax0TokenV1", proxyAddress);
        
        const currentName = await tokenV1.name();
        const currentSymbol = await tokenV1.symbol();
        const currentSupply = await tokenV1.totalSupply();
        const currentOwner = await tokenV1.owner();
        const currentVersion = await tokenV1.version();
        const deployerBalance = await tokenV1.balanceOf(deployer.address);
        const isDeployerMinter = await tokenV1.minters(deployer.address);
        
        console.log("Current Name:", currentName);
        console.log("Current Symbol:", currentSymbol);
        console.log("Current Supply:", ethers.formatEther(currentSupply));
        console.log("Current Owner:", currentOwner);
        console.log("Current Version:", currentVersion);
        console.log("Deployer Balance:", ethers.formatEther(deployerBalance));
        console.log("Deployer is Minter:", isDeployerMinter);
        
        // Verify it's actually V1
        if (currentVersion !== "1.0.0") {
            console.error(`❌ Error: Expected version 1.0.0, but found ${currentVersion}`);
            console.error("This doesn't appear to be a V1 contract or it's already upgraded.");
            process.exit(1);
        }
        
        // Check if deployer is the owner (required for upgrade)
        if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
            console.error(`❌ Error: Deployer (${deployer.address}) is not the contract owner (${currentOwner})`);
            console.error("Only the contract owner can perform upgrades.");
            process.exit(1);
        }
        
        // Prepare upgrade to V2
        console.log("\n=== Preparing Upgrade to V2 ===");
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        
        console.log("Upgrading proxy to V2 implementation...");
        const upgradedProxy = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
        await upgradedProxy.waitForDeployment();
        
        console.log("✅ Proxy upgraded successfully!");
        
        // Initialize V2 features
        console.log("\n=== Initializing V2 Features ===");
        const tokenV2 = await ethers.getContractAt("Avax0TokenV2", proxyAddress);
        
        // Set V2 parameters
        const treasuryAddress = deployer.address; // Use deployer as treasury for now
        const initialFeeRate = 100; // 1% transfer fee
        
        console.log(`Initializing V2 with treasury: ${treasuryAddress} and fee rate: ${initialFeeRate} basis points...`);
        const initTx = await tokenV2.initializeV2(treasuryAddress, initialFeeRate);
        await initTx.wait();
        
        console.log("✅ V2 initialization complete!");
        
        // Verify upgrade
        console.log("\n=== Verifying Upgrade ===");
        const newVersion = await tokenV2.version();
        const newTreasury = await tokenV2.treasury();
        const newFeeRate = await tokenV2.transferFeeRate();
        const newSupply = await tokenV2.totalSupply();
        const newDeployerBalance = await tokenV2.balanceOf(deployer.address);
        const newIsDeployerMinter = await tokenV2.minters(deployer.address);
        
        console.log("New Version:", newVersion);
        console.log("Treasury Address:", newTreasury);
        console.log("Transfer Fee Rate:", newFeeRate, "basis points");
        console.log("Total Supply (preserved):", ethers.formatEther(newSupply));
        console.log("Deployer Balance (preserved):", ethers.formatEther(newDeployerBalance));
        console.log("Deployer Minter Status (preserved):", newIsDeployerMinter);
        
        // Verification checks
        const checks = [
            { name: "Version upgraded", condition: newVersion === "2.0.0" },
            { name: "Supply preserved", condition: newSupply === currentSupply },
            { name: "Balance preserved", condition: newDeployerBalance === deployerBalance },
            { name: "Minter status preserved", condition: newIsDeployerMinter === isDeployerMinter },
            { name: "Treasury set", condition: newTreasury === treasuryAddress },
            { name: "Fee rate set", condition: newFeeRate === BigInt(initialFeeRate) }
        ];
        
        console.log("\n=== Upgrade Verification ===");
        let allPassed = true;
        for (const check of checks) {
            const status = check.condition ? "✅ PASS" : "❌ FAIL";
            console.log(`${status} ${check.name}`);
            if (!check.condition) allPassed = false;
        }
        
        if (!allPassed) {
            console.error("\n❌ Some verification checks failed!");
            process.exit(1);
        }
        
        // Get new implementation address
        const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
        
        console.log("\n=== Upgrade Summary ===");
        console.log(`Network: ${hre.network.name}`);
        console.log(`Proxy Address: ${proxyAddress}`);
        console.log(`New Implementation: ${newImplementationAddress}`);
        console.log(`Treasury: ${treasuryAddress}`);
        console.log(`Fee Rate: ${initialFeeRate} basis points (${initialFeeRate/100}%)`);
        console.log(`Upgrader: ${deployer.address}`);
        console.log("\n🎉 Upgrade completed successfully!");
        
        return {
            proxy: proxyAddress,
            implementation: newImplementationAddress,
            treasury: treasuryAddress,
            feeRate: initialFeeRate,
            upgrader: deployer.address
        };
        
    } catch (error) {
        console.error("\n❌ Upgrade failed:");
        console.error(error.message);
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
        if (error.code === 'CALL_EXCEPTION') {
            console.error("\nPossible causes:");
            console.error("- Contract is not upgradeable");
            console.error("- You're not the contract owner");
            console.error("- Contract is already upgraded");
            console.error("- Network connection issues");
        }
        process.exit(1);
    }
}

// Execute upgrade
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;