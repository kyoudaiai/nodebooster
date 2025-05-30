require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');

require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");

const { mnemonic_main, eurfx_key, phpfx_key, ubst_key, sndao_key } = require("./.secrets.json");
const mnemonic = mnemonic_main;
const privateKey = sndao_key;


task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    local: {
      url: "http://127.0.0.1:8545",
    },
    hardhat: {},    
    bsctestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: [ privateKey ],      
    },
    bscmainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      gasPrice: 20000000000,
      accounts: [ privateKey ],
    },
    polygontestnet: {
      url: "https://rpc-mumbai.maticvigil.com/v1/1cc7500537e84906b0adc08e0eb3714a7fd3ec7b",
      accounts: [ privateKey ],
    },
    polygonMumbai: {
      url: "https://rpc-mumbai.maticvigil.com/v1/1cc7500537e84906b0adc08e0eb3714a7fd3ec7b",
      accounts: [ privateKey ],
    },
    polygonmainnet: {
      url: "https://polygon-rpc.com/",
      accounts: [ privateKey ],
    },    
  },
  etherscan: {
    apiKey: {
      bsc: "8EP8CJQMPGAS1VZC4K3GUAXR3HVPYAQQHA",
      bscTestnet: "8EP8CJQMPGAS1VZC4K3GUAXR3HVPYAQQHA",
      polygon: "8H9411I5IT4HVD9JADFWE4KY6UPUDNC178",      
      polygonMumbai: "8H9411I5IT4HVD9JADFWE4KY6UPUDNC178",
    },
  },
};
