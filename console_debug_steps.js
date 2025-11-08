// Contract Bug Investigation
// There appears to be a bug where ZeroAddress() is thrown with the proxy address as parameter

// Potential causes:
// 1. Function overloading resolution issue
// 2. Storage collision in proxy upgrade
// 3. Incorrect implementation deployment
// 4. ABI encoding issue

// To fix this in console:

// STEP 1: Get fresh contract instance
const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
const avax0 = await ethers.getContractAt("Avax0TokenV3", proxyAddress);

// STEP 2: Check if this is a function resolution issue
console.log("Available createTimeLock functions:");
avax0.interface.fragments
  .filter(f => f.name === 'createTimeLock')
  .forEach((f, i) => console.log(`${i}: ${f.format()}`));

// STEP 3: Try explicit function call
const account = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
const amount = ethers.parseEther("100");
const releaseTime = "1793964048";

// Try the 3-parameter version explicitly
try {
  const tx = await avax0['createTimeLock(address,uint256,uint256)'](account, amount, releaseTime);
  console.log("Success!", tx.hash);
} catch (error) {
  console.log("Error:", error.message);
  console.log("Error data:", error.data);
}

// STEP 4: If still failing, try with empty gradual config
const emptyConfig = {
  duration: 0,
  interval: 0, 
  enabled: false
};

try {
  const tx = await avax0['createTimeLock(address,uint256,uint256,(uint256,uint256,bool))'](
    account, 
    amount, 
    releaseTime, 
    emptyConfig
  );
  console.log("4-param version success!", tx.hash);
} catch (error) {
  console.log("4-param error:", error.message);
}

// STEP 5: If both fail, there's likely a contract bug
// The ZeroAddress() error with proxy address suggests internal logic error
// May need to redeploy or upgrade the contract