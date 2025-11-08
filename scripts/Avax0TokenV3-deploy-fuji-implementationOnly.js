const { ethers } = require("hardhat");

async function main() {
    console.log("=== Deploying Fresh Avax0TokenV3 Implementation ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    console.log("Network:", await ethers.provider.getNetwork());
    
    // Get deployer balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "AVAX");
    
    try {
        // Deploy the implementation contract directly (not through proxy)
        console.log("\n=== Deploying Implementation Contract ===");
        const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
        
        console.log("Deploying new implementation...");
        const implementation = await Avax0TokenV3.deploy();
        
        console.log("Waiting for deployment confirmation...");
        await implementation.waitForDeployment();
        
        const implementationAddress = await implementation.getAddress();
        console.log("✅ New implementation deployed!");
        console.log("📍 Implementation Address:", implementationAddress);
        
        // Verify the implementation by calling version directly
        console.log("\n=== Implementation Verification ===");
        try {
            const version = await implementation.version();
            console.log("✅ Implementation version:", version);
        } catch (error) {
            console.log("❌ Could not call version on implementation:", error.message);
        }
        
        // Check if the contract code is valid
        const code = await ethers.provider.getCode(implementationAddress);
        console.log("✅ Contract code length:", code.length, "characters");
        
        console.log("\n=== Manual Upgrade Instructions ===");
        console.log("🔧 Proxy Address: 0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078");
        console.log("🔧 New Implementation:", implementationAddress);
        console.log("");
        console.log("To perform manual upgrade, use one of these methods:");
        console.log("");
        console.log("Method 1 - Hardhat Console:");
        console.log(`  const proxy = await ethers.getContractAt("Avax0TokenV3", "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078")`);
        console.log(`  await proxy.upgradeTo("${implementationAddress}")`);
        console.log("");
        console.log("Method 2 - OpenZeppelin Defender:");
        console.log(`  Use the proxy admin to upgrade to: ${implementationAddress}`);
        console.log("");
        console.log("Method 3 - Direct upgrades call:");
        console.log(`  await upgrades.upgradeProxy("0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078", Avax0TokenV3, { unsafeAllow: ['constructor'] })`);
        
    } catch (error) {
        console.error("❌ Deployment failed:", error.message);
        console.error("Full error:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });