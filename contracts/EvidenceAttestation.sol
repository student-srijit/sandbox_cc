// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract EvidenceAttestation is AccessControl, EIP712, Pausable {
    using ECDSA for bytes32;

    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bytes32 private constant EVIDENCE_TYPEHASH = keccak256(
        "EvidenceRequest(address submitter,bytes32 threatIdHash,bytes32 cidHash,bytes32 contentHash,uint256 nonce,uint256 deadline)"
    );

    struct EvidenceRecord {
        address submitter;
        bytes32 threatIdHash;
        bytes32 contentHash;
        string cid;
        uint64 timestamp;
        uint256 sourceChainId;
        address reviewer;
    }

    mapping(bytes32 => EvidenceRecord) public evidences;
    mapping(address => uint256) public nonces;

    event EvidenceAttested(
        bytes32 indexed evidenceId,
        address indexed submitter,
        bytes32 indexed threatIdHash,
        string cid,
        bytes32 contentHash,
        address reviewer
    );

    constructor(address admin) EIP712("EvidenceAttestation", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REVIEWER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function attestEvidence(
        string calldata threatId,
        string calldata cid,
        bytes32 contentHash,
        uint256 deadline,
        bytes calldata reviewerSignature
    ) external whenNotPaused returns (bytes32 evidenceId) {
        require(bytes(threatId).length > 0, "Empty threatId");
        require(bytes(cid).length > 0, "Empty CID");
        require(block.timestamp <= deadline, "Expired signature");

        uint256 currentNonce = nonces[msg.sender];
        bytes32 threatIdHash = keccak256(bytes(threatId));
        bytes32 cidHash = keccak256(bytes(cid));

        bytes32 structHash = keccak256(
            abi.encode(
                EVIDENCE_TYPEHASH,
                msg.sender,
                threatIdHash,
                cidHash,
                contentHash,
                currentNonce,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(reviewerSignature);
        require(hasRole(REVIEWER_ROLE, signer), "Invalid reviewer signature");

        nonces[msg.sender] = currentNonce + 1;

        evidenceId = keccak256(
            abi.encodePacked(msg.sender, threatIdHash, contentHash, cidHash, currentNonce)
        );
        require(evidences[evidenceId].timestamp == 0, "Evidence exists");

        evidences[evidenceId] = EvidenceRecord({
            submitter: msg.sender,
            threatIdHash: threatIdHash,
            contentHash: contentHash,
            cid: cid,
            timestamp: uint64(block.timestamp),
            sourceChainId: block.chainid,
            reviewer: signer
        });

        emit EvidenceAttested(evidenceId, msg.sender, threatIdHash, cid, contentHash, signer);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
