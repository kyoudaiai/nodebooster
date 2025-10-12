const { ethers, upgrades } = require("hardhat");

async function main() {
  // Get the deployed proxy address from command line arguments or environment variables
  const proxyAddress = process.env.PROXY_ADDRESS || process.argv[2];
  if (!proxyAddress) {
    console.error("Please provide the proxy contract address as an argument or set PROXY_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Starting upgrade of contract at address:", proxyAddress);
  
  // Prepare for upgrade
  console.log("Preparing for upgrade...");
  const DailyEthRoiV1Upgradeable = await ethers.getContractFactory("DailyEthRoiV1Upgradeable");
  
  // Upgrade the contract
  console.log("Upgrading contract...");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, DailyEthRoiV1Upgradeable);
  await upgraded.waitForDeployment();
  
  console.log("Contract upgraded successfully!");
  console.log("Upgraded contract address (should be the same as proxy):", await upgraded.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
