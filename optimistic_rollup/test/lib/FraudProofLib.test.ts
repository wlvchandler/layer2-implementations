import { expect } from "chai";
import { ethers } from "hardhat";

describe("FraudProofLib", function () {
  let contract: any;
  let user1: any, user2: any, user3: any;

  beforeEach(async function () {
    [user1, user2, user3] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("FraudProofLibTest");
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  function makeAccount(balance: bigint, nonce: bigint) {
    return { balance, nonce };
  }

  function makeTx(from: string, to: string, amount: bigint, nonce: bigint, fee: bigint) {
    return { from, to, amount, nonce, fee, signature: "0x" };
  }

  async function setupBasicScenario() {
    const user1Balance = ethers.parseEther("10");
    const user2Balance = ethers.parseEther("5");
    const transferAmount = ethers.parseEther("2");
    const fee = ethers.parseEther("0.1");

    return await contract.setupCompleteScenario(
      user1.address,
      user2.address,
      user1Balance,
      user2Balance,
      transferAmount,
      fee
    );
  }

  describe("basic fraud proof creation", function () {
    it("creates fraud proof structure", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("2"), 0n, ethers.parseEther("0.1"));

      const preStateRoot = ethers.keccak256(ethers.toUtf8Bytes("pre-state"));
      const claimedPostStateRoot = ethers.keccak256(ethers.toUtf8Bytes("post-state"));
      const transactionRoot = ethers.keccak256(ethers.toUtf8Bytes("tx-root"));

      const fromAccountProof = await contract.createStateProof(
        user1.address,
        makeAccount(ethers.parseEther("10"), 0n),
        [ethers.keccak256(ethers.toUtf8Bytes("proof1"))],
        0,
        0
      );

      const toAccountProof = await contract.createStateProof(
        user2.address,
        makeAccount(ethers.parseEther("5"), 0n),
        [ethers.keccak256(ethers.toUtf8Bytes("proof2"))],
        1,
        1
      );

      const transactionMerkleProof = await contract.createMerkleProof(
        [ethers.keccak256(ethers.toUtf8Bytes("tx-proof"))],
        0
      );

      const fraudProof = await contract.createFraudProof(
        tx,
        0,
        transactionRoot,
        preStateRoot,
        claimedPostStateRoot,
        fromAccountProof,
        toAccountProof,
        fromAccountProof, // reuse for simplicity
        toAccountProof,   // reuse for simplicity
        transactionMerkleProof
      );

      expect(fraudProof.transaction.from).to.equal(user1.address);
      expect(fraudProof.transaction.to).to.equal(user2.address);
      expect(fraudProof.preStateRoot).to.equal(preStateRoot);
      expect(fraudProof.claimedPostStateRoot).to.equal(claimedPostStateRoot);
    });
  });

  describe("transaction execution verification", function () {
    it("verifies correct execution", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("2"), 0n, ethers.parseEther("0.1"));

      const preFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const preToAccount = makeAccount(ethers.parseEther("5"), 0n);
      
      // correct post-state: user1: 10 - 2 - 0.1 = 7.9, user2: 5 + 2 = 7
      const claimedFromAccount = makeAccount(ethers.parseEther("7.9"), 1n);
      const claimedToAccount = makeAccount(ethers.parseEther("7"), 0n);

      const [isValid, reason] = await contract.verifyTransactionExecution(
        tx,
        preFromAccount,
        preToAccount,
        claimedFromAccount,
        claimedToAccount
      );

      expect(isValid).to.be.true;
      expect(reason).to.equal("Transaction execution correct");
    });

    it("detects incorrect from balance", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("2"), 0n, ethers.parseEther("0.1"));

      const preFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const preToAccount = makeAccount(ethers.parseEther("5"), 0n);
      
      // wrong: user1 should have 7.9 but claimed 8.0 (operator steals 0.1)
      const claimedFromAccount = makeAccount(ethers.parseEther("8"), 1n);
      const claimedToAccount = makeAccount(ethers.parseEther("7"), 0n);

      const [isValid, reason] = await contract.verifyTransactionExecution(
        tx,
        preFromAccount,
        preToAccount,
        claimedFromAccount,
        claimedToAccount
      );

      expect(isValid).to.be.false;
      expect(reason).to.equal("From account state incorrect");
    });

    it("detects incorrect to balance", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("2"), 0n, ethers.parseEther("0.1"));

      const preFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const preToAccount = makeAccount(ethers.parseEther("5"), 0n);
      
      // wrong: user2 should have 7.0 but claimed 6.5 (operator steals 0.5)
      const claimedFromAccount = makeAccount(ethers.parseEther("7.9"), 1n);
      const claimedToAccount = makeAccount(ethers.parseEther("6.5"), 0n);

      const [isValid, reason] = await contract.verifyTransactionExecution(
        tx,
        preFromAccount,
        preToAccount,
        claimedFromAccount,
        claimedToAccount
      );

      expect(isValid).to.be.false;
      expect(reason).to.equal("To account state incorrect");
    });

    it("detects failed transactions included as successful", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("15"), 0n, ethers.parseEther("0.1")); // more than user1 has

      const preFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const preToAccount = makeAccount(ethers.parseEther("5"), 0n);
      
      // state unchanged (transaction should fail)
      const claimedFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const claimedToAccount = makeAccount(ethers.parseEther("5"), 0n);

      const [isValid, reason] = await contract.verifyTransactionExecution(
        tx,
        preFromAccount,
        preToAccount,
        claimedFromAccount,
        claimedToAccount
      );

      expect(isValid).to.be.false;
      expect(reason).to.equal("Transaction should have failed");
    });
  });

  describe("fraud type descriptions", function () {
    it("returns correct descriptions", async function () {
      expect(await contract.getFraudTypeDescription(0))
        .to.equal("Invalid state transition computation");
      
      expect(await contract.getFraudTypeDescription(1))
        .to.equal("Invalid transaction included in batch");
      
      expect(await contract.getFraudTypeDescription(2))
        .to.equal("Invalid pre-state proof provided");
      
      expect(await contract.getFraudTypeDescription(3))
        .to.equal("Invalid post-state proof provided");
      
      expect(await contract.getFraudTypeDescription(4))
        .to.equal("Transaction executed incorrectly");
    });
  });

  describe("complex fraud scenarios", function () {
    it("handles multiple account fraud", async function () {
      const accounts = [user1.address, user2.address, user3.address].sort();
      
      const transactions = [
        makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01")),
        makeTx(user2.address, user3.address, ethers.parseEther("0.5"), 0n, ethers.parseEther("0.01"))
      ];

      const preAccountStates = [
        makeAccount(ethers.parseEther("10"), 0n),
        makeAccount(ethers.parseEther("5"), 0n),
        makeAccount(ethers.parseEther("2"), 0n)
      ];

      // correct post-states after transactions:
      // user1: 10 - 1 - 0.01 = 8.99
      // user2: 5 + 1 - 0.5 - 0.01 = 5.49  
      // user3: 2 + 0.5 = 2.5
      const correctPostAccountStates = [
        makeAccount(ethers.parseEther("8.99"), 1n),
        makeAccount(ethers.parseEther("5.49"), 1n),
        makeAccount(ethers.parseEther("2.5"), 0n)
      ];

      // test with correct states
      const [isValid1] = await contract.verifyBatchExecution(
        transactions,
        ethers.keccak256(ethers.toUtf8Bytes("pre-state")),
        ethers.keccak256(ethers.toUtf8Bytes("post-state")),
        accounts,
        preAccountStates,
        correctPostAccountStates
      );

      expect(isValid1).to.be.true;

      // test with wrong states (operator steals from user3)
      const fraudulentPostAccountStates = [
        makeAccount(ethers.parseEther("8.99"), 1n),
        makeAccount(ethers.parseEther("5.49"), 1n),
        makeAccount(ethers.parseEther("2"), 0n) // user3 should have 2.5, not 2.0
      ];

      const [isValid2, fraudIndex] = await contract.verifyBatchExecution(
        transactions,
        ethers.keccak256(ethers.toUtf8Bytes("pre-state")),
        ethers.keccak256(ethers.toUtf8Bytes("post-state")),
        accounts,
        preAccountStates,
        fraudulentPostAccountStates
      );

      expect(isValid2).to.be.false;
      expect(fraudIndex).to.equal(ethers.MaxUint256); // final state mismatch
    });

    it("detects fraud in specific transaction", async function () {
      const transactions = [
        makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01")),
        makeTx(user1.address, user2.address, ethers.parseEther("15"), 1n, ethers.parseEther("0.01")) // should fail
      ];

      const accounts = [user1.address, user2.address].sort();
      const preAccountStates = [
        makeAccount(ethers.parseEther("10"), 0n),
        makeAccount(ethers.parseEther("5"), 0n)
      ];

      const postAccountStates = [
        makeAccount(ethers.parseEther("8.99"), 2n), // as if both transactions succeeded
        makeAccount(ethers.parseEther("21"), 0n)
      ];

      const [isValid, fraudIndex] = await contract.verifyBatchExecution(
        transactions,
        ethers.keccak256(ethers.toUtf8Bytes("pre-state")),
        ethers.keccak256(ethers.toUtf8Bytes("post-state")),
        accounts,
        preAccountStates,
        postAccountStates
      );

      expect(isValid).to.be.false;
      expect(fraudIndex).to.equal(1); // second transaction should have failed
    });
  });

  describe("edge cases", function () {
    it("handles zero-amount transactions", async function () {
      const tx = makeTx(user1.address, user2.address, 0n, 0n, ethers.parseEther("0.01")); // zero amount

      const preFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const preToAccount = makeAccount(ethers.parseEther("5"), 0n);
      
      // should fail due to validation (zero amount not allowed)
      const claimedFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const claimedToAccount = makeAccount(ethers.parseEther("5"), 0n);

      const [isValid, reason] = await contract.verifyTransactionExecution(
        tx,
        preFromAccount,
        preToAccount,
        claimedFromAccount,
        claimedToAccount
      );

      expect(isValid).to.be.false;
      expect(reason).to.equal("Transaction should have failed");
    });

    it("handles self-transfers", async function () {
      const tx = makeTx(user1.address, user1.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01")); // self-transfer

      const preFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const preToAccount = makeAccount(ethers.parseEther("10"), 0n); // same account
      
      // should fail due to validation (from == to not allowed)
      const claimedFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const claimedToAccount = makeAccount(ethers.parseEther("10"), 0n);

      const [isValid, reason] = await contract.verifyTransactionExecution(
        tx,
        preFromAccount,
        preToAccount,
        claimedFromAccount,
        claimedToAccount
      );

      expect(isValid).to.be.false;
      expect(reason).to.equal("Transaction should have failed");
    });

    it("handles wrong nonce", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("2"), 5n, ethers.parseEther("0.1")); // wrong nonce

      const preFromAccount = makeAccount(ethers.parseEther("10"), 0n); // nonce is 0, not 5
      const preToAccount = makeAccount(ethers.parseEther("5"), 0n);
      
      // state should be unchanged (transaction should fail)
      const claimedFromAccount = makeAccount(ethers.parseEther("10"), 0n);
      const claimedToAccount = makeAccount(ethers.parseEther("5"), 0n);

      const [isValid, reason] = await contract.verifyTransactionExecution(
        tx,
        preFromAccount,
        preToAccount,
        claimedFromAccount,
        claimedToAccount
      );

      expect(isValid).to.be.false;
      expect(reason).to.equal("Transaction should have failed");
    });
  });

  describe("performance", function () {
    it("handles larger account sets", async function () {
      const numAccounts = 10;
      const accounts = [];
      const preAccountStates = [];
      
      for (let i = 0; i < numAccounts; i++) {
        const wallet = ethers.Wallet.createRandom();
        accounts.push(wallet.address);
        preAccountStates.push(makeAccount(ethers.parseEther("10"), 0n));
      }
      
      const sortedAccounts = accounts.sort();
      
      const transactions = [
        makeTx(
          sortedAccounts[0],
          sortedAccounts[numAccounts - 1],
          ethers.parseEther("1"),
          0n,
          ethers.parseEther("0.01")
        )
      ];

      const postAccountStates = [...preAccountStates];
      postAccountStates[0] = makeAccount(ethers.parseEther("8.99"), 1n); // first account
      postAccountStates[numAccounts - 1] = makeAccount(ethers.parseEther("11"), 0n); // last account

      const [isValid] = await contract.verifyBatchExecution(
        transactions,
        ethers.keccak256(ethers.toUtf8Bytes("pre-state")),
        ethers.keccak256(ethers.toUtf8Bytes("post-state")),
        sortedAccounts,
        preAccountStates,
        postAccountStates
      );

      expect(isValid).to.be.true;
    });
  });

  describe("integration", function () {
    it("shows end-to-end fraud detection", async function () {
      // setup initial state
      const {
        preStateRoot,
        correctPostStateRoot,
        transaction,
        user1PreProof,
        user2PreProof
      } = await setupBasicScenario();

      // operator claims a different (fraudulent) post-state
      const fraudulentBalance = ethers.parseEther("8.5"); // user1 should have 7.9, operator claims 8.5
      const fraudulentPostStateRoot = ethers.keccak256(
        ethers.solidityPacked(["string"], ["fraudulent-state"])
      );

      // create fraudulent post-state proofs
      const fraudulentUser1Proof = await contract.createStateProof(
        user1.address,
        makeAccount(fraudulentBalance, 1n),
        [ethers.keccak256(ethers.toUtf8Bytes("fraud-proof1"))],
        0,
        0
      );

      const fraudulentUser2Proof = await contract.createStateProof(
        user2.address,
        makeAccount(ethers.parseEther("7"), 0n),
        [ethers.keccak256(ethers.toUtf8Bytes("fraud-proof2"))],
        1,
        1
      );

      // create transaction merkle proof (simplified)
      const transactionRoot = ethers.keccak256(ethers.toUtf8Bytes("tx-root"));
      const transactionMerkleProof = await contract.createMerkleProof(
        [ethers.keccak256(ethers.toUtf8Bytes("tx-merkle-proof"))],
        0
      );

      // create complete fraud proof
      const fraudProof = await contract.createFraudProof(
        transaction,
        0,
        transactionRoot,
        preStateRoot,
        fraudulentPostStateRoot,
        user1PreProof,
        user2PreProof,
        fraudulentUser1Proof,
        fraudulentUser2Proof,
        transactionMerkleProof
      );

      // verify the fraud proof detects the fraud
      expect(fraudProof.claimedPostStateRoot).to.not.equal(correctPostStateRoot);
      expect(fraudProof.preStateRoot).to.equal(preStateRoot);
    });
  });
});