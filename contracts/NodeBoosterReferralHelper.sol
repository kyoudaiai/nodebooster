// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Interface to interact with main NodeBooster contract
interface INodeBooster {
    function getDirectReferrals(address user) external view returns (address[] memory);
    function userAccounts(address user) external view returns (
        bool isRegistered,
        address referrer,
        uint256 totalReferrals,
        uint256 totalReferralRewards,
        uint256 currentEngine,
        uint256 engineStartTime,
        uint256 lastClaimTime,
        uint256 totalRewardsClaimed
    );
}

/**
 * @title NodeBoosterReferralHelper
 * @dev Helper contract for referral tracking and multi-level queries
 */
contract NodeBoosterReferralHelper {
    
    INodeBooster public nodeBooster;
    
    constructor(address _nodeBooster) {
        nodeBooster = INodeBooster(_nodeBooster);
    }
    
    /**
     * @dev Get referred users on a specific level (recursive)
     */
    function getReferredUsersOnLevel(address user, uint256 level) external view returns (address[] memory) {
        require(level > 0 && level <= 10, "Invalid level");
        
        if (level == 1) {
            return nodeBooster.getDirectReferrals(user);
        }
        
        // Get previous level users
        address[] memory previousLevel = this.getReferredUsersOnLevel(user, level - 1);
        
        // Count total users at current level
        uint256 totalCount = 0;
        for (uint256 i = 0; i < previousLevel.length; i++) {
            totalCount += nodeBooster.getDirectReferrals(previousLevel[i]).length;
        }
        
        // Build result array
        address[] memory result = new address[](totalCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < previousLevel.length; i++) {
            address[] memory userReferrals = nodeBooster.getDirectReferrals(previousLevel[i]);
            for (uint256 j = 0; j < userReferrals.length; j++) {
                result[currentIndex++] = userReferrals[j];
            }
        }
        
        return result;
    }
    
    /**
     * @dev Get all referred users up to a specific level
     */
    function getAllReferredUsers(address user, uint256 maxLevel) external view returns (
        address[] memory allUsers,
        uint256[] memory userLevels
    ) {
        require(maxLevel > 0 && maxLevel <= 10, "Invalid max level");
        
        // Count total users first
        uint256 totalCount = 0;
        for (uint256 level = 1; level <= maxLevel; level++) {
            address[] memory levelUsers = this.getReferredUsersOnLevel(user, level);
            totalCount += levelUsers.length;
        }
        
        // Build result arrays
        allUsers = new address[](totalCount);
        userLevels = new uint256[](totalCount);
        uint256 currentIndex = 0;
        
        for (uint256 level = 1; level <= maxLevel; level++) {
            address[] memory levelUsers = this.getReferredUsersOnLevel(user, level);
            for (uint256 i = 0; i < levelUsers.length; i++) {
                allUsers[currentIndex] = levelUsers[i];
                userLevels[currentIndex] = level;
                currentIndex++;
            }
        }
    }
    
    /**
     * @dev Get referral statistics by level
     */
    function getReferralStatsByLevel(address user, uint256 maxLevel) external view returns (
        uint256[] memory levelCounts,
        uint256 totalCount
    ) {
        require(maxLevel > 0 && maxLevel <= 10, "Invalid max level");
        
        levelCounts = new uint256[](maxLevel);
        totalCount = 0;
        
        for (uint256 level = 1; level <= maxLevel; level++) {
            address[] memory levelUsers = this.getReferredUsersOnLevel(user, level);
            levelCounts[level - 1] = levelUsers.length;
            totalCount += levelUsers.length;
        }
    }
    
    /**
     * @dev Get referral tree structure
     */
    function getReferralTree(address user, uint256 maxDepth) external view returns (
        address[] memory users,
        uint256[] memory levels,
        address[] memory parents
    ) {
        require(maxDepth > 0 && maxDepth <= 10, "Invalid depth");
        
        // This is a simplified version that returns the tree structure
        // Can be expanded based on specific needs
        
        (users, levels) = this.getAllReferredUsers(user, maxDepth);
        parents = new address[](users.length);
        
        // For each user, find their parent (referrer)
        for (uint256 i = 0; i < users.length; i++) {
            (, address referrer,,,,,, ) = nodeBooster.userAccounts(users[i]);
            parents[i] = referrer;
        }
    }
}