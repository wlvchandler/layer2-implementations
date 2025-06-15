import { expect } from "chai";
import { ethers } from "hardhat";

describe("MerkleLib", function () {
  let contract: any;

  beforeEach(async function () {
    const factory = await ethers.getContractFactory("MerkleLibTest");
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  function makeLeaves(count: number): string[] {
    const leaves: string[] = [];
    for (let i = 0; i < count; i++) {
      leaves.push(ethers.keccak256(ethers.toUtf8Bytes(`leaf-${i}`)));
    }
    return leaves;
  }

  describe("root computation", function () {
    it("handles single leaf", async function () {
      const leaves = [ethers.keccak256(ethers.toUtf8Bytes("single-leaf"))];
      const root = await contract.computeRoot(leaves);
      expect(root).to.equal(leaves[0]);
    });

    it("computes root for two leaves", async function () {
      const leaves = makeLeaves(2);
      const root = await contract.computeRoot(leaves);
      
      const expectedRoot = await contract.hashPair(leaves[0], leaves[1]);
      expect(root).to.equal(expectedRoot);
    });

    it("works with power-of-2 trees", async function () {
      const leaves = makeLeaves(4);
      const root = await contract.computeRoot(leaves);
      
      // manually compute expected root
      const level1_0 = await contract.hashPair(leaves[0], leaves[1]);
      const level1_1 = await contract.hashPair(leaves[2], leaves[3]);
      const expectedRoot = await contract.hashPair(level1_0, level1_1);
      
      expect(root).to.equal(expectedRoot);
    });

    it("handles odd number of leaves", async function () {
      const leaves = makeLeaves(3);
      const root = await contract.computeRoot(leaves);
      expect(root).to.be.properHex(64);
    });

    it("works with larger trees", async function () {
      const leaves = makeLeaves(8);
      const root = await contract.computeRoot(leaves);
      expect(root).to.be.properHex(64);
    });

    it("rejects empty arrays", async function () {
      await expect(contract.computeRoot([])).to.be.revertedWith("Empty leaves array");
    });
  });

  describe("proof generation and verification", function () {
    it("handles single leaf proofs", async function () {
      const leaves = [ethers.keccak256(ethers.toUtf8Bytes("single-leaf"))];
      const root = await contract.computeRoot(leaves);
      
      const proof = await contract.generateProof(leaves, 0);
      const isValid = await contract.verifyProof(leaves[0], root, proof);
      
      expect(isValid).to.be.true;
      expect(proof.proof.length).to.equal(0); // no siblings for single leaf
    });

    it("works for two-leaf trees", async function () {
      const leaves = makeLeaves(2);
      const root = await contract.computeRoot(leaves);
      
      // test proof for first leaf
      const proof0 = await contract.generateProof(leaves, 0);
      const isValid0 = await contract.verifyProof(leaves[0], root, proof0);
      expect(isValid0).to.be.true;
      expect(proof0.proof.length).to.equal(1);
      expect(proof0.proof[0]).to.equal(leaves[1]); // sibling is leaves[1]
      
      // test proof for second leaf
      const proof1 = await contract.generateProof(leaves, 1);
      const isValid1 = await contract.verifyProof(leaves[1], root, proof1);
      expect(isValid1).to.be.true;
      expect(proof1.proof.length).to.equal(1);
      expect(proof1.proof[0]).to.equal(leaves[0]); // sibling is leaves[0]
    });

    it("works for 4-leaf trees", async function () {
      const leaves = makeLeaves(4);
      const root = await contract.computeRoot(leaves);
      
      // test proofs for all leaves
      for (let i = 0; i < 4; i++) {
        const proof = await contract.generateProof(leaves, i);
        const isValid = await contract.verifyProof(leaves[i], root, proof);
        expect(isValid).to.be.true;
        expect(proof.proof.length).to.equal(2); // tree depth is 2
      }
    });

    it("works for 8-leaf trees", async function () {
      const leaves = makeLeaves(8);
      const root = await contract.computeRoot(leaves);
      
      // test proofs for all leaves
      for (let i = 0; i < 8; i++) {
        const proof = await contract.generateProof(leaves, i);
        const isValid = await contract.verifyProof(leaves[i], root, proof);
        expect(isValid).to.be.true;
        expect(proof.proof.length).to.equal(3); // tree depth is 3
      }
    });

    it("rejects bad proofs", async function () {
      const leaves = makeLeaves(4);
      const root = await contract.computeRoot(leaves);
      
      const validProof = await contract.generateProof(leaves, 0);
      
      // test with wrong leaf
      const wrongLeaf = ethers.keccak256(ethers.toUtf8Bytes("wrong-leaf"));
      const isValidWrongLeaf = await contract.verifyProof(wrongLeaf, root, validProof);
      expect(isValidWrongLeaf).to.be.false;
      
      // test with wrong root
      const wrongRoot = ethers.keccak256(ethers.toUtf8Bytes("wrong-root"));
      const isValidWrongRoot = await contract.verifyProof(leaves[0], wrongRoot, validProof);
      expect(isValidWrongRoot).to.be.false;
    });

    it("handles weird sized trees", async function () {
      const leaves = makeLeaves(5);
      const root = await contract.computeRoot(leaves);
      
      // test proofs for all leaves
      for (let i = 0; i < 5; i++) {
        const proof = await contract.generateProof(leaves, i);
        const isValid = await contract.verifyProof(leaves[i], root, proof);
        expect(isValid).to.be.true;
      }
    });

    it("rejects out of bounds index", async function () {
      const leaves = makeLeaves(4);
      await expect(contract.generateProof(leaves, 4)).to.be.revertedWith("Leaf index out of bounds");
    });
  });

  describe("helper functions", function () {
    it("hashes pairs correctly", async function () {
      const left = ethers.keccak256(ethers.toUtf8Bytes("left"));
      const right = ethers.keccak256(ethers.toUtf8Bytes("right"));
      
      const hash = await contract.hashPair(left, right);
      const expectedHash = ethers.keccak256(ethers.concat([left, right]));
      
      expect(hash).to.equal(expectedHash);
    });

    it("calculates sibling indices", async function () {
      expect(await contract.getSiblingIndex(0)).to.equal(1); // left -> right sibling
      expect(await contract.getSiblingIndex(1)).to.equal(0); // right -> left sibling
      expect(await contract.getSiblingIndex(2)).to.equal(3);
      expect(await contract.getSiblingIndex(3)).to.equal(2);
    });

    it("calculates proof lengths", async function () {
      expect(await contract.getTreeDepth(1)).to.equal(0);
      expect(await contract.getTreeDepth(2)).to.equal(1);
      expect(await contract.getTreeDepth(4)).to.equal(2);
      expect(await contract.getTreeDepth(8)).to.equal(3);
      expect(await contract.getTreeDepth(5)).to.equal(3); // non-power-of-2
    });

    it("calculates tree depths", async function () {
      expect(await contract.getTreeDepth(1)).to.equal(0);
      expect(await contract.getTreeDepth(2)).to.equal(1);
      expect(await contract.getTreeDepth(4)).to.equal(2);
      expect(await contract.getTreeDepth(8)).to.equal(3);
      expect(await contract.getTreeDepth(5)).to.equal(3); // non-power-of-2
    });

    it("counts internal nodes", async function () {
      expect(await contract.getInternalNodeCount(1)).to.equal(0);
      expect(await contract.getInternalNodeCount(2)).to.equal(1);
      expect(await contract.getInternalNodeCount(4)).to.equal(3);
      expect(await contract.getInternalNodeCount(8)).to.equal(7);
    });
  });

  describe("tree validation", function () {
    it("validates correct trees", async function () {
      const leaves = makeLeaves(4);
      const root = await contract.computeRoot(leaves);
      
      const isValid = await contract.isValidTree(leaves, root);
      expect(isValid).to.be.true;
    });

    it("rejects bad trees", async function () {
      const leaves = makeLeaves(4);
      const wrongRoot = ethers.keccak256(ethers.toUtf8Bytes("wrong-root"));
      
      const isValid = await contract.isValidTree(leaves, wrongRoot);
      expect(isValid).to.be.false;
    });

    it("handles empty trees", async function () {
      const isValid = await contract.isValidTree([], ethers.ZeroHash);
      expect(isValid).to.be.true;
      
      const isInvalid = await contract.isValidTree([], ethers.keccak256(ethers.toUtf8Bytes("not-zero")));
      expect(isInvalid).to.be.false;
    });
  });

  describe("batch verification", function () {
    it("verifies multiple proofs at once", async function () {
      const leaves = makeLeaves(4);
      const root = await contract.computeRoot(leaves);
      
      // generate proofs for all leaves
      const proofs = [];
      for (let i = 0; i < 4; i++) {
        const proof = await contract.generateProof(leaves, i);
        proofs.push(proof);
      }
      
      const isValid = await contract.verifyMultiProof(leaves, root, proofs);
      expect(isValid).to.be.true;
    });

    it("catches bad proofs in batches", async function () {
      const leaves = makeLeaves(4);
      const root = await contract.computeRoot(leaves);
      
      // generate valid proofs
      const proofs = [];
      for (let i = 0; i < 4; i++) {
        const proof = await contract.generateProof(leaves, i);
        proofs.push(proof);
      }
      
      // corrupt one leaf
      const corruptedLeaves = [...leaves];
      corruptedLeaves[2] = ethers.keccak256(ethers.toUtf8Bytes("corrupted"));
      
      const isValid = await contract.verifyMultiProof(corruptedLeaves, root, proofs);
      expect(isValid).to.be.false;
    });

    it("rejects mismatched arrays", async function () {
      const leaves = makeLeaves(4);
      const root = await contract.computeRoot(leaves);
      
      const proofs = [];
      for (let i = 0; i < 2; i++) { // only 2 proofs for 4 leaves
        const proof = await contract.generateProof(leaves, i);
        proofs.push(proof);
      }
      
      await expect(contract.verifyMultiProof(leaves, root, proofs))
        .to.be.revertedWith("Leaves and proofs length mismatch");
    });
  });

  describe("performance", function () {
    it("handles big trees", async function () {
      const leaves = makeLeaves(32); // 2^5 leaves
      const root = await contract.computeRoot(leaves);
      
      // test a few random proofs
      const testIndices = [0, 15, 31];
      for (const index of testIndices) {
        const proof = await contract.generateProof(leaves, index);
        const isValid = await contract.verifyProof(leaves[index], root, proof);
        expect(isValid).to.be.true;
        expect(proof.proof.length).to.equal(5); // tree depth for 32 leaves
      }
    });
  });
});