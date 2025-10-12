// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// This file imports the latest version of Avax0Token for backward compatibility
import "./Avax0TokenV2.sol";

/**
 * @title Avax0Token
 * @dev Alias for Avax0TokenV2 to maintain backward compatibility
 * @notice Use Avax0TokenV2 for new deployments
 */
contract Avax0Token is Avax0TokenV2 {
    // This contract inherits all functionality from Avax0TokenV2
    // It exists for backward compatibility with existing deployment scripts
}