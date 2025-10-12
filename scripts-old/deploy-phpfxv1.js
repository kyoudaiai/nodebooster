// scripts/deploy_upgradeable_box.js
const { ethers, upgrades } = require("hardhat");

async function main() {
    const PHPFXV1 = await ethers.getContractFactory("PHPFXV1");

    console.log("Deploying PHPFX v1 ...");

    const phpfx = await upgrades.deployProxy(PHPFXV1, [], {
        initializer: "initialize",
    });

    await phpfx.deployed();
    console.log("phpfx v1 deployed to:", phpfx.address);
}

main();