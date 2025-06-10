import { expect } from "chai";
import { ethers } from "hardhat";

describe("TransactionLib", function () {
  let contract: any;
  let user1: any, user2: any, user3: any;

  beforeEach(async function () {
    [user1, user2, user3] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("TransactionLibTest");
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  function makeTx(from: string, to: string, amount: bigint, nonce: bigint, fee: bigint) {
    return { from, to, amount, nonce, fee, signature: "0x" };
  }

  function makeAccount(balance: bigint, nonce: bigint) {
    return { balance, nonce };
  }

  describe("basic validation", function () {
    it("accepts good transactions", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      expect(await contract.validate(tx)).to.be.true;
    });

    it("rejects zero address", async function () {
      const tx = makeTx(ethers.ZeroAddress, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      expect(await contract.validate(tx)).to.be.false;
    });

    it("rejects self transfers", async function () {
      const tx = makeTx(user1.address, user1.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      expect(await contract.validate(tx)).to.be.false;
    });

    it("rejects zero amounts", async function () {
      const tx = makeTx(user1.address, user2.address, 0n, 0n, ethers.parseEther("0.01"));
      expect(await contract.validate(tx)).to.be.false;
    });
  });

  describe("serialization", function () {
    it("serializes and deserializes properly", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("1"), 5n, ethers.parseEther("0.01"));
      const serialized = await contract.serialize(tx);
      const deserialized = await contract.deserialize(serialized);

      expect(deserialized.from).to.equal(tx.from);
      expect(deserialized.to).to.equal(tx.to);
      expect(deserialized.amount).to.equal(tx.amount);
      expect(deserialized.nonce).to.equal(tx.nonce);
      expect(deserialized.fee).to.equal(tx.fee);
    });

    it("same tx gives same hash", async function () {
      const tx1 = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      const tx2 = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));

      const hash1 = await contract.hash(tx1);
      const hash2 = await contract.hash(tx2);
      expect(hash1).to.equal(hash2);
    });

    it("different tx gives different hash", async function () {
      const tx1 = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      const tx2 = makeTx(user1.address, user2.address, ethers.parseEther("2"), 0n, ethers.parseEther("0.01"));

      const hash1 = await contract.hash(tx1);
      const hash2 = await contract.hash(tx2);
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe("executing transactions", function () {
    it("works for normal transfers", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      const user1Account = makeAccount(ethers.parseEther("5"), 0n);
      const user2Account = makeAccount(ethers.parseEther("2"), 0n);

      const [newUser1, newUser2, result] = await contract.execute(tx, user1Account, user2Account);

      expect(result).to.equal(0); // success
      expect(newUser1.balance).to.equal(ethers.parseEther("3.99")); // 5 - 1 - 0.01
      expect(newUser1.nonce).to.equal(1n);
      expect(newUser2.balance).to.equal(ethers.parseEther("3")); // 2 + 1
      expect(newUser2.nonce).to.equal(0n);
    });

    it("fails when not enough money", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("10"), 0n, ethers.parseEther("0.01"));
      const user1Account = makeAccount(ethers.parseEther("1"), 0n);
      const user2Account = makeAccount(ethers.parseEther("2"), 0n);

      const [newUser1, newUser2, result] = await contract.execute(tx, user1Account, user2Account);

      expect(result).to.equal(1); // INSUFFICIENT_BALANCE
      expect(newUser1.balance).to.equal(user1Account.balance);
      expect(newUser2.balance).to.equal(user2Account.balance);
    });

    it("fails on wrong nonce", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("1"), 5n, ethers.parseEther("0.01"));
      const user1Account = makeAccount(ethers.parseEther("5"), 0n); // nonce is 0, not 5
      const user2Account = makeAccount(ethers.parseEther("2"), 0n);

      const [newUser1, newUser2, result] = await contract.execute(tx, user1Account, user2Account);

      expect(result).to.equal(2); // INVALID_NONCE
      expect(newUser1.balance).to.equal(user1Account.balance);
      expect(newUser2.balance).to.equal(user2Account.balance);
    });

    it("calculates cost correctly", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      const cost = await contract.getExecutionCost(tx);
      expect(cost).to.equal(ethers.parseEther("1.01"));
    });

    it("checks if tx can execute", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      const richAccount = makeAccount(ethers.parseEther("5"), 0n);
      const poorAccount = makeAccount(ethers.parseEther("0.5"), 0n);

      expect(await contract.canExecute(tx, richAccount)).to.be.true;
      expect(await contract.canExecute(tx, poorAccount)).to.be.false;
    });
  });

  describe("merkle stuff", function () {
    it("makes merkle leaves", async function () {
      const tx = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      const leaf = await contract.getMerkleLeaf(tx);
      expect(leaf).to.be.properHex(64); 
    });

    it("different txs have different leaves", async function () {
      const tx1 = makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));
      const tx2 = makeTx(user1.address, user3.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01"));

      const leaf1 = await contract.getMerkleLeaf(tx1);
      const leaf2 = await contract.getMerkleLeaf(tx2);
      expect(leaf1).to.not.equal(leaf2);
    });

    it("batches transactions for merkle trees", async function () {
      const txs = [
        makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01")),
        makeTx(user2.address, user3.address, ethers.parseEther("0.5"), 0n, ethers.parseEther("0.005"))
      ];

      const leaves = await contract.serializeBatch(txs);
      
      expect(leaves.length).to.equal(2);
      expect(leaves[0]).to.be.properHex(64);
      expect(leaves[1]).to.be.properHex(64);
      expect(leaves[0]).to.not.equal(leaves[1]);
    });
  });
});