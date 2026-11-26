// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RexsonLedgerMath as M} from "./RexsonLedgerMath.sol";

/// @title RexsonFactLedger
/// @notice A public change log for approved project facts and the assistants allowed to read them.
///         Fact TEXT never comes on chain: only a keccak256 of each approved version (content hash), its group and its visibility
///         level. Assistant access keys never come on chain either: only the keccak256 of the key's public id.
///
///         Flow per project:
///           1. the owner opens a project and names editors and reviewers;
///           2. an editor proposes a draft for a fact, based on the fact's current approved version;
///           3. a reviewer approves a BATCH of drafts in one transaction: all of them land or none do, a draft built on an older
///              version is refused (stale), and a reviewer cannot approve their own draft unless the project allows solo approval;
///           4. the owner issues grants: one assistant key, a set of fact groups, a visibility ceiling and an expiry;
///           5. checkRead(grant, fact) says whether that assistant may read that fact right now, with every reason as a bit;
///           6. the owner (or a receipt anchor key) anchors batches of read receipts as a Merkle root.
///
///         No funds: nothing is payable, nothing is transferred, there is no fee, no admin over other people's projects and no upgrade.
contract RexsonFactLedger {
    // ------------------------------------------------------------------ roles inside a project
    uint8 public constant ROLE_EDITOR = 1;
    uint8 public constant ROLE_REVIEWER = 2;
    uint8 public constant ROLE_ANCHOR = 4;

    uint8 public constant MAX_BATCH = 20;
    uint64 public constant MAX_GRANT_LIFE = 366 days;

    enum DraftStatus {
        None,
        Open,
        Approved,
        Rejected,
        Withdrawn
    }

    struct Project {
        address owner;
        address pendingOwner;
        bool paused;
        bool soloApproval; // the owner may approve their own drafts (one-person projects)
        uint64 openedAt;
        uint32 receiptBatches;
        bytes32 nameHash;
    }

    struct Fact {
        uint32 version; // approved version, 0 = never approved
        uint8 group;
        uint8 visibility;
        bool retired;
        uint64 approvedAt;
        bytes32 contentHash;
    }

    struct Draft {
        uint256 project;
        bytes32 factKey;
        uint32 basedOn;
        uint8 group;
        uint8 visibility;
        DraftStatus status;
        address author;
        uint64 proposedAt;
        bytes32 contentHash;
    }

    struct Grant {
        uint256 project;
        bytes32 keyHash;
        uint256 groups;
        uint8 maxVisibility;
        bool revoked;
        uint32 revision;
        uint64 expiresAt;
    }

    uint256 public projectCount;
    uint256 public draftCount;
    uint256 public grantCount;

    mapping(uint256 => Project) internal _projects;
    mapping(uint256 => mapping(address => uint8)) public roles;
    mapping(uint256 => mapping(bytes32 => Fact)) internal _facts;
    mapping(uint256 => Draft) internal _drafts;
    mapping(uint256 => Grant) internal _grants;

    // ------------------------------------------------------------------ events (the public change log)
    event ProjectOpened(uint256 indexed project, address indexed owner, bytes32 nameHash, bool soloApproval);
    event RoleSet(uint256 indexed project, address indexed member, uint8 roles);
    event ProjectPaused(uint256 indexed project, bool paused);
    event OwnerOffered(uint256 indexed project, address indexed to);
    event OwnerChanged(uint256 indexed project, address indexed from, address indexed to);
    event DraftProposed(uint256 indexed project, bytes32 indexed factKey, uint256 indexed draft, uint32 basedOn, bytes32 contentHash, uint8 group, uint8 visibility, address author);
    event DraftClosed(uint256 indexed project, uint256 indexed draft, DraftStatus status, address by);
    event FactApproved(uint256 indexed project, bytes32 indexed factKey, uint32 indexed version, bytes32 contentHash, uint8 group, uint8 visibility, uint256 draft, address reviewer);
    event FactRetired(uint256 indexed project, bytes32 indexed factKey, uint32 version, address by);
    event GrantIssued(uint256 indexed project, uint256 indexed grant, bytes32 indexed keyHash, uint256 groups, uint8 maxVisibility, uint64 expiresAt);
    event GrantChanged(uint256 indexed project, uint256 indexed grant, uint32 revision, uint256 groups, uint8 maxVisibility, uint64 expiresAt);
    event GrantRevoked(uint256 indexed project, uint256 indexed grant);
    event ReceiptsAnchored(uint256 indexed project, uint32 indexed batch, bytes32 root, uint32 count, uint64 firstReadAt, uint64 lastReadAt, address by);

    // ------------------------------------------------------------------ errors
    error UnknownProject();
    error NotOwner();
    error NotPendingOwner();
    error Refused(uint256 reasons);
    error RefusedAt(uint256 index, uint256 reasons);
    error EmptyBatch();
    error BatchTooLarge();
    error UnknownDraft();
    error NotAuthor();
    error DraftNotOpen();
    error UnknownGrant();
    error GrantAlreadyRevoked();
    error BadGrant();
    error BadReceipts();
    error UnknownFact();
    error AlreadyRetired();
    error ZeroAddress();

    // ------------------------------------------------------------------ projects
    modifier onlyOwner(uint256 project) {
        Project storage p = _projects[project];
        if (p.owner == address(0)) revert UnknownProject();
        if (p.owner != msg.sender) revert NotOwner();
        _;
    }

    function openProject(bytes32 nameHash, bool soloApproval) external returns (uint256 id) {
        id = ++projectCount;
        _projects[id] = Project({owner: msg.sender, pendingOwner: address(0), paused: false, soloApproval: soloApproval, openedAt: uint64(block.timestamp), receiptBatches: 0, nameHash: nameHash});
        emit ProjectOpened(id, msg.sender, nameHash, soloApproval);
    }

    /// @notice Sets the roles of one member (bit set of ROLE_EDITOR, ROLE_REVIEWER, ROLE_ANCHOR; 0 removes the member).
    function setRoles(uint256 project, address member, uint8 roleBits) external onlyOwner(project) {
        if (member == address(0)) revert ZeroAddress();
        roles[project][member] = roleBits & (ROLE_EDITOR | ROLE_REVIEWER | ROLE_ANCHOR);
        emit RoleSet(project, member, roles[project][member]);
    }

    /// @notice Pausing stops every read check at once (checkRead returns R_PROJECT_PAUSED). Drafts and approvals keep working.
    function setPaused(uint256 project, bool paused) external onlyOwner(project) {
        _projects[project].paused = paused;
        emit ProjectPaused(project, paused);
    }

    /// @notice Two-step ownership handover: offer, then the new owner accepts. Offering address(0) cancels.
    function offerOwnership(uint256 project, address to) external onlyOwner(project) {
        _projects[project].pendingOwner = to;
        emit OwnerOffered(project, to);
    }

    function acceptOwnership(uint256 project) external {
        Project storage p = _projects[project];
        if (p.owner == address(0)) revert UnknownProject();
        if (p.pendingOwner != msg.sender || msg.sender == address(0)) revert NotPendingOwner();
        address from = p.owner;
        p.owner = msg.sender;
        p.pendingOwner = address(0);
        emit OwnerChanged(project, from, msg.sender);
    }

    // ------------------------------------------------------------------ drafts and approvals
    function _isEditor(uint256 project, address who) internal view returns (bool) {
        return _projects[project].owner == who || roles[project][who] & ROLE_EDITOR != 0;
    }

    function _isReviewer(uint256 project, address who) internal view returns (bool) {
        return _projects[project].owner == who || roles[project][who] & ROLE_REVIEWER != 0;
    }

    /// @notice Reasons `who` may not propose this draft now (0 = allowed).
    function checkPropose(address who, uint256 project, bytes32 factKey, uint32 basedOn, bytes32 contentHash, uint8 visibility) public view returns (uint256 r) {
        if (_projects[project].owner == address(0)) return M.D_UNKNOWN_PROJECT;
        if (!_isEditor(project, who)) r |= M.D_NOT_EDITOR;
        if (factKey == bytes32(0)) r |= M.D_EMPTY_KEY;
        if (contentHash == bytes32(0)) r |= M.D_EMPTY_CONTENT;
        if (visibility > M.WORKSPACE_ONLY) r |= M.D_BAD_VISIBILITY;
        if (_facts[project][factKey].version != basedOn) r |= M.D_STALE_BASE;
    }

    function propose(uint256 project, bytes32 factKey, uint32 basedOn, bytes32 contentHash, uint8 group, uint8 visibility) external returns (uint256 id) {
        uint256 r = checkPropose(msg.sender, project, factKey, basedOn, contentHash, visibility);
        if (r != 0) revert Refused(r);
        id = ++draftCount;
        _drafts[id] = Draft({project: project, factKey: factKey, basedOn: basedOn, group: group, visibility: visibility, status: DraftStatus.Open, author: msg.sender, proposedAt: uint64(block.timestamp), contentHash: contentHash});
        emit DraftProposed(project, factKey, id, basedOn, contentHash, group, visibility, msg.sender);
    }

    /// @notice Reasons per draft that `reviewer` may not approve this batch now (all zero = the batch would land).
    function checkApprove(address reviewer, uint256 project, uint256[] calldata drafts) public view returns (uint256[] memory out) {
        out = new uint256[](drafts.length);
        Project storage p = _projects[project];
        bool known = p.owner != address(0);
        bool reviewerOk = known && _isReviewer(project, reviewer);
        for (uint256 i = 0; i < drafts.length; i++) {
            if (!known) {
                out[i] = M.D_UNKNOWN_PROJECT;
                continue;
            }
            Draft storage d = _drafts[drafts[i]];
            uint256 r;
            if (!reviewerOk) r |= M.D_NOT_REVIEWER;
            if (d.status != DraftStatus.Open) r |= M.D_DRAFT_NOT_OPEN;
            if (d.project != project) r |= M.D_OTHER_PROJECT;
            if (d.author == reviewer && !(p.soloApproval && reviewer == p.owner)) r |= M.D_OWN_DRAFT;
            if (d.status == DraftStatus.Open && _facts[project][d.factKey].version != d.basedOn) r |= M.D_STALE_BASE;
            for (uint256 j = 0; j < i; j++) {
                if (_drafts[drafts[j]].factKey == d.factKey && d.factKey != bytes32(0)) {
                    r |= M.D_SAME_FACT_TWICE;
                    break;
                }
            }
            out[i] = r;
        }
    }

    /// @notice Approves every draft in the batch, or none: one refused draft reverts the whole transaction.
    function approveBatch(uint256 project, uint256[] calldata drafts) external {
        if (drafts.length == 0) revert EmptyBatch();
        if (drafts.length > MAX_BATCH) revert BatchTooLarge();
        uint256[] memory r = checkApprove(msg.sender, project, drafts);
        for (uint256 i = 0; i < r.length; i++) if (r[i] != 0) revert RefusedAt(i, r[i]);
        for (uint256 i = 0; i < drafts.length; i++) {
            Draft storage d = _drafts[drafts[i]];
            d.status = DraftStatus.Approved;
            Fact storage f = _facts[project][d.factKey];
            uint32 v = d.basedOn + 1;
            f.version = v;
            f.group = d.group;
            f.visibility = d.visibility;
            f.retired = false;
            f.approvedAt = uint64(block.timestamp);
            f.contentHash = d.contentHash;
            emit FactApproved(project, d.factKey, v, d.contentHash, d.group, d.visibility, drafts[i], msg.sender);
        }
    }

    /// @notice A reviewer rejects an open draft; its author may withdraw it.
    function reject(uint256 draft) external {
        Draft storage d = _drafts[draft];
        if (d.status == DraftStatus.None) revert UnknownDraft();
        if (d.status != DraftStatus.Open) revert DraftNotOpen();
        if (!_isReviewer(d.project, msg.sender)) revert Refused(M.D_NOT_REVIEWER);
        d.status = DraftStatus.Rejected;
        emit DraftClosed(d.project, draft, DraftStatus.Rejected, msg.sender);
    }

    function withdraw(uint256 draft) external {
        Draft storage d = _drafts[draft];
        if (d.status == DraftStatus.None) revert UnknownDraft();
        if (d.status != DraftStatus.Open) revert DraftNotOpen();
        if (d.author != msg.sender) revert NotAuthor();
        d.status = DraftStatus.Withdrawn;
        emit DraftClosed(d.project, draft, DraftStatus.Withdrawn, msg.sender);
    }

    /// @notice Retires an approved fact: every read check for it fails from this block on. A later approved draft revives it.
    function retire(uint256 project, bytes32 factKey) external {
        if (_projects[project].owner == address(0)) revert UnknownProject();
        if (!_isReviewer(project, msg.sender)) revert Refused(M.D_NOT_REVIEWER);
        Fact storage f = _facts[project][factKey];
        if (f.version == 0) revert UnknownFact();
        if (f.retired) revert AlreadyRetired();
        f.retired = true;
        emit FactRetired(project, factKey, f.version, msg.sender);
    }

    // ------------------------------------------------------------------ grants
    function _validGrant(uint256 groups, uint8 maxVisibility, uint64 expiresAt) internal view {
        if (groups == 0 || maxVisibility > M.INTERNAL || expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_GRANT_LIFE) revert BadGrant();
    }

    /// @param keyHash keccak256 of the assistant key's public id (the secret never comes on chain)
    function issueGrant(uint256 project, bytes32 keyHash, uint256 groups, uint8 maxVisibility, uint64 expiresAt) external onlyOwner(project) returns (uint256 id) {
        if (keyHash == bytes32(0)) revert BadGrant();
        _validGrant(groups, maxVisibility, expiresAt);
        id = ++grantCount;
        _grants[id] = Grant({project: project, keyHash: keyHash, groups: groups, maxVisibility: maxVisibility, revoked: false, revision: 1, expiresAt: expiresAt});
        emit GrantIssued(project, id, keyHash, groups, maxVisibility, expiresAt);
    }

    /// @notice Narrows or widens a live grant. The very next checkRead follows the new scope.
    function changeGrant(uint256 grant, uint256 groups, uint8 maxVisibility, uint64 expiresAt) external {
        Grant storage g = _grants[grant];
        if (g.project == 0) revert UnknownGrant();
        if (_projects[g.project].owner != msg.sender) revert NotOwner();
        if (g.revoked) revert GrantAlreadyRevoked();
        _validGrant(groups, maxVisibility, expiresAt);
        g.groups = groups;
        g.maxVisibility = maxVisibility;
        g.expiresAt = expiresAt;
        g.revision += 1;
        emit GrantChanged(g.project, grant, g.revision, groups, maxVisibility, expiresAt);
    }

    /// @notice Ends a grant for good, in this block.
    function revokeGrant(uint256 grant) external {
        Grant storage g = _grants[grant];
        if (g.project == 0) revert UnknownGrant();
        if (_projects[g.project].owner != msg.sender) revert NotOwner();
        if (g.revoked) revert GrantAlreadyRevoked();
        g.revoked = true;
        emit GrantRevoked(g.project, grant);
    }

    /// @notice Reasons this grant may not read this fact right now (0 = allowed). Every bit is listed in RexsonLedgerMath.
    function checkRead(uint256 grant, bytes32 factKey) public view returns (uint256) {
        Grant storage g = _grants[grant];
        if (g.project == 0) return M.R_UNKNOWN_GRANT;
        Fact storage f = _facts[g.project][factKey];
        return M.readReasons(true, g.revoked, g.expiresAt, _projects[g.project].paused, f.version, f.retired, g.groups, g.maxVisibility, f.group, f.visibility, block.timestamp);
    }

    /// @notice checkRead for many facts at once (the site uses it before every hosted read of a linked grant).
    function checkReads(uint256 grant, bytes32[] calldata factKeys) external view returns (uint256[] memory out) {
        out = new uint256[](factKeys.length);
        for (uint256 i = 0; i < factKeys.length; i++) out[i] = checkRead(grant, factKeys[i]);
    }

    // ------------------------------------------------------------------ read receipts
    /// @notice Anchors one batch of read receipts (a Merkle root over receipt hashes; the receipts hold no fact text).
    function anchorReceipts(uint256 project, bytes32 root, uint32 count, uint64 firstReadAt, uint64 lastReadAt) external returns (uint32 batch) {
        Project storage p = _projects[project];
        if (p.owner == address(0)) revert UnknownProject();
        if (p.owner != msg.sender && roles[project][msg.sender] & ROLE_ANCHOR == 0) revert NotOwner();
        if (root == bytes32(0) || count == 0 || firstReadAt > lastReadAt || lastReadAt > block.timestamp) revert BadReceipts();
        batch = ++p.receiptBatches;
        emit ReceiptsAnchored(project, batch, root, count, firstReadAt, lastReadAt, msg.sender);
    }

    // ------------------------------------------------------------------ views
    function projectOf(uint256 id) external view returns (Project memory) {
        return _projects[id];
    }

    function factOf(uint256 projectId, bytes32 factKey) external view returns (Fact memory) {
        return _facts[projectId][factKey];
    }

    function draftOf(uint256 id) external view returns (Draft memory) {
        return _drafts[id];
    }

    function grantOf(uint256 id) external view returns (Grant memory) {
        return _grants[id];
    }
}
