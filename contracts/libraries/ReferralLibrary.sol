// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ReferralLibrary
 * @dev Library for handling referral commission processing and user tracking
 */
library ReferralLibrary {
    using SafeERC20 for IERC20;

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

    event ReferralCommissionPaid(
        address indexed referrer,
        address indexed buyer,
        uint256 level,
        uint256 commission,
        uint256 timestamp
    );

    /**
     * @dev Process multi-level referral commissions for engine purchases
     */
    function processEngineReferralCommissions(
        mapping(address => UserAccount) storage userAccounts,
        mapping(address => bool) storage isBlacklisted,
        mapping(uint256 => Engine) storage engines,
        uint256[10] storage referralCommissionRates,
        address buyer,
        uint256 amount
    ) external returns (uint256 totalCommissions) {
        address currentReferrer = userAccounts[buyer].referrer;
        uint256 buyerEngine = userAccounts[buyer].currentEngine;
        uint256 maxLevels = buyerEngine > 0 ? engines[buyerEngine].maxReferralLevels : 0;
        
        for (uint256 level = 1; level <= 10 && level <= maxLevels && currentReferrer != address(0); level++) {
            if (isBlacklisted[currentReferrer] || !userAccounts[currentReferrer].isRegistered) {
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            uint256 referrerEngine = userAccounts[currentReferrer].currentEngine;
            if (referrerEngine == 0) {
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            uint256 commissionRate = referralCommissionRates[level - 1];
            if (commissionRate > 0) {
                uint256 commission = (amount * commissionRate) / 10000;
                
                payable(currentReferrer).transfer(commission);
                totalCommissions += commission;
                
                emit ReferralCommissionPaid(currentReferrer, buyer, level, commission, block.timestamp);
            }
            
            currentReferrer = userAccounts[currentReferrer].referrer;
        }
    }

    /**
     * @dev Calculate potential multi-level commissions for an amount
     */
    function calculatePotentialCommissions(
        mapping(address => UserAccount) storage userAccounts,
        mapping(address => bool) storage isBlacklisted,
        mapping(uint256 => Engine) storage engines,
        uint256[10] storage referralCommissionRates,
        address buyer,
        uint256 amount
    ) external view returns (
        address[] memory referrers,
        uint256[] memory levels,
        uint256[] memory commissions,
        uint256 totalCommission
    ) {
        address[10] memory tempReferrers;
        uint256[10] memory tempLevels;
        uint256[10] memory tempCommissions;
        
        address currentReferrer = userAccounts[buyer].referrer;
        uint256 buyerEngine = userAccounts[buyer].currentEngine;
        uint256 maxLevels = buyerEngine > 0 ? engines[buyerEngine].maxReferralLevels : 0;
        uint256 count = 0;
        uint256 total = 0;
        
        for (uint256 level = 1; level <= 10 && level <= maxLevels && currentReferrer != address(0); level++) {
            if (isBlacklisted[currentReferrer] || !userAccounts[currentReferrer].isRegistered) {
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            uint256 referrerEngine = userAccounts[currentReferrer].currentEngine;
            if (referrerEngine == 0) {
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            uint256 commissionRate = referralCommissionRates[level - 1];
            if (commissionRate > 0) {
                uint256 commission = (amount * commissionRate) / 10000;
                
                tempReferrers[count] = currentReferrer;
                tempLevels[count] = level;
                tempCommissions[count] = commission;
                total += commission;
                count++;
            }
            
            currentReferrer = userAccounts[currentReferrer].referrer;
        }
        
        referrers = new address[](count);
        levels = new uint256[](count);
        commissions = new uint256[](count);
        
        for (uint256 i = 0; i < count; i++) {
            referrers[i] = tempReferrers[i];
            levels[i] = tempLevels[i];
            commissions[i] = tempCommissions[i];
        }
        
        totalCommission = total;
    }

    /**
     * @dev Get referral chain for a user
     */
    function getReferralChain(
        mapping(address => UserAccount) storage userAccounts,
        mapping(uint256 => Engine) storage engines,
        address user
    ) external view returns (
        address[] memory referrers,
        uint256[] memory referrerEngines,
        uint256[] memory maxLevels
    ) {
        referrers = new address[](10);
        referrerEngines = new uint256[](10);
        maxLevels = new uint256[](10);
        
        address currentReferrer = userAccounts[user].referrer;
        
        for (uint256 i = 0; i < 10 && currentReferrer != address(0); i++) {
            referrers[i] = currentReferrer;
            referrerEngines[i] = userAccounts[currentReferrer].currentEngine;
            
            if (referrerEngines[i] > 0) {
                maxLevels[i] = engines[referrerEngines[i]].maxReferralLevels;
            } else {
                maxLevels[i] = 0;
            }
            
            currentReferrer = userAccounts[currentReferrer].referrer;
        }
    }

    /**
     * @dev Get Level 2 referred users (referrals of referrals)
     */
    function getReferredUsersLevel2(
        mapping(address => address[]) storage directReferrals,
        address user
    ) external view returns (address[] memory) {
        address[] memory level1 = directReferrals[user];
        uint256 total = 0;
        for (uint256 i = 0; i < level1.length; i++) {
            total += directReferrals[level1[i]].length;
        }
        
        address[] memory result = new address[](total);
        uint256 idx = 0;
        for (uint256 i = 0; i < level1.length; i++) {
            address[] memory refs = directReferrals[level1[i]];
            for (uint256 j = 0; j < refs.length; j++) {
                result[idx++] = refs[j];
            }
        }
        return result;
    }
}