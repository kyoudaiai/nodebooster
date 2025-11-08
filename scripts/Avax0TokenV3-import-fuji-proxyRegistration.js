const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== Registering Existing Proxy for Upgrade Management ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Existing proxy address on Fuji
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    console.log("Proxy address:", proxyAddress);
    
    try {
        // Force import the existing proxy
        const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
        
        console.log("\n=== Importing Existing Proxy ===");
        await upgrades.forceImport(proxyAddress, Avax0TokenV3);
        console.log("✅ Proxy successfully imported and registered for upgrade management");
        
        // Verify the proxy is working
        const contract = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
        const name = await contract.name();
        const version = await contract.version();
        
        console.log("\n=== Verification ===");
        console.log("Token name:", name);
        console.log("Current version:", version);
        console.log("✅ Proxy is functional and ready for upgrade");
        
    } catch (error) {
        console.error("Import failed:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });