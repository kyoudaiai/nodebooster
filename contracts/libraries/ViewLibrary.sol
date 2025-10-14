// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title ViewLibrary  
 * @dev Library for view functions and data retrieval
 */
library ViewLibrary {

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

    /**
     * @dev Get user account information
     */
    function getUserAccountInfo(
        UserAccount storage userAccount
    ) external view returns (
        bool isRegistered,
        address referrer,
        uint256 totalReferrals,
        uint256 totalReferralRewards,
        uint256 currentEngine,
        uint256 engineStartTime,
        uint256 lastClaimTime,
        uint256 totalRewardsClaimed
    ) {
        return (
            userAccount.isRegistered,
            userAccount.referrer,
            userAccount.totalReferrals,
            userAccount.totalReferralRewards,
            userAccount.currentEngine,
            userAccount.engineStartTime,
            userAccount.lastClaimTime,
            userAccount.totalRewardsClaimed
        );
    }

    /**
     * @dev Get users with pagination
     */
    function getUsers(
        address[] storage usersList,
        uint256 _start,
        uint256 _limit
    ) external view returns (address[] memory) {
        require(_start < usersList.length, "Start index out of bounds");
        
        uint256 end = _start + _limit;
        if (end > usersList.length) {
            end = usersList.length;
        }
        
        address[] memory result = new address[](end - _start);
        for (uint256 i = _start; i < end; i++) {
            result[i - _start] = usersList[i];
        }
        
        return result;
    }

    /**
     * @dev Get contract statistics
     */
    function getContractStats(
        uint256 totalUsers,
        uint256 totalUsdcCollected,
        uint256 totalAvax0Distributed,
        uint256 totalEngineRewards,
        uint256 totalReferralRewards,
        uint256 totalEngineReferralCommissions
    ) external pure returns (
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        uint256
    ) {
        return (
            totalUsers,
            totalUsdcCollected,
            totalAvax0Distributed,
            totalEngineRewards,
            totalReferralRewards,
            totalEngineReferralCommissions
        );
    }

    /**
     * @dev Check if address is contract
     */
    function isContract(address _addr) external view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size > 0;
    }

    /**
     * @dev Get security status for address
     */
    function getSecurityStatus(
        mapping(address => bool) storage isBlacklisted,
        address _user
    ) external view returns (
        bool blacklisted,
        bool contractAddress
    ) {
        blacklisted = isBlacklisted[_user];
        
        uint256 size;
        assembly {
            size := extcodesize(_user)
        }
        contractAddress = size > 0;
    }
}