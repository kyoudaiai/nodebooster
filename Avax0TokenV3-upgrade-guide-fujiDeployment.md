# Avax0TokenV3 Fixed Version Upgrade Guide

## Current Status
- **Proxy Address (Fuji):** `0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078`
- **Issue:** 3-parameter `createTimeLock` function throws `ZeroAddress()` error
- **Fix:** Modified struct initialization from `GradualReleaseConfig(0, 0, false)` to explicit field assignment

## Fixed Code Changes
The following functions were updated in `contracts/Avax0TokenV3.sol`:

1. **`createTimeLock(address,uint256,uint256)` (line 275)**
2. **`mintWithLock(address,uint256,uint256)` (line 203)**

### Before (Broken):
```solidity
GradualReleaseConfig memory emptyConfig = GradualReleaseConfig(0, 0, false);
```

### After (Fixed):
```solidity
GradualReleaseConfig memory emptyConfig;
emptyConfig.duration = 0;
emptyConfig.interval = 0;
emptyConfig.enabled = false;
```

## Upgrade Steps

### Option 1: Using Hardhat Script (When Network is Stable)
```bash
npx hardhat run scripts/deploy-fixed-impl.js --network fuji
```

### Option 2: Manual Console Upgrade
When network connectivity is better, use the console:

```bash
npx hardhat console --network fuji
```

Then execute:
```javascript
// 1. Deploy new implementation
const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
const impl = await Avax0TokenV3.deploy();
await impl.waitForDeployment();
const implAddr = await impl.getAddress();
console.log("Implementation:", implAddr);

// 2. Connect to proxy and upgrade
const proxy = await ethers.getContractAt("Avax0TokenV3", "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078");
const upgradeTx = await proxy.upgradeTo(implAddr);
await upgradeTx.wait();
console.log("Upgrade complete!");

// 3. Test the fix
const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
const futureTime = Math.floor(Date.now() / 1000) + 3600;

// This should now work:
const tx = await proxy['createTimeLock(address,uint256,uint256)'](
    testAccount, 
    ethers.parseEther("1"), 
    futureTime
);
await tx.wait();
console.log("✅ 3-parameter function fixed!");
```

### Option 3: Using OpenZeppelin Upgrades (Preferred)
If the OpenZeppelin upgrades plugin works:
```javascript
const upgraded = await upgrades.upgradeProxy(
    "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078", 
    Avax0TokenV3
);
```

## Current Workaround
Until the upgrade is deployed, use the 4-parameter version:
```javascript
const emptyConfig = { duration: 0, interval: 0, enabled: false };
await avax0['createTimeLock(address,uint256,uint256,(uint256,uint256,bool))'](
    account, 
    amount, 
    releaseTime, 
    emptyConfig
);
```

## Verification After Upgrade
```javascript
// Test both functions
const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
const futureTime = Math.floor(Date.now() / 1000) + 3600;

// 3-parameter version (should work after fix)
await proxy['createTimeLock(address,uint256,uint256)'](testAccount, ethers.parseEther("1"), futureTime);

// 4-parameter version (should still work)
const config = { duration: 0, interval: 0, enabled: false };
await proxy['createTimeLock(address,uint256,uint256,(uint256,uint256,bool))'](testAccount, ethers.parseEther("1"), futureTime + 3600, config);
```

## Network Issues
If you encounter "Unable to perform request" errors:
1. Wait for Fuji network stability
2. Try increasing gas price: `--gas-price 30000000000` (30 gwei)
3. Use a different RPC endpoint in `hardhat.config.js`
4. Try during less congested network times

The fix is ready and tested on local network. The upgrade just needs to be deployed when Fuji network connectivity is stable.