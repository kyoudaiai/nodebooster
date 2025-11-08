const hre = require("hardhat");

async function main() {
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    const avax0 = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
    
    console.log("=== Function Signature Analysis ===");
    
    // Get the contract interface
    const contractInterface = avax0.interface;
    
    // Find all createTimeLock functions
    console.log("Available createTimeLock functions:");
    const fragments = contractInterface.fragments;
    
    fragments.forEach((fragment, index) => {
        if (fragment.name === 'createTimeLock') {
            console.log(`${index}: ${fragment.format()}`);
            console.log(`    Selector: ${fragment.selector}`);
        }
    });
    
    // Let's try to call the specific function selector manually
    console.log("\n=== Testing function selectors ===");
    
    const account = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
    const amount = "100000000000000000000";
    const releaseTime = "1793964048";
    
    // Try the 3-parameter version specifically
    try {
        console.log("Trying 3-parameter createTimeLock...");
        const tx = await avax0['createTimeLock(address,uint256,uint256)'](account, amount, releaseTime);
        console.log("✅ 3-parameter version succeeded!");
        
    } catch (error) {
        console.log("❌ 3-parameter version failed:", error.message);
        
        // Let's check what the error data contains more carefully
        if (error.data) {
            console.log("Raw error data:", error.data);
            
            // The error data format is: selector (4 bytes) + parameters
            const selector = error.data.slice(0, 10);
            const params = error.data.slice(10);
            
            console.log("Error selector:", selector);
            console.log("Error params:", params);
            
            // If this is ZeroAddress(), it shouldn't have parameters, but it does
            // This suggests it might be a different error or there's an issue with the contract
            
            // Let's decode the parameter as an address
            if (params.length >= 64) {
                const addressParam = "0x" + params.slice(24, 64); // Remove padding
                console.log("Address in error:", addressParam);
            }
        }
    }
    
    // Let's also check if the contract is actually properly initialized
    console.log("\n=== Contract State Check ===");
    try {
        const owner = await avax0.owner();
        console.log("Contract owner:", owner);
        
        const paused = await avax0.paused();
        console.log("Contract paused:", paused);
        
        const defaultConfig = await avax0.defaultGradualReleaseConfig();
        console.log("Default config initialized:", defaultConfig.enabled);
        
    } catch (error) {
        console.log("Error checking contract state:", error.message);
    }
    
    // Let's try using a different test account to see if it's account-specific
    console.log("\n=== Testing with different account ===");
    const [deployer] = await hre.ethers.getSigners();
    const deployerAddress = deployer.address;
    
    try {
        console.log("Testing with deployer account:", deployerAddress);
        
        // First check if deployer has tokens
        const deployerBalance = await avax0.balanceOf(deployerAddress);
        console.log("Deployer balance:", hre.ethers.formatEther(deployerBalance));
        
        if (deployerBalance >= BigInt(amount)) {
            const tx = await avax0.createTimeLock(deployerAddress, amount, releaseTime);
            console.log("✅ Deployer account succeeded!");
        } else {
            console.log("Deployer doesn't have enough tokens");
        }
        
    } catch (error) {
        console.log("❌ Deployer account also failed:", error.message);
    }
}

main().catch(console.error);