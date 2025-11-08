const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Deploy Fixed V3 Implementation - Fuji ===");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("Balance:", hre.ethers.formatEther(balance), "AVAX");
    
    const proxyAddress = process.env.AVAX0_fuji;
    console.log("Proxy Address:", proxyAddress);
    
    // Deploy new implementation
    console.log("\nDeploying fixed Avax0TokenV3 implementation...");
    
    const Avax0TokenV3 = await hre.ethers.getContractFactory("Avax0TokenV3");
    const implementation = await Avax0TokenV3.deploy();
    
    console.log("Deployment transaction sent...");
    await implementation.waitForDeployment();
    
    const implementationAddress = await implementation.getAddress();
    console.log("✅ New implementation deployed at:", implementationAddress);
    
    // Verify the implementation
    console.log("\nVerifying implementation...");
    const version = await implementation.version();
    console.log("Implementation version:", version);
    
    console.log("\n=== Manual Upgrade Instructions ===");
    console.log("1. Connect to the proxy contract in console:");
    console.log(`   const proxy = await ethers.getContractAt("Avax0TokenV3", "${proxyAddress}");`);
    console.log("");
    console.log("2. Call upgradeTo with the new implementation:");
    console.log(`   const tx = await proxy.upgradeTo("${implementationAddress}");`);
    console.log(`   await tx.wait();`);
    console.log("");
    console.log("3. Verify the upgrade:");
    console.log(`   const version = await proxy.version();`);
    console.log(`   console.log("New version:", version);`);
    console.log("");
    console.log("4. Test the fixed 3-parameter function:");
    console.log(`   const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";`);
    console.log(`   const futureTime = Math.floor(Date.now() / 1000) + 3600;`);
    console.log(`   const tx = await proxy['createTimeLock(address,uint256,uint256)'](testAccount, ethers.parseEther("1"), futureTime);`);
    
    console.log("\n=== Summary ===");
    console.log("✅ Fixed implementation deployed");
    console.log("🔄 Manual upgrade required using upgradeTo()");
    console.log("📍 Implementation:", implementationAddress);
    console.log("📍 Proxy:", proxyAddress);
}

main().catch(console.error);