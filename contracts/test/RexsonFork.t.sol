// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RexsonFactLedger} from "../src/RexsonFactLedger.sol";
import {RexsonLedgerMath as M} from "../src/RexsonLedgerMath.sol";

/// @notice Runs against a fork of Robinhood Chain mainnet (chain id 4663):
///   forge test --match-contract Fork --fork-url <rpc> --evm-version cancun
/// Deploys the ledger on the real chain state and runs the launch-date flow end to end; also checks the chain id and that the
/// deployment fits the chain's contract size limit.
contract RexsonForkTest is Test {
    RexsonFactLedger L;
    address owner = makeAddr("rexson-fork-owner");
    address editor = makeAddr("rexson-fork-editor");
    address reviewer = makeAddr("rexson-fork-reviewer");

    function setUp() public {
        L = new RexsonFactLedger();
    }

    function test_fork_chainIsRobinhood() public view {
        assertEq(block.chainid, 4663);
        assertGt(block.number, 0);
        assertLt(address(L).code.length, 24_576);
    }

    function test_fork_launchDateFlow() public {
        vm.prank(owner);
        uint256 p = L.openProject(keccak256("Release"), false);
        vm.startPrank(owner);
        L.setRoles(p, editor, 1);
        L.setRoles(p, reviewer, 2);
        uint256 g = L.issueGrant(p, keccak256("rk_writing"), 1 << 1, 0, uint64(block.timestamp + 7 days));
        vm.stopPrank();
        bytes32 key = keccak256("launch_date");
        vm.prank(editor);
        uint256 d1 = L.propose(p, key, 0, keccak256("Monday, 7 December"), 1, 0);
        uint256[] memory ids = new uint256[](1);
        ids[0] = d1;
        vm.prank(reviewer);
        L.approveBatch(p, ids);
        assertEq(L.checkRead(g, key), 0);
        vm.prank(editor);
        ids[0] = L.propose(p, key, 1, keccak256("Tuesday, 8 December"), 1, 0);
        vm.prank(reviewer);
        L.approveBatch(p, ids);
        assertEq(L.factOf(p, key).version, 2);
        assertEq(L.factOf(p, key).contentHash, keccak256("Tuesday, 8 December"));
        vm.prank(owner);
        L.revokeGrant(g);
        assertEq(L.checkRead(g, key), M.R_GRANT_REVOKED);
    }
}
