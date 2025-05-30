const { ethers, upgrades } = require("hardhat");

async function main() {
  // The proxy address from the initial deployment
  const proxyAddress = process.env.PROXY_ADDRESS;
  
  if (!proxyAddress) {
    console.error("Please set the PROXY_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Upgrading contract at proxy address:", proxyAddress);

  // For a future upgrade to V2, you would create a new contract
  // For this example, we'll use the same contract
  const DailyEthRoi = await ethers.getContractFactory("DailyEthRoiV1Upgradeable");
  
  // Upgrade the implementation
  const upgradedProxy = await upgrades.upgradeProxy(proxyAddress, DailyEthRoi);
  
  // Get the new implementation address
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(upgradedProxy.address);
  
  console.log("Proxy upgraded successfully!");
  console.log("New implementation address:", newImplementationAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
