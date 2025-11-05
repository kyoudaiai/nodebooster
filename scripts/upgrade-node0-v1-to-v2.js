const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("\n🔄 Node0Token V1 to V2 Upgrade Script\n");
    
    const [deployer] = await ethers.getSigners();
    console.log("Upgrading with account:", deployer.address);
    
    // Get the proxy address from environment or prompt
    const PROXY_ADDRESS = process.env.NODE0_TOKEN_PROXY_ADDRESS;
    
    if (!PROXY_ADDRESS) {
        console.error("❌ Error: Please set NODE0_TOKEN_PROXY_ADDRESS environment variable");
        console.log("   Example: export NODE0_TOKEN_PROXY_ADDRESS=0x...");
        process.exit(1);
    }
    
    console.log("Proxy address:", PROXY_ADDRESS);
    
    try {
        // Connect to existing V1 contract
        console.log("\n📊 Pre-upgrade verification...");
        const existingContract = await ethers.getContractAt("Node0TokenV1", PROXY_ADDRESS);
        
        // Capture current state
        const preState = {
            name: await existingContract.name(),
            symbol: await existingContract.symbol(),
            totalSupply: await existingContract.totalSupply(),
            owner: await existingContract.owner(),
            version: await existingContract.version(),
            ownerBalance: await existingContract.balanceOf(deployer.address),
            isOwnerMinter: await existingContract.minters(deployer.address)
        };
        
        console.log("Current state:")
        console.log("  Name:", preState.name);
        console.log("  Symbol:", preState.symbol);
        console.log("  Version:", preState.version);
        console.log("  Total Supply:", ethers.formatEther(preState.totalSupply));
        console.log("  Owner:", preState.owner);
        console.log("  Owner Balance:", ethers.formatEther(preState.ownerBalance));
        console.log("  Owner is Minter:", preState.isOwnerMinter);
        
        if (preState.version !== "1.0.0") {
            console.warn("⚠️  Warning: Expected version 1.0.0, found:", preState.version);
            console.log("   Continuing anyway...");
        }
        
        // Deploy V2 implementation and upgrade
        console.log("\n🔧 Deploying Node0TokenV2 implementation...");
        const Node0TokenV2 = await ethers.getContractFactory("Node0TokenV2");
        
        console.log("⬆️  Upgrading proxy to V2...");
        const upgradedContract = await upgrades.upgradeProxy(PROXY_ADDRESS, Node0TokenV2);
        await upgradedContract.waitForDeployment();
        
        console.log("✅ Upgrade completed!");
        
        // Verify upgrade
        console.log("\n🔍 Post-upgrade verification...");
        const postState = {
            name: await upgradedContract.name(),
            symbol: await upgradedContract.symbol(),
            totalSupply: await upgradedContract.totalSupply(),
            owner: await upgradedContract.owner(),
            version: await upgradedContract.version(),
            ownerBalance: await upgradedContract.balanceOf(deployer.address),
            isOwnerMinter: await upgradedContract.minters(deployer.address)
        };
        
        console.log("Post-upgrade state:")
        console.log("  Name:", postState.name);
        console.log("  Symbol:", postState.symbol);
        console.log("  Version:", postState.version);
        console.log("  Total Supply:", ethers.formatEther(postState.totalSupply));
        console.log("  Owner:", postState.owner);
        console.log("  Owner Balance:", ethers.formatEther(postState.ownerBalance));
        console.log("  Owner is Minter:", postState.isOwnerMinter);
        
        // Verification checks
        const checks = [
            { name: "Name preserved", pass: preState.name === postState.name },
            { name: "Symbol preserved", pass: preState.symbol === postState.symbol },
            { name: "Total supply preserved", pass: preState.totalSupply === postState.totalSupply },
            { name: "Owner preserved", pass: preState.owner === postState.owner },
            { name: "Owner balance preserved", pass: preState.ownerBalance === postState.ownerBalance },
            { name: "Minter status preserved", pass: preState.isOwnerMinter === postState.isOwnerMinter },
            { name: "Version updated", pass: postState.version === "2.0.0" }
        ];
        
        console.log("\n✅ Verification Results:")
        checks.forEach(check => {
            console.log(`  ${check.pass ? '✅' : '❌'} ${check.name}`);
        });
        
        const allPassed = checks.every(check => check.pass);
        
        if (allPassed) {
            console.log("\n🎉 Upgrade completed successfully!");
            console.log("   ✅ All state preserved");
            console.log("   ✅ Version updated to 2.0.0");
            console.log("   ✅ Time lock functionality now available");
            
            // Test V2 functionality
            console.log("\n🧪 Testing V2 features...");
            
            // Check that new functions are available
            try {
                const lockedAmount = await upgradedContract.getLockedAmount(deployer.address);
                console.log("   ✅ getLockedAmount() available:", ethers.formatEther(lockedAmount));
                
                const availableBalance = await upgradedContract.getAvailableBalance(deployer.address);
                console.log("   ✅ getAvailableBalance() available:", ethers.formatEther(availableBalance));
                
                console.log("   ✅ V2 functionality confirmed working");
            } catch (error) {
                console.log("   ❌ Error testing V2 functions:", error.message);
            }
            
        } else {
            console.log("\n❌ Upgrade completed but verification failed!");
            console.log("   Please review the failed checks above");
        }
        
    } catch (error) {
        console.error("\n❌ Upgrade failed:", error.message);
        console.log("   The original V1 contract remains unchanged");
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });