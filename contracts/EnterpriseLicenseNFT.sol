// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract EnterpriseLicenseNFT is ERC721, AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct LicensePlan {
        uint256 nativePrice;
        uint256 stablePrice;
        uint64 durationSeconds;
        bool enabled;
    }

    struct LicenseState {
        bytes32 planId;
        uint64 validUntil;
        uint32 seats;
    }

    IERC20 public immutable stableToken;
    address public treasury;
    uint256 private _nextTokenId = 1;

    mapping(bytes32 => LicensePlan) public plans;
    mapping(uint256 => LicenseState) public licenses;

    event LicensePurchased(
        uint256 indexed tokenId,
        bytes32 indexed planId,
        address indexed buyer,
        bool paidWithStable,
        uint256 amount,
        uint64 validUntil,
        uint32 seats
    );

    constructor(address admin, address stableToken_, address treasury_)
        ERC721("Bhool Enterprise License", "BHELP")
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

    function setPlan(
        bytes32 planId,
        uint256 nativePrice,
        uint256 stablePrice,
        uint64 durationSeconds,
        bool enabled
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(durationSeconds > 0, "Duration required");
        plans[planId] = LicensePlan({
            nativePrice: nativePrice,
            stablePrice: stablePrice,
            durationSeconds: durationSeconds,
            enabled: enabled
        });
    }

    function buyWithNative(bytes32 planId, address to, uint32 seats)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        LicensePlan memory p = plans[planId];
        require(p.enabled, "Plan disabled");
        require(p.nativePrice > 0, "Native payment disabled");
        require(msg.value == p.nativePrice, "Incorrect payment");
        require(seats > 0, "Seats required");

        tokenId = _mintLicense(planId, to, seats, p.durationSeconds);

        (bool ok, ) = payable(treasury).call{value: msg.value}("");
        require(ok, "Treasury transfer failed");

        emit LicensePurchased(
            tokenId,
            planId,
            to,
            false,
            msg.value,
            licenses[tokenId].validUntil,
            seats
        );
    }

    function buyWithStable(bytes32 planId, address to, uint32 seats)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId)
    {
        LicensePlan memory p = plans[planId];
        require(p.enabled, "Plan disabled");
        require(p.stablePrice > 0, "Stable payment disabled");
        require(seats > 0, "Seats required");

        tokenId = _mintLicense(planId, to, seats, p.durationSeconds);

        bool ok = stableToken.transferFrom(msg.sender, treasury, p.stablePrice);
        require(ok, "Stable transfer failed");

        emit LicensePurchased(
            tokenId,
            planId,
            to,
            true,
            p.stablePrice,
            licenses[tokenId].validUntil,
            seats
        );
    }

    function isLicenseActive(uint256 tokenId) external view returns (bool) {
        return _ownerOf(tokenId) != address(0) && licenses[tokenId].validUntil >= block.timestamp;
    }

    function _mintLicense(
        bytes32 planId,
        address to,
        uint32 seats,
        uint64 durationSeconds
    ) internal returns (uint256 tokenId) {
        require(to != address(0), "Invalid recipient");

        tokenId = _nextTokenId;
        _nextTokenId += 1;

        _safeMint(to, tokenId);

        licenses[tokenId] = LicenseState({
            planId: planId,
            validUntil: uint64(block.timestamp) + durationSeconds,
            seats: seats
        });
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
