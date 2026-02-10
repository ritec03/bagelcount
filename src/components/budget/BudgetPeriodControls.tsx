import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calculator, Calendar } from "lucide-react";
import type { PeriodType, NormalizationMode } from '@/lib/types';

interface BudgetPeriodControlsProps {
  viewDate: Date;
  onDateChange: (date: Date) => void;
  periodType: PeriodType;
  onPeriodChange: (type: PeriodType) => void;
  normalizationMode: NormalizationMode;
  onNormalizationChange: (mode: NormalizationMode) => void;
}

export function BudgetPeriodControls({
  viewDate,
  onDateChange,
  periodType,
  onPeriodChange,
  normalizationMode,
  onNormalizationChange
}: BudgetPeriodControlsProps) {
  
  const handlePrevious = () => {
    const newDate = new Date(viewDate);
    if (periodType === 'monthly') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setFullYear(newDate.getFullYear() - 1);
    }
    onDateChange(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(viewDate);
    if (periodType === 'monthly') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setFullYear(newDate.getFullYear() + 1);
    }
    onDateChange(newDate);
  };

  const formatDate = (date: Date) => {
    if (periodType === 'monthly') {
      return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
    }
    return new Intl.DateTimeFormat('en-US', { year: 'numeric' }).format(date);
  };

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col sm:flex-row gap-4 items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Select 
            value={periodType} 
            onValueChange={(val) => onPeriodChange(val as 'monthly' | 'yearly')}
          >
            <SelectTrigger className="w-40">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 border rounded-md bg-background">
            <Button variant="ghost" size="icon" onClick={handlePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-36 text-center font-medium">
              {formatDate(viewDate)}
            </div>
            <Button variant="ghost" size="icon" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">Budget View:</span>
          <Select 
            value={normalizationMode} 
            onValueChange={(val) => onNormalizationChange(val as 'pro-rated' | 'full')}
          >
            <SelectTrigger className="w-48">
              <Calculator className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pro-rated">Pro-rated</SelectItem>
              <SelectItem value="full">Full Amount</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
