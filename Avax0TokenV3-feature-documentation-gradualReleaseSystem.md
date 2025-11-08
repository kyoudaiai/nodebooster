# Avax0TokenV3 - Gradual Release Feature Documentation

## Overview

Avax0TokenV3 introduces a powerful **gradual release** mechanism that enhances the time lock functionality by releasing locked tokens gradually over a configurable period, rather than all at once when the lock expires. This provides smoother token distribution and better control over token flows.

## Key Features

### 🎯 **Configurable Gradual Release**
- **Duration**: Total time period for gradual release (e.g., 30 days)
- **Interval**: How often tokens are released (e.g., daily)
- **Enable/Disable**: Option to use immediate release instead

### 🔄 **Automatic Processing**
- Gradual releases are automatically processed during transfers and burns
- No manual intervention required for most operations
- Smart balance checking includes pending releases

### 🛡️ **Upgrade Safe**
- Full backward compatibility with V2 contracts
- Maintains all existing time lock functionality
- Zero-downtime upgrades from V2 to V3

## How Gradual Release Works

### Traditional Time Lock (V2)
```
Lock Period: [--------] → Release Time → All tokens available immediately
```

### Gradual Release (V3)
```
Lock Period: [--------] → Release Time → [Gradual Release Period: |--|--|--|--] → All released
                                         Day1 Day3 Day5 Day7
```

### Example Configuration
- **Lock Amount**: 30,000 tokens
- **Release Start**: After 1 week
- **Gradual Duration**: 10 days  
- **Interval**: 2 days
- **Result**: 6,000 tokens released every 2 days (5 releases total)

## Configuration Options

### Default Configuration
```solidity
struct GradualReleaseConfig {
    uint256 duration;    // 30 days (2,592,000 seconds)
    uint256 interval;    // 1 day (86,400 seconds)  
    bool enabled;        // true
}
```

### Custom Configurations
```solidity
// Weekly release over 4 weeks
GradualReleaseConfig memory weeklyRelease = GradualReleaseConfig({
    duration: 28 days,
    interval: 7 days,
    enabled: true
});

// Daily release over 2 weeks
GradualReleaseConfig memory dailyRelease = GradualReleaseConfig({
    duration: 14 days,
    interval: 1 days,
    enabled: true
});

// Disabled gradual release (immediate release like V2)
GradualReleaseConfig memory immediateRelease = GradualReleaseConfig({
    duration: 0,
    interval: 0,
    enabled: false
});
```

## Usage Examples

### 1. Creating Locks with Gradual Release

```solidity
// Using default configuration
await token.createTimeLock(userAddress, amount, releaseTime);

// Using custom configuration  
GradualReleaseConfig memory customConfig = GradualReleaseConfig({
    duration: 14 days,
    interval: 2 days, 
    enabled: true
});
await token.createTimeLock(userAddress, amount, releaseTime, customConfig);

// Minting with gradual release
await token.mintWithLock(userAddress, amount, releaseTime, customConfig);
```

### 2. Checking Gradual Release Status

```solidity
// Get detailed information about a specific lock
(uint256 availableNow, 
 uint256 nextReleaseTime,
 uint256 totalReleased, 
 uint256 totalAmount) = await token.getGradualReleaseStatus(userAddress, lockId);

// Get comprehensive balance information
(uint256 totalBalance,
 uint256 currentlyLocked,
 uint256 availableNow,
 uint256 pendingRelease,
 uint256 nextReleaseTime) = await token.getDetailedBalance(userAddress);
```

### 3. Manual Release Operations

```solidity
// Process all available gradual releases
await token.releaseGradualUnlocks(userAddress);

// Release specific lock
await token.releaseSpecificLock(userAddress, lockId);
```

## Error Messages

The contract provides clear, informative error messages for gradual release scenarios:

### InsufficientGraduallyReleasedBalance
```
Error: InsufficientGraduallyReleasedBalance(
    address account,           // Who tried the operation
    uint256 requested,         // Amount they tried to transfer/burn
    uint256 availableNow,     // Amount available right now
    uint256 totalAvailable,   // Total that will be available eventually
    uint256 nextReleaseTime   // When next release occurs
)
```

**Example Error Message:**
```
"Insufficient gradually released balance for 0x123...
Requested: 50,000 tokens
Available now: 20,000 tokens  
Total available: 80,000 tokens
Next release: 1,640,995,200 (timestamp)"
```

## Advanced Features

### 1. Multiple Locks with Different Configs

```solidity
// User can have multiple locks with different gradual release schedules
await token.createTimeLock(user, 10000, time1, fastReleaseConfig);   // 1 week
await token.createTimeLock(user, 20000, time2, slowReleaseConfig);   // 1 month
await token.createTimeLock(user, 5000, time3, immediateConfig);      // No gradual release
```

### 2. Automatic Processing During Operations

```solidity
// These operations automatically process available gradual releases:
await token.transfer(recipient, amount);      // Processes releases first
await token.transferFrom(from, to, amount);   // Processes releases first  
await token.burn(amount);                     // Processes releases first
await token.burnFrom(account, amount);        // Processes releases first
```

### 3. Smart Balance Checking

```solidity
// Traditional balance (doesn't process releases)
uint256 available = await token.getAvailableBalance(user);

// Smart balance (processes releases automatically)
uint256 smartAvailable = await token.getAvailableBalanceWithProcessing(user);
```

## Gas Considerations

| Operation | Estimated Gas | Notes |
|-----------|---------------|-------|
| Creating gradual lock | ~200,000 gas | One-time setup |
| Processing 1 release | ~15,000 gas | Per expired lock |
| Processing 5 releases | ~60,000 gas | Multiple locks |
| Transfer with auto-process | Base + processing | Efficient combined operation |

**Optimization Tips:**
- Gradual processing is batched with transfer operations
- Users don't need separate release transactions
- Gas cost scales with number of expired locks

## Deployment and Upgrade

### Fresh V3 Deployment
```bash
# Deploy new V3 contract
npx hardhat run scripts/deployV3.js --network <network>
```

### Upgrade from V2 to V3
```bash
# Upgrade existing V2 proxy to V3
PROXY_ADDRESS=0x... npx hardhat run scripts/upgradeToV3.js --network <network>
```

### V3 Initialization
```solidity
// Called during deployment or upgrade
await token.initializeV3(
    30 * 24 * 60 * 60,  // 30 days duration
    24 * 60 * 60        // 1 day interval
);
```

## Backward Compatibility

### V2 Function Support
All V2 functions continue to work:

```solidity
// V2 functions that work in V3
await token.createTimeLock(user, amount, time);                    // Uses default gradual config
await token.releaseExpiredLocks(user);                            // Processes gradual releases
await token.getAvailableBalanceWithAutoRelease(user);             // Processes gradual releases
await token.totalLockedAmount(user);                              // Returns current locked amount
await token.timeLocks(user, index);                               // V2-style array access
```

### Migration Strategy
1. **Zero-downtime upgrade**: Existing locks continue working
2. **New locks get gradual release**: Automatically use default configuration
3. **Existing locks remain unchanged**: No retroactive gradual release
4. **All V2 functions work**: Full backward compatibility

## Events

### New V3 Events
```solidity
event TokensGraduallyReleased(
    address indexed account, 
    uint256 amount, 
    uint256 lockId, 
    uint256 totalReleased
);

event GradualReleaseConfigUpdated(
    uint256 duration, 
    uint256 interval, 
    bool enabled
);
```

### Inherited V2 Events
```solidity
event TokensLocked(address indexed account, uint256 amount, uint256 releaseTime, uint256 lockId);
event TokensUnlocked(address indexed account, uint256 amount, uint256 lockId);
event LockExtended(address indexed account, uint256 lockId, uint256 newReleaseTime);
```

## Common Use Cases

### 1. **Team Vesting**
```solidity
// 2-year team vesting with monthly releases
GradualReleaseConfig memory teamVesting = GradualReleaseConfig({
    duration: 24 * 30 days,  // 24 months
    interval: 30 days,       // Monthly
    enabled: true
});
```

### 2. **Investor Lockup**
```solidity
// 1-year lockup followed by quarterly releases over 2 years
GradualReleaseConfig memory investorRelease = GradualReleaseConfig({
    duration: 2 * 365 days,  // 2 years gradual
    interval: 90 days,       // Quarterly  
    enabled: true
});
```

### 3. **Liquidity Mining Rewards**
```solidity
// Daily release over 30 days
GradualReleaseConfig memory miningRewards = GradualReleaseConfig({
    duration: 30 days,
    interval: 1 days,
    enabled: true
});
```

### 4. **Ecosystem Grants**
```solidity
// Immediate release for grants (backward compatible)
GradualReleaseConfig memory immediateGrant = GradualReleaseConfig({
    duration: 0,
    interval: 0,
    enabled: false
});
```

## Security Considerations

✅ **Safe Operations**
- All calculations use safe math (Solidity 0.8+)
- No reentrancy vulnerabilities
- Owner-only administrative functions
- Gradual releases cannot be manipulated

✅ **Access Control**
- Only owner can create locks
- Users can only release their own expired locks
- Transfer restrictions properly enforced

✅ **Upgrade Safety**
- Storage layout preserved from V2
- No breaking changes to existing functionality
- UUPS proxy pattern ensures secure upgrades

## Testing

The contract includes comprehensive tests covering:

- ✅ Configuration management
- ✅ Lock creation with various configs
- ✅ Gradual release calculations
- ✅ Automatic processing during transfers
- ✅ Multiple locks with different schedules
- ✅ Edge cases and error conditions
- ✅ Backward compatibility with V2
- ✅ Gas optimization scenarios

Run tests:
```bash
npx hardhat test test/Avax0TokenV3CoreFeatures.test.js
```

## Conclusion

Avax0TokenV3's gradual release feature provides:

1. **Smooth Token Distribution**: No sudden large releases
2. **Flexible Configuration**: Adaptable to any vesting schedule  
3. **User-Friendly**: Automatic processing, clear error messages
4. **Backward Compatible**: Zero disruption to existing functionality
5. **Gas Efficient**: Optimized for real-world usage

This enhancement makes the token contract suitable for sophisticated DeFi applications, team vesting, investor relations, and any scenario requiring controlled token release schedules.