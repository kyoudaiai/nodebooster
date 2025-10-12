const { ethers } = require("hardhat");

async function main() {
  const contractAddress = process.argv[2];
  
  if (!contractAddress) {
    console.error("❌ Please provide contract address as argument");
    console.log("Usage: npx hardhat run scripts/verify-avalanche.js --network <network> <contract_address>");
    process.exit(1);
  }
  
  console.log(`🔍 Verifying contract at address: ${contractAddress}`);
  
  try {
    // Verify the contract
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [
        "avax0",  // name
        "avax0",  // symbol
        ethers.parseUnits("1000000", 18) // initialSupply
      ],
    });
    
    console.log("✅ Contract verified successfully!");
    
  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("ℹ️  Contract is already verified!");
    } else {
      console.error("❌ Verification failed:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });