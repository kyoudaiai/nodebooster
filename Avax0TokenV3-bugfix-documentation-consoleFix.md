// Console fix for createTimeLock

// In your console session, use this instead:

// Method 1: Specify the exact function signature
await avax0['createTimeLock(address,uint256,uint256)']("0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be", "100000000000000000000", "1793964048")

// Method 2: Use parseEther for cleaner amount handling
await avax0['createTimeLock(address,uint256,uint256)']("0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be", ethers.parseEther("100"), "1793964048")

// Method 3: If the above doesn't work, there might be a contract bug. Test with the 4-parameter version:
const emptyConfig = { duration: 0, interval: 0, enabled: false };
await avax0['createTimeLock(address,uint256,uint256,(uint256,uint256,bool))']("0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be", ethers.parseEther("100"), "1793964048", emptyConfig)