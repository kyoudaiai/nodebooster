# Script & Documentation Naming Convention

## 📋 File Naming Standard

All scripts and documentation should follow this naming pattern:
```
{ContractName}-{type}-{purpose}-{featureIdentifier}.{ext}
```

### Script Examples:

#### Upgrade Scripts:
- `Avax0TokenV3-upgrade-fuji-structInitializationFix.js` - Fixes struct initialization bug
- `Avax0TokenV3-upgrade-fuji-autoReleasedLockCleanup.js` - Adds auto cleanup and modify lock features

#### Test Scripts:
- `Avax0TokenV3-test-localhost-modifyLockFunctionality.js` - Tests modify lock features
- `Avax0TokenV3-test-localhost-autoCleanupSystem.js` - Tests auto cleanup system

#### Deployment Scripts:
- `Avax0TokenV3-deploy-fuji-initialDeployment.js` - Initial contract deployment
- `Avax0TokenV3-deploy-mainnet-productionRelease.js` - Production deployment

### Documentation Examples:

#### Feature Documentation:
- `Avax0TokenV3-feature-complete-autoReleasedLockCleanup.md` - Auto cleanup feature documentation
- `Avax0TokenV3-feature-complete-modifyLockFunctionality.md` - Modify lock feature documentation

#### Upgrade Guides:
- `Avax0TokenV3-upgrade-guide-autoReleasedLockCleanup.md` - V3.0.3 upgrade guide
- `Avax0TokenV3-upgrade-guide-structInitializationFix.md` - Struct fix upgrade guide

#### Technical Documentation:
- `Avax0TokenV3-documentation-scriptNamingConvention.md` - This file
- `Avax0TokenV3-documentation-apiReference.md` - API reference
- `Avax0TokenV3-documentation-deploymentGuide.md` - Deployment guide

### Pattern Breakdown:

1. **{ContractName}**: The main contract (e.g., `Avax0TokenV3`)
2. **{type}**: File category (e.g., `upgrade`, `deploy`, `test`, `feature`, `documentation`)
3. **{purpose}**: What the file does or network target (e.g., `fuji`, `complete`, `guide`)
4. **{featureIdentifier}**: Specific feature or purpose (e.g., `autoReleasedLockCleanup`, `structInitializationFix`)

### Benefits:

- **Clear Purpose**: Immediately understand what the file contains
- **Easy Organization**: Group files by contract and type
- **Version Tracking**: Feature identifiers help track content
- **Consistency**: Same pattern for scripts and documentation

### Current Files:

#### Scripts:
✅ `Avax0TokenV3-upgrade-fuji-structInitializationFix.js` - V3 struct bug fix
✅ `Avax0TokenV3-upgrade-fuji-autoReleasedLockCleanup.js` - V3.0.3 auto cleanup features

#### Documentation:
✅ `Avax0TokenV3-feature-complete-autoReleasedLockCleanup.md` - Auto cleanup feature summary
✅ `Avax0TokenV3-feature-complete-modifyLockFunctionality.md` - Modify lock feature summary  
✅ `Avax0TokenV3-upgrade-guide-autoReleasedLockCleanup.md` - V3.0.3 upgrade guide
✅ `Avax0TokenV3-documentation-scriptNamingConvention.md` - This naming convention guide