# LowStockItems — Algorithm specification

Two independent engines:

- **Engine A — PO allocation.** Given a set of selected items and a chosen
  method, decide how many boxes of each to order.
- **Engine B — Reorder suggestions.** Given sales history, stock history
  and logged lost sales, propose new `reorder_level` and
  `cf_maximum_capacity` values per item for user approval.

They share one input (trailing-365-day sales) and one output channel
(Engine A emits stockout signals that Engine B consumes).

---

# ENGINE A — PO allocation

## A.0 Inputs

The **group is the user's row selection.** No item metadata defines
grouping; whatever rows were selected when the user clicked Create PO
constitute the group for all share-based math.

Per item `i` in selection `S`:

| Symbol | Source |
|---|---|
| `on_hand_i` | Zoho `available_stock` (fall back to `stock_on_hand`) |
| `max_i` | Zoho `cf_maximum_capacity` |
| `reorder_i` | Zoho `reorder_level` |
| `sold_i` | units sold, trailing **365 days** |
| `min_i` | Zoho `minimum_order_quantity` (default 0) |
| `is_freetext_i` | true for plain-text items added on the PO page |

Derived:

```
velocity_i  = sold_i / 365              # boxes per day
headroom_i  = max(0, max_i - on_hand_i) # 0 when at/over max
if override_max_capacity: headroom_i = +Infinity
```

User inputs per PO: `method`, and depending on method a bundle total `B`,
a damping exponent `e`, a target cover `D` (days), plus the
`override_max_capacity` toggle. **Nothing is persisted** — the picker
opens fresh with no method preselected.

Free-text items are excluded from all share/velocity math. They accept a
manually typed quantity only.

## A.1 Shared subroutines

### CLAMP_AND_REDISTRIBUTE(alloc, headroom, B)
Water-filling. Used by every method with a fixed total `B`.

```
loop:
  spill = 0
  for each i: if alloc_i > headroom_i:
                spill += alloc_i - headroom_i
                alloc_i = headroom_i
  if spill == 0: break
  eligible = { i : alloc_i < headroom_i }
  if eligible empty: break            # cannot place remainder
  distribute spill across eligible in proportion to their current
  weights (or equally if all weights are 0)
```

### APPORTION(weights, B)
Convert fractional shares to integers that **sum exactly to B**, using the
largest-remainder (Hamilton) method — floor everything, then hand the
leftover units one at a time to the largest fractional remainders. Never
naive `round()`, which drifts off the target total.

### APPLY_MIN_FLOOR(alloc)
For each `i` where `alloc_i > 0` and `alloc_i < min_i` and
`headroom_i >= min_i`: raise `alloc_i` to `min_i`.
If the method has a fixed total `B`, reclaim the added units by
decrementing the largest allocations one unit at a time (never taking an
item below its own `min_i`, never below 0).

## A.2 The five methods

### 1. Simple
No bundle total.
```
qty_i = headroom_i
```

### 2. Bundle — damped size-curve
Inputs: `B`, exponent `e` (0…1, default **0.5**).
```
w_i = sold_i ^ e                     # if all sold_i == 0, w_i = 1 for all
qty = APPORTION(w, B)
qty = CLAMP_AND_REDISTRIBUTE(qty, headroom, B)
```
`e = 1` → raw sales share; `e = 0` → equal split; `0.5` → compressed,
slow sizes protected. Items over max contribute ~0 but are **never
removed from the selection** — this is the fix for the collapse-onto-one-
size bug.

### 3. Cover-duration (target days)
Input: `D`. No bundle total; total is whatever equal cover requires.
```
qty_i = max(0, round(velocity_i * D) - on_hand_i)
qty_i = min(qty_i, headroom_i)
```

### 4. Cover-duration fitted to a bundle
Inputs: `B`, `D`. Cover-duration *shape*, scaled to hit `B`.
```
raw_i = max(0, velocity_i * D - on_hand_i)
if sum(raw) == 0: fall back to method 2 weights
qty = APPORTION(raw, B)
qty = CLAMP_AND_REDISTRIBUTE(qty, headroom, B)
```

### 5. Simple + equal balance to bundle
Input: `B`. Start at Simple, then close the gap to `B` equally.
```
base_i = headroom_i
diff   = B - sum(base)
alloc  = base
loop:
  eligible = { i : (diff > 0 and alloc_i < headroom_i)
                or (diff < 0 and alloc_i > 0) }
  if eligible empty or |diff| < 1: break
  per = diff / |eligible|
  for i in eligible:
      alloc_i = clamp(alloc_i + per, 0, headroom_i)
  diff = B - sum(alloc)
alloc = APPORTION(alloc, B)
```
Equal add/subtract, but clamped: a line that hits 0 stops absorbing cuts
and a line that hits its headroom stops receiving, with the remainder
redistributed across the rest.

## A.3 Post-processing (all methods)

```
1. APPLY_MIN_FLOOR(alloc)
2. drop any item with alloc_i == 0 from the PO lines (keep it visible in
   the preview showing 0, so the user sees why)
3. round to integers; all quantities >= 0
```

## A.4 Preview contract

The picker computes allocations **client-side, with no writes**, and
renders a per-item table (item, on-hand, max, 1yr sold, order qty, total)
on demand via a "Preview quantities" button. Changing method or any knob
invalidates the preview. Only "Create PO with these" carries the
quantities to the New PO page, where they remain editable.

## A.5 Stockout signal emission

Whenever a selection is evaluated, for each item `i`:

```
siblings = S \ {i}
if on_hand_i <= reorder_i
   and |siblings| >= 2
   and count(j in siblings : on_hand_j >= max_j) / |siblings| >= 0.5
then emit signal {
       item_id, date, on_hand_i, siblings_full_count, group_size
     }
```

Persist to the lost-sale/signal store. Engine B treats this as evidence
that `i`'s reorder point and max capacity are set too low relative to its
siblings.

---

# ENGINE B — Reorder suggestions

Runs per item. Output is a **proposal**, never a write. Zoho is updated
only on explicit per-row or bulk approval.

## B.0 Settings (user-controlled, persisted in Netlify Blobs)

| Setting | Default | Effect |
|---|---|---|
| `service_level` | 95% | → `Z`: 90→1.28, 95→1.65, 97→1.88, 98→2.05, 99→2.33 |
| `aggressiveness` | 50% | damping fraction `f` toward the calculated value |
| `materiality_pct` | 15% | suppress small changes |
| `materiality_abs` | 2 | suppress small changes (boxes) |
| `min_history_days` | 60 | below this, no suggestion |
| `default_lead_time` | 21 | days, when vendor PO history is thin |
| `max_change_factor` | 3 | hard bound per pass |

No physical storage cap — demand alone sets max capacity.

## B.1 Demand reconstruction (censored-demand correction)

The central step. Observed sales understate demand because an item sells
nothing while out of stock.

```
days_in_stock   = days in trailing 365 where on_hand > 0
lost_units      = sum of logged lost-sale quantities for this item, 365d

A = sold / max(days_in_stock, 1)        # in-stock extrapolation
B = (sold + lost_units) / 365           # explicit logged demand

demand_per_day = max(A, B)
```

**Group fallback.** If `days_in_stock < 30` or `sold` is negligible, the
item's own data is untrustworthy. Estimate from siblings instead:

```
share_i        = historical share of group sales for item i
                 (longest window available; else equal share)
demand_per_day = share_i * (group total demand_per_day)
```
Use the fallback as a **floor**, not a replacement:
`demand_per_day = max(own estimate, group fallback)`.

## B.2 Variability → safety stock

```
bucket trailing 365 days into weeks
sigma_weekly = stdev(weekly demand)      # use reconstructed demand
sigma_daily  = sigma_weekly / sqrt(7)
safety_stock = Z * sigma_daily * sqrt(lead_time)
```
If fewer than 8 usable weekly buckets, substitute
`sigma_daily = 0.5 * demand_per_day` as a conservative proxy.

## B.3 Lead time and order cycle

Both derived from the item's vendor PO history:

```
lead_time       = median(receipt_date - issue_date) over that vendor's POs
                  fallback: default_lead_time  (if < 3 POs)
order_cycle_days= median(gap between consecutive POs to that vendor)
                  fallback: 30  (if < 3 POs)
```

## B.4 Raw proposals

```
raw_rop = demand_per_day * lead_time + safety_stock
raw_max = raw_rop + demand_per_day * order_cycle_days
```

## B.5 Guardrails — applied in this exact order

```
1. ELIGIBILITY
   skip if is_freetext
   skip if history_days < min_history_days
   skip if fewer than 3 sales transactions in the window

2. BOUND        (guards against bad data)
   raw_rop = clamp(raw_rop, current_rop / max_change_factor,
                            current_rop * max_change_factor)
   raw_max = clamp(raw_max, current_max / max_change_factor,
                            current_max * max_change_factor)
   (when a current value is 0, skip the bound for that value)

3. DAMP         (f = aggressiveness)
   prop_rop = current_rop + f * (raw_rop - current_rop)
   prop_max = current_max + f * (raw_max - current_max)

4. ROUND + COHERENCE
   round both to integers, floor at 0
   enforce prop_max >= prop_rop + 1

5. MATERIALITY
   for each value independently, suppress if
     |prop - current| < max(materiality_abs,
                            materiality_pct * current)
   if both suppressed, emit no suggestion for this item
```

## B.6 Output per suggestion

```
{
  item_id, item_name,
  current_rop, proposed_rop,        # null if suppressed
  current_max, proposed_max,        # null if suppressed
  demand_per_day, lead_time, safety_stock,
  reason,                           # human-readable
  confidence                        # low | medium | high
}
```

**`reason`** is assembled from what actually drove the change, e.g.
*"Out of stock 40 of 365 days; 3 lost sales logged (14 boxes); lead time
21d."* Every row must justify itself — approve/reject is meaningless
otherwise.

**`confidence`**:
- `high` — ≥180 days of stock history and ≥12 sales transactions
- `medium` — ≥90 days and ≥6 transactions
- `low` — anything less, or the group fallback was used

## B.7 Approval → write-back

On approve, PATCH the Zoho item with the approved field(s) only. Per-row
and bulk approve share one path. Record each applied change
(item, field, old, new, timestamp) so the next pass damps from the new
baseline and the history is auditable.

---

# Data dependency — stock history

`days_in_stock` requires a daily stock series that Zoho does not expose.
Staged approach:

1. **Now** — a scheduled nightly Netlify function snapshots `on_hand` per
   item to a blob. History accrues from day one.
2. **Meanwhile** — Engine B runs on estimate `B` (sales + logged lost
   sales) alone, with `confidence: low` and `days_in_stock = 365`
   (i.e. no censoring correction, so proposals stay conservative).
3. **As history matures** — estimate `A` activates per item once that item
   has ≥`min_history_days` of snapshots, and confidence rises.

This makes the lost-sale module immediately useful rather than data entry
with a deferred payoff.
