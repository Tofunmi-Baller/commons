//! COMMONS pool contract.
//!
//! Records collective purchasing pools, participant commitments, the hash of
//! the exact deal terms, explicit per-participant approvals, settlement and
//! cancellation. It enforces the financial rules on-chain so they do not depend
//! on the frontend or on any AI agent.
//!
//! MVP scope: this contract does NOT take custody of funds. Amounts are
//! recorded commitments in the smallest unit of the deal currency (US cents).
//! Refund *eligibility* is computed on-chain; moving tokens is future work
//! (see SUBMISSION.md).

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, PanicOnDefault};

const MAX_PARTICIPANTS: usize = 50;
const MAX_ID_LEN: usize = 64;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum PoolStatus {
    Open,
    Proposed,
    FullyApproved,
    Settled,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Participant {
    pub participant_id: String,
    /// Account that must sign this participant's approval.
    pub account_id: AccountId,
    /// Upper bound the participant committed to (smallest currency unit).
    pub max_contribution: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Allocation {
    pub participant_id: String,
    pub contribution: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub proposal_hash: String,
    pub total: U128,
    pub allocations: Vec<Allocation>,
    pub version: u32,
    pub set_at_ns: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Approval {
    pub participant_id: String,
    pub proposal_hash: String,
    pub approved_at_ns: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Pool {
    pub pool_id: String,
    pub organizer: AccountId,
    pub currency: String,
    pub deadline_ns: U64,
    pub status: PoolStatus,
    pub participants: Vec<Participant>,
    pub proposal: Option<Proposal>,
    pub approvals: Vec<Approval>,
    pub settlement_ref: Option<String>,
    pub cancel_reason: Option<String>,
    pub created_at_ns: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pools: LookupMap<String, Pool>,
    pool_count: u64,
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "commons", "version": "1.0.0", "event": event, "data": [data] })
    ));
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID_LEN && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn valid_hash(h: &str) -> bool {
    h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self { pools: LookupMap::new(b"p"), pool_count: 0 }
    }

    /// Create a pool. The caller becomes its organizer.
    pub fn create_pool(&mut self, pool_id: String, deadline_ns: U64, currency: String, participants: Vec<Participant>) {
        require!(valid_id(&pool_id), "Invalid pool_id");
        require!(self.pools.get(&pool_id).is_none(), "Pool already exists");
        require!(deadline_ns.0 > env::block_timestamp(), "Deadline must be in the future");
        require!(!participants.is_empty() && participants.len() <= MAX_PARTICIPANTS, "Pool needs 1-50 participants");
        require!(currency.len() == 3 && currency.chars().all(|c| c.is_ascii_uppercase()), "Currency must be an ISO code");
        for (i, p) in participants.iter().enumerate() {
            require!(valid_id(&p.participant_id), "Invalid participant_id");
            require!(p.max_contribution.0 > 0, "max_contribution must be positive");
            require!(
                participants[..i].iter().all(|q| q.participant_id != p.participant_id),
                "Duplicate participant_id"
            );
        }
        let pool = Pool {
            pool_id: pool_id.clone(),
            organizer: env::predecessor_account_id(),
            currency,
            deadline_ns,
            status: PoolStatus::Open,
            participants,
            proposal: None,
            approvals: vec![],
            settlement_ref: None,
            cancel_reason: None,
            created_at_ns: U64(env::block_timestamp()),
        };
        emit("pool_created", json!({ "pool_id": pool_id, "organizer": pool.organizer, "participants": pool.participants.len() }));
        self.pools.insert(pool_id, pool);
        self.pool_count += 1;
    }

    /// Set (or replace, before full approval) the deal terms. Replacing terms
    /// clears every approval and emits an explicit event — terms can never
    /// change silently, and they are locked once everyone has approved.
    pub fn set_proposal(&mut self, pool_id: String, proposal_hash: String, total: U128, allocations: Vec<Allocation>) {
        let now = env::block_timestamp();
        let pool = self.pool_mut(&pool_id);
        require!(env::predecessor_account_id() == pool.organizer, "Only the organizer can set terms");
        require!(matches!(pool.status, PoolStatus::Open | PoolStatus::Proposed), "Terms are locked in this status");
        require!(now <= pool.deadline_ns.0, "Pool deadline has passed");
        require!(valid_hash(&proposal_hash), "proposal_hash must be 64 lowercase hex chars");
        require!(!allocations.is_empty(), "Allocations required");
        let mut sum: u128 = 0;
        for (i, a) in allocations.iter().enumerate() {
            let p = pool
                .participants
                .iter()
                .find(|p| p.participant_id == a.participant_id)
                .unwrap_or_else(|| env::panic_str("Allocation for unknown participant"));
            require!(allocations[..i].iter().all(|b| b.participant_id != a.participant_id), "Duplicate allocation");
            require!(a.contribution.0 > 0, "Contribution must be positive");
            require!(a.contribution.0 <= p.max_contribution.0, "Contribution exceeds participant's committed maximum");
            sum = sum.checked_add(a.contribution.0).unwrap_or_else(|| env::panic_str("Overflow"));
        }
        require!(sum == total.0, "Allocations must sum exactly to total");

        let version = pool.proposal.as_ref().map(|p| p.version + 1).unwrap_or(1);
        let replaced = pool.proposal.as_ref().map(|p| p.proposal_hash.clone());
        let cleared = pool.approvals.len();
        pool.approvals.clear();
        pool.proposal = Some(Proposal { proposal_hash: proposal_hash.clone(), total, allocations, version, set_at_ns: U64(now) });
        pool.status = PoolStatus::Proposed;
        emit(
            if replaced.is_some() { "proposal_replaced" } else { "proposal_set" },
            json!({ "pool_id": pool_id, "proposal_hash": proposal_hash, "version": version, "previous_hash": replaced, "approvals_cleared": cleared }),
        );
    }

    /// Explicit approval by the participant's own account for an exact hash.
    pub fn approve(&mut self, pool_id: String, participant_id: String, proposal_hash: String) {
        let now = env::block_timestamp();
        let pool = self.pool_mut(&pool_id);
        require!(pool.status == PoolStatus::Proposed, "Pool is not awaiting approvals");
        require!(now <= pool.deadline_ns.0, "Pool deadline has passed");
        let participant = pool
            .participants
            .iter()
            .find(|p| p.participant_id == participant_id)
            .unwrap_or_else(|| env::panic_str("Unknown participant"));
        require!(env::predecessor_account_id() == participant.account_id, "Only the participant's account can approve");
        let proposal = pool.proposal.as_ref().unwrap_or_else(|| env::panic_str("No proposal"));
        require!(proposal.proposal_hash == proposal_hash, "Proposal hash does not match current terms");
        require!(proposal.allocations.iter().any(|a| a.participant_id == participant_id), "Participant has no allocation");
        require!(pool.approvals.iter().all(|a| a.participant_id != participant_id), "Already approved");

        pool.approvals.push(Approval { participant_id: participant_id.clone(), proposal_hash: proposal_hash.clone(), approved_at_ns: U64(now) });
        let complete = proposal.allocations.iter().all(|a| pool.approvals.iter().any(|x| x.participant_id == a.participant_id));
        if complete {
            pool.status = PoolStatus::FullyApproved;
        }
        emit("participant_approved", json!({ "pool_id": pool_id, "participant_id": participant_id, "proposal_hash": proposal_hash, "fully_approved": complete }));
    }

    /// Record settlement of the fully-approved terms. Organizer only, once.
    pub fn record_settlement(&mut self, pool_id: String, proposal_hash: String, settlement_ref: String) {
        let now = env::block_timestamp();
        let pool = self.pool_mut(&pool_id);
        require!(env::predecessor_account_id() == pool.organizer, "Only the organizer can record settlement");
        require!(pool.status != PoolStatus::Settled, "Pool already settled");
        require!(pool.status == PoolStatus::FullyApproved, "All participants must approve before settlement");
        require!(now <= pool.deadline_ns.0, "Pool deadline has passed");
        let proposal = pool.proposal.as_ref().unwrap_or_else(|| env::panic_str("No proposal"));
        require!(proposal.proposal_hash == proposal_hash, "Settlement must reference the approved terms");
        require!(!settlement_ref.is_empty() && settlement_ref.len() <= 128, "Invalid settlement_ref");
        pool.status = PoolStatus::Settled;
        pool.settlement_ref = Some(settlement_ref.clone());
        emit("pool_settled", json!({ "pool_id": pool_id, "proposal_hash": proposal_hash, "total": proposal.total, "settlement_ref": settlement_ref }));
    }

    /// Organizer may cancel any time before settlement; anyone may cancel an
    /// expired, unsettled pool so commitments never stay locked indefinitely.
    pub fn cancel_pool(&mut self, pool_id: String, reason: String) {
        let now = env::block_timestamp();
        let pool = self.pool_mut(&pool_id);
        require!(pool.status != PoolStatus::Settled, "Settled pools cannot be cancelled");
        require!(pool.status != PoolStatus::Cancelled, "Pool already cancelled");
        let expired = now > pool.deadline_ns.0;
        require!(env::predecessor_account_id() == pool.organizer || expired, "Only the organizer can cancel before the deadline");
        require!(reason.len() <= 256, "Reason too long");
        pool.status = PoolStatus::Cancelled;
        pool.cancel_reason = Some(reason.clone());
        emit("pool_cancelled", json!({ "pool_id": pool_id, "reason": reason, "expired": expired }));
    }

    // ── Views ────────────────────────────────────────────────────────────

    pub fn get_pool(&self, pool_id: String) -> Option<Pool> {
        self.pools.get(&pool_id).cloned()
    }

    pub fn pool_count(&self) -> u64 {
        self.pool_count
    }

    /// Empty vector means settlement can be recorded now.
    pub fn settlement_blockers(&self, pool_id: String) -> Vec<String> {
        let Some(pool) = self.pools.get(&pool_id) else { return vec!["Pool not found".into()] };
        let mut out = vec![];
        match pool.status {
            PoolStatus::Settled => out.push("Already settled".to_string()),
            PoolStatus::Cancelled => out.push("Pool cancelled".to_string()),
            PoolStatus::Open => out.push("No proposal set".to_string()),
            _ => {}
        }
        if let Some(p) = &pool.proposal {
            let missing = p.allocations.iter().filter(|a| pool.approvals.iter().all(|x| x.participant_id != a.participant_id)).count();
            if missing > 0 {
                out.push(format!("{} approval(s) missing", missing));
            }
        }
        if env::block_timestamp() > pool.deadline_ns.0 {
            out.push("Deadline passed".to_string());
        }
        out
    }

    pub fn is_settlement_ready(&self, pool_id: String) -> bool {
        self.settlement_blockers(pool_id).is_empty()
    }

    /// A participant who approved terms in a pool that was later cancelled is
    /// eligible for a refund of any contribution made off-chain or in future custody.
    pub fn is_refund_eligible(&self, pool_id: String, participant_id: String) -> bool {
        self.pools
            .get(&pool_id)
            .map(|p| p.status == PoolStatus::Cancelled && p.approvals.iter().any(|a| a.participant_id == participant_id))
            .unwrap_or(false)
    }

    fn pool_mut(&mut self, pool_id: &String) -> &mut Pool {
        self.pools.get_mut(pool_id).unwrap_or_else(|| env::panic_str("Pool not found"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const HASH_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const HASH_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const DAY: u64 = 86_400_000_000_000;

    fn ctx(caller: usize, now: u64) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(accounts(caller)).block_timestamp(now).build());
    }

    /// organizer = accounts(0); participants p_a/p_b/p_c signed by accounts(1..=3)
    fn setup() -> Contract {
        ctx(0, DAY);
        let mut c = Contract::new();
        let parts = (1..=3)
            .map(|i| Participant { participant_id: format!("p_{}", i), account_id: accounts(i), max_contribution: U128(20_000_000) })
            .collect();
        c.create_pool("pool_1".into(), U64(10 * DAY), "USD".into(), parts);
        c
    }

    fn allocs(amounts: [u128; 3]) -> Vec<Allocation> {
        amounts.iter().enumerate().map(|(i, a)| Allocation { participant_id: format!("p_{}", i + 1), contribution: U128(*a) }).collect()
    }

    fn propose(c: &mut Contract, hash: &str) {
        ctx(0, 2 * DAY);
        c.set_proposal("pool_1".into(), hash.into(), U128(42_525_000), allocs([9_450_000, 18_900_000, 14_175_000]));
    }

    fn approve_all(c: &mut Contract, hash: &str) {
        for i in 1..=3 {
            ctx(i, 3 * DAY);
            c.approve("pool_1".into(), format!("p_{}", i), hash.into());
        }
    }

    #[test]
    fn happy_path_settles_once() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        approve_all(&mut c, HASH_A);
        assert!(c.is_settlement_ready("pool_1".into()));
        ctx(0, 4 * DAY);
        c.record_settlement("pool_1".into(), HASH_A.into(), "demo-settlement-1".into());
        assert_eq!(c.get_pool("pool_1".into()).unwrap().status, PoolStatus::Settled);
    }

    #[test]
    #[should_panic(expected = "Pool already settled")]
    fn duplicate_settlement_rejected() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        approve_all(&mut c, HASH_A);
        ctx(0, 4 * DAY);
        c.record_settlement("pool_1".into(), HASH_A.into(), "s1".into());
        c.record_settlement("pool_1".into(), HASH_A.into(), "s2".into());
    }

    #[test]
    #[should_panic(expected = "Only the organizer can record settlement")]
    fn unauthorized_settlement_rejected() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        approve_all(&mut c, HASH_A);
        ctx(4, 4 * DAY);
        c.record_settlement("pool_1".into(), HASH_A.into(), "s1".into());
    }

    #[test]
    #[should_panic(expected = "All participants must approve before settlement")]
    fn missing_approvals_block_settlement() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        ctx(1, 3 * DAY);
        c.approve("pool_1".into(), "p_1".into(), HASH_A.into());
        assert_eq!(c.settlement_blockers("pool_1".into()), vec!["2 approval(s) missing".to_string()]);
        ctx(0, 4 * DAY);
        c.record_settlement("pool_1".into(), HASH_A.into(), "s1".into());
    }

    #[test]
    #[should_panic(expected = "Only the participant's account can approve")]
    fn cannot_approve_for_someone_else() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        ctx(1, 3 * DAY);
        c.approve("pool_1".into(), "p_2".into(), HASH_A.into());
    }

    #[test]
    #[should_panic(expected = "Proposal hash does not match current terms")]
    fn approval_must_match_hash() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        ctx(1, 3 * DAY);
        c.approve("pool_1".into(), "p_1".into(), HASH_B.into());
    }

    #[test]
    fn replacing_terms_clears_approvals_explicitly() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        ctx(1, 3 * DAY);
        c.approve("pool_1".into(), "p_1".into(), HASH_A.into());
        propose(&mut c, HASH_B);
        let pool = c.get_pool("pool_1".into()).unwrap();
        assert!(pool.approvals.is_empty());
        assert_eq!(pool.proposal.unwrap().version, 2);
    }

    #[test]
    #[should_panic(expected = "Terms are locked in this status")]
    fn approved_terms_cannot_change() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        approve_all(&mut c, HASH_A);
        propose(&mut c, HASH_B);
    }

    #[test]
    #[should_panic(expected = "Contribution exceeds participant's committed maximum")]
    fn contribution_cap_enforced() {
        let mut c = setup();
        ctx(0, 2 * DAY);
        c.set_proposal("pool_1".into(), HASH_A.into(), U128(50_000_000), allocs([9_000_000, 21_000_000, 20_000_000]));
    }

    #[test]
    #[should_panic(expected = "Allocations must sum exactly to total")]
    fn totals_must_match() {
        let mut c = setup();
        ctx(0, 2 * DAY);
        c.set_proposal("pool_1".into(), HASH_A.into(), U128(1), allocs([9_450_000, 18_900_000, 14_175_000]));
    }

    #[test]
    #[should_panic(expected = "Only the organizer can set terms")]
    fn only_organizer_sets_terms() {
        let mut c = setup();
        ctx(2, 2 * DAY);
        c.set_proposal("pool_1".into(), HASH_A.into(), U128(42_525_000), allocs([9_450_000, 18_900_000, 14_175_000]));
    }

    #[test]
    fn cancellation_and_refund_eligibility() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        ctx(1, 3 * DAY);
        c.approve("pool_1".into(), "p_1".into(), HASH_A.into());
        assert!(!c.is_refund_eligible("pool_1".into(), "p_1".into()));
        ctx(0, 3 * DAY);
        c.cancel_pool("pool_1".into(), "Supplier withdrew offer".into());
        assert!(c.is_refund_eligible("pool_1".into(), "p_1".into()));
        assert!(!c.is_refund_eligible("pool_1".into(), "p_2".into()));
    }

    #[test]
    #[should_panic(expected = "Only the organizer can cancel before the deadline")]
    fn stranger_cannot_cancel_early() {
        let mut c = setup();
        ctx(4, 3 * DAY);
        c.cancel_pool("pool_1".into(), "nope".into());
    }

    #[test]
    fn anyone_can_cancel_after_expiry() {
        let mut c = setup();
        ctx(4, 11 * DAY);
        c.cancel_pool("pool_1".into(), "expired".into());
        assert_eq!(c.get_pool("pool_1".into()).unwrap().status, PoolStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Settled pools cannot be cancelled")]
    fn settled_pool_cannot_be_cancelled() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        approve_all(&mut c, HASH_A);
        ctx(0, 4 * DAY);
        c.record_settlement("pool_1".into(), HASH_A.into(), "s1".into());
        c.cancel_pool("pool_1".into(), "too late".into());
    }

    #[test]
    #[should_panic(expected = "Pool deadline has passed")]
    fn no_settlement_after_deadline() {
        let mut c = setup();
        propose(&mut c, HASH_A);
        approve_all(&mut c, HASH_A);
        ctx(0, 11 * DAY);
        c.record_settlement("pool_1".into(), HASH_A.into(), "s1".into());
    }
}
