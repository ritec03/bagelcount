/**
 * Props for the CollapsedPlaceholder component.
 */
export interface CollapsedPlaceholderProps {
    /** Number of hidden immediate child budgets */
    count: number;
    /** Handler to expand the group */
    onClick: () => void;
    /** Optional width override (not currently used but kept for API consistency) */
    width?: string;
}

/**
 * Visual indicator displayed when a budget group is collapsed.
 * 
 * Design: "Folder Flop" style.
 * - Appears to be tucked *under* the parent card using negative top margin (-mt-5) and lower z-index.
 * - Visually resembles a paper tab sticking out.
 * - Displays the count of hidden items.
 */
export function CollapsedPlaceholder({ count, onClick }: CollapsedPlaceholderProps) {
    if (count === 0) return null;
    
    return (
        <div 
            className="relative z-0 -mt-5 mx-6 cursor-pointer group"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            <div className="bg-slate-100 border border-t-0 border-slate-200 rounded-b-lg shadow-sm hover:bg-slate-200 transition-colors h-8 flex items-end justify-center pb-1">
                <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
                    {count} collapsed budget{count !== 1 ? 's' : ''}
                </span>
            </div>
        </div>
    );
}
