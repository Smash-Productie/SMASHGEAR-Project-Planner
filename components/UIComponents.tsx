import React from 'react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }> = ({ 
  children, 
  className = '', 
  variant = 'primary', 
  ...props 
}) => {
  const baseStyle = "px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-95";
  
  const variants = {
    primary: "bg-white text-black hover:bg-gray-200 border border-black shadow-[0_0_15px_rgba(255,255,255,0.2)]",
    secondary: "bg-neutral-800 text-white border border-neutral-700 hover:bg-neutral-700",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
    ghost: "bg-transparent text-neutral-400 hover:text-white"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => {
  return (
    <input 
      className={`w-full bg-neutral-900 border border-neutral-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/50 transition-all placeholder-neutral-600 ${className}`}
      {...props}
    />
  );
};

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => {
  return (
    <div 
      className={`bg-neutral-900/60 backdrop-blur-md border border-neutral-800 rounded-2xl p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const Badge: React.FC<{ status: string, label?: string }> = ({ status, label }) => {
  let colorClass = "bg-neutral-800 text-neutral-400 border-neutral-700";
  
  const statusUpper = status.toUpperCase();
  
  if (status === 'Goed' || status === 'COMPLETED' || statusUpper === 'GOOD') colorClass = "bg-green-500/10 text-green-400 border-green-500/20";
  if (status === 'Word vervangen' || status === 'ACTIVE' || statusUpper === 'REPLACING') colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (status === 'Te gebruiken' || status === 'PREP' || statusUpper === 'USABLE') colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  if (status === 'Kapot' || statusUpper === 'BROKEN') colorClass = "bg-red-500/10 text-red-500 border-red-500/20";
  if (status === 'In Gebruik' || statusUpper === 'RENTED' || statusUpper === 'RESERVED') colorClass = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";

  return (
    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${colorClass} uppercase tracking-wider`}>
      {label || status}
    </span>
  );
};
