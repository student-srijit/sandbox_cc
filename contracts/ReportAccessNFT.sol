// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract ReportAccessNFT is ERC721, AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct ReportPricing {
        uint256 nativePrice;
        uint256 stablePrice;
        bool enabled;
    }

    IERC20 public immutable stableToken;
    address public treasury;
    uint256 private _nextTokenId = 1;

    mapping(bytes32 => ReportPricing) public pricing;
    mapping(uint256 => bytes32) public tokenReport;

    event ReportPurchased(
        uint256 indexed tokenId,
        bytes32 indexed reportId,
        address indexed buyer,
        bool paidWithStable,
        uint256 amount
    );

    constructor(address admin, address stableToken_, address treasury_)
        ERC721("Bhool Report Access", "BHREP")
    {
        require(stableToken_ != address(0), "Invalid stable token");
        require(treasury_ != address(0), "Invalid treasury");

        stableToken = IERC20(stableToken_);
        treasury = treasury_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function setTreasury(address treasury_) external onlyRole(TREASURY_ROLE) {
        require(treasury_ != address(0), "Invalid treasury");
        treasury = treasury_;
    }

    function setReportPricing(
        bytes32 reportId,
        uint256 nativePrice,
        uint256 stablePrice,
        bool enabled
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        pricing[reportId] = ReportPricing({
            nativePrice: nativePrice,
            stablePrice: stablePrice,
            enabled: enabled
        });
    }

    function buyWithNative(bytes32 reportId, address to)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        ReportPricing memory p = pricing[reportId];
        require(p.enabled, "Report disabled");
        require(p.nativePrice > 0, "Native payment disabled");
        require(msg.value == p.nativePrice, "Incorrect payment");

        tokenId = _mintAccess(reportId, to);

        (bool ok, ) = payable(treasury).call{value: msg.value}("");
        require(ok, "Treasury transfer failed");

        emit ReportPurchased(tokenId, reportId, to, false, msg.value);
    }

    function buyWithStable(bytes32 reportId, address to)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        ReportPricing memory p = pricing[reportId];
        require(p.enabled, "Report disabled");
        require(p.stablePrice > 0, "Stable payment disabled");

        tokenId = _mintAccess(reportId, to);

        bool ok = stableToken.transferFrom(msg.sender, treasury, p.stablePrice);
        require(ok, "Stable transfer failed");

        emit ReportPurchased(tokenId, reportId, to, true, p.stablePrice);
    }

    function _mintAccess(bytes32 reportId, address to) internal returns (uint256 tokenId) {
        require(to != address(0), "Invalid recipient");

        tokenId = _nextTokenId;
        _nextTokenId += 1;

        tokenReport[tokenId] = reportId;
        _safeMint(to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
