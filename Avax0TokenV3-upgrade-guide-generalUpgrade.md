# NodeBooster V1 to V2 Upgrade Guide

This directory contains scripts and tests for upgrading NodeBooster V1 contracts to V2.

## Files

- `upgrade-v1-to-v2.js` - Main upgrade script
- `upgrade-v1-to-v2.test.js` - Comprehensive upgrade tests
- `upgrade-helper.sh` - Interactive helper script

## Quick Start

### 1. Test the Upgrade Process (Recommended First)

```bash
npx hardhat test test/upgrade-v1-to-v2.test.js
```

This will:
- Deploy a V1 contract with test data
- Upgrade it to V2
- Verify all data is preserved
- Test new V2 features

### 2. Run Actual Upgrade

```bash
# Set your V1 proxy address
export NODEBOOSTER_PROXY_ADDRESS=0x1234567890123456789012345678901234567890

# Run the upgrade
npx hardhat run scripts/upgrade-v1-to-v2.js --network <your-network>
```

### 3. Use Interactive Helper

```bash
./scripts/upgrade-helper.sh
```

## Detailed Steps

### Pre-Upgrade Checklist

1. **Backup Current State**
   - Record current proxy address
   - Document all user accounts and balances
   - Save engine configurations
   - Note any custom settings

2. **Test Thoroughly**
   ```bash
   npx hardhat test test/upgrade-v1-to-v2.test.js
   ```

3. **Verify Network Configuration**
   - Ensure you're on the correct network
   - Verify deployer account has sufficient gas
   - Confirm proxy address is correct

### Upgrade Process

The upgrade script will:

1. **Validate Environment**
   - Check proxy address is set
   - Verify current contract is V1
   - Display current contract state

2. **Deploy V2 Implementation**
   - Deploy new NodeBoosterV2 contract
   - Prepare upgrade transaction

3. **Execute Upgrade**
   - Upgrade proxy to point to V2
   - Verify upgrade success
   - Check version number

4. **Verify State Preservation**
   - Compare pre/post upgrade state
   - Test V2-specific features
   - Confirm all data intact

### What Gets Preserved

✅ **Preserved Data:**
- All user registrations and referrals
- User engine ownership and history
- Pending rewards and claim history
- Engine configurations
- System pool settings
- Total statistics (USDC collected, AVAX0 distributed, etc.)
- Blacklist status
- MIN_WD settings

🆕 **New V2 Features:**
- Default referrer functionality
- Enhanced user account info function
- Per-engine reward cap tracking
- Improved blacklist handling
- Better error messages

### Post-Upgrade Verification

After upgrade, verify:

```javascript
// Check version
await contract.version(); // Should return "2.0.0"

// Test new default referrer feature
await contract.defaultReferrer();

// Test enhanced user info
await contract.getUserAccountInfo(userAddress);

// Test engine cap status
await contract.getUserEngineCapStatus(userAddress, engineId);
```

### Network Configuration

For different networks, update your hardhat.config.js:

```javascript
networks: {
  mainnet: {
    url: "https://api.avax.network/ext/bc/C/rpc",
    accounts: [process.env.PRIVATE_KEY]
  },
  testnet: {
    url: "https://api.avax-test.network/ext/bc/C/rpc", 
    accounts: [process.env.PRIVATE_KEY]
  }
}
```

### Environment Variables

Required:
```bash
NODEBOOSTER_PROXY_ADDRESS=0x... # Your V1 proxy address
PRIVATE_KEY=0x...               # Deployer private key
```

Optional:
```bash
HARDHAT_NETWORK=mainnet         # Target network
ETHERSCAN_API_KEY=...           # For verification
```

### Troubleshooting

**Common Issues:**

1. **"Proxy address not set"**
   ```bash
   export NODEBOOSTER_PROXY_ADDRESS=0x...
   ```

2. **"Expected version 1.0.0"**
   - Verify you're pointing to correct V1 contract
   - Check if contract was already upgraded

3. **"Insufficient gas"**
   - Increase gas limit in hardhat.config.js
   - Ensure deployer has enough AVAX

4. **"State mismatch after upgrade"**
   - Run the test suite to identify issues
   - Check for any custom modifications to V1

### Gas Estimates

Typical gas usage:
- Deploy V2 implementation: ~5,000,000 gas
- Upgrade proxy: ~50,000 gas
- Total cost: ~5,050,000 gas

At 25 gwei: ~0.12 AVAX

### Emergency Procedures

If upgrade fails:
1. The proxy will still point to V1 (no state lost)
2. Retry upgrade after fixing issues
3. Contract owner can pause contract if needed
4. Emergency functions remain available

### Support

For issues:
1. Run test suite first: `npx hardhat test test/upgrade-v1-to-v2.test.js`
2. Check console output for specific errors
3. Verify all environment variables are set
4. Ensure sufficient gas and AVAX balance