const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🚀 Upgrading Avax0TokenV2 to V2.1 with global vesting features...");
    
    // Get current network and deployer
    const [deployer] = await ethers.getSigners();
    console.log("📝 Upgrading with account:", deployer.address);
    console.log("💰 Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));
    console.log("🌐 Network:", hre.network.name);
    
    // Get proxy address from command line args or from deployment file
    let proxyAddress = process.env.PROXY_ADDRESS;
    
    if (!proxyAddress) {
        // Try to read from deployment file
        try {
            const deploymentFile = `./deployments/Avax0TokenV2-${hre.network.name}.json`;
            if (fs.existsSync(deploymentFile)) {
                const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
                proxyAddress = deployment.proxyAddress;
                console.log(`📁 Using proxy address from ${deploymentFile}`);
            }
        } catch (error) {
            console.log("⚠️  Could not read deployment file");
        }
    }
    
    if (!proxyAddress) {
        console.error("❌ Error: No proxy address provided");
        console.log("💡 Usage: PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-avax0-v2-to-v2_1.js --network <network>");
        console.log("💡 Or make sure deployment file exists: ./deployments/Avax0TokenV2-<network>.json");
        process.exit(1);
    }
    
    console.log("📍 Upgrading proxy at:", proxyAddress);
    
    // Verify current contract is V2
    console.log("\n🔍 Verifying current contract state...");
    try {
        const currentContract = await ethers.getContractAt("Avax0TokenV2", proxyAddress);
        const currentVersion = await currentContract.version();
        const totalSupply = await currentContract.totalSupply();
        const owner = await currentContract.owner();
        
        console.log("  Current version:", currentVersion);
        console.log("  Current total supply:", ethers.formatEther(totalSupply));
        console.log("  Current owner:", owner);
        
        if (currentVersion !== "2.0.0") {
            console.log(`⚠️  Warning: Expected version 2.0.0, found ${currentVersion}`);
            console.log("🤔 Do you want to continue? (This might be upgrading from a different version)");
        }
    } catch (error) {
        console.error("❌ Error reading current contract:", error.message);
        console.log("🤔 Contract might not be V2, or network connection issue. Continue anyway? (y/N)");
        process.exit(1);
    }
    
    // Deploy new implementation
    console.log("\n📦 Deploying Avax0TokenV2_1 implementation...");
    const Avax0TokenV2_1 = await ethers.getContractFactory("Avax0TokenV2_1");
    
    console.log("🔄 Performing upgrade...");
    const upgradedContract = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2_1);
    await upgradedContract.waitForDeployment();
    
    // Verify upgrade was successful
    const avax0TokenV2_1 = await ethers.getContractAt("Avax0TokenV2_1", proxyAddress);
    const newVersion = await avax0TokenV2_1.version();
    
    console.log("✅ Upgrade completed successfully!");
    console.log("📍 Proxy address (unchanged):", proxyAddress);
    console.log("🆕 New version:", newVersion);
    
    // Get new implementation address
    const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("🔧 New implementation address:", newImplementationAddress);
    
    // Verify state preservation
    console.log("\n🔍 Verifying state preservation...");
    const totalSupply = await avax0TokenV2_1.totalSupply();
    const name = await avax0TokenV2_1.name();
    const symbol = await avax0TokenV2_1.symbol();
    const owner = await avax0TokenV2_1.owner();
    
    console.log("  Name:", name);
    console.log("  Symbol:", symbol);  
    console.log("  Total supply:", ethers.formatEther(totalSupply));
    console.log("  Owner:", owner);
    
    // Check V2.1 specific state (should be uninitialized)
    const vestingEnabled = await avax0TokenV2_1.vestingEnabled();
    const vestingEndDate = await avax0TokenV2_1.vestingEndDate();
    console.log("  Vesting enabled:", vestingEnabled);
    console.log("  Vesting end date:", vestingEndDate.toString());
    
    console.log("\n⚠️  IMPORTANT: V2.1 features are not yet initialized!");
    console.log("📋 Next steps required:");
    console.log("  1. Call initializeV2_1(vestingEndDate, vestingEnabled) to activate V2.1 features");
    console.log("  2. Configure vesting exclusions as needed");
    console.log("  3. Test all functionality");
    
    // Ask if user wants to initialize V2.1 features now
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const initializeNow = await new Promise((resolve) => {
        rl.question('🤔 Do you want to initialize V2.1 features now? (y/N): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
    
    if (initializeNow) {
        console.log("\n🔧 Initializing V2.1 features...");
        
        // Get initialization parameters
        const vestingDurationHours = 24; // Default 24 hours
        const vestingEndDate = Math.floor(Date.now() / 1000) + (vestingDurationHours * 60 * 60);
        const enableVesting = true;
        
        console.log(`  Vesting duration: ${vestingDurationHours} hours`);
        console.log(`  Vesting end date: ${new Date(vestingEndDate * 1000).toISOString()}`);
        console.log(`  Vesting enabled: ${enableVesting}`);
        
        try {
            const tx = await avax0TokenV2_1.initializeV2_1(vestingEndDate, enableVesting);
            await tx.wait();
            
            console.log("✅ V2.1 features initialized successfully!");
            console.log("📍 Transaction hash:", tx.hash);
            
            // Verify initialization
            const finalVestingEnabled = await avax0TokenV2_1.vestingEnabled();
            const finalVestingEndDate = await avax0TokenV2_1.vestingEndDate();
            const ownerExcluded = await avax0TokenV2_1.vestingExcluded(owner);
            
            console.log("🔍 Verification:");
            console.log("  Vesting enabled:", finalVestingEnabled);
            console.log("  Vesting end date:", new Date(Number(finalVestingEndDate) * 1000).toISOString());
            console.log("  Owner excluded from vesting:", ownerExcluded);
            
        } catch (error) {
            console.error("❌ Error initializing V2.1 features:", error.message);
            console.log("💡 You can initialize later by calling initializeV2_1() manually");
        }
    }
    
    // Save deployment info
    const deploymentInfo = {
        network: hre.network.name,
        proxyAddress: proxyAddress,
        implementationAddress: newImplementationAddress,
        upgrader: deployer.address,
        version: "2.1.0",
        upgradedAt: new Date().toISOString(),
        previousVersion: "2.0.0",
        vestingInitialized: initializeNow,
        upgradeTransaction: upgradedContract.deploymentTransaction()?.hash || "unknown"
    };
    
    // Write upgrade info to file
    const deployDir = './deployments';
    if (!fs.existsSync(deployDir)) {
        fs.mkdirSync(deployDir, { recursive: true });
    }
    
    const filename = `${deployDir}/Avax0TokenV2_1-${hre.network.name}.json`;
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    
    console.log(`\n💾 Upgrade info saved to: ${filename}`);
    console.log("\n🎉 V2 → V2.1 upgrade completed successfully!");
    
    if (!initializeNow) {
        console.log("\n📝 Remember to initialize V2.1 features:");
        console.log(`  await contract.initializeV2_1(vestingEndDate, true)`);
        console.log("📝 And configure vesting exclusions:");
        console.log(`  await contract.setVestingExclusion(address, true)`);
    }
    
    console.log("\n🚀 Contract is ready for V2.1 functionality testing!");
    
    return {
        proxyAddress,
        implementationAddress: newImplementationAddress,
        contract: avax0TokenV2_1,
        deploymentInfo
    };
}

// Allow script to be called directly or imported
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Upgrade failed:");
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;