// scripts/deploy_upgradeable_box.js
const { ethers, upgrades } = require("hardhat");

async function main() {
    const MultiTokenSaleContract = await ethers.getContractFactory("MultiTokenSale");
    console.log("Deploying MultiTokenSaleContract...");


    const { chainId } = await ethers.provider.getNetwork();
    console.log("chainId: ", chainId);

    
    const deployer = await ethers.getSigner();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString() / 1e18);

    networkConfig = {
        "56": {
            "networkName": "BSC Mainnet",
            "USDFX_Token": "0xBc05D0e44eB2005a14BF84e8F5D4C383B6a1CEEe",
            "nativeRate": 3990000,
            "PayToWallet": deployer.address,
            "USDT_Token":  "0x55d398326f99059fF775485246999027B3197955",
            "usdTokenRate": 13300,
            "supportTokens": 
            [
                {
                    "Name": "USDT",
                    "symbol": "USDT",
                    "decimals": 18,
                    "address":  "0x55d398326f99059fF775485246999027B3197955",
                    "Rate": 13300,
                    "MinAmount": 100000000,
                }
            ],
        },
        "97": {
            "networkName": "BSC Testnet",
            "USDFX_Token": "0x86934d55CB7d274A95bFAf40B4d40977418DCB07",
            "nativeRate": 3990000,
            "PayToWallet": deployer.address,
            "USDT_Token":  "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
            "usdTokenRate": 13300,
            "supportTokens": 
            [
                {
                    "Name": "USDT",
                    "symbol": "USDT",
                    "decimals": 18,
                    "address":  "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
                    "Rate": 13300,
                    "MinAmount": 100000000,
                }                
            ],
        },
        "137": {
            "networkName": "Polygon Mainnet",
            "USDFX_Token": "0x648b47ce8a4e36f1bcdfa42d7344e39eb15a4ff7",
            "nativeRate": "13300",
            "PayToWallet": deployer.address,
            "USDT_Token":  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
            "usdTokenRate": 13300,
            "supportTokens": 
            [
                {
                    "Name": "USDT",
                    "symbol": "USDT",
                    "decimals": 18,
                    "address":  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
                    "Rate": 13300,
                    "MinAmount": 100000000,
                }
            ],
        },
        // polgygon mumbai
        "80001": {
            "networkName": "Polygon Mumbai",
            "USDFX_Token": "0x86934d55CB7d274A95bFAf40B4d40977418DCB07",
            "nativeRate": "13300",
            "PayToWallet": deployer.address,
            "USDT_Token":  "0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832",
            "usdTokenRate": 13300,
            "supportTokens": 
            [
                {
                    "Name": "USDT",
                    "symbol": "USDT",
                    "decimals": 18,
                    "address":  "0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832",
                    "Rate": 13300,
                    "MinAmount": 100000000,
                }
            ],
        },


    }

    if (networkConfig[chainId]) {
        console.log("networkConfig[chainId]:", networkConfig[chainId]);        
        const { networkName, USDFX_Token, nativeRate, PayToWallet } = networkConfig[chainId];        
        console.log("Deploying to: ", networkName)

        // constructor (uint _nativeRate, address payable wallet, address tokenWallet, IERC20 token)

        const MultiTokenSale = await MultiTokenSaleContract.deploy(nativeRate, PayToWallet, deployer.address, USDFX_Token); 
        const MultiTokenSaleInstance = await MultiTokenSale.deployed();

        console.log("MultiTokenSale deployed to address:", MultiTokenSaleInstance.address);

        if (MultiTokenSaleInstance.address != "") {
            console.log(`approve 10 million USDFX tokens to ${MultiTokenSaleInstance.address}`);

            const USDFX_TokenContract = await ethers.getContractAt("contracts/MultiTokenSale.sol:IERC20", USDFX_Token);
            const approveTx = await USDFX_TokenContract.approve(MultiTokenSaleInstance.address, (10000000 * 1e6));

            console.log(`add USDT support to sale contract at MultiTokenSaleInstance.address`);        
            const { USDT_Token, usdTokenRate } = networkConfig[chainId];
            const addUSDTTx = await MultiTokenSaleInstance.addSupportedToken(true, USDT_Token, "USDT", 18, PayToWallet, usdTokenRate, 0);

            const sale = await ethers.getContractAt("MultiTokenSale", MultiTokenSaleInstance.address);
        }

    } else {
        console.log("networkConfig not found");
        return;
    }

}

main();