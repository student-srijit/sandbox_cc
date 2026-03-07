// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract BountyEscrow is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    enum BountyState {
        Open,
        Awarded,
        Disputed,
        Refunded
    }

    struct Bounty {
        address creator;
        address token;
        uint256 amount;
        uint64 deadline;
        BountyState state;
    }

    struct Claim {
        address hunter;
        string cid;
        bytes32 contentHash;
        bool exists;
    }

    uint256 public nextBountyId = 1;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Claim) public claims;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed creator,
        address indexed token,
        uint256 amount,
        uint64 deadline
    );
    event ClaimSubmitted(uint256 indexed bountyId, address indexed hunter, string cid, bytes32 contentHash);
    event ClaimApproved(uint256 indexed bountyId, address indexed hunter, uint256 amount);
    event ClaimDisputed(uint256 indexed bountyId, address indexed caller);
    event BountyRefunded(uint256 indexed bountyId, address indexed creator, uint256 amount);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REVIEWER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function createNativeBounty(uint64 deadline)
        external
        payable
        whenNotPaused
        returns (uint256 bountyId)
    {
        require(msg.value > 0, "Amount required");
        require(deadline > block.timestamp, "Deadline in past");

        bountyId = nextBountyId;
        nextBountyId += 1;

        bounties[bountyId] = Bounty({
            creator: msg.sender,
            token: address(0),
            amount: msg.value,
            deadline: deadline,
            state: BountyState.Open
        });

        emit BountyCreated(bountyId, msg.sender, address(0), msg.value, deadline);
    }

    function createTokenBounty(address token, uint256 amount, uint64 deadline)
        external
        whenNotPaused
        returns (uint256 bountyId)
    {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount required");
        require(deadline > block.timestamp, "Deadline in past");

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(ok, "Token transfer failed");

        bountyId = nextBountyId;
        nextBountyId += 1;

        bounties[bountyId] = Bounty({
            creator: msg.sender,
            token: token,
            amount: amount,
            deadline: deadline,
            state: BountyState.Open
        });

        emit BountyCreated(bountyId, msg.sender, token, amount, deadline);
    }

    function submitClaim(uint256 bountyId, string calldata cid, bytes32 contentHash)
        external
        whenNotPaused
    {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.creator != address(0), "Bounty missing");
        require(bounty.state == BountyState.Open, "Bounty not open");
        require(block.timestamp <= bounty.deadline, "Bounty expired");
        require(!claims[bountyId].exists, "Claim already submitted");
        require(bytes(cid).length > 0, "CID required");

        claims[bountyId] = Claim({
            hunter: msg.sender,
            cid: cid,
            contentHash: contentHash,
            exists: true
        });

        emit ClaimSubmitted(bountyId, msg.sender, cid, contentHash);
    }

    function approveClaim(uint256 bountyId) external nonReentrant onlyRole(REVIEWER_ROLE) {
        Bounty storage bounty = bounties[bountyId];
        Claim storage claim = claims[bountyId];

        require(bounty.state == BountyState.Open, "Bounty not open");
        require(claim.exists, "Claim missing");

        bounty.state = BountyState.Awarded;

        if (bounty.token == address(0)) {
            (bool ok, ) = payable(claim.hunter).call{value: bounty.amount}("");
            require(ok, "Native payout failed");
        } else {
            bool ok = IERC20(bounty.token).transfer(claim.hunter, bounty.amount);
            require(ok, "Token payout failed");
        }

        emit ClaimApproved(bountyId, claim.hunter, bounty.amount);
    }

    function disputeClaim(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        require(
            msg.sender == bounty.creator || hasRole(REVIEWER_ROLE, msg.sender),
            "Not authorized"
        );
        require(bounty.state == BountyState.Open, "Bounty not open");
        require(claims[bountyId].exists, "Claim missing");

        bounty.state = BountyState.Disputed;
        emit ClaimDisputed(bountyId, msg.sender);
    }

    function refundExpiredBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.creator == msg.sender, "Not creator");
        require(block.timestamp > bounty.deadline, "Bounty active");
        require(bounty.state == BountyState.Open || bounty.state == BountyState.Disputed, "Cannot refund");

        bounty.state = BountyState.Refunded;

        if (bounty.token == address(0)) {
            (bool ok, ) = payable(bounty.creator).call{value: bounty.amount}("");
            require(ok, "Native refund failed");
        } else {
            bool ok = IERC20(bounty.token).transfer(bounty.creator, bounty.amount);
            require(ok, "Token refund failed");
        }

        emit BountyRefunded(bountyId, bounty.creator, bounty.amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
