# Avax0TokenV2 Scripts and Testing Guide

This directory contains comprehensive testing and deployment scripts for the `Avax0TokenV2` contract, which features time lock functionality for enhanced token control.

## 📋 Table of Contents

- [Contract Overview](#contract-overview)
- [Test Scripts](#test-scripts)
- [Deployment Scripts](#deployment-scripts)
- [Upgrade Scripts](#upgrade-scripts)
- [Usage Examples](#usage-examples)
- [Environment Configuration](#environment-configuration)

## 🔍 Contract Overview

**Avax0TokenV2** is an upgradeable ERC20 token with advanced time lock functionality:

### Key Features:
- ✅ **Time Lock System**: Lock tokens for specific addresses with release times
- ✅ **Multiple Locks**: Support for multiple concurrent locks per address
- ✅ **Mint with Lock**: Mint tokens directly with time lock restrictions
- ✅ **Upgradeable**: UUPS proxy pattern for safe upgrades
- ✅ **Pausable**: Emergency pause functionality
- ✅ **Burnable**: Token burning capabilities
- ✅ **Access Control**: Owner and minter role management
- ✅ **Batch Operations**: Batch minting for efficiency

### Core Functions:
- `createTimeLock()` - Lock tokens for an address
- `releaseExpiredLocks()` - Release all expired locks
- `mintWithLock()` - Mint tokens with automatic lock
- `getAvailableBalance()` - Check unlocked balance
- `extendLock()` - Extend lock duration

## 🧪 Test Scripts

### `test/Avax0TokenV2.test.js`

Comprehensive test suite covering all contract functionality:

#### Test Categories:
1. **Basic Functionality** - Deployment, initialization, constants
2. **Minting Functionality** - Regular minting, batch minting, mint with lock
3. **Time Lock Functionality** - Lock creation, expiration, extension
4. **Transfer Restrictions** - Lock enforcement on transfers
5. **Administrative Functions** - Owner controls, pause/unpause
6. **View Functions** - Balance queries, lock information
7. **Upgrade Safety** - State preservation during upgrades

#### Running Tests:
```bash
# Run all Avax0TokenV2 tests
npx hardhat test test/Avax0TokenV2.test.js

# Run with gas reporting
REPORT_GAS=true npx hardhat test test/Avax0TokenV2.test.js

# Run specific test
npx hardhat test test/Avax0TokenV2.test.js --grep "Time Lock"
```

#### Test Coverage:
- ✅ 30 comprehensive test cases
- ✅ All error conditions tested
- ✅ Event emission verification
- ✅ State preservation checks
- ✅ Gas usage optimization

## 🚀 Deployment Scripts

### `scripts/deploy-avax0-v2-timelock.js`

Deploy a fresh Avax0TokenV2 contract with time lock functionality.

#### Features:
- Environment variable configuration
- Comprehensive deployment verification
- Automatic functionality testing
- Detailed deployment summary
- Next steps guidance

#### Usage:
```bash
# Deploy to localhost
npx hardhat run scripts/deploy-avax0-v2-timelock.js --network localhost

# Deploy to testnet (example: fuji)
npx hardhat run scripts/deploy-avax0-v2-timelock.js --network fuji

# Deploy with custom parameters
TOKEN_NAME="MyToken" TOKEN_SYMBOL="MTK" INITIAL_SUPPLY="5000000" \
npx hardhat run scripts/deploy-avax0-v2-timelock.js --network fuji
```

#### Environment Variables:
- `TOKEN_NAME` - Token name (default: "Avax0Token")
- `TOKEN_SYMBOL` - Token symbol (default: "AVAX0")
- `INITIAL_SUPPLY` - Initial supply in tokens (default: "1000000")

#### Output Example:
```
🎉 Avax0TokenV2 deployment completed successfully!

Network: fuji
Proxy Address: 0x1234...
Implementation Address: 0x5678...
Total Supply: 1000000.0 AVAX0
Owner: 0xabcd...
```

## ⬆️ Upgrade Scripts

### `scripts/upgrade-avax0-v1-to-v2-timelock.js`

Safely upgrade an existing Avax0TokenV1 contract to V2 with time lock features.

#### Features:
- Pre-upgrade state verification
- Upgrade compatibility validation
- Post-upgrade state verification
- Balance preservation checks
- New functionality testing

#### Usage:
```bash
# Method 1: Environment variable
PROXY_ADDRESS=0x1234... npx hardhat run scripts/upgrade-avax0-v1-to-v2-timelock.js --network mainnet

# Method 2: Command line argument
npx hardhat run scripts/upgrade-avax0-v1-to-v2-timelock.js --network mainnet 0x1234...

# With additional account verification
CHECK_ADDRESSES="0xabc...,0xdef..." PROXY_ADDRESS=0x1234... \
npx hardhat run scripts/upgrade-avax0-v1-to-v2-timelock.js --network mainnet
```

#### Safety Checks:
- ✅ Contract version verification
- ✅ Owner permission validation
- ✅ Storage layout compatibility
- ✅ Balance preservation
- ✅ Functionality continuity

#### Environment Variables:
- `PROXY_ADDRESS` - Address of the proxy contract to upgrade
- `CHECK_ADDRESSES` - Comma-separated list of addresses to verify balances

## 📖 Usage Examples

### Basic Deployment Flow
```bash
# 1. Deploy new contract
npx hardhat run scripts/deploy-avax0-v2-timelock.js --network fuji

# 2. Verify deployment
npx hardhat verify --network fuji <IMPLEMENTATION_ADDRESS>

# 3. Run tests
npx hardhat test test/Avax0TokenV2.test.js
```

### Upgrade Flow
```bash
# 1. Verify current state
npx hardhat console --network mainnet
> const token = await ethers.getContractAt("Avax0TokenV1", "0x...")
> await token.version()

# 2. Run upgrade script
PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-avax0-v1-to-v2-timelock.js --network mainnet

# 3. Verify upgrade
npx hardhat console --network mainnet
> const token = await ethers.getContractAt("Avax0TokenV2", "0x...")
> await token.version() // Should be "2.0.0"
```

### Testing Time Locks
```javascript
// In Hardhat console
const token = await ethers.getContractAt("Avax0TokenV2", "0x...");

// Create a time lock
const releaseTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
await token.createTimeLock(userAddress, ethers.parseEther("1000"), releaseTime);

// Check available balance
const available = await token.getAvailableBalance(userAddress);
console.log("Available:", ethers.formatEther(available));

// Check locked amount
const locked = await token.getLockedAmount(userAddress);
console.log("Locked:", ethers.formatEther(locked));
```

## ⚙️ Environment Configuration

### Network Configuration
Ensure your `hardhat.config.js` includes the target networks:

```javascript
module.exports = {
  networks: {
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 43113
    },
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 43114
    }
  }
};
```

### Environment Variables
Create a `.env` file:
```bash
PRIVATE_KEY=your_private_key_here
PROXY_ADDRESS=0x1234567890abcdef...
TOKEN_NAME=Avax0Token
TOKEN_SYMBOL=AVAX0
INITIAL_SUPPLY=1000000
CHECK_ADDRESSES=0xabc...,0xdef...
```

## 🔒 Security Considerations

### Deployment Security:
- ✅ Verify implementation addresses
- ✅ Use deterministic deployments when possible
- ✅ Test on testnets before mainnet
- ✅ Verify contracts on explorers

### Upgrade Security:
- ✅ Always backup critical data before upgrades
- ✅ Test upgrades on forked networks
- ✅ Verify owner permissions
- ✅ Check storage layout compatibility
- ✅ Monitor contract after upgrade

### Time Lock Security:
- ✅ Validate lock parameters
- ✅ Implement proper access controls
- ✅ Test lock enforcement
- ✅ Monitor lock expiration

## 🐛 Troubleshooting

### Common Issues:

1. **"Insufficient funds"**
   - Ensure deployer account has enough native tokens
   - Check gas price settings

2. **"Contract already upgraded"**
   - Verify the current contract version
   - Check if upgrade already occurred

3. **"Invalid proxy address"**
   - Verify the proxy address is correct
   - Ensure the contract is actually upgradeable

4. **Test failures**
   - Check Node.js version compatibility
   - Clear Hardhat cache: `npx hardhat clean`
   - Reinstall dependencies

### Getting Help:
- Check Hardhat documentation
- Review OpenZeppelin Upgrades documentation
- Check test outputs for specific error messages
- Verify network connectivity and RPC endpoints

## 📊 Gas Usage

Typical gas costs for common operations:

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| Deploy | ~2.3M | Proxy + Implementation |
| Mint | ~53K | Regular minting |
| Mint with Lock | ~155K | Includes lock creation |
| Create Time Lock | ~119K | Average cost |
| Transfer (unlocked) | ~61K | Standard transfer |
| Release Lock | ~59K | Release expired lock |

*Gas costs may vary based on network conditions and contract state.*