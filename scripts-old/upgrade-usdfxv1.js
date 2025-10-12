const { ethers, upgrades } = require("hardhat");

const proxy     = {
    bsc_mainnet: "0xBc05D0e44eB2005a14BF84e8F5D4C383B6a1CEEe",
    polygon_mainnet: "0x648b47ce8a4e36f1bcdfa42d7344e39eb15a4ff7"
}
const new_version = "USDFXV2";


async function main() {
    const network = "polygon_mainnet"
    console.log("Running USDFX Upgrade...");
    console.log(`Using Proxy on ${network} at address ${proxy[network]}`);

    const new_usdfx_version = await ethers.getContractFactory(new_version);

    await upgrades.upgradeProxy(proxy[network], new_usdfx_version)

    console.log("Congrats upgrade completed successfully!");

}

main();