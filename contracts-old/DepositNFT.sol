// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DepositNFT is ERC721, Ownable {
    uint256 public nextTokenId;
    address public minter;

    constructor(address _minter) ERC721("DailyRoi.online Stake Badge", "ETHXP") {
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
