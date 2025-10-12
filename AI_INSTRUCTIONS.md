# AI Instructions for NodeBooster Smart Contract Development

## 🤖 AI Assistant Guidelines for Blockchain Development

This document provides comprehensive instructions for AI assistants working on the NodeBooster project, ensuring consistent, secure, and efficient smart contract development practices.

## 📋 Project Context

**Project Name**: NodeBooster  
**Blockchain**: Avalanche C-Chain  
**Primary Language**: Solidity 0.8.28  
**Framework**: Hardhat  
**Architecture**: Upgradeable contracts using UUPS pattern  
**Libraries**: OpenZeppelin v5.x  

## 🎯 Core Responsibilities

### 1. Smart Contract Development
- Write secure, gas-optimized Solidity contracts
- Implement OpenZeppelin standards and best practices
- Ensure upgradeability using UUPS proxy pattern
- Follow consistent naming conventions and documentation

### 2. Security Focus
- Always prioritize security over convenience
- Implement comprehensive access controls
- Add reentrancy guards where applicable
- Validate all inputs and handle edge cases
- Follow the principle of least privilege

### 3. Gas Optimization
- Optimize storage layout and access patterns
- Use efficient data structures
- Minimize external calls
- Implement batch operations where beneficial

## 🛡️ Security Guidelines

### Access Control Patterns
```solidity
// Always use OpenZeppelin's access control
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Implement role-based access where needed
modifier onlyMinter() {
    require(minters[msg.sender], "Caller is not a minter");
    _;
}
```

### Input Validation
```solidity
// Always validate inputs
function mint(address to, uint256 amount) public onlyMinter {
    require(to != address(0), "Cannot mint to zero address");
    require(amount > 0, "Amount must be greater than zero");
    require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
    _mint(to, amount);
}
```

### Reentrancy Protection
```solidity
// Use OpenZeppelin's ReentrancyGuard
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

function withdraw(uint256 amount) external nonReentrant {
    // Implementation
}
```

## 🏗️ Architecture Patterns

### 1. Upgradeable Contracts
Always use UUPS pattern for upgradeability:

```solidity
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MyContract is UUPSUpgradeable {
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
```

### 2. Initialization Pattern
```solidity
function initialize(
    address _token,
    uint256 _rate
) public initializer {
    __Ownable_init(msg.sender);
    __ReentrancyGuard_init();
    __UUPSUpgradeable_init();
    
    token = _token;
    rate = _rate;
}
```

### 3. Emergency Controls
```solidity
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract MyContract is PausableUpgradeable {
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}
```

## 💻 Coding Standards

### 1. Naming Conventions
- **Contracts**: PascalCase (e.g., `NodeBoosterToken`)
- **Functions**: camelCase (e.g., `calculateReward`)
- **Variables**: camelCase (e.g., `totalStaked`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_SUPPLY`)
- **Events**: PascalCase (e.g., `TokensMinted`)

### 2. Documentation Requirements
```solidity
/**
 * @title NodeBoosterStaking
 * @dev Staking contract for NodeBooster ecosystem
 * @notice Users can stake tokens to earn rewards
 */
contract NodeBoosterStaking {
    /**
     * @dev Stake tokens for rewards
     * @param amount Amount of tokens to stake
     * @param lockPeriod Lock period in seconds
     */
    function stake(uint256 amount, uint256 lockPeriod) external {
        // Implementation
    }
}
```

### 3. Error Handling
```solidity
// Use descriptive error messages with contract prefix
require(amount > 0, "NodeBooster: amount must be greater than zero");
require(user != address(0), "NodeBooster: invalid user address");
```

## 🧪 Testing Requirements

### 1. Test Coverage
- **Minimum 95% code coverage**
- Test all functions, modifiers, and edge cases
- Include gas usage tests for critical functions
- Test upgrade scenarios

### 2. Test Structure
```javascript
describe("ContractName", function () {
  describe("Deployment", function () {
    // Test initial state
  });
  
  describe("Core Functionality", function () {
    // Test main features
  });
  
  describe("Access Control", function () {
    // Test permissions
  });
  
  describe("Edge Cases", function () {
    // Test error conditions
  });
});
```

### 3. Test Categories
- **Unit Tests**: Individual function testing
- **Integration Tests**: Contract interaction testing
- **Upgrade Tests**: Proxy upgrade testing
- **Gas Tests**: Gas consumption analysis

## 🌐 Avalanche-Specific Considerations

### 1. Network Configuration
```javascript
// Avalanche networks in hardhat.config.js
fuji: {
  url: "https://api.avax-test.network/ext/bc/C/rpc",
  chainId: 43113,
  accounts: [privateKey],
  gasPrice: 225000000000, // 225 gwei
  gas: 8000000
},
avalanche: {
  url: "https://api.avax.network/ext/bc/C/rpc",
  chainId: 43114,
  accounts: [privateKey],
  gasPrice: 225000000000, // 225 gwei
  gas: 8000000
}
```

### 2. Gas Optimization for Avalanche
- Target gas limit: 8,000,000
- Typical gas price: 25-50 nAVAX
- Optimize for C-Chain EVM compatibility

### 3. Verification Setup
```javascript
// Snowtrace verification
etherscan: {
  apiKey: {
    avalanche: process.env.SNOWTRACE_API_KEY,
    avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY
  },
  customChains: [
    {
      network: "avalanche",
      chainId: 43114,
      urls: {
        apiURL: "https://api.snowtrace.io/api",
        browserURL: "https://snowtrace.io/"
      }
    }
  ]
}
```

## 🚀 Deployment Procedures

### 1. Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Gas optimization complete
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Environment variables set
- [ ] Sufficient AVAX for deployment

### 2. Deployment Steps
```bash
# 1. Compile contracts
npm run compile

# 2. Run tests
npm test

# 3. Deploy to testnet first
npm run deploy:fuji

# 4. Verify on testnet
npm run verify:fuji <CONTRACT_ADDRESS>

# 5. Test on testnet
# Run integration tests

# 6. Deploy to mainnet
npm run deploy:avalanche

# 7. Verify on mainnet
npm run verify:avalanche <CONTRACT_ADDRESS>
```

### 3. Post-Deployment
- Verify contract on Snowtrace
- Update documentation with addresses
- Set up monitoring and alerts
- Perform final integration tests

## 🔍 Code Review Guidelines

### 1. Security Review Points
- [ ] Access control properly implemented
- [ ] No reentrancy vulnerabilities
- [ ] Input validation comprehensive
- [ ] Integer overflow/underflow handled
- [ ] External calls minimized and secured

### 2. Code Quality Points
- [ ] Gas optimizations applied
- [ ] Clear and consistent naming
- [ ] Comprehensive documentation
- [ ] Error messages descriptive
- [ ] Events properly emitted

### 3. Architecture Review Points
- [ ] Upgradeability correctly implemented
- [ ] Emergency controls in place
- [ ] Modular and maintainable design
- [ ] Following established patterns

## 📊 Performance Metrics

### 1. Gas Usage Targets
- **Simple transfers**: < 30,000 gas
- **Minting operations**: < 60,000 gas
- **Staking operations**: < 80,000 gas
- **Complex operations**: < 150,000 gas

### 2. Contract Size Limits
- **Maximum contract size**: 24KB
- **Target contract size**: < 20KB
- **Use libraries for shared functionality**

## 🚨 Emergency Procedures

### 1. Emergency Response
- **Pause contracts** if critical vulnerability found
- **Notify stakeholders** immediately
- **Prepare upgrade** if necessary
- **Document incident** for future reference

### 2. Upgrade Procedures
```solidity
// Emergency upgrade pattern
function emergencyUpgrade(address newImplementation) external onlyOwner {
    _authorizeUpgrade(newImplementation);
    _upgradeTo(newImplementation);
}
```

## 📚 Resource References

### Essential Documentation
- [Solidity Documentation](https://docs.soliditylang.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Avalanche Documentation](https://docs.avax.network/)
- [Hardhat Documentation](https://hardhat.org/docs)

### Security Resources
- [Consensys Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [SWC Registry](https://swcregistry.io/)
- [Slither Static Analyzer](https://github.com/crytic/slither)

### Avalanche Specific
- [Avalanche Dev Center](https://docs.avax.network/build)
- [Snowtrace Explorer](https://snowtrace.io/)
- [AVAX Faucet](https://faucet.avax.network/)

---

## 🎯 Quick Reference Commands

```bash
# Development
npm install                    # Install dependencies
npm run compile               # Compile contracts
npm test                      # Run tests
npm run clean                 # Clean artifacts

# Deployment
npm run deploy:fuji           # Deploy to Fuji testnet
npm run deploy:avalanche      # Deploy to Avalanche mainnet

# Verification
npm run verify:fuji <address>      # Verify on Fuji
npm run verify:avalanche <address> # Verify on Avalanche

# Utilities
npx hardhat help              # Show help
npx hardhat accounts          # Show accounts
npx hardhat node              # Start local node
```

**Remember**: Always test thoroughly on Fuji testnet before mainnet deployment! 🧪

---

*This document should be updated as the project evolves and new patterns emerge.*