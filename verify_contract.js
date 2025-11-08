const hre = require("hardhat");

async function main() {
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    
    console.log("=== Contract Verification ===");
    console.log("Proxy Address:", proxyAddress);
    
    try {
        // Try to connect as V3
        const avax0V3 = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
        
        try {
            const version = await avax0V3.version();
            console.log("✅ Contract version:", version);
        } catch (error) {
            console.log("❌ Error getting version:", error.message);
        }
        
        try {
            const name = await avax0V3.name();
            console.log("✅ Token name:", name);
        } catch (error) {
            console.log("❌ Error getting name:", error.message);
        }
        
        try {
            const symbol = await avax0V3.symbol();
            console.log("✅ Token symbol:", symbol);
        } catch (error) {
            console.log("❌ Error getting symbol:", error.message);
        }
        
        // Check if it has V3 functions
        try {
            const defaultConfig = await avax0V3.defaultGradualReleaseConfig();
            console.log("✅ Default gradual release config:", defaultConfig);
            console.log("This appears to be V3 contract");
        } catch (error) {
            console.log("❌ No V3 gradual release config - might be V2:", error.message);
            
            // Try as V2
            const avax0V2 = await hre.ethers.getContractAt("Avax0TokenV1", proxyAddress);
            try {
                const version = await avax0V2.version();
                console.log("✅ V2 Contract version:", version);
            } catch (error) {
                console.log("❌ Error getting V2 version:", error.message);
            }
        }
        
        // Check the bytecode to see what's actually deployed
        const code = await hre.ethers.provider.getCode(proxyAddress);
        console.log("Contract bytecode length:", code.length);
        
        if (code === "0x") {
            console.log("❌ NO CONTRACT AT THIS ADDRESS!");
        } else {
            console.log("✅ Contract exists");
        }
        
    } catch (error) {
        console.log("❌ Error connecting to contract:", error.message);
    }
}

main().catch(console.error);