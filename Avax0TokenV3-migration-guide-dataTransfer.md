# Player Deposits Migration Scripts

This collection of scripts helps you migrate player deposits data to your DailyEthRo### 5. Execute the Migration (Direct)

Once you're confident, run the actual migration directly:ontract using efficient multicall batching with advanced features like batch file generation for external execution.

## Overview

The migration system consists of four main scripts:

1. **`migrate_player_deposits_multicall.js`** - Basic multicall migration script
2. **`migrate_player_deposits_advanced.js`** - Advanced migration with features like dry-run, fallback, network support, and batch file generation
3. **`execute_batch_files.js`** - Execute pre-generated batch files
4. **`analyze_deposits.js`** - Utility to analyze and preview migration data

## Features

- ✅ Multicall batching (20 calls per transaction)
- ✅ Automatic fallback to individual calls if multicall fails
- ✅ Dry run mode for testing
- ✅ **Batch file generation for external execution**
- ✅ **Selective batch execution by range**
- ✅ Gas estimation and optimization
- ✅ Progress tracking and detailed logging
- ✅ Support for multiple networks
- ✅ Data validation and error handling

## Prerequisites

1. Make sure your contract addresses are configured in the scripts
2. Ensure you have the appropriate private key in `.secrets.json`
3. Verify the data files exist in the `migration_arrays/` directory

## Setup

1. **Configure Contract Addresses**

   Edit the `CONTRACT_ADDRESSES` object in `migrate_player_deposits_advanced.js`:

   ```javascript
   CONTRACT_ADDRESSES: {
       "polygonmainnet": "0xYourContractAddress",
       "bscmainnet": "0xYourContractAddress",
       "mainnet": "0xYourContractAddress",
       "optimism": "0xYourContractAddress"
   }
   ```

2. **Verify Data Files**

   The script will automatically select the correct data file based on network:
   - Polygon: `polygon-2025-05-31_12-09-11-playerDeposits.json`
   - BSC: `bsc-2025-05-31_13-03-27-playerDeposits.json`
   - Ethereum: `ethereumplayerDeposits.json`
   - Optimism: `optimism-2025-05-31_11-58-31-playerDeposits.json`

## Usage

### 1. Analyze Your Data First

Before running the migration, analyze your data to understand what you're working with:

```bash
# Analyze all available data files
node scripts/analyze_deposits.js all

# Analyze specific file
node scripts/analyze_deposits.js analyze polygon-2025-05-31_12-09-11-playerDeposits.json

# Preview first 5 batches
node scripts/analyze_deposits.js preview polygon-2025-05-31_12-09-11-playerDeposits.json
```

### 2. Test with Dry Run

Always test first with a dry run to verify everything works:

```bash
# Dry run on polygon
DRY_RUN=true npx hardhat run scripts/migrate_player_deposits_advanced.js --network polygonmainnet

# Dry run on BSC
DRY_RUN=true npx hardhat run scripts/migrate_player_deposits_advanced.js --network bscmainnet
```

### 3. Generate Batch Files Only

Generate batch files without executing them for later use or external tools:

```bash
# Generate batch files for polygon (dry run + generate files)
DRY_RUN=true GENERATE_BATCH_FILES=true npx hardhat run scripts/migrate_player_deposits_advanced.js --network polygonmainnet

# Generate batch files for BSC
DRY_RUN=true GENERATE_BATCH_FILES=true npx hardhat run scripts/migrate_player_deposits_advanced.js --network bscmainnet
```

This creates batch files in `generated_batches/<network>-<date>/` containing:
- Individual batch files with multicall data
- Summary file with metadata
- Ready-to-use encoded function calls

### 4. Execute Pre-Generated Batch Files

Execute previously generated batch files:

```bash
# Execute all batch files for polygon
npx hardhat run scripts/execute_batch_files.js --network polygonmainnet

# Execute specific batch range (batches 1-5)
BATCH_RANGE="1-5" npx hardhat run scripts/execute_batch_files.js --network polygonmainnet

# Execute single batch (batch 3)
BATCH_RANGE="3" npx hardhat run scripts/execute_batch_files.js --network polygonmainnet

# Dry run execution
DRY_RUN=true npx hardhat run scripts/execute_batch_files.js --network polygonmainnet

# Use specific batch directory
BATCH_DIR="/path/to/generated_batches/polygon-2025-06-04" npx hardhat run scripts/execute_batch_files.js --network polygonmainnet
```

### 5. Execute the Migration

Once you're confident, run the actual migration:

```bash
# Migrate on polygon mainnet
npx hardhat run scripts/migrate_player_deposits_advanced.js --network polygonmainnet

# Migrate on BSC mainnet
npx hardhat run scripts/migrate_player_deposits_advanced.js --network bscmainnet

# Migrate on Ethereum mainnet
npx hardhat run scripts/migrate_player_deposits_advanced.js --network mainnet

# Migrate on Optimism
npx hardhat run scripts/migrate_player_deposits_advanced.js --network optimism
```

## Configuration Options

You can customize the migration behavior by modifying the `CONFIG` object in `migrate_player_deposits_advanced.js`:

```javascript
const CONFIG = {
    BATCH_SIZE: 20,                    // Number of calls per multicall
    DRY_RUN: process.env.DRY_RUN === "true",  // Enable dry run mode
    GENERATE_BATCH_FILES: process.env.GENERATE_BATCH_FILES === "true", // Generate batch files
    GAS_BUFFER_PERCENT: 10,            // Gas estimation buffer (10%)
    BATCH_DELAY_MS: 2000,              // Delay between batches (2 seconds)
    // ... contract addresses and data files
};
```

### Environment Variables

#### For `migrate_player_deposits_advanced.js`:
- **`DRY_RUN`**: Set to `"true"` to simulate without executing transactions
- **`GENERATE_BATCH_FILES`**: Set to `"true"` to create batch files for later execution

#### For `execute_batch_files.js`:
- **`DRY_RUN`**: Set to `"true"` to simulate batch file execution
- **`BATCH_DIR`**: Specify custom batch directory (auto-detects latest if not set)
- **`BATCH_RANGE`**: Execute specific batch range (e.g., `"1-5"` or `"3"`)
- **`GAS_BUFFER_PERCENT`**: Gas estimation buffer percentage (default: 10)

## Script Features

### Advanced Migration Script Features

- **Multicall Batching**: Groups 20 `addPlayerDeposits` calls into a single transaction
- **Automatic Fallback**: If multicall fails, automatically falls back to individual calls
- **Gas Optimization**: Estimates gas and adds a 10% buffer for safety
- **Data Validation**: Validates deposit data before processing
- **Progress Tracking**: Shows detailed progress and batch information
- **Error Recovery**: Continues processing even if some batches fail
- **Network Support**: Automatically selects correct contract and data for each network

### Error Handling

The script includes comprehensive error handling:

1. **Batch-level errors**: If a multicall batch fails, it falls back to individual calls
2. **Individual call errors**: Logs failed individual calls but continues with others
3. **Data validation**: Skips invalid player data (mismatched arrays, empty deposits)
4. **Network validation**: Ensures contract address is configured for the target network

## Monitoring and Logs

The script provides detailed logging:

```
🚀 Starting player deposits migration script...
Network: polygonmainnet
Batch size: 20
Dry run: NO
Contract address: 0x...
Loading player deposits data from: .../polygon-2025-05-31_12-09-11-playerDeposits.json
Found 1234 players with deposits

📦 Processing 1234 players in 62 batches

Processing batch 1/62 (20 players)
  - 0x123...: 5 deposits
  - 0x456...: 3 deposits
  ...
  Estimating gas for 20 calls...
  Estimated gas: 2500000
  Executing multicall...
  Transaction hash: 0xabc...
  ✅ Batch 1 completed! Gas used: 2300000

...

📊 MIGRATION SUMMARY
============================================================
Network: polygonmainnet
Total players processed: 1234
Total batches: 62
Successful batches: 62
Failed batches: 0
Total gas used: 142500000
🎉 All batches completed successfully!
```

## Safety Recommendations

1. **Always test with dry run first**
2. **Start with testnet deployment**
3. **Verify contract ownership before running**
4. **Monitor gas prices and adjust buffer if needed**
5. **Keep transaction hashes for verification**
6. **Consider running in smaller batches during high network congestion**

## Troubleshooting

### Common Issues

1. **"Contract address not configured"**
   - Update the `CONTRACT_ADDRESSES` object with your deployed contract address

2. **"Deployer is not the contract owner"**
   - Ensure you're using the correct private key that owns the contract

3. **"Data file not found"**
   - Verify the data file exists in the `migration_arrays/` directory
   - Check the file name matches the `DATA_FILES` configuration

4. **Gas estimation failures**
   - Network congestion may cause gas estimation to fail
   - Try increasing the `GAS_BUFFER_PERCENT`

5. **Multicall failures**
   - The script automatically falls back to individual calls
   - Check individual error messages for specific issues

## Gas Optimization Tips

- Run during low network congestion periods
- Consider adjusting `BATCH_SIZE` based on network conditions
- Monitor gas prices and adjust buffer accordingly
- Use testnets for initial testing to avoid mainnet gas costs

## Security Notes

- Scripts require contract owner privileges
- Always verify contract addresses before running
- Test thoroughly on testnets before mainnet deployment
- Keep your private keys secure and never commit them to version control

## Batch File Structure

When `GENERATE_BATCH_FILES=true` is used, the script creates structured batch files that can be used for external execution or manual processing:

### Generated Directory Structure
```
generated_batches/
└── polygonmainnet-2025-06-04/
    ├── batch_001_multicall.json
    ├── batch_002_multicall.json
    ├── ...
    └── batch_summary.json
```

### Batch File Format
Each batch file (`batch_XXX_multicall.json`) contains:

```json
{
  "batchNumber": 1,
  "totalBatches": 25,
  "network": "polygonmainnet",
  "timestamp": "2025-06-04T10:30:00.000Z",
  "contractAddress": "0xD90B67C0084B15Ae5B22FE783c43c7916e65f9aa",
  "playerCount": 20,
  "calls": [
    {
      "playerAddress": "0x123...",
      "deposits": 5,
      "amounts": ["1000000000000000000", "..."],
      "timestamps": ["1644889779", "..."],
      "encodedCall": "0xabcdef..."
    }
  ],
  "multicallData": [
    "0xabcdef...", // Encoded function calls ready for multicall
    "0x123456..."
  ]
}
```

### Summary File Format
The summary file (`batch_summary.json`) contains:

```json
{
  "network": "polygonmainnet",
  "timestamp": "2025-06-04T10:30:00.000Z",
  "totalPlayers": 500,
  "totalBatches": 25,
  "batchSize": 20,
  "contractAddress": "0xD90B67C0084B15Ae5B22FE783c43c7916e65f9aa",
  "batchFiles": ["batch_001_multicall.json", "..."],
  "usage": {
    "description": "Use these batch files to execute multicalls manually or with external tools",
    "exampleHardhatCall": "await contract.multicall(batchData.multicallData)",
    "gasEstimation": "Estimate gas before execution: await contract.estimateGas.multicall(batchData.multicallData)"
  }
}
```
