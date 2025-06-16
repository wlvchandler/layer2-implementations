// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../lib/MerkleLib.sol";

contract MerkleLibTest {
    
    function computeRoot(bytes32[] memory leaves) external pure returns (bytes32) {
        return MerkleLib.computeRoot(leaves);
    }
    
    function verifyProof(
        bytes32 leaf,
        bytes32 root,
        MerkleLib.MerkleProof memory proof
    ) external pure returns (bool) {
        return MerkleLib.verifyProof(leaf, root, proof);
    }
    
    function generateProof(
        bytes32[] memory leaves,
        uint256 leafIndex
    ) external pure returns (MerkleLib.MerkleProof memory) {
        return MerkleLib.generateProof(leaves, leafIndex);
    }
    
    function hashPair(bytes32 left, bytes32 right) external pure returns (bytes32) {
        return MerkleLib.hashPair(left, right);
    }
    
    function getSiblingIndex(uint256 index) external pure returns (uint256) {
        return MerkleLib.getSiblingIndex(index);
    }
    
    function getProofLength(uint256 numLeaves) external pure returns (uint256) {
        return MerkleLib.getTreeDepth(numLeaves);
    }
    
    function verifyMultiProof(
        bytes32[] memory leaves,
        bytes32 root,
        MerkleLib.MerkleProof[] memory proofs
    ) external pure returns (bool) {
        return MerkleLib.verifyMultiProof(leaves, root, proofs);
    }
    
    function isValidTree(bytes32[] memory leaves, bytes32 expectedRoot) external pure returns (bool) {
        return MerkleLib.isValidTree(leaves, expectedRoot);
    }
    
    function getTreeDepth(uint256 numLeaves) external pure returns (uint256) {
        return MerkleLib.getTreeDepth(numLeaves);
    }
    
    function getInternalNodeCount(uint256 numLeaves) external pure returns (uint256) {
        return MerkleLib.getInternalNodeCount(numLeaves);
    }
}