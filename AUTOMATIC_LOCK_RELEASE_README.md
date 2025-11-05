# Avax0TokenV2 - Automatic Lock Release Feature

## Overview

The Avax0TokenV2 contract has been enhanced with an automatic lock release mechanism that automatically releases expired time locks during token operations. This feature provides a much better user experience by eliminating the need for users to manually release expired locks before performing transfers or burns.

## How It Works

### Automatic Release Mechanism

The contract now includes an internal `_autoReleaseExpiredLocks(address account)` function that:

1. **Checks all time locks** for the given account
2. **Identifies expired locks** (where current timestamp >= releaseTime)
3. **Automatically releases** all expired locks
4. **Emits TokensUnlocked events** for each released lock
5. **Updates the locked amount** to reflect released tokens

### Triggered Operations

The automatic release mechanism is triggered before the following operations:

- **transfer()** - Releases expired locks before transferring tokens
- **transferFrom()** - Releases expired locks before transferring tokens on behalf
- **burn()** - Releases expired locks before burning tokens  
- **burnFrom()** - Releases expired locks before burning tokens on behalf

## New Functions

### getAvailableBalanceWithAutoRelease(address account)

```solidity
function getAvailableBalanceWithAutoRelease(address account) external returns (uint256)
```

This function:
- Automatically releases any expired locks for the account
- Returns the available balance after auto-release
- **Note**: This is a state-changing function (not view) because it releases locks

## Benefits

### 1. **Improved User Experience**
- Users no longer need to manually call `releaseExpiredLocks()` 
- Transactions work seamlessly even with expired locks
- Reduces friction in token operations

### 2. **Gas Efficiency**
- Combines lock release with the intended operation
- No separate transaction needed for releasing locks
- Optimized for common use cases

### 3. **Backward Compatibility**
- All existing functions continue to work as before
- Manual `releaseExpiredLocks()` still available if needed
- No breaking changes to the API

## Usage Examples

### Example 1: Transfer with Expired Locks

```javascript
// User has 100,000 tokens with 20,000 locked (but expired)
// Before: Would fail with InsufficientUnlockedBalance
// After: Automatically releases the 20,000 expired tokens and completes transfer

await token.connect(user).transfer(recipient, ethers.parseEther("50000"));
// ✅ Success: Auto-releases 20,000 expired tokens, transfers 50,000
```

### Example 2: Burn with Multiple Locks

```javascript
// User has mixed expired and active locks
// Automatic release only affects expired locks, keeps active ones

await token.connect(user).burn(ethers.parseEther("30000"));
// ✅ Success: Releases only expired locks, preserves active locks
```

### Example 3: Check Available Balance

```javascript
// Check balance with automatic release
const available = await token.getAvailableBalanceWithAutoRelease(userAddress);
// This will release expired locks and return the updated available balance
```

## Implementation Details

### Internal Function: _autoReleaseExpiredLocks

```solidity
function _autoReleaseExpiredLocks(address account) internal {
    uint256 lockCount = _timeLockCounts[account];
    uint256 currentTime = block.timestamp;
    uint256 totalReleased = 0;
    
    for (uint256 i = 0; i < lockCount; i++) {
        TimeLock storage lock = _timeLocks[account][i];
        if (!lock.released && currentTime >= lock.releaseTime) {
            lock.released = true;
            totalReleased += lock.amount;
            emit TokensUnlocked(account, lock.amount, i);
        }
    }
    
    if (totalReleased > 0) {
        _lockedAmounts[account] -= totalReleased;
    }
}
```

### Modified Functions

All transfer and burn functions now include this check at the beginning:

```solidity
function transfer(address to, uint256 amount) public override returns (bool) {
    _autoReleaseExpiredLocks(msg.sender);  // ← New automatic release
    return super.transfer(to, amount);
}
```

## Testing

The automatic lock release feature is thoroughly tested with:

- **Automatic Release on Transfer**: Verifies expired locks are released during transfers
- **Selective Release**: Ensures only expired locks are released, active locks remain
- **Multiple Lock Handling**: Tests scenarios with both expired and active locks
- **Integration with Burns**: Validates automatic release works with burn operations
- **Manual Release Compatibility**: Confirms manual release functions still work
- **Gas Efficiency**: Monitors gas usage for the enhanced operations

## Migration Notes

### For Existing Users

- **No action required**: Existing functionality continues to work
- **Improved experience**: Transfers that previously failed due to expired locks will now succeed
- **Same security**: Active (non-expired) locks are still enforced

### For Developers

- **API unchanged**: All existing function signatures remain the same
- **New function available**: `getAvailableBalanceWithAutoRelease()` for enhanced balance checking
- **Events**: Same `TokensUnlocked` events are emitted for automatic releases

## Gas Considerations

The automatic release adds minimal gas overhead:

- **Best case**: No expired locks = minimal additional gas (~2,000 gas)
- **Common case**: 1-2 expired locks = moderate additional gas (~15,000 gas per lock)
- **Worst case**: Many expired locks = higher gas but saves separate release transaction

The gas cost is generally offset by not needing a separate `releaseExpiredLocks()` transaction.

## Security

- **No security changes**: The same lock validation logic is used
- **Atomic operations**: Release and transfer/burn happen in the same transaction
- **Event transparency**: All automatic releases emit events for tracking
- **Access control**: Only expired locks are automatically released

## Deployment

This feature is part of Avax0TokenV2 and can be deployed as:

1. **New deployment**: Full automatic lock release functionality
2. **Upgrade**: Existing Avax0TokenV1 contracts can be upgraded to V2 to gain this feature

The upgrade is backward compatible and preserves all existing time locks and balances.