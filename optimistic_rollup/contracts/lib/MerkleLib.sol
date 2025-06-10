// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library MerkleLib {
    struct MerkleProof {
        bytes32[] proof;
        uint256 index;
    }

    function hashPair(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(left,right));
    }

    function computeRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "Empty leaves array");
        if (leaves.length == 1) 
            return leaves[0];
        
        // copy to avoid modifying input
        bytes32[] memory currentLevel = new bytes32[](leaves.length);
        for (uint256 i = 0; i < leaves.length; i++) currentLevel[i] = leaves[i];

        while (currentLevel.length > 1) {
            uint256 nextLevelLength = (currentLevel.length + 1) / 2;
            bytes32[] memory nextLevel = new bytes32[](nextLevelLength);
            for (uint256 i = 0; i < nextLevelLength; i++) {
                uint256 left = i*2;
                uint256 right = left + 1;
                if (right < currentLevel.length) { // has 2 children
                    nextLevel[i] = hashPair(currentLevel[left], currentLevel[right]);
                } else { // only has left child
                    nextLevel[i] = currentLevel[left];
                }
            }
            currentLevel = nextLevel;
        }
        return currentLevel[0];
    }

    function verifyProof(bytes32 leaf, bytes32 root, MerkleProof memory proof) internal pure returns(bool) {
        bytes32 computedHash = leaf;
        uint256 index = proof.index;
        for (uint256 i = 0; i < proof.proof.length; i++) {
            bytes32 proofElement = proof.proof[i];

            if (index & 1 == 0) { // current node is left child
                computedHash = hashPair(computedHash, proofElement);
            } else {
                computedHash = hashPair(proofElement,computedHash);
            }

            index >>= 1;
        }
        return computedHash == root;
    }

    function generateProof(bytes32[] memory leaves, uint256 leafIndex) internal pure returns (MerkleProof memory) {
        require(leafIndex < leaves.length, "Leaf index out of bounds");
        
        bytes32[] memory proof = new bytes32[](getProofLength(leaves.length));
        uint256 proofIndex = 0;
        
        bytes32[] memory currentLevel = new bytes32[](leaves.length);
        for (uint256 i = 0; i < leaves.length; i++) currentLevel[i] = leaves[i];
        
        uint256 currentIndex = leafIndex;
        
        while (currentLevel.length > 1) {
            uint256 siblingIndex = getSiblingIndex(currentIndex);
            
            if (siblingIndex < currentLevel.length) {
                proof[proofIndex] = currentLevel[siblingIndex];
                proofIndex++;
            }
            
            // build next level
            uint256 nextLevelLength = (currentLevel.length + 1) / 2;
            bytes32[] memory nextLevel = new bytes32[](nextLevelLength);
            
            for (uint256 i = 0; i < nextLevelLength; i++) {
                uint256 left = i * 2;
                uint256 right = left + 1;
                
                if (right < currentLevel.length) {
                    nextLevel[i] = hashPair(currentLevel[left], currentLevel[right]);
                } else {
                    nextLevel[i] = currentLevel[left];
                }
            }
            
            currentLevel = nextLevel;
            currentIndex >>= 1;
        }
        
        // resize proof array to actual length
        bytes32[] memory finalProof = new bytes32[](proofIndex);
        for (uint256 i = 0; i < proofIndex; i++) finalProof[i] = proof[i];
        
        return MerkleProof({
            proof: finalProof,
            index: leafIndex
        });
    }

    function getSiblingIndex(uint256 index) internal pure returns (uint256) {
        if (index % 2 == 0) {
            return index + 1; // left child ==> sibling is right
        } else {
            return index - 1; // vice versa
        }
    }

    // calc maximum proof length needed for tree with n leaves
    function getProofLength(uint256 numLeaves) internal pure returns (uint256) {
        if (numLeaves <= 1) return 0;
        
        uint256 depth = 0;
        uint256 n = numLeaves;
        while (n > 1) {
            n = (n + 1) / 2;
            depth++;
        }
        return depth;
    }
}