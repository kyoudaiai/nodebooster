// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract DepositNFTUpgradeable is Initializable, ERC721Upgradeable, OwnableUpgradeable {
    uint256 public nextTokenId;
    address public minter;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _minter) public initializer {
        __ERC721_init("DailyRoi.online Stake Badge", "ETHXP");
        __Ownable_init();
        minter = _minter;
    }

    modifier onlyMinter() {
        require(msg.sender == minter, "Not authorized");
        _;
    }

    function mint(address to) external onlyMinter {
        _safeMint(to, nextTokenId);
        nextTokenId++;
    }
}
