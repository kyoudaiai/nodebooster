const { ethers } = require("hardhat");

async function main() {
  try {
    console.log("🔍 Testing Connection...\n");
    
    // Get network info
    const network = await ethers.provider.getNetwork();
    console.log("🌐 Network Name:", network.name);
    console.log("🆔 Chain ID:", network.chainId.toString());
    
    // Get signer
    const [signer] = await ethers.getSigners();
    console.log("👤 Account Address:", signer.address);
    
    // Get balance
    const balance = await ethers.provider.getBalance(signer.address);
    console.log("💰 Balance:", ethers.formatEther(balance), "AVAX");
    
    // Get latest block
    const blockNumber = await ethers.provider.getBlockNumber();
    console.log("📦 Latest Block:", blockNumber);
    
    // Test gas price
    const gasPrice = await ethers.provider.getFeeData();
    console.log("⛽ Gas Price:", ethers.formatUnits(gasPrice.gasPrice, "gwei"), "gwei");
    
    // Connection status
    if (network.chainId) {
      console.log("\n✅ Successfully connected to: ", network.name);
      
      if (balance > ethers.parseEther("0.1")) {
        console.log("✅ Sufficient balance for deployment");
      } else {
        console.log("⚠️  Low balance. Get testnet AVAX from: https://faucet.avax.network/");
      }
    } else {
      console.log("❌ Connected to wrong network!");
    }
    
  } catch (error) {
    console.error("❌ Connection failed:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });