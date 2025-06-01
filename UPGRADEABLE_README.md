# Upgradeable Contracts Guide

This guide explains how to deploy and upgrade the DailyEthRoiV1 contract using OpenZeppelin's upgradeable contracts pattern.

## Prerequisites

Make sure you have the required dependencies installed:

```bash
npm install @openzeppelin/contracts-upgradeable @openzeppelin/hardhat-upgrades
```

## Contract Overview

The upgradeable version of the DailyEthRoiV1 contract has been created with the following changes:

1. Inherits from Initializable, ReentrancyGuardUpgradeable, ContextUpgradeable, and OwnableUpgradeable
2. Uses initialize() function instead of a constructor
3. State variables are initialized in the initialize() function
4. Uses __ReentrancyGuard_init(), __Context_init(), and __Ownable_init() in initialize()

## Deployment Process

### 1. Deploy the Upgradeable Contracts

Use the `deploy_dailyethroiv1_upgradeable.js` script to deploy both the DepositNFTUpgradeable and DailyEthRoiV1Upgradeable contracts:

```bash
npx hardhat run scripts/deploy_dailyethroiv1_upgradeable.js --network <network_name>
```

This will:
- Deploy a proxy, an implementation contract, and a ProxyAdmin contract for each of the upgradeable contracts
- Initialize the contracts with the provided parameters
- Link the DepositNFT to the DailyEthRoi contract

### 2. Verify Contract Addresses

After deploying, you'll get the addresses for:
- The DepositNFTUpgradeable proxy contract
- The DailyEthRoiV1Upgradeable proxy contract

Save these addresses as they're needed for future upgrades and interactions.

## Upgrading the Contract

If you need to upgrade the implementation of either contract while keeping all state:

1. Make changes to the contract code (e.g., add new functions or fix bugs)
2. Use the upgrade script with the proxy address:

```bash
# Set the environment variable for the proxy address
export PROXY_ADDRESS=<deployed_proxy_address>

# Or pass it as an argument
npx hardhat run scripts/upgrade_dailyethroiv1.js --network <network_name> <proxy_address>
```

The upgrade script will:
- Deploy a new implementation contract
- Update the proxy to point to the new implementation
- Keep all contract state (balances, users, deposits, etc.)

## Testing

Run the test suite to verify the contracts work as expected:

```bash
npx hardhat test test/DailyEthRoiV1Upgradeable.test.js
```

## Important Notes

1. Always use the proxy address for interactions after deployment
2. Never directly call the implementation contract
3. Always test upgrades thoroughly on a testnet before deploying to mainnet
4. The upgradeable contracts allow you to fix bugs or add features without losing state

## Contract Addresses

| Contract | Network | Proxy Address | Implementation Address |
|----------|---------|---------------|------------------------|
| DailyEthRoiV1Upgradeable | Mainnet | TBD | TBD |
| DepositNFTUpgradeable | Mainnet | TBD | TBD |
