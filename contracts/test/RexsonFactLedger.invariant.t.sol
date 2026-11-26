// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RexsonFactLedger} from "../src/RexsonFactLedger.sol";
import {RexsonLedgerMath as M} from "../src/RexsonLedgerMath.sol";

/// @notice Editors, reviewers, the owner and strangers propose, approve in batches, reject, retire, grant and revoke at random.
contract RexsonLedgerActor is Test {
    RexsonFactLedger public L;
    uint256 public P;
    address public owner = address(0xA11CE);
    address public editor = address(0xED17);
    address public reviewer = address(0x5EE);
    address public stranger = address(0x5745);
    bytes32[4] public keys = [keccak256("a"), keccak256("b"), keccak256("c"), keccak256("d")];
    uint256[] public drafts;
    uint256[] public grants;
    mapping(bytes32 => uint32) public lastSeenVersion;
    uint256 public versionJumps;
    uint256 public strangerWins;
    uint256 public revokedReadable;
    uint256 public workspaceReadable;

    constructor() {
        vm.warp(1_800_000_000);
        L = new RexsonFactLedger();
        vm.prank(owner);
        P = L.openProject(keccak256("p"), false);
        vm.startPrank(owner);
        L.setRoles(P, editor, 1);
        L.setRoles(P, reviewer, 2);
        vm.stopPrank();
    }

    function propose(uint8 k, uint8 vis, bool useOldBase) external {
        bytes32 key = keys[k % 4];
        uint32 v = L.factOf(P, key).version;
        uint32 base = useOldBase && v > 0 ? v - 1 : v;
        vm.prank(editor);
        try L.propose(P, key, base, keccak256(abi.encode(drafts.length, key)), k % 3, vis % 3) returns (uint256 id) {
            drafts.push(id);
        } catch {}
    }

    function approve(uint256 a, uint256 b, bool two) external {
        if (drafts.length == 0) return;
        uint256[] memory ids = new uint256[](two ? 2 : 1);
        ids[0] = drafts[a % drafts.length];
        if (two) ids[1] = drafts[b % drafts.length];
        vm.prank(reviewer);
        try L.approveBatch(P, ids) {} catch {}
        _track();
    }

    function reject(uint256 a) external {
        if (drafts.length == 0) return;
        vm.prank(reviewer);
        try L.reject(drafts[a % drafts.length]) {} catch {}
    }

    function retire(uint8 k) external {
        vm.prank(reviewer);
        try L.retire(P, keys[k % 4]) {} catch {}
    }

    function grant(uint256 groups, uint8 vis) external {
        vm.prank(owner);
        try L.issueGrant(P, keccak256(abi.encode(grants.length)), groups | 1, vis % 2, uint64(block.timestamp + 5 days)) returns (uint256 g) {
            grants.push(g);
        } catch {}
    }

    function revoke(uint256 g) external {
        if (grants.length == 0) return;
        vm.prank(owner);
        try L.revokeGrant(grants[g % grants.length]) {} catch {}
    }

    function strangerTries(uint256 a, uint8 k) external {
        vm.startPrank(stranger);
        if (drafts.length > 0) {
            uint256[] memory ids = new uint256[](1);
            ids[0] = drafts[a % drafts.length];
            try L.approveBatch(P, ids) {
                strangerWins++;
            } catch {}
        }
        try L.propose(P, keys[k % 4], L.factOf(P, keys[k % 4]).version, keccak256("x"), 0, 0) {
            strangerWins++;
        } catch {}
        try L.issueGrant(P, keccak256("s"), 1, 0, uint64(block.timestamp + 1 days)) {
            strangerWins++;
        } catch {}
        vm.stopPrank();
    }

    function wait(uint32 dt) external {
        vm.warp(block.timestamp + (dt % 2 days));
    }

    function _track() internal {
        for (uint256 i = 0; i < 4; i++) {
            uint32 v = L.factOf(P, keys[i]).version;
            if (v > lastSeenVersion[keys[i]] + 2) versionJumps++; // a batch adds at most one version per fact
            lastSeenVersion[keys[i]] = v;
        }
        for (uint256 g = 0; g < grants.length; g++) {
            RexsonFactLedger.Grant memory gr = L.grantOf(grants[g]);
            for (uint256 i = 0; i < 4; i++) {
                uint256 r = L.checkRead(grants[g], keys[i]);
                if (gr.revoked && r == 0) revokedReadable++;
                if (L.factOf(P, keys[i]).visibility == M.WORKSPACE_ONLY && r == 0) workspaceReadable++;
            }
        }
    }

    function draftCount() external view returns (uint256) {
        return drafts.length;
    }
}

contract RexsonFactLedgerInvariant is Test {
    RexsonLedgerActor internal actor;

    function setUp() public {
        actor = new RexsonLedgerActor();
        targetContract(address(actor));
    }

    function invariant_strangersNeverWrite() public view {
        assertEq(actor.strangerWins(), 0);
    }

    function invariant_revokedNeverReads() public view {
        assertEq(actor.revokedReadable(), 0);
    }

    function invariant_workspaceOnlyNeverReads() public view {
        assertEq(actor.workspaceReadable(), 0);
    }

    function invariant_versionsStepByOne() public view {
        assertEq(actor.versionJumps(), 0);
    }

    function invariant_holdsNoEther() public view {
        assertEq(address(actor.L()).balance, 0);
    }
}
