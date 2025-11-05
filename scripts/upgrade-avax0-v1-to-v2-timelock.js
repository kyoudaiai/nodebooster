const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("\n=== Upgrading Avax0Token V1 to V2 (Time Lock Version) ===\n");
    console.log("Upgrading with account:", deployer.address);
    
    // Get balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");
    
    // Get proxy address from command line args or environment variable
    let proxyAddress = process.env.AVAX0_AVALANCHE_PROXY_ADDRESS;
    
    // Try to get from command line arguments (skip first 2 args: node, script)
    const args = process.argv.slice(2);
    const addressArg = args.find(arg => arg.startsWith('0x') && arg.length === 42);
    if (addressArg) {
        proxyAddress = addressArg;
    }
    
    if (!proxyAddress) {
        console.error("\\n❌ Error: Please provide the proxy address");
        console.log("Method 1: Set environment variable:");
        console.log("  PROXY_ADDRESS=0x1234... npx hardhat run scripts/upgrade-avax0-v1-to-v2-timelock.js --network <network>");
        console.log("Method 2: Add to command (after network):");
        console.log("  npx hardhat run scripts/upgrade-avax0-v1-to-v2-timelock.js --network <network> 0x1234...");
        console.log("Example: npx hardhat run scripts/upgrade-avax0-v1-to-v2-timelock.js --network avalanche 0x1234...");
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
        const maxSupply = await tokenV1.MAX_SUPPLY();
        
        console.log("Current Name:", currentName);
        console.log("Current Symbol:", currentSymbol);
        console.log("Current Supply:", ethers.formatEther(currentSupply));
        console.log("Max Supply:", ethers.formatEther(maxSupply));
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
        
        // Get additional holders info (top 5 by balance)
        console.log("\n=== Checking Token Holders ===");
        const allAccounts = [deployer.address];
        let totalAccountsChecked = 1;
        
        // You might want to add other known addresses here for verification
        const knownAddresses = process.env.CHECK_ADDRESSES ? process.env.CHECK_ADDRESSES.split(',') : [];
        
        for (const addr of knownAddresses) {
            if (ethers.isAddress(addr.trim())) {
                allAccounts.push(addr.trim());
                totalAccountsChecked++;
            }
        }
        
        console.log(`Checking balances for ${totalAccountsChecked} accounts...`);
        const accountBalances = {};
        for (const account of allAccounts) {
            const balance = await tokenV1.balanceOf(account);
            if (balance > 0) {
                accountBalances[account] = balance;
                console.log(`  ${account}: ${ethers.formatEther(balance)}`);
            }
        }
        
        // Prepare upgrade to V2
        console.log("\n=== Preparing Upgrade to V2 (Time Lock Version) ===");
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        
        // Validate upgrade compatibility
        console.log("Validating upgrade compatibility...");
        await upgrades.validateUpgrade(proxyAddress, Avax0TokenV2);
        console.log("✅ Upgrade compatibility validated!");
        
        console.log("Upgrading proxy to V2 implementation...");
        const upgradedProxy = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
        await upgradedProxy.waitForDeployment();
        
        console.log("✅ Proxy upgraded successfully!");
        
        // Verify upgrade
        console.log("\n=== Verifying Upgrade ===");
        const tokenV2 = await ethers.getContractAt("Avax0TokenV2", proxyAddress);
        
        const newVersion = await tokenV2.version();
        const newSupply = await tokenV2.totalSupply();
        const newDeployerBalance = await tokenV2.balanceOf(deployer.address);
        const newIsDeployerMinter = await tokenV2.minters(deployer.address);
        const newOwner = await tokenV2.owner();
        const newMaxSupply = await tokenV2.MAX_SUPPLY();
        
        console.log("New Version:", newVersion);
        console.log("Total Supply (preserved):", ethers.formatEther(newSupply));
        console.log("Max Supply (preserved):", ethers.formatEther(newMaxSupply));
        console.log("Deployer Balance (preserved):", ethers.formatEther(newDeployerBalance));
        console.log("Deployer Minter Status (preserved):", newIsDeployerMinter);
        console.log("Owner (preserved):", newOwner);
        
        // Check all previously found balances are preserved
        console.log("\n=== Verifying All Account Balances ===");
        let allBalancesPreserved = true;
        for (const [account, oldBalance] of Object.entries(accountBalances)) {
            const newBalance = await tokenV2.balanceOf(account);
            const preserved = newBalance === oldBalance;
            console.log(`${account}: ${preserved ? '✅' : '❌'} ${ethers.formatEther(newBalance)}`);
            if (!preserved) allBalancesPreserved = false;
        }
        
        // Test new V2 functionality
        console.log("\n=== Testing New V2 Features ===");
        
        // Test time lock functions exist
        try {
            await tokenV2.getTimeLockCount(deployer.address);
            console.log("✅ Time lock functions accessible");
            
            // Test available balance calculation
            const availableBalance = await tokenV2.getAvailableBalance(deployer.address);
            const totalBalance = await tokenV2.balanceOf(deployer.address);
            console.log(`✅ Available balance calculation works: ${ethers.formatEther(availableBalance)} / ${ethers.formatEther(totalBalance)}`);
            
            // Test getting empty time locks
            const timeLocks = await tokenV2.getTimeLocks(deployer.address);
            console.log(`✅ Time locks query works: ${timeLocks.length} locks found`);
            
        } catch (error) {
            console.log("❌ Error testing V2 features:", error.message);
            allBalancesPreserved = false;
        }
        
        // Verification checks
        const checks = [
            { name: "Version upgraded", condition: newVersion === "2.0.0" },
            { name: "Supply preserved", condition: newSupply === currentSupply },
            { name: "Max supply preserved", condition: newMaxSupply === maxSupply },
            { name: "Deployer balance preserved", condition: newDeployerBalance === deployerBalance },
            { name: "Minter status preserved", condition: newIsDeployerMinter === isDeployerMinter },
            { name: "Owner preserved", condition: newOwner === currentOwner },
            { name: "All account balances preserved", condition: allBalancesPreserved }
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
        console.log(`Version: ${newVersion}`);
        console.log(`Total Supply: ${ethers.formatEther(newSupply)} ${currentSymbol}`);
        console.log(`Accounts Verified: ${totalAccountsChecked}`);
        console.log(`Upgrader: ${deployer.address}`);
        console.log("\n🎉 Upgrade to V2 (Time Lock) completed successfully!");
        console.log("\n📝 New V2 Features Available:");
        console.log("   • Time lock functionality for token transfers");
        console.log("   • Multiple concurrent locks per address");
        console.log("   • Mint with automatic time lock");
        console.log("   • Lock extension capabilities");
        console.log("   • Enhanced transfer restrictions");
        
        return {
            proxy: proxyAddress,
            implementation: newImplementationAddress,
            version: newVersion,
            totalSupply: ethers.formatEther(newSupply),
            upgrader: deployer.address,
            accountsVerified: totalAccountsChecked
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
            console.error("- Storage layout incompatibility");
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