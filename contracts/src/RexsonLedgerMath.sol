// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title RexsonLedgerMath
/// @notice Pure rules shared by RexsonFactLedger: reason bits for reads, drafts and approvals, group masks and visibility limits.
/// @dev Every refusal the ledger can give is a bit here, so the site can show the exact reasons before a wallet is asked to sign
///      (a reverting transaction leaves no log). Bits are append-only; the TypeScript mirror is src/lib/ledger/bits.ts.
library RexsonLedgerMath {
    // ------------------------------------------------------------------ visibility levels
    uint8 internal constant SHAREABLE = 0; // any assistant whose grant names the fact's group
    uint8 internal constant INTERNAL = 1; // only assistants whose grant also allows internal facts
    uint8 internal constant WORKSPACE_ONLY = 2; // never sent to an assistant

    // ------------------------------------------------------------------ read reasons (checkRead)
    uint256 internal constant R_UNKNOWN_GRANT = 1 << 0;
    uint256 internal constant R_GRANT_REVOKED = 1 << 1;
    uint256 internal constant R_GRANT_EXPIRED = 1 << 2;
    uint256 internal constant R_PROJECT_PAUSED = 1 << 3;
    uint256 internal constant R_NO_APPROVED_VERSION = 1 << 4;
    uint256 internal constant R_FACT_RETIRED = 1 << 5;
    uint256 internal constant R_GROUP_NOT_GRANTED = 1 << 6;
    uint256 internal constant R_ABOVE_GRANT_LEVEL = 1 << 7;
    uint256 internal constant R_WORKSPACE_ONLY = 1 << 8;

    // ------------------------------------------------------------------ draft / approval reasons (checkPropose, checkApprove)
    uint256 internal constant D_UNKNOWN_PROJECT = 1 << 16;
    uint256 internal constant D_NOT_EDITOR = 1 << 17;
    uint256 internal constant D_NOT_REVIEWER = 1 << 18;
    uint256 internal constant D_STALE_BASE = 1 << 19;
    uint256 internal constant D_BAD_VISIBILITY = 1 << 20;
    uint256 internal constant D_EMPTY_CONTENT = 1 << 21;
    uint256 internal constant D_DRAFT_NOT_OPEN = 1 << 22;
    uint256 internal constant D_OTHER_PROJECT = 1 << 23;
    uint256 internal constant D_OWN_DRAFT = 1 << 24;
    uint256 internal constant D_SAME_FACT_TWICE = 1 << 25;
    uint256 internal constant D_EMPTY_KEY = 1 << 26;

    /// @notice Mask with one bit set for a fact group (0..255).
    function groupBit(uint8 group) internal pure returns (uint256) {
        return uint256(1) << group;
    }

    /// @notice Reasons an assistant's grant may not read a fact right now. Zero means the read is allowed.
    /// @param grantExists   the grant id was issued
    /// @param revoked       the grant was revoked
    /// @param expiresAt     grant expiry (unix seconds)
    /// @param paused        the project is paused
    /// @param version       approved version of the fact (0 = never approved)
    /// @param retired       the fact was retired
    /// @param groups        groups named in the grant (bitmap)
    /// @param maxVisibility highest visibility level the grant allows (SHAREABLE or INTERNAL)
    /// @param group         the fact's group
    /// @param visibility    the fact's visibility level
    /// @param nowTs         current time
    function readReasons(
        bool grantExists,
        bool revoked,
        uint64 expiresAt,
        bool paused,
        uint32 version,
        bool retired,
        uint256 groups,
        uint8 maxVisibility,
        uint8 group,
        uint8 visibility,
        uint256 nowTs
    ) internal pure returns (uint256 r) {
        if (!grantExists) return R_UNKNOWN_GRANT;
        if (revoked) r |= R_GRANT_REVOKED;
        if (nowTs >= expiresAt) r |= R_GRANT_EXPIRED;
        if (paused) r |= R_PROJECT_PAUSED;
        if (version == 0) r |= R_NO_APPROVED_VERSION;
        if (retired) r |= R_FACT_RETIRED;
        if (groups & groupBit(group) == 0) r |= R_GROUP_NOT_GRANTED;
        if (visibility == WORKSPACE_ONLY) r |= R_WORKSPACE_ONLY;
        else if (visibility > maxVisibility) r |= R_ABOVE_GRANT_LEVEL;
    }

    /// @notice True when a fact at this visibility can ever be sent to an assistant.
    function sendable(uint8 visibility) internal pure returns (bool) {
        return visibility < WORKSPACE_ONLY;
    }
}
