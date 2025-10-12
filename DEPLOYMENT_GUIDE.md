# Avax0 Token Deployment Guide

This guide explains how to deploy and upgrade the Avax0 token using the provided scripts.

## Overview

The Avax0 token system supports two versions:
- **V1**: Basic ERC20 token without transfer fees
- **V2**: Enhanced token with configurable transfer fees (0-5%)

Both versions support:
- Minting/burning by authorized addresses
- Pausable functionality
- Upgradeable via UUPS proxy pattern
- Emergency token recovery

## Prerequisites

1. **Environment Setup**:
   ```bash
   # Install dependencies
   npm install
   
   # Set up private key in .secrets.json or .env
   echo '{"nodebooster_deployer": "0xYOUR_PRIVATE_KEY_HERE"}' > .secrets.json
   ```

2. **Network Configuration**: 
   - Fuji testnet and Avalanche mainnet are pre-configured
   - Ensure you have AVAX for gas fees

## Deployment Scripts

### 1. Deploy V1 Only (`deploy-avax0-v1.js`)

Deploys the basic V1 token without transfer fees.

**Usage:**
```bash
# Deploy on Fuji testnet
npx hardhat run scripts/deploy-avax0-v1.js --network fuji

# Deploy on Avalanche mainnet
npx hardhat run scripts/deploy-avax0-v1.js --network avalanche
```

**What it does:**
- Deploys V1 contract with 1M initial supply
- Sets deployer as owner and minter
- Creates UUPS proxy for future upgrades
- Provides comprehensive deployment verification

**Output:**
- Proxy address (this is your token contract address)
- Implementation address
- Deployment verification details

### 2. Upgrade V1 to V2 (`upgrade-avax0-v1-to-v2.js`)

Upgrades an existing V1 deployment to V2 with transfer fees.

**Usage:**
```bash
# Method 1: Using environment variable (recommended)
PROXY_ADDRESS=0x1234... npx hardhat run scripts/upgrade-avax0-v1-to-v2.js --network fuji

# Method 2: Adding address after network command
npx hardhat run scripts/upgrade-avax0-v1-to-v2.js --network fuji 0x1234...

# Example with actual address:
PROXY_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 npx hardhat run scripts/upgrade-avax0-v1-to-v2.js --network fuji
```

**What it does:**
- Verifies current contract is V1
- Ensures you're the contract owner
- Upgrades to V2 implementation
- Initializes transfer fee system (1% default)
- Sets deployer as treasury address
- Preserves all existing balances and permissions

**Safety Features:**
- Pre-upgrade verification
- State preservation checks
- Comprehensive post-upgrade validation
- Detailed error handling

## Example Workflow

### Scenario 1: Start with V1, upgrade later

```bash
# 1. Deploy V1 first
npx hardhat run scripts/deploy-avax0-v1.js --network fuji
# Note the proxy address: 0xABC123...

# 2. Use V1 for a while (no transfer fees)
# Users can transfer tokens freely

# 3. Later, upgrade to V2 to enable transfer fees
PROXY_ADDRESS=0xABC123... npx hardhat run scripts/upgrade-avax0-v1-to-v2.js --network fuji
```

### Scenario 2: Deploy V2 directly

```bash
# Use the existing V2 deployment script
npx hardhat run scripts/deploy-avalanche.js --network fuji
```

## Post-Deployment Management

After deployment, you can manage the token using the owner functions:

### V1 Functions:
- `addMinter(address)` - Add new minter
- `removeMinter(address)` - Remove minter
- `mint(address, amount)` - Mint tokens
- `pause()/unpause()` - Pause/unpause transfers

### V2 Additional Functions:
- `setTransferFeeRate(uint256)` - Update fee rate (0-500 basis points)
- `setTreasury(address)` - Update treasury address
- `setFeeExempt(address, bool)` - Exempt addresses from fees
- `initializeV2(address, uint256)` - One-time V2 initialization

## Network Addresses

### Fuji Testnet (Chain ID: 43113)
- RPC: `https://api.avax-test.network/ext/bc/C/rpc`
- Explorer: https://testnet.snowtrace.io/
- Get testnet AVAX: https://faucet.avax.network/

### Avalanche Mainnet (Chain ID: 43114)
- RPC: `https://api.avax.network/ext/bc/C/rpc`
- Explorer: https://snowtrace.io/

## Verification

### Contract Verification on Snowtrace:
```bash
# Verify V1
npx hardhat verify --network fuji <PROXY_ADDRESS>

# Verify V2 (after upgrade)
npx hardhat verify --network fuji <PROXY_ADDRESS>
```

### Testing Deployment:
```bash
# Run all tests
npx hardhat test

# Test specific upgrade functionality
npx hardhat test --grep "upgrade"
```

## Troubleshooting

### Common Issues:

1. **"Cannot connect to network"**
   - Check internet connection
   - Verify network configuration in `hardhat.config.js`

2. **"Insufficient funds"**
   - Ensure wallet has enough AVAX for gas fees
   - Fuji: Get testnet AVAX from faucet
   - Mainnet: Need real AVAX

3. **"You're not the contract owner"**
   - Only the contract owner can upgrade
   - Verify you're using the correct private key

4. **"Contract is already upgraded"**
   - Check current version with `version()` function
   - V1 = "1.0.0", V2 = "2.0.0"

5. **"Invalid proxy address"**
   - Ensure you're using the proxy address, not implementation
   - Proxy address is returned from initial deployment

### Getting Help:
- Check the test files for usage examples
- Review contract source code in `contracts/` directory
- Use `npx hardhat console --network fuji` for interactive testing

## Security Notes

- **Private Keys**: Never commit private keys to version control
- **Mainnet Deployment**: Test thoroughly on Fuji before mainnet
- **Upgrade Safety**: The upgrade preserves all state, but test with small amounts first
- **Transfer Fees**: Start with low fees and adjust based on usage
- **Treasury**: Consider using a multisig wallet for the treasury address

## Gas Estimates

Approximate gas costs on Avalanche:

- **V1 Deployment**: ~3-4M gas
- **V1 to V2 Upgrade**: ~1-2M gas
- **V2 Direct Deployment**: ~4-5M gas

At 225 gwei gas price: ~0.5-1 AVAX per deployment