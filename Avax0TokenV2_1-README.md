# Avax0Token V2.1 - Global Vesting Upgrade

This document describes the Avax0TokenV2.1 upgrade, which introduces global vesting functionality while maintaining full compatibility with previous versions.

## 🎯 Overview

Avax0TokenV2.1 adds global vesting capabilities to the existing time lock system, providing administrators with comprehensive control over token transferability during specific periods.

## 🔄 Upgrade Path

The contract follows this upgrade path:
- **V1.0** → Basic ERC20 with minting
- **V2.0** → Adds individual time locks
- **V2.1** → Adds global vesting system

## ✨ New Features in V2.1

### Global Vesting System
- **Global vesting period**: Set a timelock ending date that affects all addresses
- **Enable/Disable vesting**: Can be toggled on or off by the owner
- **Dynamic end date**: Vesting end date can be changed by the owner
- **Exclusion list**: Specific addresses can be excluded from vesting restrictions

### Key Functions

#### Administrative Functions
```solidity
function initializeV2_1(uint256 _vestingEndDate, bool _vestingEnabled) external onlyOwner
function setVestingEnabled(bool _enabled) external onlyOwner
function setVestingEndDate(uint256 _endDate) external onlyOwner
function setVestingExclusion(address account, bool excluded) external onlyOwner
function batchSetVestingExclusion(address[] calldata accounts, bool[] calldata excluded) external onlyOwner
```

#### View Functions
```solidity
function isSubjectToVesting(address account) public view returns (bool)
function canTransfer(address account) external view returns (bool)
function getVestingStatus() external view returns (bool enabled, uint256 endDate, uint256 remainingTime)
```

### Storage Layout (Upgrade Safe)

The contract maintains upgrade safety by:
- Adding new variables at the end of storage
- Using a storage gap for future upgrades
- Preserving all existing storage slots

```solidity
// V2.1 Storage Variables (added at end)
bool public vestingEnabled;
uint256 public vestingEndDate;  
mapping(address => bool) public vestingExcluded;

// Storage gap for future upgrades
uint256[47] private __gap;
```

## 🚀 Deployment & Upgrade

### Option 1: Complete Upgrade Path (V1 → V2 → V2.1)
```bash
# Deploy and upgrade through all versions
npx hardhat run scripts/deploy-complete-v1-v2-v2_1-upgrade-path.js --network <network>
```

### Option 2: Upgrade Existing V2 to V2.1
```bash
# Upgrade existing V2 deployment to V2.1
PROXY_ADDRESS=<your-proxy-address> npx hardhat run scripts/upgrade-avax0-v2-to-v2_1.js --network <network>
```

### Post-Upgrade Setup

After upgrading to V2.1, initialize the new features:

```javascript
// Initialize V2.1 features
const vestingEndDate = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
await contract.initializeV2_1(vestingEndDate, true);

// Add exclusions (optional)
await contract.setVestingExclusion(ownerAddress, true);
await contract.batchSetVestingExclusion(
    [minterAddress, treasuryAddress],
    [true, true]
);
```

## 🧪 Testing

### Run Complete Test Suite
```bash
npx hardhat test test/Avax0TokenV1-V2-V2_1-FullUpgrade.test.js
```

The test suite verifies:
- ✅ V1 → V2 → V2.1 upgrade path
- ✅ Data preservation across all upgrades  
- ✅ All existing functionality preserved
- ✅ New V2.1 features working correctly
- ✅ Vesting restrictions enforced properly
- ✅ Exclusion list functionality
- ✅ Edge cases and error conditions

## 📊 Contract Behavior

### Vesting Logic

A user is subject to vesting restrictions if:
1. Vesting is enabled (`vestingEnabled = true`)
2. Vesting end date is in the future (or 0 for indefinite vesting)
3. User is not on the exclusion list (`vestingExcluded[user] = false`)

### Transfer Restrictions

When vesting is active:
- ❌ Non-excluded addresses cannot transfer tokens
- ❌ Non-excluded addresses cannot burn tokens  
- ✅ Excluded addresses can transfer/burn normally
- ✅ All addresses can receive tokens
- ✅ Minting is not restricted

### Available Balance Calculation

```solidity
// V2.1 considers both time locks AND vesting
function getAvailableBalance(address account) public view returns (uint256) {
    uint256 totalBalance = balanceOf(account);
    uint256 lockedAmount = getLockedAmount(account); // Time locks
    uint256 unlockedBalance = totalBalance >= lockedAmount ? totalBalance - lockedAmount : 0;
    
    // Apply global vesting if applicable
    if (isSubjectToVesting(account)) {
        return 0; // All tokens locked during vesting
    }
    
    return unlockedBalance;
}
```

## 🔒 Security Features

### Access Control
- All vesting functions are `onlyOwner`
- Upgrade authorization requires owner approval
- Input validation on all parameters

### Safety Checks
- Cannot set past dates as vesting end date
- Cannot exclude zero address
- Array length validation in batch functions
- Proper error handling with custom errors

### Custom Errors
```solidity
error VestingActive();
error InvalidVestingEndDate(uint256 endDate);
error ZeroAddress();
```

## 📈 Gas Optimization

- Efficient storage layout with packed variables
- Batch operations for multiple exclusions
- Minimal gas overhead for vesting checks
- Auto-release functionality for time locks

## 🔍 Example Usage

### Setting Up Vesting
```javascript
// Enable 30-day vesting period
const thirtyDays = 30 * 24 * 60 * 60;
const vestingEnd = Math.floor(Date.now() / 1000) + thirtyDays;

await contract.initializeV2_1(vestingEnd, true);
console.log("30-day vesting period activated");

// Add team/advisor exclusions
await contract.batchSetVestingExclusion(
    [teamWallet, advisorWallet, treasuryWallet],
    [true, true, true]
);
```

### Managing Vesting During Runtime
```javascript
// Extend vesting period
const newEndDate = Math.floor(Date.now() / 1000) + (45 * 24 * 60 * 60);
await contract.setVestingEndDate(newEndDate);

// Temporarily disable vesting for emergency
await contract.setVestingEnabled(false);

// Re-enable vesting
await contract.setVestingEnabled(true);
```

### Checking Vesting Status
```javascript
// Get global vesting info
const [enabled, endDate, remainingTime] = await contract.getVestingStatus();
console.log(`Vesting: ${enabled ? 'Active' : 'Inactive'}`);
console.log(`Time remaining: ${remainingTime} seconds`);

// Check specific user
const canTransfer = await contract.canTransfer(userAddress);
const isVested = await contract.isSubjectToVesting(userAddress);
console.log(`User can transfer: ${canTransfer}`);
console.log(`User subject to vesting: ${isVested}`);
```

## 🚨 Important Notes

### Upgrade Safety
- ✅ All existing V1 and V2 functionality preserved
- ✅ Storage layout is upgrade-safe
- ✅ No breaking changes to existing interfaces
- ✅ Comprehensive test coverage

### Initialization Required
- V2.1 features are inactive until `initializeV2_1()` is called
- Owner is automatically excluded from vesting
- Can only initialize once per deployment

### Vesting vs Time Locks
- **Time locks**: Individual address-specific locks with release dates
- **Global vesting**: Affects all non-excluded addresses until end date
- Both systems work together: users need both unlocked AND not vested tokens

## 📄 Contract Addresses

| Network | Proxy Address | Implementation | Version |
|---------|---------------|----------------|---------|
| Hardhat | `0xe7f1...0512` | `0x2279...eBe6` | 2.1.0 |
| Fuji    | TBD           | TBD            | TBD     |
| Mainnet | TBD           | TBD            | TBD     |

## 📚 Additional Resources

- [OpenZeppelin Upgrades Documentation](https://docs.openzeppelin.com/upgrades-plugins/1.x/)
- [UUPS vs Transparent Proxies](https://docs.openzeppelin.com/contracts/4.x/api/proxy)
- [Hardhat Upgrades Plugin](https://hardhat.org/plugins/openzeppelin-hardhat-upgrades.html)

---

## 🎉 Summary

Avax0TokenV2.1 successfully extends the time lock functionality with a comprehensive global vesting system while maintaining full backward compatibility. The upgrade provides administrators with powerful tools to manage token distribution and transferability during critical periods such as token launches, fundraising events, or regulatory compliance requirements.

The implementation is production-ready with comprehensive test coverage, gas optimization, and robust security measures.