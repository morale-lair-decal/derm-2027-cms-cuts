# Dermatology Medicare Cut Projection Model

A mathematical specification and implementation guide for modeling projected Medicare payment cuts for individual dermatologists using public CMS datasets, dynamic Conversion Factor (CF) logic, uncapped Practice Expense (PE) reweighting, and provider-specific Modifier 25 billing distribution curves.

## Executive Summary

This model calculates individual provider-level financial impacts from proposed Medicare Physician Fee Schedule (PFS) policy shifts without requiring access to proprietary clearinghouse billing data. By combining historical public utilization (PUF) with local Realization Factors ($RF_i$), the framework isolates:

1. **Conversion Factor (CF) Reductions:** Macro-level baseline payment drops.
2. **RVU Reweighting Cuts:** Work, Practice Expense, and Malpractice shift impacts (both 2027 phased-in and fully implemented uncapped levels).
3. **Dynamic Modifier 25 Penalty:** Provider-specific same-day E/M discounting based on candidate procedure ratios mapped to a national percentile distribution.

## Required Datasets

| Dataset | Source | Primary Purpose | Key Fields / Metrics |
| :--- | :--- | :--- | :--- |
| **Medicare Provider PUF** | CMS (2024) | Provider billing history & local payment rates | `Tot_Srvcs`, `Avg_Mdcr_Alowd_Amt`, `NPI` |
| **2026 CMS PFS Addendum B** | CMS | Baseline Total RVUs per CPT code | `Total RVU 2026` |
| **2027 CMS PFS Addendum B (Proposed)** | CMS | Proposed Work, PE, and MP RVUs | `Work RVU 2027`, `PE RVU 2027`, `MP RVU 2027` |
| **Fully Implemented PE RVU File** | CMS | Uncapped Practice Expense RVUs | `Fully Implemented PE RVU` |
| **OIG Modifier 25 Report** | HHS OIG | Median anchor ($\sim 61.5\%$) for national usage curve | Historical same-day E/M usage baseline |

## Baseline Constants

$$
\text{CF}_{2024} = \$33.11 \quad (\text{PUF Historical Baseline})
$$

$$
\text{CF}_{2026} = \$33.4009 \quad (\text{Current Baseline})
$$

$$
\text{CF}_{2027} = \$32.8409 \quad (\text{Proposed Baseline})
$$

### Derived Multipliers

* **Inflation Scaling Ratio:**

$$
\text{CF Inflation Ratio} = \frac{33.4009}{33.11} \approx 1.00878
$$

* **Dynamic Conversion Factor Cut:**

$$
  \text{Dynamic CF Cut \%} = \frac{32.8409 - 33.4009}{33.4009} \approx -1.6766\%
$$

## Mathematical Sequence

Execute the following line-by-line calculations for every distinct CPT code $i$ billed by the dermatologist:

### Step 1: Calculate CPT Realization Factor ($RF_i$)

Captures the physician's exact local Geographic Practice Cost Index (GPCI) and historical frequency of Multiple Procedure Payment Reduction (MPPR) discounts:

$$
RF_i = \frac{\text{Actual PUF Allowed Amount}_{i, 2024}}{\text{Total RVU}_{i, 2026} \times 33.11}
$$

### Step 2: Establish Baseline 2026 Revenue

Scales historical line-item revenue into 2026 baseline dollars:

$$
\text{Rev}_{i, 2026} = \text{Services}_i \times \text{Actual PUF Allowed Amount}_{i, 2024} \times 1.00878
$$

### Step 3: Calculate Isolated Conversion Factor Cut

Calculates dollar loss from the macro Conversion Factor drop alone:

$$
\text{CF Cut}_i = \text{Rev}_{i, 2026} \times \text{Dynamic CF Cut Percentage}
$$

### Step 4: Calculate RVU Reweighting Cuts

#### A. 2027 Phased-In Cut

1. Theoretical total unit shift:

$$
   \Delta \text{Unit}_{2027} = (\text{Total RVU}_{i, 2027} \times 32.8409) - (\text{Total RVU}_{i, 2026} \times 33.4009)
$$

2. Pure RVU shift (isolating double-counted CF drop):

$$
   \text{Pure RVU Shift}_{2027} = \Delta \text{Unit}_{2027} - (\text{Total RVU}_{i, 2026} \times 33.4009 \times \text{Dynamic CF Cut Percentage})
$$

3. Geography- and MPPR-adjusted dollar cut for CPT code $i$:

$$
   \text{RVU Cut}_{i, 2027} = \text{Services}_i \times \text{Pure RVU Shift}_{2027} \times RF_i
   $$

#### B. Fully Implemented Cut (Uncapped Long-Term)

1. Uncapped Total RVU construction:

$$
   \text{Total RVU}_{i, \text{Full}} = \text{Work RVU}_{i, 2027} + \text{Fully Implemented PE RVU}_i + \text{Malpractice RVU}_{i, 2027}
   $$

2. Fully implemented pure RVU shift and adjusted cut:

$$
   \text{Pure RVU Shift}_{\text{Full}} = [(\text{Total RVU}_{i, \text{Full}} \times 32.8409) - (\text{Total RVU}_{i, 2026} \times 33.4009)] - (\text{Total RVU}_{i, 2026} \times 33.4009 \times \text{Dynamic CF Cut Percentage})
   $$

$$
   \text{RVU Cut}_{i, \text{Full}} = \text{Services}_i \times \text{Pure RVU Shift}_{\text{Full}} \times RF_i
   $$

### Step 5: Dynamic Modifier 25 Penalty

Predicts the specific physician's same-day E/M discounting based on their actual procedure-to-visit ratio:

1. **Candidate Procedure Pool:** Isolate common same-day procedures (e.g., skin biopsies, destruction codes `17000`/`17004`/`17110`/`17111`, intralesional injections).

2. **Procedure Ratio:**

$$
   \text{Raw Proc Ratio} = \frac{\text{Total Candidate Procedures}}{\text{Total E/M Visits}}
   $$

3. **Percentile Mapping:** Rank ratio against national dermatologist distribution ($0–100^{\text{th}}$ percentile):

   * $25^{\text{th}}$ **Percentile (Low Procedural):** Maps to $\sim 15\% - 45\%$ usage rate.
   * $50^{\text{th}}$ **Percentile (Median Anchor):** Maps to $\sim 60\%$ usage rate.
   * $75^{\text{th}}$ **Percentile (High Procedural):** Maps to $\sim 82\% - 92\%$ usage rate.

4. **Encounter Penalty:**

$$
   \text{Penalty per Encounter} = 0.50 \times \min(\text{Avg Realized E/M Value}, \text{Avg Realized Procedure Value})
   $$

5. **Total Modifier 25 Cut:**

$$
   \text{Modifier 25 Cut} = -1 \times (\text{Total E/M Services} \times \text{Estimated Mod 25 Usage Rate} \times \text{Penalty per Encounter})
   $$

## Step 6: Total Net Impact Aggregation

Sum all line-item cuts and policy penalties across all billed CPT codes:

$$
\text{Total Net Impact} = \sum_{i} \text{CF Cut}_i + \sum_{i} \text{RVU Cut}_i + \text{Modifier 25 Cut}
$$
