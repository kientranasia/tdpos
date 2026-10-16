import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    
    const variants = {
      default: "bg-sky-600 text-white hover:bg-sky-700",
      destructive: "bg-red-500 text-white hover:bg-red-600",
      outline: "border border-slate-300 bg-white hover:bg-slate-100 text-slate-700",
      secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
      ghost: "hover:bg-slate-100 hover:text-slate-900 text-slate-700",
      link: "text-sky-600 underline-offset-4 hover:underline",
    }
    
    const sizes = {
      default: "h-9 px-3 py-1.5 rounded-md",
      sm: "h-8 rounded-md px-2.5",
      lg: "h-10 rounded-md px-5",
      icon: "h-9 w-9",
    }

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
