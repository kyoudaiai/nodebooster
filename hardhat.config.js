require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');
require("@nomicfoundation/hardhat-verify");

// Load environment variables
try {
  require('dotenv').config();
} catch (error) {
  console.log("dotenv not available, using environment variables or secrets file");
}

// Private key from environment or secrets file
let privateKey;
try {
  const secrets = require("./.secrets.json");
  privateKey = secrets.nodebooster_deployer || process.env.PRIVATE_KEY;
} catch (error) {
  privateKey = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
}

if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  console.warn("⚠️  Warning: Using default private key. Set PRIVATE_KEY in .env file or add ethdailyroi_key to .secrets.json for actual deployment");
}


task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("size", "Check contract sizes", async () => {
  const { exec } = require('child_process');
  exec('node scripts/contract-size.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(stdout);
  });
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1
      },
      viaIR: true,
      evmVersion: "paris"
    }
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
  },
  networks: {
    local: {
      url: "http://127.0.0.1:8545",
    },
    hardhat: {
      allowUnlimitedContractSize: true,
      gasPrice: 225000000000, // 225 gwei
      gas: 8000000
    },    
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
    mainnet: {
      url: "https://mainnet.infura.io/v3/cb50510f7cc0486d88d7e4956fed0c2c",
      chainId: 1,
      accounts: [ privateKey ],
    },
    sepolia: {
      url: "https://sepolia.infura.io/v3/cb50510f7cc0486d88d7e4956fed0c2c",
      chainId: 11155111,
      accounts: [ privateKey ],
    },
    optimism: {
      url: "https://optimism-mainnet.infura.io/v3/cb50510f7cc0486d88d7e4956fed0c2c",
      chainId: 10,
      accounts: [ privateKey ],
    },
    optimismSepolia: {
      url: "https://optimism-sepolia.infura.io/v3/cb50510f7cc0486d88d7e4956fed0c2c",
      chainId: 11155420,
      accounts: [ privateKey ],
    },
    // Avalanche Networks
    fuji: {
      // url: "https://api.avax-test.network/ext/bc/C/rpc",
      url: "https://avalanche-fuji.drpc.org",
      chainId: 43113,
      accounts: [ privateKey ],
      gasPrice: 225000000000, // 225 gwei
      gas: 8000000
    },
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: [ privateKey ],
      gasPrice: 225000000000, // 225 gwei
      gas: 8000000
    },
    // Sonic Networks
    sonic: {
      url: "https://rpc.soniclabs.com",
      chainId: 146,
      accounts: [ privateKey ],
      // gasPrice: 1000000000, // 1 gwei (low cost as mentioned)
      // gas: 8000000
    },
    sonicBlaze: {
      url: "https://rpc.blaze.soniclabs.com",
      chainId: 57054,
      accounts: [ privateKey ],
      // gasPrice: 1000000000, // 1 gwei
      // gas: 8000000
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSCSCAN_API_KEY || "8EP8CJQMPGAS1VZC4K3GUAXR3HVPYAQQHA",
      bscTestnet: process.env.BSCSCAN_API_KEY || "8EP8CJQMPGAS1VZC4K3GUAXR3HVPYAQQHA",
      polygon: process.env.POLYGONSCAN_API_KEY || "8H9411I5IT4HVD9JADFWE4KY6UPUDNC178",      
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "8H9411I5IT4HVD9JADFWE4KY6UPUDNC178",      
      mainnet: process.env.ETHERSCAN_API_KEY || "8EP8CJQMPGAS1VZC4K3GUAXR3HVPYAQQHA",
      sepolia: process.env.ETHERSCAN_API_KEY || "8EP8CJQMPGAS1VZC4K3GUAXR3HVPYAQQHA",      
      optimisticEthereum: process.env.OPTIMISM_API_KEY || "8EP8CJQMPGAS1VZC4K3GUAXR3HVPYAQQHA",
      optimisticSepolia: process.env.OPTIMISM_API_KEY || "8EP8CJQMPGAS1VZC4K3GUAXR3HVPYAQQHA",
      // Avalanche
      avalanche: process.env.SNOWTRACE_API_KEY || "verifyContract",
      avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY || "verifyContract",
      // Sonic
      sonic: process.env.SONIC_API_KEY || "verifyContract",
      sonictestnet: process.env.SONIC_API_KEY || "verifyContract"
    },
    customChains: [
      {
        network: "avalanche",
        chainId: 43114,
        urls: {
          apiURL: "https://api.snowtrace.io/api",
          browserURL: "https://snowtrace.io/"
        }
      },
      {
        network: "avalancheFujiTestnet",
        chainId: 43113,
        urls: {
          apiURL: "https://api-testnet.snowtrace.io/api",
          browserURL: "https://testnet.snowtrace.io/"
        }
      },
      {
        network: "sonic",
        chainId: 146,
        urls: {
          apiURL: "https://api.sonicscan.org/api",
          browserURL: "https://sonicscan.org/"
        }
      },
      {
        network: "sonictestnet",
        chainId: 64165,
        urls: {
          apiURL: "https://api.testnet.sonicscan.org/api",
          browserURL: "https://testnet.sonicscan.org/"
        }
      }
    ]
  },
};
