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
}