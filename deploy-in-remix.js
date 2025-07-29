// This script is designed to be run in Ethereum Remix IDE
// Right click on the script name and hit "Run" to execute
(async () => {
    try {
        console.log('Running deployWithEthers script...')
        
        // Get the signer
        const signer = (new ethers.providers.Web3Provider(web3Provider)).getSigner()
        const signerAddress = await signer.getAddress();
        console.log("Signer address:", signerAddress);
        

        // Deploy MOCKERC20Token contract with constructor args: "ETHXP", "ETHXP", 100000000
        console.log("Deploying MOCKERC20Token contract...");
        const mockERC20Path = `browser/artifacts/ERC20Token.json`
        const mockERC20Metadata = JSON.parse(await remix.call('fileManager', 'getFile', mockERC20Path))
        let mockERC20Factory = new ethers.ContractFactory(mockERC20Metadata.abi, mockERC20Metadata.data.bytecode.object, signer);
        let mockERC20 = await mockERC20Factory.deploy("ETHXP", "ETHXP", "100000000");
        await mockERC20.deployed()
        console.log("MOCKERC20Token deployed at:", mockERC20.address);
        
        // Deploy ETHXP-TokenSale contract with constructor args: 20, signerAddress, signerAddress, mockERC20.address
        console.log("Deploying ETHXP-TokenSale contract...");
        const ethxpTokenSalePath = `browser/artifacts/TokenSale.json`
        const ethxpTokenSaleMetadata = JSON.parse(await remix.call('fileManager', 'getFile', ethxpTokenSalePath))
        let ethxpTokenSaleFactory = new ethers.ContractFactory(ethxpTokenSaleMetadata.abi, ethxpTokenSaleMetadata.data.bytecode.object, signer);
        let ethxpTokenSale = await ethxpTokenSaleFactory.deploy(20, signerAddress, signerAddress, mockERC20.address);
        await ethxpTokenSale.deployed()
        console.log("ETHXP-TokenSale deployed at:", ethxpTokenSale.address);

        
        // deploy old DailyEthRoi contract
        console.log("Deploying old DailyEthRoi contract...");
        const oldDailyEthRoiPath = `browser/artifacts/DailyEthRoiV1.json`
        const oldDailyEthRoiMetadata = JSON.parse(await remix.call('fileManager', 'getFile', oldDailyEthRoiPath))
        let oldDailyEthRoiFactory = new ethers.ContractFactory(oldDailyEthRoiMetadata.abi, oldDailyEthRoiMetadata.data.bytecode.object, signer);
        let oldDailyEthRoi = await oldDailyEthRoiFactory.deploy();
        await oldDailyEthRoi.deployed()
        console.log("Old DailyEthRoi deployed at:", oldDailyEthRoi.address);

        // Deploy New DailyEthRoi With ETHXP Payout and auto migration contract
        console.log("Deploying DailyEthRoi contract...");
        const dailyEthRoiPath = `browser/artifacts/DailyEthRoiV3.json`
        const dailyEthRoiMetadata = JSON.parse(await remix.call('fileManager', 'getFile', dailyEthRoiPath))
        let dailyEthRoiFactory = new ethers.ContractFactory(dailyEthRoiMetadata.abi, dailyEthRoiMetadata.data.bytecode.object, signer);
        let dailyEthRoi = await dailyEthRoiFactory.deploy();
        await dailyEthRoi.deployed()
        console.log("DailyEthRoi deployed at:", dailyEthRoi.address);
        
        
        
        // Log the addresses of the deployed contracts
        console.log("\n=== Deployment Summary ===");
        console.log("Old DailyEthRoi address:", oldDailyEthRoi.address);
        console.log("DailyEthRoi address:", dailyEthRoi.address);
        console.log("MOCKERC20Token address:", mockERC20.address);
        console.log("ETHXP-TokenSale address:", ethxpTokenSale.address);
        console.log("Signer address used:", signerAddress);
        console.log('Deployment successful.')
        
        console.log("\n=== Post-Deployment Configuration ===");

        // set the old DailyEthRoi contract address in the new DailyEthRoi contract
        console.log("Setting old DailyEthRoi contract address...");
        const setOldDailyEthRoiTx = await dailyEthRoi.setOldContract(oldDailyEthRoi.address);
        await setOldDailyEthRoiTx.wait();
        console.log("Old DailyEthRoi contract address set to:", oldDailyEthRoi.address);
        
        // Approve 10 million tokens from first signer to DailyEthRoi address
        console.log("Approving 10 million tokens to DailyEthRoi contract...");
        const approvalAmount = ethers.utils.parseUnits("10000000", 18); // 10 million tokens with 18 decimals
        const approveTx = await mockERC20.approve(dailyEthRoi.address, approvalAmount);
        await approveTx.wait();
        console.log("Approval transaction completed");
        
        // Configure DailyEthRoi contract
        console.log("Configuring DailyEthRoi contract...");
        
        // Set TokenSale contract address
        console.log("Setting TokenSale contract address...");
        const setTokenSaleTx = await dailyEthRoi.chgTokenSaleContract(ethxpTokenSale.address);
        await setTokenSaleTx.wait();
        console.log("TokenSale contract address set");
        
        // Set ERC20 token address
        console.log("Setting ERC20 token address...");
        const setTokenTx = await dailyEthRoi.chgToken(mockERC20.address);
        await setTokenTx.wait();
        console.log("ERC20 token address set");
        
        // Set token wallet address
        console.log("Setting token wallet address...");
        const setTokenWalletTx = await dailyEthRoi.chgTokenWallet(signerAddress);
        await setTokenWalletTx.wait();
        console.log("Token wallet address set");
        
        console.log("\n=== Final Summary ===");
        console.log("Old DailyEthRoi address:", oldDailyEthRoi.address);
        console.log("New DailyEthRoi address:", dailyEthRoi.address);
        console.log("MOCKERC20Token address:", mockERC20.address);
        console.log("ETHXP-TokenSale address:", ethxpTokenSale.address);
        console.log("Signer address used:", signerAddress);
        console.log("10 million tokens approved to new DailyEthRoi contract");
        console.log("TokenSale contract address set to:", ethxpTokenSale.address);
        console.log("ERC20 token address set to:", mockERC20.address);
        console.log("Token wallet address set to:", signerAddress);
        console.log("All contracts configured successfully");
        console.log('Deployment and configuration completed.')
        
    } catch (e) {
        console.log(e.message)
    }
})();
