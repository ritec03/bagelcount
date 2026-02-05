
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createBudgetApiV1BudgetsPost as createBudget } from "../../lib/api/sdk.gen";
import type { BudgetSubmission, StandardBudgetOutput } from "../../lib/types";
import { CalendarIcon, Loader2 } from "lucide-react";
import { useBudgets } from "../../hooks/useBudgets";

// --- UI Components (Inlined for speed, in real app would be imported from ui/ folder) ---
// Ideally we would assume shadcn components exist or use basic HTML with tailwind first.
// I'll use standard HTML + Tailwind classes that mimic Shadcn for this iteration to avoid file hunting.

const cardClass = "rounded-xl border bg-card text-card-foreground shadow";
const inputClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const labelClass = "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70";
const buttonClass = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2";

// --- Schema ---
// We need a super-schema that handles both types conditionally? 
// Or just a loose schema that refines based on type?
// Let's go with a Discriminated Union in Zod if possible, or just optional fields with refinements.

const budgetSchema = z.object({
  type: z.enum(["StandardBudget", "CustomBudget"]),
  account: z.string().min(1, "Account is required"),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
  currency: z.string().default("CAD"),
  tags: z.string().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)"),
  // Conditional fields
  frequency: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  end_date: z.string().optional(), // YYYY-MM-DD
}).superRefine((data, ctx) => {
  if (data.type === "StandardBudget") {
    if (!data.frequency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Frequency is required for Recurring budgets",
        path: ["frequency"],
      });
    }
  } else {
    if (!data.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End Date is required for One-off projects",
        path: ["end_date"],
      });
    }
  }
});

type BudgetFormValues = z.infer<typeof budgetSchema>;

interface BudgetFormProps {
  onSuccess?: () => void;
  initialData?: BudgetSubmission | null;
}

export function BudgetForm({ onSuccess, initialData }: BudgetFormProps) {
  // Determine initial type safely
  const initialType = initialData && "frequency" in initialData 
    ? "StandardBudget" 
    : (initialData && "end_date" in initialData ? "CustomBudget" : "StandardBudget");

  const [activeTab, setActiveTab] = useState<"StandardBudget" | "CustomBudget">(initialType);
  
  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      type: initialType,
      currency: initialData?.currency || "CAD",
      start_date: initialData?.start_date || new Date().toISOString().split("T")[0],
      amount: initialData ? String(initialData.amount) : "",
      account: initialData?.account || "", 
      tags: initialData?.tags?.join(", ") || "",
      // Conditional defaults
      frequency: (initialData as any)?.frequency || "monthly",
      end_date: (initialData as any)?.end_date || ""
    }
  });

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = form;

  // React to tab change
  const handleTabChange = (type: "StandardBudget" | "CustomBudget") => {
    setActiveTab(type);
    setValue("type", type);
  };

  // Retrieve current budgets for validation context
  const { budgets } = useBudgets(); 

  const onSubmit = async (data: BudgetFormValues) => {
    try {
      const amount = parseFloat(data.amount);

      // --- Consistency Validation (StandardBudget Only) ---
      if (data.type === "StandardBudget" && budgets) {
         const standardBudgets = budgets.filter((b): b is StandardBudgetOutput => "frequency" in b);
         
         // 1. Child Check: Ensure we don't exceed Parent
         const parentName = data.account.split(':').slice(0, -1).join(':');
         if (parentName) {
             const parentBudget = standardBudgets.find(b => b.account === parentName);
             if (parentBudget) {
                 // Calculate used by other siblings
                 // We exclude the current account from the sum because this new amount will replace/set it.
                 const siblings = standardBudgets.filter(b => 
                    b.account.startsWith(parentName + ":") && // Is Child
                    b.account.split(':').length === parentName.split(':').length + 1 && // Is Direct Child
                    b.account !== data.account // Exclude self (if updating)
                 );
                 
                 const siblingsUsed = siblings.reduce((sum, b) => sum + parseFloat(b.amount as string), 0);
                 const available = parseFloat(parentBudget.amount as string) - siblingsUsed;
                 
                 if (amount > available) {
                     form.setError("amount", { 
                        type: "manual", 
                        message: `Exceeds parent budget (${parentName}). Available: $${available.toFixed(2)}` 
                     });
                     return; // Stop submission
                 }
             }
         }

         // 2. Parent Check: Ensure we have enough for Children
         // If we are setting a Parent budget, it must cover existing Children.
         const children = standardBudgets.filter(b => 
            b.account.startsWith(data.account + ":") &&
            b.account.split(':').length === data.account.split(':').length + 1 // Direct children
         );
         
         if (children.length > 0) {
             const childrenSum = children.reduce((sum, b) => sum + parseFloat(b.amount as string), 0);
             if (amount < childrenSum) {
                 form.setError("amount", { 
                    type: "manual", 
                    message: `Insufficient for sub-categories. Required: $${childrenSum.toFixed(2)}` 
                 });
                 return; // Stop submission
             }
         }
      }

      // Transformation: String tags -> Array
      const tagsArray = data.tags 
        ? data.tags.split(",").map(t => t.trim()).filter(Boolean) 
        : [];
        
      // Construct Payload
      let payload: BudgetSubmission;
      
      const base = {
        account: data.account,
        amount: data.amount, 
        currency: data.currency,
        tags: tagsArray,
        start_date: data.start_date,
      };

      if (data.type === "StandardBudget") {
        payload = {
            ...base,
            frequency: data.frequency as "monthly" | "quarterly" | "yearly",
        };
      } else {
        payload = {
            ...base,
            end_date: data.end_date!,
        };
      }
      
      // API Call
      await createBudget({ body: payload });
      
      if (onSuccess) onSuccess();
      
    } catch (err) {
      console.error(err);
      alert("Failed to save budget");
    }
  };
  
  // Watch active tab visually
  const currentType = watch("type");

  return (
    <div className={cardClass}>
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">Create Budget</h3>
        
        {/* Tab Switcher */}
        <div className="grid w-full grid-cols-2 bg-muted p-1 rounded-lg mb-6 border bg-slate-100">
          <button
            type="button"
            onClick={() => handleTabChange("StandardBudget")}
            className={`text-sm font-medium py-1.5 rounded-md transition-all ${activeTab === "StandardBudget" ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"}`}
          >
            Recurring Rule
          </button>
          <button
             type="button"
             onClick={() => handleTabChange("CustomBudget")}
             className={`text-sm font-medium py-1.5 rounded-md transition-all ${activeTab === "CustomBudget" ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"}`}
          >
            One-off Project
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          
          {/* Account */}
          <div className="space-y-2">
            <label className={labelClass}>Account</label>
            <input {...register("account")} className={inputClass} placeholder="Expenses:Food" />
            {errors.account && <span className="text-xs text-red-500">{errors.account.message}</span>}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className={labelClass}>Amount</label>
            <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500 text-xs mt-0.5">CAD</span>
                <input {...register("amount")} className={`${inputClass} pl-10`} placeholder="500.00" />
            </div>
            {errors.amount && <span className="text-xs text-red-500">{errors.amount.message}</span>}
          </div>

          {/* Conditional Fields */}
          {activeTab === "StandardBudget" ? (
             <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <label className={labelClass}>Frequency</label>
                <select {...register("frequency")} className={inputClass}>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                </select>
                {errors.frequency && <span className="text-xs text-red-500">{errors.frequency.message}</span>}
             </div>
          ) : (
             <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <label className={labelClass}>End Date</label>
                <input type="date" {...register("end_date")} className={inputClass} />
                {errors.end_date && <span className="text-xs text-red-500">{errors.end_date.message}</span>}
             </div>
          )}

          {/* Start Date */}
          <div className="space-y-2">
            <label className={labelClass}>Start Date</label>
            <input type="date" {...register("start_date")} className={inputClass} />
            {errors.start_date && <span className="text-xs text-red-500">{errors.start_date.message}</span>}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className={labelClass}>Tags (comma separated)</label>
            <input {...register("tags")} className={inputClass} placeholder="vacation, essentials" />
          </div>

          <button type="submit" disabled={isSubmitting} className={`${buttonClass} w-full mt-4 bg-blue-600 text-white hover:bg-blue-700`}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Budget
          </button>

        </form>
      </div>
    </div>
  );
}
