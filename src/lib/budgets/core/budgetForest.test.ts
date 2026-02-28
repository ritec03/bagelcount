/**
 * Test suite for {@link BudgetForest.buildUnifiedTree}
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  WHAT buildUnifiedTree() DOES                                        ║
 * ║                                                                      ║
 * ║  It merges all per-period trees into ONE BudgetTree by extending     ║
 * ║  each budget's account path with a period-hierarchy suffix:          ║
 * ║                                                                      ║
 * ║    yearly    → <account>:yearly                                      ║
 * ║    quarterly → <account>:yearly:quarterly                            ║
 * ║    monthly   → <account>:yearly:quarterly:monthly                    ║
 * ║                                                                      ║
 * ║  The rule "bigger period = higher in tree" is enforced structurally: ║
 * ║  "yearly" is always an ancestor of "quarterly", which is always an   ║
 * ║  ancestor of "monthly" at every account node.                        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ZOMBIES coverage plan:
 *   Z – Zero    : empty forest → null
 *   O – One     : single budget per period type
 *   M – Many    : same account across periods; parent + child accounts
 *   B – Boundary: top-level single-segment account; sibling accounts
 *   I – Interface: return type is BudgetTree; extended label structure correct
 *   E – Exceptions/Edge: only nodes that hold budgets (or are on the path
 *                         to a budget) appear in the unified tree
 *   S – Simple  : covered by Zero and One cases
 */

import { describe, it, expect } from "vitest";
import { BudgetForest } from "./budgetForest";
import { BudgetInstance } from "./budgetInstance";
import { BudgetTree } from "./budgetTree";
import type { BudgetTreeNode } from "./budgetNode";
import { makeAccountLabel, type AccountLabel } from "./accountLabel";
import { DateRange } from "@/lib/utils/dateRange";
import { NaiveDate } from "@/lib/utils/dateUtil";
import type { ConstraintConfig } from "../constraints/constraints";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG: ConstraintConfig = {
  ParentChildrenSum: { parent: "warning", child: "blocking" },
};

let idCounter = 0;

/** Create a minimal BudgetInstance with a given amount (open-ended range). */
function makeBudget(amount: number): BudgetInstance {
  const start = NaiveDate.fromString("2026-01-01");
  return new BudgetInstance(new DateRange(start, null), amount, `id-${++idCounter}`);
}

/**
 * Walk the unified tree and return the node whose full `accountLabel`
 * matches the given colon-separated path, or `undefined` if absent.
 *
 * Example: findNode(tree, "Expenses:Food:yearly:quarterly:monthly")
 */
function findNode(tree: BudgetTree, path: string): BudgetTreeNode | undefined {
  const target = makeAccountLabel(path);
  return findNodeByLabel(tree.root, target);
}

function findNodeByLabel(
  node: BudgetTreeNode,
  target: AccountLabel,
): BudgetTreeNode | undefined {
  if (
    node.accountLabel.length === target.length &&
    node.accountLabel.every((seg, i) => seg === target[i])
  ) {
    return node;
  }
  for (const child of node.children) {
    const found = findNodeByLabel(child, target);
    if (found !== undefined) return found;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BudgetForest.buildUnifiedTree()", () => {
  // ── Z: Zero ────────────────────────────────────────────────────────────────

  it("Z – returns null for an empty forest", () => {
    // Arrange
    const forest = BudgetForest.createEmpty(CONFIG);
    // Act / Assert
    expect(forest.buildUnifiedTree()).toBeNull();
  });

  // ── S / O: Simple / One ────────────────────────────────────────────────────

  it("O – single yearly budget is placed at <account>:yearly", () => {
    /*
     * Forest input:
     *   yearly ──► Expenses:Food  ($12 000)
     *
     * Expected unified tree:
     *
     *   Expenses                   (ghost – root)
     *   └── Food                   (ghost – no budget directly on the account)
     *       └── yearly  ◄── $12 000 lives here
     */
    // Arrange
    const budget = makeBudget(12_000);
    const forest = BudgetForest.createEmpty(CONFIG).insertBudget(
      "yearly",
      makeAccountLabel("Expenses:Food"),
      budget,
    );
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert
    const node = findNode(unified, "Expenses:Food:yearly");
    expect(node).toBeDefined();
    expect(node!.budgets).toHaveLength(1);
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  it("O – single quarterly budget is placed at <account>:yearly:quarterly", () => {
    /*
     * Forest input:
     *   quarterly ──► Expenses:Food  ($3 000)
     *
     * Expected unified tree:
     *
     *   Expenses
     *   └── Food
     *       └── yearly        (ghost – period placeholder)
     *           └── quarterly ◄── $3 000 lives here
     */
    // Arrange
    const budget = makeBudget(3_000);
    const forest = BudgetForest.createEmpty(CONFIG).insertBudget(
      "quarterly",
      makeAccountLabel("Expenses:Food"),
      budget,
    );
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert – ghost yearly node must exist
    expect(findNode(unified, "Expenses:Food:yearly")).toBeDefined();
    // Budget lives at quarterly depth
    const node = findNode(unified, "Expenses:Food:yearly:quarterly");
    expect(node).toBeDefined();
    expect(node!.budgets).toHaveLength(1);
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  it("O – single monthly budget is placed at <account>:yearly:quarterly:monthly", () => {
    /*
     * Forest input:
     *   monthly ──► Expenses:Food  ($800)
     *
     * Expected unified tree:
     *
     *   Expenses
     *   └── Food
     *       └── yearly          (ghost)
     *           └── quarterly   (ghost)
     *               └── monthly ◄── $800 lives here
     */
    // Arrange
    const budget = makeBudget(800);
    const forest = BudgetForest.createEmpty(CONFIG).insertBudget(
      "monthly",
      makeAccountLabel("Expenses:Food"),
      budget,
    );
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert – full ghost chain exists
    expect(findNode(unified, "Expenses:Food:yearly")).toBeDefined();
    expect(findNode(unified, "Expenses:Food:yearly:quarterly")).toBeDefined();
    const node = findNode(unified, "Expenses:Food:yearly:quarterly:monthly");
    expect(node).toBeDefined();
    expect(node!.budgets).toHaveLength(1);
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  // ── M: Many ────────────────────────────────────────────────────────────────

  it("M – same account with yearly AND monthly budgets: yearly is ancestor of monthly", () => {
    /*
     * Forest input:
     *   yearly  ──► Expenses:Food  ($12 000)
     *   monthly ──► Expenses:Food  ($800)
     *
     * Expected unified tree:
     *
     *   Expenses
     *   └── Food
     *       └── yearly          ◄── $12 000
     *           └── quarterly   (ghost)
     *               └── monthly ◄── $800
     *
     * Key invariant: the two budgets for the SAME account are now in an
     * ancestor-descendant relationship, letting constraints compare them directly.
     */
    // Arrange
    const yearlyBudget  = makeBudget(12_000);
    const monthlyBudget = makeBudget(800);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget("yearly",  makeAccountLabel("Expenses:Food"), yearlyBudget)
      .insertBudget("monthly", makeAccountLabel("Expenses:Food"), monthlyBudget);
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert – yearly
    const yearlyNode = findNode(unified, "Expenses:Food:yearly");
    expect(yearlyNode).toBeDefined();
    expect(yearlyNode!.budgets).toHaveLength(1);
    expect(yearlyNode!.budgets[0]!.id).toBe(yearlyBudget.id);
    // Assert – monthly (three levels deep)
    const monthlyNode = findNode(unified, "Expenses:Food:yearly:quarterly:monthly");
    expect(monthlyNode).toBeDefined();
    expect(monthlyNode!.budgets).toHaveLength(1);
    expect(monthlyNode!.budgets[0]!.id).toBe(monthlyBudget.id);
  });

  it("M – parent account (yearly) and child account (monthly) both appear correctly", () => {
    /*
     * Forest input:
     *   yearly  ──► Expenses:Food            ($12 000)
     *   monthly ──► Expenses:Food:Groceries  ($500)
     *
     * Expected unified tree:
     *
     *   Expenses
     *   └── Food
     *       ├── yearly      ◄── $12 000          (period chain for Food)
     *       └── Groceries                        (account ghost)
     *           └── yearly     (ghost)
     *               └── quarterly (ghost)
     *                   └── monthly ◄── $500     (period chain for Groceries)
     */
    // Arrange
    const parentBudget = makeBudget(12_000);
    const childBudget  = makeBudget(500);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget("yearly",  makeAccountLabel("Expenses:Food"),          parentBudget)
      .insertBudget("monthly", makeAccountLabel("Expenses:Food:Groceries"), childBudget);
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert parent
    const parentNode = findNode(unified, "Expenses:Food:yearly");
    expect(parentNode!.budgets[0]!.id).toBe(parentBudget.id);
    // Assert child
    const childNode = findNode(unified, "Expenses:Food:Groceries:yearly:quarterly:monthly");
    expect(childNode).toBeDefined();
    expect(childNode!.budgets[0]!.id).toBe(childBudget.id);
  });

  it("M – ghost quarterly always exists between yearly and monthly for the same account", () => {
    /*
     * Forest input:
     *   yearly  ──► Expenses:Food  ($12 000)
     *   monthly ──► Expenses:Food  ($800)
     *   (NO quarterly budget)
     *
     *   Expenses
     *   └── Food
     *       └── yearly
     *           └── quarterly  ◄── ghost (0 budgets, but node must exist!)
     *               └── monthly
     */
    // Arrange
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget("yearly",  makeAccountLabel("Expenses:Food"), makeBudget(12_000))
      .insertBudget("monthly", makeAccountLabel("Expenses:Food"), makeBudget(800));
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert – ghost quarterly node present with no budgets
    const quarterlyGhost = findNode(unified, "Expenses:Food:yearly:quarterly");
    expect(quarterlyGhost).toBeDefined();
    expect(quarterlyGhost!.budgets).toHaveLength(0);
  });

  // ── B: Boundary ────────────────────────────────────────────────────────────

  it("B – single-segment (top-level) account path works correctly", () => {
    /*
     * Forest input:
     *   monthly ──► Expenses  ($5 000)
     *
     * Expected unified tree:
     *
     *   Expenses                      (root, also ghost account node)
     *   └── yearly   (ghost)
     *       └── quarterly (ghost)
     *           └── monthly ◄── $5 000
     */
    // Arrange
    const budget = makeBudget(5_000);
    const forest = BudgetForest.createEmpty(CONFIG).insertBudget(
      "monthly",
      makeAccountLabel("Expenses"),
      budget,
    );
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert
    const node = findNode(unified, "Expenses:yearly:quarterly:monthly");
    expect(node).toBeDefined();
    expect(node!.budgets[0]!.id).toBe(budget.id);
  });

  it("B – sibling accounts each get their own period chains (no cross-contamination)", () => {
    /*
     * Forest input:
     *   monthly ──► Expenses:Food:Groceries  ($400)
     *   monthly ──► Expenses:Food:DiningOut  ($300)
     *
     * Expected unified tree:
     *
     *   Expenses
     *   └── Food
     *       ├── Groceries
     *       │   └── yearly:quarterly:monthly ◄── $400
     *       └── DiningOut
     *           └── yearly:quarterly:monthly ◄── $300
     */
    // Arrange
    const grocBudget  = makeBudget(400);
    const diningBudget = makeBudget(300);
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget("monthly", makeAccountLabel("Expenses:Food:Groceries"),  grocBudget)
      .insertBudget("monthly", makeAccountLabel("Expenses:Food:DiningOut"), diningBudget);
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert – each sibling has its own isolated period chain
    const grocNode  = findNode(unified, "Expenses:Food:Groceries:yearly:quarterly:monthly");
    expect(grocNode!.budgets[0]!.id).toBe(grocBudget.id);
    const diningNode = findNode(unified, "Expenses:Food:DiningOut:yearly:quarterly:monthly");
    expect(diningNode!.budgets[0]!.id).toBe(diningBudget.id);
  });

  // ── I: Interface ───────────────────────────────────────────────────────────

  it("I – returns an instance of BudgetTree", () => {
    // Arrange
    const forest = BudgetForest.createEmpty(CONFIG).insertBudget(
      "yearly",
      makeAccountLabel("Expenses:Food"),
      makeBudget(1_000),
    );
    // Act
    const result = forest.buildUnifiedTree();
    // Assert
    expect(result).toBeInstanceOf(BudgetTree);
  });

  // ── E: Exceptions / Edge cases ─────────────────────────────────────────────

  it("E – only yearly inserted: no quarterly or monthly nodes exist in the tree", () => {
    /*
     * Forest input:
     *   yearly ──► Expenses:Food  ($12 000)
     *   (no quarterly or monthly trees)
     *
     *   Expenses
     *   └── Food
     *       └── yearly  ◄── $12 000
     *           (quarterly and monthly must NOT be present)
     */
    // Arrange
    const forest = BudgetForest.createEmpty(CONFIG).insertBudget(
      "yearly",
      makeAccountLabel("Expenses:Food"),
      makeBudget(12_000),
    );
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert – no deeper period nodes created
    expect(findNode(unified, "Expenses:Food:yearly:quarterly")).toBeUndefined();
    expect(findNode(unified, "Expenses:Food:yearly:quarterly:monthly")).toBeUndefined();
  });

  it("E – different accounts on different periods do not share period-chain nodes", () => {
    /*
     * Forest input:
     *   yearly  ──► Expenses:Food       ($12 000)
     *   monthly ──► Expenses:Transport  ($200)
     *
     * Expected unified tree:
     *
     *   Expenses
     *   ├── Food
     *   │   └── yearly ◄── $12 000   (no quarterly/monthly — Food has no such budgets)
     *   └── Transport
     *       └── yearly:quarterly:monthly ◄── $200
     *
     * Food must NOT have a quarterly or monthly node.
     * Transport must NOT have a yearly or quarterly budget node.
     */
    // Arrange
    const forest = BudgetForest.createEmpty(CONFIG)
      .insertBudget("yearly",  makeAccountLabel("Expenses:Food"),      makeBudget(12_000))
      .insertBudget("monthly", makeAccountLabel("Expenses:Transport"),  makeBudget(200));
    // Act
    const unified = forest.buildUnifiedTree()!;
    // Assert – Food period chain ends at yearly
    expect(findNode(unified, "Expenses:Food:yearly")).toBeDefined();
    expect(findNode(unified, "Expenses:Food:yearly:quarterly")).toBeUndefined();
    // Assert – Transport period chain goes all the way to monthly
    expect(findNode(unified, "Expenses:Transport:yearly:quarterly:monthly")).toBeDefined();
  });
});
