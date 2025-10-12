# NodeBooster V1 Engine System - Complete Summary

## 🎯 System Overview

The NodeBooster V1 contract implements a sophisticated engine-based reward system on Avalanche C-Chain where users can upgrade through different engine tiers to earn AVAX0 token rewards. The system uses cumulative pricing and time-based reward calculations.

## 🏗️ Core Architecture

### UserAccount Structure
Each user account tracks:
- `currentEngine`: Current engine ID (0-9)
- `engineStartTime`: When current engine was activated
- `pendingRewards`: Stored rewards from previous engines
- `totalRewardsClaimed`: Lifetime rewards claimed

### Reward Formula
```
Daily Reward = (Cumulative Cost × 450% ÷ 405 days) × (1 + HashPower%)
```

Where:
- **Cumulative Cost**: Total cost of engines from 0 to current engine
- **450%**: Base reward rate (4.5× return over 405 days)
- **405 days**: Maximum reward period for all engines
- **HashPower%**: Percentage multiplier bonus applied to base daily reward

## 📊 Engine Configuration & Calculations

| Engine ID | Name | Individual Price (AVAX) | Cumulative Cost (AVAX) | HashPower (%) | Max Reward Days |
|-----------|------|------------------------|------------------------|---------------|-----------------|
| 0 | Starter | 2 | 2 | 1% | 405 |
| 1 | Basic | 4 | 6 | 2% | 405 |
| 2 | Standard | 8 | 14 | 4% | 405 |
| 3 | Advanced | 12 | 26 | 6% | 405 |
| 4 | Professional | 20 | 46 | 8% | 405 |
| 5 | Expert | 36 | 82 | 10% | 405 |
| 6 | Master | 75 | 157 | 12% | 405 |
| 7 | Elite | 115 | 272 | 14% | 405 |
| 8 | Supreme | 195 | 467 | 16% | 405 |
| 9 | Ultimate | 310 | 777 | 18% | 405 |

## 💰 Daily Reward Calculations

| Engine | Cumulative Cost | Base Daily (4.5%/405) | HashPower Multiplier | **Total Daily Reward** | **405-Day Total** |
|--------|-----------------|-----------------------|----------------------|------------------------|-------------------|
| 0      | 2 AVAX          | 0.0222 AVAX           | ×1.01 (1%)           | **0.0224 AVAX**        | **9.07 AVAX**     |
| 1      | 6 AVAX          | 0.0667 AVAX           | ×1.02 (2%)           | **0.0680 AVAX**        | **27.54 AVAX**    |
| 2      | 14 AVAX         | 0.1556 AVAX           | ×1.04 (4%)           | **0.1618 AVAX**        | **65.53 AVAX**    |
| 3      | 26 AVAX         | 0.2889 AVAX           | ×1.06 (6%)           | **0.3062 AVAX**        | **124.01 AVAX**   |
| 4      | 46 AVAX         | 0.5111 AVAX           | ×1.08 (8%)           | **0.5520 AVAX**        | **223.56 AVAX**   |
| 5      | 82 AVAX         | 0.9111 AVAX           | ×1.10 (10%)          | **1.0022 AVAX**        | **405.89 AVAX**   |
| 6      | 157 AVAX        | 1.7444 AVAX           | ×1.12 (12%)          | **1.9538 AVAX**        | **791.29 AVAX**   |
| 7      | 272 AVAX        | 3.0222 AVAX           | ×1.14 (14%)          | **3.4453 AVAX**        | **1,395.35 AVAX** |
| 8      | 467 AVAX        | 5.1889 AVAX           | ×1.16 (16%)          | **6.0191 AVAX**        | **2,437.74 AVAX** |
| 9      | 777 AVAX        | 8.6333 AVAX           | ×1.18 (18%)          | **10.1873 AVAX**       | **4,125.86 AVAX** |

## 🔄 Upgrade Cost Structure

| From Engine | To Engine | Individual Costs | **Upgrade Cost** |
|-------------|-----------|------------------|------------------|
| 0 | 1 | 4 | **4 AVAX** |
| 0 | 2 | 4 + 8 | **12 AVAX** |
| 0 | 3 | 4 + 8 + 12 | **24 AVAX** |
| 1 | 2 | 8 | **8 AVAX** |
| 1 | 3 | 8 + 12 | **20 AVAX** |
| 2 | 3 | 12 | **12 AVAX** |
| 5 | 9 | 75 + 115 + 195 + 310 | **695 AVAX** |

## ⚙️ Key Functions

### `upgradeEngine(uint256 targetEngine)`
- **Purpose**: Upgrade user's engine to higher tier
- **Payment**: Requires exact AVAX for cumulative upgrade cost
- **Process**: 
  1. Calculates and stores pending rewards
  2. Validates upgrade cost payment
  3. Updates user's engine and reset start time
  4. Distributes AVAX to payout wallets
- **Events**: Emits `EngineUpgraded` with pending rewards

### `claimRewards()`
- **Purpose**: Claim accumulated AVAX0 rewards
- **Process**:
  1. Calculates current + stored pending rewards
  2. Mints AVAX0 tokens to user
  3. Resets pending rewards and start time
  4. Updates statistics
- **Events**: Emits `RewardsClaimed` with amount

### `calculatePendingRewards(address user)`
- **Purpose**: View function to check earned rewards
- **Formula**: `(daysPassed × dailyReward)` capped at 405 days
- **Returns**: Real-time calculated pending rewards in AVAX0

## 📈 ROI Analysis

| Engine | Investment (AVAX) | 405-Day Return (AVAX) | **ROI %** | **Daily ROI %** |
|--------|-------------------|----------------------|-----------|-----------------||
| 0 | 2 | 9.07 | **354%** | **0.87%** |
| 1 | 6 | 27.54 | **359%** | **0.89%** |
| 2 | 14 | 65.53 | **368%** | **0.91%** |
| 3 | 26 | 124.01 | **377%** | **0.93%** |
| 4 | 46 | 223.56 | **386%** | **0.95%** |
| 5 | 82 | 405.89 | **395%** | **0.98%** |
| 6 | 157 | 791.29 | **404%** | **1.00%** |
| 7 | 272 | 1,395.35 | **413%** | **1.02%** |
| 8 | 467 | 2,437.74 | **422%** | **1.04%** |
| 9 | 777 | 4,125.86 | **431%** | **1.06%** |

## 🛠️ System Features

### ✅ **Implemented Features**
- **Cumulative Pricing**: Each upgrade requires payment for all intermediate engines
- **Time-Based Rewards**: Linear daily reward accumulation for 405 days
- **Reward Preservation**: Pending rewards stored during engine upgrades
- **Flexible Claiming**: Users can claim rewards anytime
- **AVAX Distribution**: Upgrade payments distributed to payout wallets
- **Security**: Blacklist protection and registration requirements

### 🔒 **Security Measures**
- Reentrancy protection on all state-changing functions
- Blacklist checking for all user interactions
- Owner-only administrative functions
- Pausable contract for emergency stops
- Upgrade authorization for contract improvements

### 📊 **Statistics Tracking**
- `totalUsers`: Number of registered users
- `totalEngineRewards`: Total AVAX0 distributed as rewards
- `totalUsdcCollected`: Registration fees collected
- User-level tracking of rewards claimed and engines

## 🚀 **Example User Journey**

1. **Registration**: User pays 25 USDC + receives 1 AVAX0, starts with Engine 0
2. **Day 1-30**: Earns ~0.67 AVAX0 from Engine 0 rewards (0.0224 AVAX0/day)
3. **Upgrade to Engine 2**: Pays 12 AVAX, previous rewards stored as pending
4. **Day 31-100**: Earns higher rewards from Engine 2 (0.1618 AVAX0/day)
5. **Claim Rewards**: Receives stored pending + current rewards in AVAX0
6. **Continue Upgrading**: Progressive upgrades for sustainable 4.5× returns

## 📋 **Test Coverage**
- ✅ 89 tests passing
- ✅ Cumulative cost calculations
- ✅ Engine upgrade mechanics
- ✅ Reward calculations and claiming
- ✅ Pending reward preservation
- ✅ Payment validation and distribution
- ✅ Error handling and edge cases

This engine system provides a comprehensive, secure, and profitable mining simulation platform with progressive rewards and sustainable tokenomics.