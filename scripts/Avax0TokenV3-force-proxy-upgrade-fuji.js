const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== Force Proxy Upgrade ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    const newImplementationAddress = "0xA4d332f1D568bB87C07B131faf81164B501FD6D7";
    
    console.log("Proxy address:", proxyAddress);
    console.log("New implementation:", newImplementationAddress);
    
    try {
        // Try method 1: Direct admin upgrade
        console.log("\n=== Method 1: Admin Upgrade Pattern ===");
        
        // Get the proxy admin
        const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);
        console.log("Proxy admin address:", adminAddress);
        
        // Get proxy admin contract
        const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
        const proxyAdmin = ProxyAdmin.attach(adminAddress);
        
        console.log("Calling upgrade on proxy admin...");
        const upgradeTx = await proxyAdmin.upgrade(proxyAddress, newImplementationAddress);
        console.log("Transaction hash:", upgradeTx.hash);
        
        await upgradeTx.wait();
        console.log("✅ Admin upgrade completed");
        
        // Verify
        const proxy = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
        const newVersion = await proxy.version();
        console.log("New proxy version:", newVersion);
        
        if (newVersion === "3.0.3") {
            console.log("✅ SUCCESS! Proxy upgraded to V3.0.3");
            
            // Test functions
            const cleanupConfig = await proxy.getAutoCleanupConfig();
            console.log("✅ getAutoCleanupConfig now works:", cleanupConfig);
        }
        
    } catch (error) {
        console.log("❌ Admin upgrade failed:", error.message);
        
        // Try method 2: Force upgrade with upgrades plugin
        console.log("\n=== Method 2: Force with Upgrades Plugin ===");
        try {
            const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
            
            // Force the upgrade
            const upgraded = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV3, {
                unsafeAllow: ['constructor', 'state-variable-immutable'],
                force: true
            });
            
            await upgraded.waitForDeployment();
            console.log("✅ Force upgrade completed");
            
            const version = await upgraded.version();
            console.log("Final version:", version);
            
        } catch (forceError) {
            console.log("❌ Force upgrade also failed:", forceError.message);
            
            // Try method 3: Manual implementation slot update
            console.log("\n=== Method 3: Manual Implementation Slot ===");
            try {
                // This is for UUPS proxies - update the implementation slot directly
                const proxy = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
                
                // For UUPS, the upgrade function should be available
                const upgradeCall = await proxy.upgradeToAndCall(newImplementationAddress, "0x");
                await upgradeCall.wait();
                console.log("✅ UUPS upgrade completed");
                
                const finalVersion = await proxy.version();
                console.log("Final version:", finalVersion);
                
            } catch (uupsError) {
                console.log("❌ UUPS upgrade failed:", uupsError.message);
                console.log("All upgrade methods failed. Manual intervention required.");
            }
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });