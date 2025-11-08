const hre = require("hardhat");

async function main() {
    const currentBlock = await hre.ethers.provider.getBlock('latest');
    console.log('Current block timestamp:', currentBlock.timestamp);
    console.log('Current block timestamp date:', new Date(currentBlock.timestamp * 1000));
    console.log('Your timestamp:', 1793964048);
    console.log('Your timestamp date:', new Date(1793964048 * 1000));
    console.log('Is your timestamp in future?', 1793964048 > currentBlock.timestamp);
    console.log('Time difference (seconds):', 1793964048 - currentBlock.timestamp);
}

main().catch(console.error);
