const hre = require("hardhat");

async function main() {
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    const avax0 = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
    
    console.log("=== Testing Other Functions First ===");
    
    const [deployer] = await hre.ethers.getSigners();
    const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
    
    // Test basic functions that should work
    try {
        const balance = await avax0.balanceOf(testAccount);
        console.log("✅ balanceOf works:", hre.ethers.formatEther(balance));
        
        const totalSupply = await avax0.totalSupply();
        console.log("✅ totalSupply works:", hre.ethers.formatEther(totalSupply));
        
        const name = await avax0.name();
        console.log("✅ name works:", name);
        
        const version = await avax0.version();
        console.log("✅ version works:", version);
        
        const owner = await avax0.owner();
        console.log("✅ owner works:", owner);
        
    } catch (error) {
        console.log("❌ Basic function failed:", error.message);
        return;
    }
    
    // Test V3-specific functions
    try {
        const config = await avax0.defaultGradualReleaseConfig();
        console.log("✅ defaultGradualReleaseConfig works:", config);
        
        const locks = await avax0.getTimeLocks(testAccount);
        console.log("✅ getTimeLocks works, count:", locks.length);
        
    } catch (error) {
        console.log("❌ V3 function failed:", error.message);
    }
    
    // Test mint function (as owner)
    try {
        console.log("Testing mint function...");
        const mintTx = await avax0.mint(deployer.address, hre.ethers.parseEther("1"));
        await mintTx.wait();
        console.log("✅ mint works");
        
    } catch (error) {
        console.log("❌ mint failed:", error.message);
    }
    
    // Now let's try to understand the createTimeLock issue better
    console.log("\n=== Investigating createTimeLock Issue ===");
    
    // Let's try to manually construct the transaction data and see what happens
    const createTimeLockSignature = "createTimeLock(address,uint256,uint256)";
    
    try {
        // Encode the function call manually
        const iface = new hre.ethers.Interface(avax0.interface.fragments);
        const data = iface.encodeFunctionData("createTimeLock(address,uint256,uint256)", [
            testAccount,
            hre.ethers.parseEther("100"),
            1793964048
        ]);
        
        console.log("Encoded function data:", data);
        
        // Try to call it using the low-level call
        const tx = {
            to: proxyAddress,
            data: data
        };
        
        // Estimate gas first
        const gasEstimate = await deployer.estimateGas(tx);
        console.log("Gas estimate:", gasEstimate.toString());
        
        // Try the actual call
        const result = await deployer.call(tx);
        console.log("Call result:", result);
        
    } catch (error) {
        console.log("❌ Manual call failed:", error.message);
        
        if (error.data) {
            console.log("Error data:", error.data);
            
            // Let's decode this more carefully
            if (error.data.includes("118cdaa7")) {
                console.log("🔍 This is definitely the ZeroAddress() error");
                console.log("🔍 But the address in error is the proxy address itself!");
                console.log("🔍 This suggests an internal contract issue, not user input");
            }
        }
    }
    
    // Let's check if there's an issue with the proxy setup
    console.log("\n=== Proxy State Investigation ===");
    
    try {
        // Check if this is actually a proxy
        const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
        const implementationAddress = await hre.ethers.provider.getStorageAt(proxyAddress, implementationSlot);
        console.log("Implementation address (from storage):", implementationAddress);
        
        const implementationAddr = "0x" + implementationAddress.slice(-40);
        console.log("Cleaned implementation address:", implementationAddr);
        
        // Try to call the implementation directly (this should fail for state-changing functions)
        const implementation = await hre.ethers.getContractAt("Avax0TokenV3", implementationAddr);
        const implVersion = await implementation.version();
        console.log("Implementation version:", implVersion);
        
    } catch (error) {
        console.log("Error checking proxy state:", error.message);
    }
}

main().catch(console.error);