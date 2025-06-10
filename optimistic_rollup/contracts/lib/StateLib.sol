// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./TransactionLib.sol";
import "./MerkleLib.sol";

library StateLib {
    using TransactionLib for TransactionLib.Transaction;
    using MerkleLib for bytes32[];

    struct StateProof {
        address account;
        TransactionLib.Account accountData;
        MerkleLib.MerkleProof merkleProof;
        uint256 accountIndex;
    }
    
    struct StateTransition {
        bytes32 preStateRoot;
        bytes32 postStateRoot;
        TransactionLib.Transaction[] transactions;
        address[] affectedAccounts;
        TransactionLib.Account[] preAccountStates;
        TransactionLib.Account[] postAccountStates;
    }

    function computeStateRoot(address[] memory accounts, TransactionLib.Account[] memory accountData) internal pure returns (bytes32) {
        require(accounts.length == accountData.length, "Array length mismatch");
        require(accounts.length > 0, "Empty state");
        
        for (uint256 i = 1; i < accounts.length; i++) {
            require(accounts[i] > accounts[i-1], "Accounts not sorted");
        }
        
        // make account leaves for merkle tree
        bytes32[] memory leaves = new bytes32[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            leaves[i] = hashAccount(accounts[i], accountData[i]);
        }
        
        return MerkleLib.computeRoot(leaves);
    }

    function hashAccount(address account,TransactionLib.Account memory accountData) internal pure returns (bytes32) {
        return keccak256(abi.encode(account, accountData.balance, accountData.nonce));
    }

    
}