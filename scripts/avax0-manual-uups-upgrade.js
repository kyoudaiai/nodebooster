const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Manual UUPS Upgrade for Fuji ===");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    const proxyAddress = process.env.AVAX0_fuji;
    console.log("Proxy Address:", proxyAddress);
    
    // Connect to the proxy as UUPSUpgradeable
    const proxy = await hre.ethers.getContractAt(
        ["function upgradeToAndCall(address,bytes) external"], 
        proxyAddress
    );
    
    console.log("Connected to proxy via UUPS interface");
    
    // Deploy new implementation
    console.log("\nDeploying new implementation...");
    const Avax0TokenV3 = await hre.ethers.getContractFactory("Avax0TokenV3");
    const newImpl = await Avax0TokenV3.deploy();
    await newImpl.waitForDeployment();
    
    const newImplAddress = await newImpl.getAddress();
    console.log("✅ New implementation deployed at:", newImplAddress);
    
    // Perform upgrade using upgradeToAndCall with empty data
    console.log("\nUpgrading proxy...");
    try {
        const upgradeTx = await proxy.upgradeToAndCall(newImplAddress, "0x");
        console.log("Upgrade transaction sent:", upgradeTx.hash);
        
        await upgradeTx.wait();
        console.log("✅ Upgrade completed!");
        
        // Verify the upgrade
        const upgradedContract = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
        const version = await upgradedContract.version();
        console.log("New version:", version);
        
        // Test the fixed function
        console.log("\nTesting fixed 3-parameter createTimeLock...");
        const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
        const futureTime = Math.floor(Date.now() / 1000) + 3600;
        
        try {
            const gasEstimate = await upgradedContract['createTimeLock(address,uint256,uint256)'].estimateGas(
                testAccount,
                hre.ethers.parseEther("1"),
                futureTime
            );
            console.log("✅ 3-parameter function gas estimate works:", gasEstimate.toString());
            
            // Actually create the lock
            const lockTx = await upgradedContract['createTimeLock(address,uint256,uint256)'](
                testAccount,
                hre.ethers.parseEther("1"),
                futureTime
            );
            await lockTx.wait();
            console.log("✅ 3-parameter createTimeLock works! TX:", lockTx.hash);
            
        } catch (error) {
            console.log("❌ 3-parameter function still broken:", error.message);
        }
        
    } catch (error) {
        console.log("❌ Upgrade failed:", error.message);
        throw error;
    }
}

main().catch(console.error);