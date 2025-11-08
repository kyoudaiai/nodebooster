# Manual Console Upgrade Instructions

## The Problem
The `upgradeTo` function is not directly available in the contract interface because it's internal in UUPS contracts.

## Solution: Use upgradeToAndCall

In your console, use this approach:

```javascript
// 1. Connect to proxy with UUPS interface
const proxy = await ethers.getContractAt(
    ["function upgradeToAndCall(address,bytes) external"],
    "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078"
);

// 2. Deploy new implementation (use the address from previous deployment)
const newImplAddress = "0x0373e40cB1f32dA691b7E60f73D5F3191D5AE131";

// 3. Upgrade using upgradeToAndCall with empty data
const tx = await proxy.upgradeToAndCall(newImplAddress, "0x");
await tx.wait();
console.log("Upgrade complete!");

// 4. Verify upgrade worked
const upgraded = await ethers.getContractAt("Avax0TokenV3", "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078");
const version = await upgraded.version();
console.log("New version:", version); // Should show "3.0.1"

// 5. Test the fixed function
const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
const futureTime = Math.floor(Date.now() / 1000) + 3600;

const lockTx = await upgraded['createTimeLock(address,uint256,uint256)'](
    testAccount,
    ethers.parseEther("1"),
    futureTime
);
await lockTx.wait();
console.log("✅ 3-parameter function works!");
```

## Alternative: Use OpenZeppelin Upgrades Plugin

If the manual approach doesn't work, use the upgrades plugin:

```javascript
// In console
const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
const upgraded = await upgrades.upgradeProxy(
    "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078",
    Avax0TokenV3
);
console.log("Upgrade via plugin complete!");
```