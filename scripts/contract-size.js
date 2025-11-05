const fs = require('fs');
const path = require('path');

function getContractSize(contractName) {
    try {
        const artifactsPath = path.join(__dirname, '..', 'artifacts', 'contracts');
        const contractPath = path.join(artifactsPath, `${contractName}.sol`, `${contractName}.json`);
        
        if (!fs.existsSync(contractPath)) {
            console.log(`Contract artifact not found: ${contractPath}`);
            return null;
        }
        
        const artifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        const bytecode = artifact.bytecode;
        
        // Remove 0x prefix and calculate size
        const bytecodeSize = (bytecode.length - 2) / 2;
        const maxSize = 24576; // 24KB limit
        const percentage = (bytecodeSize / maxSize * 100).toFixed(2);
        
        return {
            name: contractName,
            size: bytecodeSize,
            maxSize: maxSize,
            percentage: percentage,
            isOverLimit: bytecodeSize > maxSize
        };
    } catch (error) {
        console.error(`Error checking size for ${contractName}:`, error.message);
        return null;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
    console.log('\n📏 Contract Size Analysis');
    console.log('========================\n');
    
    const contracts = [
        'NodeBoosterV1',
        'NodeBoosterV2',
        'Avax0TokenV1',
        'Avax0TokenV2',
        'Node0TokenV1',
        'Node0TokenV2',
        'MockERC20',
        'NodeBoosterReferralHelper',
        'NodeBoosterStaking'
    ];
    
    const results = [];
    
    for (const contractName of contracts) {
        const result = getContractSize(contractName);
        if (result) {
            results.push(result);
        }
    }
    
    // Sort by size (largest first)
    results.sort((a, b) => b.size - a.size);
    
    console.log('Contract                     | Size      | Max Size  | Usage    | Status');
    console.log('-------------------------------|-----------|-----------|----------|----------');
    
    for (const result of results) {
        const status = result.isOverLimit ? '❌ OVER LIMIT' : '✅ OK';
        const sizeFormatted = result.size.toLocaleString().padStart(7);
        const maxSizeFormatted = result.maxSize.toLocaleString().padStart(7);
        const percentageFormatted = (result.percentage + '%').padStart(6);
        
        console.log(
            `${result.name.padEnd(30)} | ${sizeFormatted} | ${maxSizeFormatted} | ${percentageFormatted} | ${status}`
        );
    }
    
    console.log('\n📊 Summary:');
    console.log(`Total contracts analyzed: ${results.length}`);
    console.log(`Contracts over limit: ${results.filter(r => r.isOverLimit).length}`);
    console.log(`Contract size limit: ${formatBytes(24576)} (24,576 bytes)`);
    
    // Show the largest contract details
    if (results.length > 0) {
        const largest = results[0];
        console.log(`\n🏆 Largest contract: ${largest.name}`);
        console.log(`   Size: ${formatBytes(largest.size)} (${largest.size.toLocaleString()} bytes)`);
        console.log(`   Usage: ${largest.percentage}% of limit`);
        console.log(`   Remaining space: ${formatBytes(largest.maxSize - largest.size)}`);
        
        if (largest.isOverLimit) {
            console.log(`   ⚠️  OVER LIMIT by ${formatBytes(largest.size - largest.maxSize)}`);
        }
    }
    
    console.log('\n💡 Tips to reduce contract size:');
    console.log('   • Use shorter variable names (already optimized in your contract)');
    console.log('   • Remove unused functions');
    console.log('   • Use libraries for common functionality');
    console.log('   • Consider splitting large contracts');
    console.log('   • Optimize string literals');
    console.log('   • Use packed structs where possible');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });