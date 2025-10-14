// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title EngineLibrary
 * @dev Library for engine-related calculations and management
 */
library EngineLibrary {
    
    struct UserAccount {
        bool isRegistered;
        address referrer;
        uint256 totalReferrals;
        uint256 totalReferralRewards;
        uint256 currentEngine;
        uint256 engineStartTime;
        uint256 lastClaimTime;
        mapping(uint256 => uint256) totalDaysRewarded;
        mapping(uint256 => uint256) totalRewardsClaimedPerEngine;
        uint256 totalRewardsClaimed;
    }

    struct Engine {
        bool isActive;
        uint256 priceInAvax;
        uint256 hashPower;
        uint256 maxRewardCapDays;
        uint256 maxRewardCapPercentage;
        uint256 maxReferralLevels;
        string name;
    }

    struct Rewards {
        uint256 amount;
        uint256 engineId;
        uint256 timestamp;
        uint256 daysClaimed;
    }

    /**
     * @dev Calculate upgrade cost from current engine to target engine
     */
    function calculateUpgradeCost(
        mapping(uint256 => Engine) storage engines,
        uint256 currentEngine,
        uint256 targetEngine
    ) external view returns (uint256) {
        require(targetEngine > currentEngine, "Invalid upgrade");
        
        uint256 totalCost = 0;
        for (uint256 i = currentEngine + 1; i <= targetEngine; i++) {
            require(engines[i].isActive, "Engine not active");
            totalCost += engines[i].priceInAvax;
        }
        return totalCost;
    }

    /**
     * @dev Get cumulative cost up to specific engine
     */
    function getCumulativeCost(
        mapping(uint256 => Engine) storage engines,
        uint256 engineId
    ) external view returns (uint256) {
        uint256 totalCost = 0;
        for (uint256 i = 1; i <= engineId; i++) {
            if (engines[i].isActive) {
                totalCost += engines[i].priceInAvax;
            }
        }
        return totalCost;
    }

    /**
     * @dev Calculate pending rewards for a user
     */
    function calculatePendingRewards(
        mapping(uint256 => Engine) storage engines,
        UserAccount storage userAccount
    ) external view returns (uint256) {
        if (userAccount.currentEngine == 0 || userAccount.engineStartTime == 0) {
            return 0;
        }

        Engine storage engine = engines[userAccount.currentEngine];
        if (!engine.isActive) return 0;

        uint256 daysSinceStart = (block.timestamp - userAccount.engineStartTime) / 1 days;
        uint256 totalDaysRewarded = userAccount.totalDaysRewarded[userAccount.currentEngine];

        if (daysSinceStart <= totalDaysRewarded) {
            return 0;
        }

        uint256 newDaysToReward = daysSinceStart - totalDaysRewarded;
        if (newDaysToReward > engine.maxRewardCapDays) {
            newDaysToReward = engine.maxRewardCapDays - totalDaysRewarded;
        }

        if (newDaysToReward == 0) return 0;

        uint256 dailyReward = (engine.priceInAvax * engine.hashPower) / 10000;
        uint256 pendingReward = dailyReward * newDaysToReward;

        uint256 maxRewardForEngine = (engine.priceInAvax * engine.maxRewardCapPercentage) / 100;
        uint256 totalRewardsClaimed = userAccount.totalRewardsClaimedPerEngine[userAccount.currentEngine];
        
        if (totalRewardsClaimed + pendingReward > maxRewardForEngine) {
            if (totalRewardsClaimed >= maxRewardForEngine) {
                return 0;
            }
            pendingReward = maxRewardForEngine - totalRewardsClaimed;
        }

        return pendingReward;
    }

    /**
     * @dev Get user engine cap status
     */
    function getUserEngineCapStatus(
        mapping(uint256 => Engine) storage engines,
        UserAccount storage userAccount,
        uint256 engineId
    ) external view returns (
        uint256 maxRewardCap,
        uint256 totalClaimed,
        uint256 remainingRewards,
        bool capReached,
        uint256 capPercentage
    ) {
        Engine storage engine = engines[engineId];
        maxRewardCap = (engine.priceInAvax * engine.maxRewardCapPercentage) / 100;
        totalClaimed = userAccount.totalRewardsClaimedPerEngine[engineId];
        capPercentage = engine.maxRewardCapPercentage;
        
        if (totalClaimed >= maxRewardCap) {
            remainingRewards = 0;
            capReached = true;
        } else {
            remainingRewards = maxRewardCap - totalClaimed;
            capReached = false;
        }
    }

    /**
     * @dev Check if rewards can be claimed for current engine
     */
    function canClaimRewards(
        mapping(uint256 => Engine) storage engines,
        UserAccount storage userAccount
    ) external view returns (bool) {
        if (userAccount.currentEngine == 0) return false;
        
        Engine storage engine = engines[userAccount.currentEngine];
        if (!engine.isActive) return false;

        uint256 daysSinceStart = (block.timestamp - userAccount.engineStartTime) / 1 days;
        uint256 totalDaysRewarded = userAccount.totalDaysRewarded[userAccount.currentEngine];
        
        if (daysSinceStart <= totalDaysRewarded) return false;

        uint256 maxRewardForEngine = (engine.priceInAvax * engine.maxRewardCapPercentage) / 100;
        uint256 totalRewardsClaimed = userAccount.totalRewardsClaimedPerEngine[userAccount.currentEngine];
        
        return totalRewardsClaimed < maxRewardForEngine;
    }
}