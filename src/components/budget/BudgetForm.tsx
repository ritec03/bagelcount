
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createBudgetApiV1BudgetsPost as createBudget } from "../../lib/api/sdk.gen";
import type { BudgetSubmission, StandardBudgetOutput } from "../../lib/types";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useBudgets } from "../../hooks/useBudgets";
import { useAccounts } from "../../hooks/useAccounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
        code: "custom",
        message: "Frequency is required for Recurring budgets",
        path: ["frequency"],
      });
    }
  } else {
    if (!data.end_date) {
      ctx.addIssue({
        code: "custom",
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
  
  // Fetch accounts and filter to Expenses only
  const { accounts } = useAccounts();
  const expenseAccounts = accounts.filter(acc => acc.name.startsWith("Expenses:"));
  
  // NOTE remove type variable from useForm (<BudgetFormValues>) to avoid inference mismatch
  const form = useForm({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      type: initialType,
      currency: initialData?.currency || "CAD",
      start_date: initialData?.start_date || new Date().toISOString().split("T")[0],
      amount: initialData ? String(initialData.amount) : "",
      account: initialData?.account || "", 
      tags: initialData?.tags?.join(", ") || "",
      // Conditional defaults - use type guards to safely access union type fields
      frequency: (initialData && "frequency" in initialData) ? initialData.frequency : "monthly",
      end_date: (initialData && "end_date" in initialData) ? initialData.end_date : ""
    }
  });

  const { handleSubmit, setValue, formState: { isSubmitting } } = form;

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
  
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Budget</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as "StandardBudget" | "CustomBudget")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="StandardBudget">Recurring Rule</TabsTrigger>
            <TabsTrigger value="CustomBudget">One-off Project</TabsTrigger>
          </TabsList>
        </Tabs>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
            
            {/* Account - Combobox */}
            <FormField
              control={form.control}
              name="account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value
                            ? expenseAccounts.find((acc) => acc.name === field.value)?.name
                            : "Select account..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput placeholder="Search accounts..." />
                        <CommandList>
                          <CommandEmpty>No account found.</CommandEmpty>
                          <CommandGroup>
                            {expenseAccounts.map((acc) => (
                              <CommandItem
                                value={acc.name}
                                key={acc.name}
                                onSelect={() => {
                                  form.setValue("account", acc.name);
                                  setAccountPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    acc.name === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {acc.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500 text-xs mt-0.5">CAD</span>
                      <Input {...field} className="pl-10" placeholder="500.00" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Conditional Fields */}
            {activeTab === "StandardBudget" ? (
              <FormField
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Start Date */}
            <FormField
              control={form.control}
              name="start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tags */}
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags (comma separated)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="vacation, essentials" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Budget
            </Button>

          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
