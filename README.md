# Avax0 Hardhat Project - Avalanche C-Chain

This project contains smart contracts for the avax0 ecosystem, designed for deployment on Avalanche C-Chain using Hardhat development framework.

## 🏗️ Project Structure

```
contracts/
├── MOCKERC20Token.sol          # Simple ERC20 token for testing
├── Avax0TokenV1.sol            # V1: Basic token without transfer fees
├── Avax0TokenV2.sol            # V2: Advanced token with transfer fees
├── Avax0Token.sol              # Alias pointing to V2 for compatibility
└── NodeBoosterStaking.sol      # Staking contract for avax0 ecosystem

scripts/
├── deploy-avalanche.js         # Deployment script for Avalanche networks (V2)
└── verify-avalanche.js         # Contract verification script

test/
├── Avax0Token.test.js          # V2 functionality tests
└── Avax0TokenUpgrade.test.js   # V1 to V2 upgrade tests
```

## 🛠️ Tech Stack

- **Solidity**: 0.8.28
- **Hardhat**: Latest version with toolbox
- **OpenZeppelin**: v5.x contracts and upgradeable contracts
- **Network**: Avalanche C-Chain (Mainnet & Fuji Testnet)
- **Upgrades**: UUPS (Universal Upgradeable Proxy Standard)

## 🚀 Quick Start

### 1. Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### 2. Environment Setup

Edit `.env` file with your configuration:

```env
PRIVATE_KEY=your_private_key_here
SNOWTRACE_API_KEY=verifyContract
```

### 3. Compile Contracts

```bash
npm run compile
```

### 4. Run Tests

```bash
npm test                        # All tests
npm test test/Avax0Token.test.js       # V2 functionality
npm test test/Avax0TokenUpgrade.test.js # Upgrade tests
```

### 5. Choose Deployment Strategy

#### Option A: Deploy V2 Directly (Recommended)
```bash
npm run deploy:fuji      # Deploy V2 to testnet
npm run deploy:avalanche # Deploy V2 to mainnet
```

#### Option B: Upgrade Path (V1 → V2)
```bash
# Deploy V1 first (requires custom script)
# Then upgrade to V2 later
```

## 📋 Available Scripts

- `npm run compile` - Compile smart contracts
- `npm run clean` - Clean artifacts and cache
- `npm test` - Run test suite
- `npm run deploy:fuji` - Deploy to Fuji testnet
- `npm run deploy:avalanche` - Deploy to Avalanche mainnet
- `npm run verify:fuji` - Verify contracts on Fuji
- `npm run verify:avalanche` - Verify contracts on Avalanche

## 🌐 Network Configuration

### Avalanche Fuji Testnet
- **Chain ID**: 43113
- **RPC URL**: https://api.avax-test.network/ext/bc/C/rpc
- **Explorer**: https://testnet.snowtrace.io/
- **Faucet**: https://faucet.avax.network/

### Avalanche Mainnet
- **Chain ID**: 43114
- **RPC URL**: https://api.avax.network/ext/bc/C/rpc
- **Explorer**: https://snowtrace.io/

## 📄 Smart Contracts

### Avax0 Token Versioning System

#### **Avax0TokenV1.sol** - Basic Token
- ✅ **Basic ERC20**: Standard token functionality
- ✅ **Upgradeable**: UUPS proxy pattern
- ✅ **Pausable**: Emergency stop functionality
- ✅ **Burnable**: Token burning capability
- ✅ **Mintable**: Controlled token minting
- ✅ **Access Control**: Role-based permissions
- ❌ **No Transfer Fees**: Clean transfers without deductions

#### **Avax0TokenV2.sol** - Advanced Token
- ✅ **All V1 Features**: Complete backward compatibility
- ✅ **Transfer Fees**: Configurable transfer fees (0-5%)
- ✅ **Treasury System**: Automatic fee collection
- ✅ **Fee Exemptions**: Whitelist system for fee-free transfers
- ✅ **Upgrade Path**: Seamless upgrade from V1

#### **Avax0Token.sol** - Compatibility Alias
- Points to V2 for backward compatibility with existing scripts

**Token Details:**
- **Name**: avax0
- **Symbol**: avax0
- **Max Supply**: 100M tokens
- **Decimals**: 18
- **Versions**: 1.0.0 (basic) → 2.0.0 (with fees)

### Version Comparison

| Feature | V1 | V2 |
|---------|----|----|
| **ERC20 Standard** | ✅ | ✅ |
| **Minting/Burning** | ✅ | ✅ |
| **Pausable** | ✅ | ✅ |
| **Upgradeable** | ✅ | ✅ |
| **Transfer Fees** | ❌ | ✅ |
| **Treasury** | ❌ | ✅ |
| **Fee Exemptions** | ❌ | ✅ |

### NodeBoosterStaking.sol

Comprehensive staking contract for avax0 ecosystem with:

- ✅ **Multiple Pools**: Different lock periods and rewards
- ✅ **Flexible Staking**: Various lock periods
- ✅ **Auto-Rewards**: Automatic reward calculation
- ✅ **Performance Fees**: Configurable fee structure
- ✅ **Emergency Withdraw**: Emergency exit functionality
- ✅ **Upgradeable**: UUPS proxy pattern

### MOCKERC20Token.sol

Simple ERC20 token for testing purposes.

## 🔧 Deployment Guide

### Step 1: Prepare Environment

1. **Get AVAX**: Ensure you have AVAX for gas fees
   - Fuji testnet: Use [AVAX Faucet](https://faucet.avax.network/)
   - Mainnet: Purchase AVAX from exchanges

2. **Set up Private Key**: Add your private key to `.env` file
   ```env
   PRIVATE_KEY=0x1234...
   ```

### Step 2: Deploy Contracts

#### Deploy to Fuji Testnet (Recommended for testing)

```bash
npx hardhat run scripts/deploy-avalanche.js --network fuji
```

#### Deploy to Avalanche Mainnet

```bash
npx hardhat run scripts/deploy-avalanche.js --network avalanche
```

### Step 3: Verify Contracts

```bash
# For Fuji
npx hardhat run scripts/verify-avalanche.js --network fuji <CONTRACT_ADDRESS>

# For Avalanche Mainnet
npx hardhat run scripts/verify-avalanche.js --network avalanche <CONTRACT_ADDRESS>
```

## 🧪 Testing

The project includes comprehensive tests covering:

- ✅ Contract deployment and initialization
- ✅ Token minting and burning
- ✅ Transfer fee mechanisms
- ✅ Access control and permissions
- ✅ Pausable functionality
- ✅ Emergency recovery
- ✅ Upgradeability

Run tests:
```bash
npm test
```

## 🔐 Security Features

### Smart Contract Security
- **Access Control**: Owner-only functions for critical operations
- **Reentrancy Guard**: Protection against reentrancy attacks
- **Pausable**: Emergency stop mechanism
- **Input Validation**: Comprehensive parameter validation
- **Overflow Protection**: Solidity 0.8.28 built-in protection

### Operational Security
- **Upgradeable**: UUPS pattern for secure upgrades
- **Emergency Functions**: Recovery mechanisms for edge cases
- **Rate Limiting**: Maximum fee rates and supply limits
- **Multi-signature**: Recommended for mainnet deployments

## 🌟 Gas Optimization

- **Efficient Storage**: Optimized storage layout
- **Batch Operations**: Gas-efficient batch functions
- **View Functions**: Off-chain computation where possible
- **Event Emission**: Minimal gas usage for events

## 📚 Resources

### Avalanche Documentation
- [Avalanche Developer Docs](https://docs.avax.network/)
- [C-Chain Documentation](https://docs.avax.network/build/dapp/smart-contracts/)
- [Avalanche Bridge](https://bridge.avax.network/)

### Development Tools
- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Snowtrace (Block Explorer)](https://snowtrace.io/)

### Avalanche Ecosystem
- [Avalanche Subnet Explorer](https://subnets.avax.network/)
- [Avalanche Wallet](https://wallet.avax.network/)
- [AVAX Faucet](https://faucet.avax.network/)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

These smart contracts are provided as-is for educational and development purposes. Always conduct thorough testing and security audits before deploying to mainnet with real funds.

## 🆘 Support

For support and questions:
- Create an issue in this repository
- Join the NodeBooster community
- Review the documentation

---

**Happy Building on Avalanche! 🏔️**
