const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("\\n=== Avax0TokenV2 Scripts Validation ===\\n");
    
    let allPassed = true;
    const results = [];
    
    try {
        // Test 1: Compile contracts
        console.log("1. Testing contract compilation...");
        try {
            await hre.run("compile");
            results.push({ test: "Contract compilation", status: "✅ PASS" });
        } catch (error) {
            results.push({ test: "Contract compilation", status: "❌ FAIL", error: error.message });
            allPassed = false;
        }
        
        // Test 2: Run test suite
        console.log("2. Running test suite...");
        try {
            const testResult = await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                const test = spawn('npx', ['hardhat', 'test', 'test/Avax0TokenV2.test.js'], {
                    stdio: 'pipe'
                });
                
                let output = '';
                test.stdout.on('data', (data) => output += data.toString());
                test.stderr.on('data', (data) => output += data.toString());
                
                test.on('close', (code) => {
                    if (code === 0) resolve(output);
                    else reject(new Error(output));
                });
            });
            
            const passCount = (testResult.match(/passing/g) || []).length;
            const failCount = (testResult.match(/failing/g) || []).length;
            
            if (failCount > 0) {
                results.push({ test: "Test suite execution", status: "❌ FAIL", error: `${failCount} tests failing` });
                allPassed = false;
            } else {
                results.push({ test: "Test suite execution", status: "✅ PASS", note: `${passCount > 0 ? 'Tests passed' : 'Completed'}` });
            }
        } catch (error) {
            results.push({ test: "Test suite execution", status: "❌ FAIL", error: error.message.substring(0, 100) });
            allPassed = false;
        }
        
        // Test 3: Validate deployment script
        console.log("3. Validating deployment script...");
        try {
            const deployScript = require('./deploy-avax0-v2-timelock.js');
            if (typeof deployScript === 'function') {
                results.push({ test: "Deployment script structure", status: "✅ PASS" });
            } else {
                results.push({ test: "Deployment script structure", status: "❌ FAIL", error: "Script doesn't export function" });
                allPassed = false;
            }
        } catch (error) {
            results.push({ test: "Deployment script structure", status: "❌ FAIL", error: error.message });
            allPassed = false;
        }
        
        // Test 4: Validate upgrade script
        console.log("4. Validating upgrade script...");
        try {
            const upgradeScript = require('./upgrade-avax0-v1-to-v2-timelock.js');
            if (typeof upgradeScript === 'function') {
                results.push({ test: "Upgrade script structure", status: "✅ PASS" });
            } else {
                results.push({ test: "Upgrade script structure", status: "❌ FAIL", error: "Script doesn't export function" });
                allPassed = false;
            }
        } catch (error) {
            results.push({ test: "Upgrade script structure", status: "❌ FAIL", error: error.message });
            allPassed = false;
        }
        
        // Test 5: Check contract factories
        console.log("5. Checking contract factories...");
        try {
            const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
            const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
            results.push({ test: "Contract factories available", status: "✅ PASS" });
        } catch (error) {
            results.push({ test: "Contract factories available", status: "❌ FAIL", error: error.message });
            allPassed = false;
        }
        
        // Test 6: Quick deployment test
        console.log("6. Testing quick deployment...");
        try {
            const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
            const token = await upgrades.deployProxy(
                Avax0TokenV2,
                ["TestToken", "TEST", ethers.parseEther("1000")],
                { initializer: "initialize", kind: "uups" }
            );
            await token.waitForDeployment();
            
            // Quick functionality test
            const name = await token.name();
            const version = await token.version();
            const lockCount = await token.getTimeLockCount(await token.owner());
            
            if (name === "TestToken" && version === "2.0.0" && lockCount === 0n) {
                results.push({ test: "Quick deployment test", status: "✅ PASS" });
            } else {
                results.push({ test: "Quick deployment test", status: "❌ FAIL", error: "Contract state incorrect" });
                allPassed = false;
            }
        } catch (error) {
            results.push({ test: "Quick deployment test", status: "❌ FAIL", error: error.message });
            allPassed = false;
        }
        
        // Test 7: Documentation files
        console.log("7. Checking documentation...");
        try {
            const fs = require('fs');
            const path = require('path');
            
            const docsPath = path.join(__dirname, '..', 'docs', 'AVAX0TOKENV2_SCRIPTS_GUIDE.md');
            if (fs.existsSync(docsPath)) {
                const content = fs.readFileSync(docsPath, 'utf8');
                if (content.includes('Avax0TokenV2') && content.includes('Time Lock')) {
                    results.push({ test: "Documentation available", status: "✅ PASS" });
                } else {
                    results.push({ test: "Documentation available", status: "❌ FAIL", error: "Documentation incomplete" });
                    allPassed = false;
                }
            } else {
                results.push({ test: "Documentation available", status: "❌ FAIL", error: "Documentation file missing" });
                allPassed = false;
            }
        } catch (error) {
            results.push({ test: "Documentation available", status: "❌ FAIL", error: error.message });
            allPassed = false;
        }
        
    } catch (error) {
        console.error("Validation failed with error:", error.message);
        allPassed = false;
    }
    
    // Print results
    console.log("\\n=== Validation Results ===");
    results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.status} ${result.test}`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
        if (result.note) {
            console.log(`   Note: ${result.note}`);
        }
    });
    
    console.log("\\n=== Summary ===");
    const passCount = results.filter(r => r.status.includes('✅')).length;
    const failCount = results.filter(r => r.status.includes('❌')).length;
    
    console.log(`Tests Passed: ${passCount}`);
    console.log(`Tests Failed: ${failCount}`);
    console.log(`Overall Status: ${allPassed ? '🎉 ALL SYSTEMS GO!' : '⚠️  ISSUES DETECTED'}`);
    
    if (allPassed) {
        console.log("\\n✨ Avax0TokenV2 scripts are ready for use!");
        console.log("\\n📋 Available scripts:");
        console.log("   • test/Avax0TokenV2.test.js - Comprehensive test suite");
        console.log("   • scripts/deploy-avax0-v2-timelock.js - Fresh deployment");
        console.log("   • scripts/upgrade-avax0-v1-to-v2-timelock.js - V1 to V2 upgrade");
        console.log("   • docs/AVAX0TOKENV2_SCRIPTS_GUIDE.md - Complete documentation");
    } else {
        console.log("\\n🔧 Please fix the issues above before proceeding.");
    }
    
    return {
        passed: allPassed,
        results: results,
        summary: { passed: passCount, failed: failCount }
    };
}

// Execute validation
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;