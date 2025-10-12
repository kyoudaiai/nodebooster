const { ethers, upgrades } = require("hardhat");

async function main() {
  // The proxy address from the initial deployment
  const proxyAddress = process.env.PROXY_ADDRESS;
  
  if (!proxyAddress) {
    console.error("Please set the PROXY_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Upgrading contract to V2 at proxy address:", proxyAddress);

  // Deploy V2 implementation
  const DailyEthRoiV2 = await ethers.getContractFactory("DailyEthRoiV2Upgradeable");
  
  // Upgrade the implementation
  const upgradedProxy = await upgrades.upgradeProxy(proxyAddress, DailyEthRoiV2);
  
  // Initialize V2 specific variables
  const withdrawalFee = 200; // 2% withdrawal fee
  await upgradedProxy.initializeV2(withdrawalFee);
  
  console.log("Contract upgraded to V2 successfully!");
  console.log("Withdrawal fee set to:", withdrawalFee / 100, "%");
  
  // Get the new implementation address
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(upgradedProxy.address);
  console.log("New implementation address:", newImplementationAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
