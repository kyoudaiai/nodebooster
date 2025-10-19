// Example: How to use the NodeBooster V1 to V2 upgrade system

const { ethers, upgrades } = require("hardhat");

async function exampleUpgrade() {
    console.log("📚 NodeBooster V1 to V2 Upgrade Example");
    console.log("======================================");
    
    // This example shows how to use the upgrade system in different scenarios
    
    console.log("\n1️⃣  Testing Upgrade Locally");
    console.log("Run the comprehensive test suite:");
    console.log("   npx hardhat test test/upgrade-v1-to-v2.test.js");
    
    console.log("\n2️⃣  Upgrading on Testnet");
    console.log("First, set your testnet V1 proxy address:");
    console.log("   export NODEBOOSTER_PROXY_ADDRESS=0x1234567890123456789012345678901234567890");
    console.log("Then run the upgrade:");
    console.log("   npx hardhat run scripts/upgrade-v1-to-v2.js --network testnet");
    
    console.log("\n3️⃣  Upgrading on Mainnet");
    console.log("⚠️  IMPORTANT: Test thoroughly on testnet first!");
    console.log("   export NODEBOOSTER_PROXY_ADDRESS=0x...");
    console.log("   npx hardhat run scripts/upgrade-v1-to-v2.js --network mainnet");
    
    console.log("\n4️⃣  Using the Interactive Helper");
    console.log("For a guided experience:");
    console.log("   ./scripts/upgrade-helper.sh");
    
    console.log("\n🔍 What happens during upgrade:");
    console.log("   ✅ All user data preserved");
    console.log("   ✅ Engine configurations maintained");
    console.log("   ✅ Reward history intact");
    console.log("   ✅ Admin settings preserved");
    console.log("   🆕 New V2 features activated");
    
    console.log("\n📋 Pre-upgrade checklist:");
    console.log("   □ Run upgrade tests successfully");
    console.log("   □ Backup current contract state");
    console.log("   □ Verify proxy address is correct");
    console.log("   □ Ensure sufficient gas for deployment");
    console.log("   □ Test on testnet first");
    
    console.log("\n💡 New V2 Features Available After Upgrade:");
    console.log("   • Default referrer system");
    console.log("   • Enhanced user account info");
    console.log("   • Per-engine reward cap tracking");
    console.log("   • Improved error handling");
    console.log("   • Better blacklist management");
    
    // Example of checking state before/after upgrade
    if (process.env.NODEBOOSTER_PROXY_ADDRESS) {
        console.log("\n🔍 Example: Checking contract state");
        
        const proxyAddress = process.env.NODEBOOSTER_PROXY_ADDRESS;
        
        try {
            // Connect to existing contract
            const contract = await ethers.getContractAt("NodeBoosterV1", proxyAddress);
            
            // Get current state
            const version = await contract.version();
            const totalUsers = await contract.totalUsers();
            const engineCount = await contract.engineCount();
            
            console.log(`   Current version: ${version}`);
            console.log(`   Total users: ${totalUsers}`);
            console.log(`   Engine count: ${engineCount}`);
            
            if (version === "1.0.0") {
                console.log("   ✅ Contract is V1 - ready for upgrade");
            } else if (version === "2.0.0") {
                console.log("   ✅ Contract is already V2");
            } else {
                console.log("   ⚠️  Unexpected version detected");
            }
            
        } catch (error) {
            console.log("   ℹ️  Could not connect to contract (normal if not deployed)");
        }
    } else {
        console.log("\n💡 To check your contract state, set:");
        console.log("   export NODEBOOSTER_PROXY_ADDRESS=0x...");
    }
    
    console.log("\n🎯 Next Steps:");
    console.log("   1. Run: npx hardhat test test/upgrade-v1-to-v2.test.js");
    console.log("   2. Set your proxy address environment variable");
    console.log("   3. Run upgrade on testnet first");
    console.log("   4. Verify all functionality works");
    console.log("   5. Run upgrade on mainnet");
    
    console.log("\n📚 For detailed instructions, see: UPGRADE_GUIDE.md");
}

// Run the example
if (require.main === module) {
    exampleUpgrade()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Example failed:", error);
            process.exit(1);
        });
}

module.exports = { exampleUpgrade };