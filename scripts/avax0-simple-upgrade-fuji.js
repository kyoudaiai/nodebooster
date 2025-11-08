const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Simple Avax0TokenV3 Upgrade - Fuji ===");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    const proxyAddress = process.env.AVAX0_fuji;
    console.log("Proxy:", proxyAddress);
    
    // Verify current state
    const current = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
    console.log("Current version:", await current.version());
    console.log("Owner:", await current.owner());
    
    try {
        console.log("\n=== Force Upgrading Implementation ===");
        
        // Get the factory
        const Avax0TokenV3 = await hre.ethers.getContractFactory("Avax0TokenV3");
        
        // Force upgrade by specifying the implementation deployment manually
        console.log("Deploying new implementation...");
        const newImplementation = await Avax0TokenV3.deploy();
        await newImplementation.waitForDeployment();
        
        const newImplAddress = await newImplementation.getAddress();
        console.log("New implementation deployed at:", newImplAddress);
        
        // Now use upgrades.upgradeProxy with the force option
        console.log("Upgrading proxy to new implementation...");
        const upgraded = await hre.upgrades.upgradeProxy(
            proxyAddress, 
            Avax0TokenV3,
            { 
                unsafeAllowRenames: true,
                unsafeAllowLinkedLibraries: true,
                unsafeSkipStorageCheck: true
            }
        );
        
        console.log("✅ Upgrade completed!");
        
        // Test the fix
        console.log("\n=== Testing Fixed Functions ===");
        
        const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
        const futureTime = Math.floor(Date.now() / 1000) + 3600;
        
        try {
            const gas3 = await upgraded['createTimeLock(address,uint256,uint256)'].estimateGas(
                testAccount, 
                hre.ethers.parseEther("1"), 
                futureTime
            );
            console.log("✅ 3-parameter function works! Gas:", gas3.toString());
        } catch (error) {
            console.log("❌ 3-parameter still broken:", error.message);
        }
        
        try {
            const emptyConfig = { duration: 0, interval: 0, enabled: false };
            const gas4 = await upgraded['createTimeLock(address,uint256,uint256,(uint256,uint256,bool))'].estimateGas(
                testAccount, 
                hre.ethers.parseEther("1"), 
                futureTime,
                emptyConfig
            );
            console.log("✅ 4-parameter function works! Gas:", gas4.toString());
        } catch (error) {
            console.log("❌ 4-parameter broken:", error.message);
        }
        
    } catch (error) {
        console.log("Upgrade error:", error.message);
        
        // Alternative: Try using prepareUpgrade
        console.log("\n=== Trying prepareUpgrade approach ===");
        try {
            const Avax0TokenV3 = await hre.ethers.getContractFactory("Avax0TokenV3");
            const newImplAddress = await hre.upgrades.prepareUpgrade(proxyAddress, Avax0TokenV3);
            console.log("New implementation prepared at:", newImplAddress);
            
            // You would then need to manually call upgradeTo on the proxy
            console.log("To complete upgrade, call upgradeTo on the proxy with address:", newImplAddress);
            
        } catch (prepError) {
            console.log("PrepareUpgrade also failed:", prepError.message);
            
            console.log("\n=== Manual Implementation Deployment ===");
            // Last resort: Deploy implementation manually and provide instructions
            const Avax0TokenV3 = await hre.ethers.getContractFactory("Avax0TokenV3");
            const impl = await Avax0TokenV3.deploy();
            await impl.waitForDeployment();
            const implAddr = await impl.getAddress();
            
            console.log("✅ New implementation deployed at:", implAddr);
            console.log("\nTo complete upgrade manually:");
            console.log("1. Call upgradeTo(" + implAddr + ") on the proxy");
            console.log("2. Or use: await proxy.upgradeTo('" + implAddr + "')");
        }
    }
}

main().catch(console.error);