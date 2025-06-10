// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../lib/TransactionLib.sol";

contract TransactionLibTest {
    using TransactionLib for TransactionLib.Transaction;
    
    function serialize(TransactionLib.Transaction memory txn) external pure returns (bytes memory){
        return TransactionLib.serialize(txn);
    }
    
    function deserialize(bytes memory data) external pure returns(TransactionLib.Transaction memory){
        return TransactionLib.deserialize(data);
    }
    
    function hash(TransactionLib.Transaction memory txn) external pure returns(bytes32){
        return TransactionLib.hash(txn);
    }
    
    function verifySignature(TransactionLib.Transaction memory txn) external pure returns(bool) {
        return TransactionLib.verifySignature(txn);
    }
    
    function validate(TransactionLib.Transaction memory txn) external pure returns(bool) {
        return TransactionLib.validate(txn);
    }
    
    function execute(
          TransactionLib.Transaction memory txn, TransactionLib.Account memory fromAccount, TransactionLib.Account memory toAccount) 
        external pure returns (
          TransactionLib.Account memory newFromAccount,TransactionLib.Account memory newToAccount,TransactionLib.TransactionResult result)
    {
        return TransactionLib.execute(txn, fromAccount, toAccount);
    }
    
    function canExecute(TransactionLib.Transaction memory txn,TransactionLib.Account memory fromAccount) external pure returns (bool) {
        return TransactionLib.canExecute(txn, fromAccount);
    }
    
    function getExecutionCost(TransactionLib.Transaction memory txn) external pure returns(uint256) {
        return TransactionLib.getExecutionCost(txn);
    }
    
    function getMerkleLeaf(TransactionLib.Transaction memory txn) external pure returns(bytes32){
        return TransactionLib.getMerkleLeaf(txn);
    }
    
    function serializeBatch(TransactionLib.Transaction[] memory transactions) external pure returns(bytes32[] memory){
        return TransactionLib.serializeBatch(transactions);
    }
}