// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RexsonFactLedger} from "../src/RexsonFactLedger.sol";
import {RexsonLedgerMath as M} from "../src/RexsonLedgerMath.sol";

contract RexsonFactLedgerTest is Test {
    RexsonFactLedger internal L;
    address internal owner = address(0xA11CE);
    address internal editor = address(0xED17);
    address internal reviewer = address(0x5EE);
    address internal outsider = address(0xBAD);
    uint256 internal P;

    bytes32 internal constant LAUNCH = keccak256("launch_date");
    bytes32 internal constant PRICE = keccak256("price_note");
    bytes32 internal constant H1 = keccak256("v1");
    bytes32 internal constant H2 = keccak256("v2");
    bytes32 internal constant KEY = keccak256("rk_assistant_one");

    function setUp() public {
        vm.warp(1_800_000_000);
        L = new RexsonFactLedger();
        vm.prank(owner);
        P = L.openProject(keccak256("Release"), false);
        vm.startPrank(owner);
        L.setRoles(P, editor, 1);
        L.setRoles(P, reviewer, 2);
        vm.stopPrank();
    }

    function _propose(address who, bytes32 key, uint32 base, bytes32 h, uint8 group, uint8 vis) internal returns (uint256 id) {
        vm.prank(who);
        id = L.propose(P, key, base, h, group, vis);
    }

    function _one(uint256 id) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = id;
    }

    function _approve(address who, uint256 id) internal {
        vm.prank(who);
        L.approveBatch(P, _one(id));
    }

    function _grant(uint256 groups, uint8 vis) internal returns (uint256 g) {
        vm.prank(owner);
        g = L.issueGrant(P, KEY, groups, vis, uint64(block.timestamp + 30 days));
    }

    // ------------------------------------------------------------------ projects + roles
    function test_openProjectSetsOwner() public view {
        RexsonFactLedger.Project memory p = L.projectOf(P);
        assertEq(p.owner, owner);
        assertEq(L.projectCount(), 1);
        assertFalse(p.soloApproval);
    }

    function test_onlyOwnerSetsRoles() public {
        vm.prank(outsider);
        vm.expectRevert(RexsonFactLedger.NotOwner.selector);
        L.setRoles(P, outsider, 3);
    }

    function test_setRolesMasksUnknownBits() public {
        vm.prank(owner);
        L.setRoles(P, outsider, 0xff);
        assertEq(L.roles(P, outsider), 7);
    }

    function test_setRolesZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(RexsonFactLedger.ZeroAddress.selector);
        L.setRoles(P, address(0), 1);
    }

    function test_unknownProjectRefused() public {
        vm.prank(owner);
        vm.expectRevert(RexsonFactLedger.UnknownProject.selector);
        L.setPaused(99, true);
    }

    function test_ownershipHandoverTwoStep() public {
        vm.prank(owner);
        L.offerOwnership(P, outsider);
        vm.prank(editor);
        vm.expectRevert(RexsonFactLedger.NotPendingOwner.selector);
        L.acceptOwnership(P);
        vm.prank(outsider);
        L.acceptOwnership(P);
        assertEq(L.projectOf(P).owner, outsider);
        vm.prank(owner);
        vm.expectRevert(RexsonFactLedger.NotOwner.selector);
        L.setPaused(P, true);
    }

    // ------------------------------------------------------------------ drafts
    function test_proposeAndApprove() public {
        uint256 d = _propose(editor, LAUNCH, 0, H1, 1, 0);
        _approve(reviewer, d);
        RexsonFactLedger.Fact memory f = L.factOf(P, LAUNCH);
        assertEq(f.version, 1);
        assertEq(f.contentHash, H1);
        assertEq(uint8(L.draftOf(d).status), uint8(RexsonFactLedger.DraftStatus.Approved));
    }

    function test_outsiderCannotPropose() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(RexsonFactLedger.Refused.selector, M.D_NOT_EDITOR));
        L.propose(P, LAUNCH, 0, H1, 1, 0);
    }

    function test_proposeReasonsCombine() public view {
        uint256 r = L.checkPropose(outsider, P, bytes32(0), 3, bytes32(0), 9);
        assertEq(r, M.D_NOT_EDITOR | M.D_EMPTY_KEY | M.D_EMPTY_CONTENT | M.D_BAD_VISIBILITY | M.D_STALE_BASE);
        assertEq(L.checkPropose(owner, 77, LAUNCH, 0, H1, 0), M.D_UNKNOWN_PROJECT);
    }

    function test_staleDraftHeldBack() public {
        uint256 a = _propose(editor, LAUNCH, 0, H1, 1, 0);
        uint256 b = _propose(editor, LAUNCH, 0, H2, 1, 0);
        _approve(reviewer, a);
        uint256[] memory r = L.checkApprove(reviewer, P, _one(b));
        assertEq(r[0], M.D_STALE_BASE);
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(RexsonFactLedger.RefusedAt.selector, 0, M.D_STALE_BASE));
        L.approveBatch(P, _one(b));
        assertEq(L.factOf(P, LAUNCH).contentHash, H1);
    }

    function test_proposeOnOldBaseRefused() public {
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, 1, 0));
        vm.prank(editor);
        vm.expectRevert(abi.encodeWithSelector(RexsonFactLedger.Refused.selector, M.D_STALE_BASE));
        L.propose(P, LAUNCH, 0, H2, 1, 0);
    }

    function test_reviewerCannotApproveOwnDraft() public {
        vm.prank(owner);
        L.setRoles(P, reviewer, 3);
        uint256 d = _propose(reviewer, LAUNCH, 0, H1, 1, 0);
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(RexsonFactLedger.RefusedAt.selector, 0, M.D_OWN_DRAFT));
        L.approveBatch(P, _one(d));
    }

    function test_ownerOwnDraftOnlyWithSoloApproval() public {
        uint256 d = _propose(owner, LAUNCH, 0, H1, 1, 0);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(RexsonFactLedger.RefusedAt.selector, 0, M.D_OWN_DRAFT));
        L.approveBatch(P, _one(d));

        vm.prank(owner);
        uint256 solo = L.openProject(keccak256("Solo"), true);
        vm.prank(owner);
        uint256 d2 = L.propose(solo, LAUNCH, 0, H1, 0, 0);
        vm.prank(owner);
        L.approveBatch(solo, _one(d2));
        assertEq(L.factOf(solo, LAUNCH).version, 1);
    }

    function test_batchAllOrNothing() public {
        uint256 a = _propose(editor, LAUNCH, 0, H1, 1, 0);
        uint256 b = _propose(editor, PRICE, 0, H1, 2, 1);
        uint256 c = _propose(editor, PRICE, 0, H2, 2, 1);
        _approve(reviewer, b); // makes c stale
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = c;
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(RexsonFactLedger.RefusedAt.selector, 1, M.D_STALE_BASE));
        L.approveBatch(P, ids);
        assertEq(L.factOf(P, LAUNCH).version, 0, "first draft did not land");
        assertEq(uint8(L.draftOf(a).status), uint8(RexsonFactLedger.DraftStatus.Open));
    }

    function test_sameFactTwiceInBatchRefused() public {
        uint256 a = _propose(editor, LAUNCH, 0, H1, 1, 0);
        uint256 b = _propose(editor, LAUNCH, 0, H2, 1, 0);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        uint256[] memory r = L.checkApprove(reviewer, P, ids);
        assertEq(r[0], 0);
        assertEq(r[1], M.D_SAME_FACT_TWICE);
    }

    function test_batchLimits() public {
        vm.prank(reviewer);
        vm.expectRevert(RexsonFactLedger.EmptyBatch.selector);
        L.approveBatch(P, new uint256[](0));
        vm.prank(reviewer);
        vm.expectRevert(RexsonFactLedger.BatchTooLarge.selector);
        L.approveBatch(P, new uint256[](21));
    }

    function test_draftFromOtherProjectRefused() public {
        vm.prank(owner);
        uint256 q = L.openProject(keccak256("Other"), false);
        vm.prank(owner);
        uint256 d = L.propose(q, LAUNCH, 0, H1, 0, 0);
        uint256[] memory r = L.checkApprove(reviewer, P, _one(d));
        assertTrue(r[0] & M.D_OTHER_PROJECT != 0);
    }

    function test_rejectAndWithdraw() public {
        uint256 a = _propose(editor, LAUNCH, 0, H1, 1, 0);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(RexsonFactLedger.Refused.selector, M.D_NOT_REVIEWER));
        L.reject(a);
        vm.prank(reviewer);
        L.reject(a);
        vm.prank(reviewer);
        vm.expectRevert(RexsonFactLedger.DraftNotOpen.selector);
        L.reject(a);
        uint256 b = _propose(editor, LAUNCH, 0, H2, 1, 0);
        vm.prank(reviewer);
        vm.expectRevert(RexsonFactLedger.NotAuthor.selector);
        L.withdraw(b);
        vm.prank(editor);
        L.withdraw(b);
        assertEq(uint8(L.draftOf(b).status), uint8(RexsonFactLedger.DraftStatus.Withdrawn));
        uint256[] memory r = L.checkApprove(reviewer, P, _one(b));
        assertEq(r[0], M.D_DRAFT_NOT_OPEN);
        vm.expectRevert(RexsonFactLedger.UnknownDraft.selector);
        L.withdraw(999);
    }

    function test_retireAndRevive() public {
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, 1, 0));
        uint256 g = _grant(1 << 1, 0);
        assertEq(L.checkRead(g, LAUNCH), 0);
        vm.prank(reviewer);
        L.retire(P, LAUNCH);
        assertEq(L.checkRead(g, LAUNCH), M.R_FACT_RETIRED);
        vm.prank(reviewer);
        vm.expectRevert(RexsonFactLedger.AlreadyRetired.selector);
        L.retire(P, LAUNCH);
        _approve(reviewer, _propose(editor, LAUNCH, 1, H2, 1, 0));
        assertEq(L.checkRead(g, LAUNCH), 0);
        assertEq(L.factOf(P, LAUNCH).version, 2);
        vm.prank(reviewer);
        vm.expectRevert(RexsonFactLedger.UnknownFact.selector);
        L.retire(P, PRICE);
    }

    // ------------------------------------------------------------------ grants + reads
    function test_launchDateChangeNextReadSeesNewVersion() public {
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, 1, 0));
        uint256 g = _grant(1 << 1, 0);
        assertEq(L.checkRead(g, LAUNCH), 0);
        assertEq(L.factOf(P, LAUNCH).contentHash, H1);
        uint256 d = _propose(editor, LAUNCH, 1, H2, 1, 0);
        // the draft is not readable yet: the approved version is still the old one
        assertEq(L.factOf(P, LAUNCH).contentHash, H1);
        _approve(reviewer, d);
        assertEq(L.factOf(P, LAUNCH).contentHash, H2);
        assertEq(L.factOf(P, LAUNCH).version, 2);
    }

    function test_readReasons() public {
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, 1, 1)); // internal
        _approve(reviewer, _propose(editor, PRICE, 0, H1, 3, 2)); // workspace only
        uint256 g = _grant(1 << 1, 0); // shareable only, group 1
        assertEq(L.checkRead(g, LAUNCH), M.R_ABOVE_GRANT_LEVEL);
        assertEq(L.checkRead(g, PRICE), M.R_GROUP_NOT_GRANTED | M.R_WORKSPACE_ONLY);
        assertEq(L.checkRead(g, keccak256("nothing")), M.R_NO_APPROVED_VERSION | M.R_GROUP_NOT_GRANTED);
        assertEq(L.checkRead(42, LAUNCH), M.R_UNKNOWN_GRANT);
        vm.prank(owner);
        L.changeGrant(g, (1 << 1) | (1 << 3), 1, uint64(block.timestamp + 10 days));
        assertEq(L.checkRead(g, LAUNCH), 0);
        assertEq(L.checkRead(g, PRICE), M.R_WORKSPACE_ONLY, "workspace-only facts never leave");
        assertEq(L.grantOf(g).revision, 2);
    }

    function test_revokeTakesEffectSameBlock() public {
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, 1, 0));
        uint256 g = _grant(1 << 1, 0);
        vm.prank(owner);
        L.revokeGrant(g);
        assertEq(L.checkRead(g, LAUNCH), M.R_GRANT_REVOKED);
        vm.prank(owner);
        vm.expectRevert(RexsonFactLedger.GrantAlreadyRevoked.selector);
        L.revokeGrant(g);
        vm.prank(owner);
        vm.expectRevert(RexsonFactLedger.GrantAlreadyRevoked.selector);
        L.changeGrant(g, 1, 0, uint64(block.timestamp + 1 days));
    }

    function test_pauseStopsReads() public {
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, 1, 0));
        uint256 g = _grant(1 << 1, 0);
        vm.prank(owner);
        L.setPaused(P, true);
        assertEq(L.checkRead(g, LAUNCH), M.R_PROJECT_PAUSED);
        vm.prank(owner);
        L.setPaused(P, false);
        assertEq(L.checkRead(g, LAUNCH), 0);
    }

    function test_grantExpires() public {
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, 1, 0));
        uint256 g = _grant(1 << 1, 0);
        vm.warp(block.timestamp + 30 days);
        assertEq(L.checkRead(g, LAUNCH), M.R_GRANT_EXPIRED);
    }

    function test_badGrantsRefused() public {
        vm.startPrank(owner);
        vm.expectRevert(RexsonFactLedger.BadGrant.selector);
        L.issueGrant(P, KEY, 0, 0, uint64(block.timestamp + 1 days));
        vm.expectRevert(RexsonFactLedger.BadGrant.selector);
        L.issueGrant(P, KEY, 1, 2, uint64(block.timestamp + 1 days));
        vm.expectRevert(RexsonFactLedger.BadGrant.selector);
        L.issueGrant(P, KEY, 1, 0, uint64(block.timestamp));
        vm.expectRevert(RexsonFactLedger.BadGrant.selector);
        L.issueGrant(P, KEY, 1, 0, uint64(block.timestamp + 367 days));
        vm.expectRevert(RexsonFactLedger.BadGrant.selector);
        L.issueGrant(P, bytes32(0), 1, 0, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        vm.prank(editor);
        vm.expectRevert(RexsonFactLedger.NotOwner.selector);
        L.issueGrant(P, KEY, 1, 0, uint64(block.timestamp + 1 days));
    }

    function test_onlyProjectOwnerChangesGrant() public {
        uint256 g = _grant(1, 0);
        vm.prank(reviewer);
        vm.expectRevert(RexsonFactLedger.NotOwner.selector);
        L.revokeGrant(g);
        vm.prank(reviewer);
        vm.expectRevert(RexsonFactLedger.NotOwner.selector);
        L.changeGrant(g, 1, 0, uint64(block.timestamp + 1 days));
        vm.expectRevert(RexsonFactLedger.UnknownGrant.selector);
        L.revokeGrant(77);
    }

    function test_checkReadsBatch() public {
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, 1, 0));
        uint256 g = _grant(1 << 1, 0);
        bytes32[] memory keys = new bytes32[](2);
        keys[0] = LAUNCH;
        keys[1] = PRICE;
        uint256[] memory r = L.checkReads(g, keys);
        assertEq(r[0], 0);
        assertEq(r[1], M.R_NO_APPROVED_VERSION | M.R_GROUP_NOT_GRANTED);
    }

    // ------------------------------------------------------------------ receipts
    function test_anchorReceipts() public {
        vm.prank(owner);
        uint32 b = L.anchorReceipts(P, keccak256("root"), 3, uint64(block.timestamp - 60), uint64(block.timestamp));
        assertEq(b, 1);
        vm.prank(outsider);
        vm.expectRevert(RexsonFactLedger.NotOwner.selector);
        L.anchorReceipts(P, keccak256("root"), 3, 1, 2);
        vm.prank(owner);
        L.setRoles(P, outsider, 4);
        vm.prank(outsider);
        assertEq(L.anchorReceipts(P, keccak256("root2"), 1, 1, 2), 2);
    }

    function test_badReceiptsRefused() public {
        vm.startPrank(owner);
        vm.expectRevert(RexsonFactLedger.BadReceipts.selector);
        L.anchorReceipts(P, bytes32(0), 1, 1, 2);
        vm.expectRevert(RexsonFactLedger.BadReceipts.selector);
        L.anchorReceipts(P, keccak256("r"), 0, 1, 2);
        vm.expectRevert(RexsonFactLedger.BadReceipts.selector);
        L.anchorReceipts(P, keccak256("r"), 1, 5, 2);
        vm.expectRevert(RexsonFactLedger.BadReceipts.selector);
        L.anchorReceipts(P, keccak256("r"), 1, 1, uint64(block.timestamp + 1));
        vm.stopPrank();
    }

    function test_noFundsAccepted() public {
        vm.deal(outsider, 1 ether);
        vm.prank(outsider);
        (bool ok,) = address(L).call{value: 1 wei}("");
        assertFalse(ok);
        assertEq(address(L).balance, 0);
    }

    // ------------------------------------------------------------------ fuzz
    function testFuzz_readReasonsMatchLibrary(uint8 group, uint8 vis, uint256 groups, uint8 maxVis, uint32 dt) public {
        vis = uint8(bound(vis, 0, 2));
        maxVis = uint8(bound(maxVis, 0, 1));
        groups = groups == 0 ? 1 : groups;
        _approve(reviewer, _propose(editor, LAUNCH, 0, H1, group, vis));
        uint256 g = _grant(groups, maxVis);
        vm.warp(block.timestamp + bound(dt, 0, 60 days));
        uint256 r = L.checkRead(g, LAUNCH);
        bool expired = block.timestamp >= L.grantOf(g).expiresAt;
        assertEq(r & M.R_GRANT_EXPIRED != 0, expired);
        assertEq(r & M.R_GROUP_NOT_GRANTED != 0, groups & (uint256(1) << group) == 0);
        assertEq(r & M.R_WORKSPACE_ONLY != 0, vis == 2);
        assertEq(r & M.R_ABOVE_GRANT_LEVEL != 0, vis < 2 && vis > maxVis);
        if (vis == 2) assertTrue(r != 0, "workspace-only never readable");
    }

    function testFuzz_versionsOnlyGrowByOne(uint8 n) public {
        n = uint8(bound(n, 1, 15));
        for (uint32 i = 0; i < n; i++) {
            _approve(reviewer, _propose(editor, LAUNCH, i, keccak256(abi.encode(i)), 1, 0));
            assertEq(L.factOf(P, LAUNCH).version, i + 1);
        }
    }

    function testFuzz_outsiderNeverWrites(address who, uint256 groups) public {
        vm.assume(who != owner && who != editor && who != reviewer && who != address(0));
        uint256 d = _propose(editor, LAUNCH, 0, H1, 1, 0);
        vm.startPrank(who);
        vm.expectRevert();
        L.approveBatch(P, _one(d));
        vm.expectRevert();
        L.issueGrant(P, KEY, groups | 1, 0, uint64(block.timestamp + 1 days));
        vm.expectRevert();
        L.setPaused(P, true);
        vm.expectRevert();
        L.retire(P, LAUNCH);
        vm.stopPrank();
    }
}
