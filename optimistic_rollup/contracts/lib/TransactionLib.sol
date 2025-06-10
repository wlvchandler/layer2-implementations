// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library TransactionLib {
    struct Transaction {
        address from;
        address to;
        uint256 amount;
        uint256 nonce;
        uint256 fee;
        bytes signature;
    }

    struct Account {
        uint256 balance; // l2 eth balance
        uint256 nonce; // tx counter
    }

    enum TransactionResult {
        SUCCESS,
        INSUFFICIENT_BALANCE,
        INVALID_NONCE,
        INVALID_SIGNATURE
    }

    bytes32 private constant TRANSACTION_TYPEHASH = keccak256(
        "Transaction(address from,address to,uint256 amount,uint256 nonce,uint256 fee)"
    );

    function serialize(Transaction memory txn) internal pure returns (bytes memory) {
        return abi.encode(txn.from, txn.to, txn.amount, txn.nonce, txn.fee);
    }

    function serializeBatch(Transaction[] memory transactions) internal pure returns (bytes32[] memory leaves) {
        leaves = new bytes32[](transactions.length);
        for (uint256 i = 0; i < transactions.length; i++) {
            leaves[i] = getMerkleLeaf(transactions[i]);
        }
        return leaves;
    }

    function deserialize(bytes memory data) internal pure returns (Transaction memory) {
        (address from, address to, uint256 amount, uint256 nonce, uint256 fee) = abi.decode(data, (address, address, uint256, uint256, uint256));
        return Transaction({
            from: from,
            to: to,
            amount: amount,
            nonce:nonce,
            fee: fee,
            signature: new bytes(0) //set separately
        });
    }

    function hash(Transaction memory txn) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            TRANSACTION_TYPEHASH, 
            txn.from,
            txn.to,
            txn.amount,
            txn.nonce,
            txn.fee
        ));
    } 

    // todo: will this need updating to work with eip-191 and eip-712?
    function verifySignature(Transaction memory txn) internal pure returns (bool) {
        if (txn.signature.length != 65) return false;

        bytes32 txnHash = hash(txn);
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", txnHash));
        
        bytes32 r;
        bytes32 s;
        uint8 v;

        bytes memory sig = txn.signature;
        assembly {
        r := mload(add(sig, 32))
        s := mload(add(sig, 64))
        v := byte(0, mload(add(sig, 96)))
        }
        address recoveredSigner = ecrecover(ethSignedMessageHash, v, r, s);
        return ((recoveredSigner==txn.from) && (recoveredSigner != address(0)));
}

    function validate(Transaction memory txn) internal pure returns(bool) {
        return( 
            txn.from != address(0)
            && txn.to != address(0)
            && txn.from != txn.to
            && txn.amount > 0
            && txn.fee >= 0
        );
    }

    function execute(Transaction memory txn, Account memory fromAcct, Account memory toAcct) internal pure 
        returns (Account memory newFromAcct, Account memory newToAcct, TransactionResult result) 
    {
        if (!validate(txn)) 
            return (fromAcct, toAcct, TransactionResult.INVALID_SIGNATURE);

        if (txn.nonce != fromAcct.nonce) 
            return (fromAcct, toAcct, TransactionResult.INVALID_NONCE);
    
        uint256 totalCost = txn.amount + txn.fee;
        if (fromAcct.balance < totalCost) 
            return (fromAcct, toAcct, TransactionResult.INSUFFICIENT_BALANCE);

        // execute 
        newFromAcct = Account({
            balance: fromAcct.balance - totalCost,
            nonce: fromAcct.nonce + 1
        });
        
        newToAcct = Account({
            balance: toAcct.balance + txn.amount,
            nonce: toAcct.nonce
        });
        
        return (newFromAcct, newToAcct, TransactionResult.SUCCESS);
    }

    function canExecute(Transaction memory txn,Account memory fromAccount) internal pure returns (bool) {
        if (!validate(txn)) return false;
        if (txn.nonce != fromAccount.nonce) return false;
        if (fromAccount.balance < txn.amount + txn.fee) return false;
        return true;
    }

    function getExecutionCost(Transaction memory txn) internal pure returns (uint256) {
        return txn.amount + txn.fee;
    }

    function getMerkleLeaf(Transaction memory txn) internal pure returns (bytes32) {
        return keccak256(serialize(txn));
    }

}